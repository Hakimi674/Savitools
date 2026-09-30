import { ConfigService } from "@nestjs/config";
import { MetricsService } from "./metrics.service";

type Sample = { value: number; labels: Record<string, string> };

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: string) =>
      Object.prototype.hasOwnProperty.call(overrides, key)
        ? overrides[key]
        : defaultValue,
    ),
  } as unknown as ConfigService;
}

async function sampleFor(
  service: MetricsService,
  name: string,
  match: Record<string, string> = {},
): Promise<Sample | undefined> {
  const json = (await service.registry.getMetricsAsJSON()) as Array<{
    name: string;
    values?: Sample[];
  }>;
  const metric = json.find((m) => m.name === name);
  return (metric?.values ?? []).find((value) =>
    Object.entries(match).every(
      ([key, expected]) => value.labels[key] === expected,
    ),
  );
}

/** Scrape-payload lines beginning with `prefix`, in emission order. */
async function scrapeLines(service: MetricsService, prefix: string) {
  const text = await service.metrics();
  return text.split("\n").filter((line) => line.startsWith(prefix));
}

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService(makeConfig());
  });

  it("registers every documented metric with a stable name and label set", () => {
    const expected: Record<string, string[]> = {
      savitools_http_requests_total: ["method", "route", "status_code"],
      savitools_http_request_duration_seconds: ["method", "route", "status_code"],
      savitools_soroban_rpc_duration_seconds: ["network", "operation", "status"],
      savitools_soroban_contract_invocations_total: ["function", "status"],
      savitools_horizon_active_connections: ["network"],
      savitools_redis_active_connections: ["client"],
    };

    const actual = Object.fromEntries(
      (
        service.registry.getMetricsAsArray() as unknown as Array<{
          name: string;
          labelNames: string[];
        }>
      )
        .filter((metric) => metric.name.startsWith("savitools_"))
        .map((metric) => [metric.name, [...metric.labelNames].sort()]),
    );

    // Exact set: a renamed or removed metric fails here instead of silently
    // breaking every dashboard and alert built on the old name.
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, labels] of Object.entries(expected)) {
      expect(actual[name]).toEqual([...labels].sort());
    }
  });

  it("stamps the configured service name onto every sample", async () => {
    const named = new MetricsService(
      makeConfig({ OTEL_SERVICE_NAME: "savitools-test" }),
    );
    named.recordHttpRequest("GET", "/api/v1/ping", 200, 0.001);

    const [line] = await scrapeLines(named, "savitools_http_requests_total{");
    expect(line).toContain('service="savitools-test"');
  });

  it("exposes the Prometheus text content type and scrape payload", async () => {
    expect(service.contentType()).toContain("text/plain");
    await expect(service.metrics()).resolves.toContain(
      "savitools_soroban_rpc_duration_seconds",
    );
  });

  it("counts and times HTTP requests under the shared label set", async () => {
    service.recordHttpRequest("GET", "/api/v1/workspaces", 200, 0.012);
    service.recordHttpRequest("GET", "/api/v1/workspaces", 200, 0.02);
    service.recordHttpRequest("POST", "/api/v1/workspaces", 500, 0.3);

    await expect(
      sampleFor(service, "savitools_http_requests_total", {
        method: "GET",
        route: "/api/v1/workspaces",
        status_code: "200",
      }),
    ).resolves.toMatchObject({ value: 2 });

    await expect(
      sampleFor(service, "savitools_http_requests_total", {
        method: "POST",
        route: "/api/v1/workspaces",
        status_code: "500",
      }),
    ).resolves.toMatchObject({ value: 1 });

    const durationCounts = await scrapeLines(
      service,
      "savitools_http_request_duration_seconds_count{",
    );
    expect(
      durationCounts.some(
        (line) =>
          line.includes('method="GET"') &&
          line.includes('route="/api/v1/workspaces"') &&
          line.includes('status_code="200"') &&
          line.endsWith(" 2"),
      ),
    ).toBe(true);
  });

  it("records the requested network on the RPC histogram", async () => {
    await service.timeSorobanRpc("get_events", "testnet", async () => "ok");
    await service.timeSorobanRpc("get_events", "mainnet", async () => "ok");

    const counts = await scrapeLines(
      service,
      "savitools_soroban_rpc_duration_seconds_count{",
    );

    expect(counts.some((line) => line.includes('network="testnet"'))).toBe(true);
    expect(counts.some((line) => line.includes('network="mainnet"'))).toBe(true);
    expect(counts.some((line) => line.includes('network="events"'))).toBe(false);
    expect(counts.some((line) => line.includes('operation="get_events"'))).toBe(
      true,
    );
    expect(counts.every((line) => line.endsWith(" 1"))).toBe(true);
  });

  it("tags RPC observations with the call outcome", async () => {
    await service.timeSorobanRpc("get_events", "testnet", async () => "ok");
    await expect(
      service.timeSorobanRpc("get_events", "testnet", async () => {
        throw new Error("rpc down");
      }),
    ).rejects.toThrow("rpc down");

    const counts = await scrapeLines(
      service,
      "savitools_soroban_rpc_duration_seconds_count{",
    );
    expect(counts.some((line) => line.includes('status="success"'))).toBe(true);
    expect(counts.some((line) => line.includes('status="error"'))).toBe(true);
  });

  it("counts contract invocations by outcome", async () => {
    service.recordContractInvocation("transfer", true);
    service.recordContractInvocation("transfer", false);

    await expect(
      sampleFor(service, "savitools_soroban_contract_invocations_total", {
        function: "transfer",
        status: "success",
      }),
    ).resolves.toMatchObject({ value: 1 });
    await expect(
      sampleFor(service, "savitools_soroban_contract_invocations_total", {
        function: "transfer",
        status: "error",
      }),
    ).resolves.toMatchObject({ value: 1 });
  });

  it("exposes connection gauges as numbers", async () => {
    service.setHorizonConnections("testnet", 3);
    service.setRedisConnection("cache", true);
    service.setRedisConnection("queue", false);

    await expect(
      sampleFor(service, "savitools_horizon_active_connections", {
        network: "testnet",
      }),
    ).resolves.toMatchObject({ value: 3 });
    await expect(
      sampleFor(service, "savitools_redis_active_connections", {
        client: "cache",
      }),
    ).resolves.toMatchObject({ value: 1 });
    await expect(
      sampleFor(service, "savitools_redis_active_connections", {
        client: "queue",
      }),
    ).resolves.toMatchObject({ value: 0 });
  });
});
