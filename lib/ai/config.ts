import "server-only";

/**
 * AI configuration.
 *
 * Read server-side only. AI_GATEWAY_KEY is in the eslint secret allowlist's
 * denied set, so it can only be read through lib/env.server.ts — this module
 * deliberately reads just the non-secret settings and reports whether the key
 * is present without ever returning it.
 */

export interface AiConfig {
  readonly configured: boolean;
  readonly providerName: string | null;
  readonly model: string | null;
  readonly embeddingModel: string | null;
  readonly gatewayUrl: string | null;
  /** Whether a key exists. The key itself never leaves lib/env.server.ts. */
  readonly hasCredentials: boolean;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly temperature: number;
}

/** Bounds, so a misconfiguration cannot create an unbounded request. */
export const AI_LIMITS = {
  /** Total gateway deadline. */
  requestTimeoutMs: 30_000,
  /** Per tool call. Shorter than the request, so one tool cannot consume it. */
  toolTimeoutMs: 10_000,
  maxOutputTokens: 2_000,
  maxToolCallsPerRun: 8,
  maxPromptChars: 16_000,
} as const;

export function readAiConfig(): AiConfig {
  const gatewayUrl = process.env.AI_GATEWAY_URL ?? null;
  const model = process.env.LLM_MODEL ?? null;
  const hasCredentials = Boolean(process.env["AI_GATEWAY_KEY"]);

  return {
    // All three are required: a URL without a model, or a model without
    // credentials, is a half-configured gateway that would fail at request
    // time instead of at startup.
    configured: Boolean(gatewayUrl && model && hasCredentials),
    // LLM_PROVIDER names the adapter (e.g. "gemini"); a bare URL means a
    // generic gateway. Chosen by configuration, never by a request.
    providerName: process.env.LLM_PROVIDER?.trim() || (gatewayUrl ? "gateway" : null),
    model,
    embeddingModel: process.env.EMBEDDING_MODEL ?? null,
    gatewayUrl,
    hasCredentials,
    timeoutMs: AI_LIMITS.requestTimeoutMs,
    maxOutputTokens: AI_LIMITS.maxOutputTokens,
    temperature: 0.2,
  };
}
