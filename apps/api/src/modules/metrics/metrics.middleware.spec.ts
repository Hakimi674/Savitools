import {
  MetricsMiddleware,
  UNMATCHED_ROUTE_LABEL,
  isExcludedFromRequestMetrics,
  resolveRouteLabel,
} from "./metrics.middleware";
import { MetricsService } from "./metrics.service";

function makeRes(statusCode = 200) {
  const handlers: Record<string, () => void> = {};
  return {
    statusCode,
    on: jest.fn((event: string, cb: () => void) => {
      handlers[event] = cb;
    }),
    finish: () => handlers.finish?.(),
  };
}

function makeReq(url: string, routerPath?: string) {
  return { method: "GET", url, routerPath } as unknown as Parameters<
    MetricsMiddleware["use"]
  >[0];
}

describe("isExcludedFromRequestMetrics", () => {
  it.each([
    "/metrics",
    "/metrics?format=json",
    "/health",
    "/health/live",
    "/api/v1/health/ready",
    "/api/v1/v1/health/startup",
  ])("excludes %s", (url) => {
    expect(isExcludedFromRequestMetrics(url)).toBe(true);
  });

  it.each([
    "/api/v1/workspaces",
    "/api/v1/monitoring/operational-health",
    "/api/v1/contracts/health-check",
    undefined,
  ])("keeps %s", (url) => {
    expect(isExcludedFromRequestMetrics(url)).toBe(false);
  });
});

describe("MetricsMiddleware", () => {
  let recordHttpRequest: jest.Mock;
  let middleware: MetricsMiddleware;

  beforeEach(() => {
    recordHttpRequest = jest.fn();
    middleware = new MetricsMiddleware({ recordHttpRequest } as never);
  });

  it("records a normal request with its resolved route and status", () => {
    const res = makeRes(200);
    const next = jest.fn();

    middleware.use(
      makeReq("/api/v1/workspaces?page=1", "/api/v1/workspaces"),
      res as never,
      next,
    );
    res.finish();

    expect(next).toHaveBeenCalled();
    expect(recordHttpRequest).toHaveBeenCalledTimes(1);
    const [method, route, status, duration] = recordHttpRequest.mock.calls[0];
    expect(method).toBe("GET");
    expect(route).toBe("/api/v1/workspaces");
    expect(status).toBe(200);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it("buckets a request the router never matched under one fixed label", () => {
    const res = makeRes(404);
    middleware.use(makeReq("/api/v1/does-not-exist"), res as never, jest.fn());
    res.finish();

    expect(recordHttpRequest).toHaveBeenCalledWith(
      "GET",
      UNMATCHED_ROUTE_LABEL,
      404,
      expect.any(Number),
    );
    expect(recordHttpRequest.mock.calls[0][1]).not.toContain("does-not-exist");
  });

  it("collapses 200 distinct unmatched paths onto a single label value", () => {
    for (let i = 0; i < 200; i += 1) {
      const res = makeRes(404);
      middleware.use(
        makeReq(`/api/v1/scan-${i}-${Math.random().toString(36).slice(2)}`),
        res as never,
        jest.fn(),
      );
      res.finish();
    }

    const routes = new Set(
      recordHttpRequest.mock.calls.map((call) => call[1] as string),
    );
    expect(routes).toEqual(new Set([UNMATCHED_ROUTE_LABEL]));
  });

  it("keeps the parameterised template of a matched route", () => {
    const res = makeRes(200);
    middleware.use(
      makeReq("/api/v1/workspaces/0198c0de", "/api/v1/workspaces/:id"),
      res as never,
      jest.fn(),
    );
    res.finish();

    expect(recordHttpRequest.mock.calls[0][1]).toBe("/api/v1/workspaces/:id");
  });

  it("prefers the router path over a stale routeOptions url", () => {
    const req = {
      method: "GET",
      url: "/api/v1/workspaces?page=2",
      routerPath: "/api/v1/workspaces",
      routeOptions: { url: "/api/v1/other" },
    } as unknown as Parameters<MetricsMiddleware["use"]>[0];

    expect(resolveRouteLabel(req)).toBe("/api/v1/workspaces");
  });

  it("does not record the scrape of /metrics", () => {
    const res = makeRes();
    middleware.use(makeReq("/metrics"), res as never, jest.fn());
    res.finish();

    expect(recordHttpRequest).not.toHaveBeenCalled();
  });

  it.each(["/api/v1/health/live", "/api/v1/v1/health/ready"])(
    "does not record the health probe %s",
    (url) => {
      const res = makeRes();
      middleware.use(makeReq(url), res as never, jest.fn());
      res.finish();

      expect(recordHttpRequest).not.toHaveBeenCalled();
    },
  );

  it("still records a business route whose name merely contains health", () => {
    const res = makeRes();
    middleware.use(
      makeReq("/api/v1/monitoring/operational-health"),
      res as never,
      jest.fn(),
    );
    res.finish();

    expect(recordHttpRequest).toHaveBeenCalledTimes(1);
  });
});

describe("MetricsMiddleware against a real registry", () => {
  const configService = {
    get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
  } as never;

  async function scrape(service: MetricsService, prefix: string) {
    const text = await service.metrics();
    return text.split("\n").filter((line) => line.startsWith(prefix));
  }

  it("bounds the registry when a scanner walks 250 unseen paths", async () => {
    const service = new MetricsService(configService);
    const middleware = new MetricsMiddleware(service);

    for (let i = 0; i < 250; i += 1) {
      const res = makeRes(404);
      middleware.use(
        makeReq(`/api/v1/${i}-does-not-exist`),
        res as never,
        jest.fn(),
      );
      res.finish();
    }

    const counters = await scrape(service, "savitools_http_requests_total{");
    const histogramCounts = await scrape(
      service,
      "savitools_http_request_duration_seconds_count{",
    );

    // 250 distinct URLs must collapse into one counter series and one
    // histogram series (250 × 12 before the fix), and the label must not leak
    // the scanned path.
    expect(counters).toHaveLength(1);
    expect(histogramCounts).toHaveLength(1);
    expect(counters[0]).toContain(`route="${UNMATCHED_ROUTE_LABEL}"`);
    expect(counters[0]).toContain(" 250");
    expect(counters[0]).not.toContain("does-not-exist");
  });

  it("keeps one series per real route plus the unmatched bucket", async () => {
    const service = new MetricsService(configService);
    const middleware = new MetricsMiddleware(service);

    for (const [url, template] of [
      ["/api/v1/workspaces", "/api/v1/workspaces"],
      ["/api/v1/workspaces/abc", "/api/v1/workspaces/:id"],
      ["/api/v1/nope", undefined],
    ] as Array<[string, string | undefined]>) {
      const res = makeRes(template ? 200 : 404);
      middleware.use(makeReq(url, template), res as never, jest.fn());
      res.finish();
    }

    const counters = await scrape(service, "savitools_http_requests_total{");
    const routes = counters
      .map((line) => /route="([^"]+)"/.exec(line)?.[1])
      .sort();
    expect(routes).toEqual([
      "/api/v1/workspaces",
      "/api/v1/workspaces/:id",
      UNMATCHED_ROUTE_LABEL,
    ]);
  });
});
