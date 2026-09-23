import { NextResponse, type NextRequest } from "next/server";

import { parsePageContext } from "@/lib/assistant/context";
import { handleGatewayRequest, type GatewayErrorCode } from "@/lib/ai/gateway";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/ai/chat — TANIA_PRD_v2.0.md §21.
 *
 * The only HTTP surface for the gateway. POST only: a GET carrying a prompt
 * would be logged, cached and triggerable cross-site.
 *
 * The route does no authorization of its own — that belongs to the gateway,
 * so there is one place it happens rather than two that can disagree.
 *
 * Errors return a code and a safe message. No stack trace, provider error
 * body or SQL text reaches the client (CLAUDE.md §22), and every response
 * carries the correlation id so a user can quote it and an operator can find
 * the matching server log.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<GatewayErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  NOT_CONFIGURED: 503,
  PROVIDER_ERROR: 502,
  TIMEOUT: 504,
  RATE_LIMITED: 429,
};

interface ChatBody {
  message?: unknown;
  intent?: unknown;
  sessionId?: unknown;
  confirmations?: unknown;
  /** Untrusted page hint from the browser. Validated, never trusted. */
  context?: unknown;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Body must be valid JSON." } },
      { status: 400 },
    );
  }

  // Validate shape here so the gateway receives typed input rather than
  // whatever arrived on the wire.
  if (typeof body.message !== "string") {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "message must be a string." } },
      { status: 400 },
    );
  }

  const confirmations = Array.isArray(body.confirmations)
    ? body.confirmations.filter((c): c is string => typeof c === "string")
    : undefined;

  // Parsed through an allowlist: an unrecognised kind degrades to "unknown"
  // and a non-UUID entityId is dropped. Even when valid, the gateway
  // re-authorizes anything it implies — a forged context can only make TANIA
  // answer the wrong question, never reveal the wrong data.
  const pageContext = parsePageContext(body.context);

  const outcome = await handleGatewayRequest({
    message: body.message,
    pageContext,
    ...(typeof body.intent === "string" ? { intent: body.intent } : {}),
    ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
    ...(confirmations ? { confirmations } : {}),
  });

  // Outcome only: the message and the answer may carry personal data.
  logger.info("api.ai.chat", {
    correlationId: outcome.ok ? outcome.run.correlationId : outcome.correlationId,
    status: outcome.ok ? outcome.run.status : "error",
    ...(outcome.ok ? {} : { code: outcome.code }),
    durationMs: Date.now() - startedAt,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: {
          code: outcome.code,
          message: outcome.message,
          requestId: outcome.correlationId,
        },
      },
      { status: STATUS[outcome.code] },
    );
  }

  return NextResponse.json(
    {
      response: outcome.response,
      run: {
        correlationId: outcome.run.correlationId,
        agentName: outcome.run.agentName,
        status: outcome.run.status,
        model: outcome.run.model,
        latencyMs: outcome.run.latencyMs,
        usage: outcome.run.usage,
        // Denied and failed calls are included deliberately: a run that
        // attempted an unauthorized action must not look like a clean one.
        toolCalls: outcome.run.toolCalls.map((call) => ({
          toolName: call.toolName,
          status: call.status,
          durationMs: call.durationMs,
          awaitingConfirmation: call.awaitingConfirmation,
          errorDetail: call.errorDetail,
        })),
      },
    },
    { status: outcome.run.status === "awaiting_approval" ? 202 : 200 },
  );
}

/** Explicitly refuse GET so a prompt can never travel in a URL. */
export function GET() {
  return NextResponse.json(
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Use POST. A prompt must not travel in a URL.",
      },
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
