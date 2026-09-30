import { Injectable, NestMiddleware } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { MetricsService } from "./metrics.service";

/**
 * Path segments that must never feed the request metrics.
 *
 * - `metrics`: scraping /metrics would otherwise observe itself and inflate
 *   request rate/error rate with the scraper's own traffic.
 * - `health`: orchestrator probes hit the API on a fixed interval regardless of
 *   user activity, which flattens latency and error panels.
 *
 * The match is segment-exact, so routes such as
 * `/api/v1/monitoring/operational-health` or `.../health-check` are still
 * measured.
 */
const EXCLUDED_SEGMENT = /(^|\/)(metrics|health)(\/|$)/;

/**
 * Route label used for every request the router did not match.
 *
 * Raw 404 paths are caller-controlled, so using them as the `route` label let a
 * single scanner create one counter series plus eleven histogram series per
 * request (`/api/v1/<random>`), with nothing ever pruning them. Unmatched
 * requests share this one label value instead, so cardinality stays bounded by
 * the number of real route templates plus one.
 */
export const UNMATCHED_ROUTE_LABEL = "unmatched";

export function isExcludedFromRequestMetrics(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  const path = rawUrl.split("?")[0];
  return EXCLUDED_SEGMENT.test(path);
}

/**
 * The `route` label for a request: the matched route template when the router
 * matched one, otherwise {@link UNMATCHED_ROUTE_LABEL} — never the raw URL.
 */
export function resolveRouteLabel(
  req: Pick<FastifyRequest, "routerPath" | "routeOptions" | "url">,
): string {
  const matched = req.routerPath ?? req.routeOptions?.url?.toString();
  return matched && matched.length > 0 ? matched : UNMATCHED_ROUTE_LABEL;
}

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: FastifyRequest, res: FastifyReply["raw"], next: () => void) {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      if (isExcludedFromRequestMetrics(req.url)) return;
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;
      const route = resolveRouteLabel(req);
      this.metricsService.recordHttpRequest(
        req.method,
        route,
        res.statusCode,
        durationSeconds,
      );
    });
    next();
  }
}
