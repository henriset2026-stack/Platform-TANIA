import type { Instrumentation } from "next";

/**
 * Captures every unhandled server error — Server Components, Route Handlers,
 * Server Actions and middleware — as one structured log line.
 *
 * The error boundaries in app/ only see a digest in the browser; this is the
 * server half that carries the message, so an operator can match the digest a
 * user quotes to what actually failed.
 *
 * The query string is dropped from the path: it can carry search terms and
 * ids, and a log is the wrong place for either.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logger } = await import("@/lib/observability/logger");
  const detail = error as { message?: unknown; digest?: unknown };

  logger.error("server.unhandled_error", {
    digest: typeof detail.digest === "string" ? detail.digest : null,
    message: typeof detail.message === "string" ? detail.message : "unknown error",
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
};
