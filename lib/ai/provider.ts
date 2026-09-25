/**
 * LLM provider abstraction.
 *
 * The gateway talks to this interface, never to a vendor SDK. Two reasons
 * that matter beyond tidiness:
 *
 *  - No model has been selected for TANIA. LLM_MODEL and AI_GATEWAY_URL are
 *    declared in .env.example and unset, so the only provider registered
 *    today is one that refuses. Coding against an interface means selecting a
 *    provider later changes configuration, not the gateway.
 *  - A provider receives a prompt and returns text plus telemetry. It is
 *    never handed a database client, credentials or a tool handler, so the
 *    model-facing surface cannot reach anything a tool contract has not
 *    deliberately exposed.
 */

export interface TokenUsage {
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  /** Cost in the provider's billing currency, when the provider reports it. */
  readonly estimatedCost: number | null;
  readonly currency: string | null;
}

export interface ProviderMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ProviderToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
}

export interface ProviderRequest {
  readonly model: string;
  readonly messages: readonly ProviderMessage[];
  /** Tool specs only — never handlers. The provider cannot invoke anything. */
  readonly tools: readonly ProviderToolSpec[];
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly signal: AbortSignal;
  readonly correlationId: string;
}

export interface ProviderToolCall {
  readonly toolName: string;
  readonly arguments: unknown;
}

export type ProviderResult =
  | {
      readonly ok: true;
      readonly text: string;
      /** Tool calls the model PROPOSED. Proposal is not execution. */
      readonly toolCalls: readonly ProviderToolCall[];
      readonly usage: TokenUsage;
      readonly latencyMs: number;
      readonly model: string;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code:
        | "NOT_CONFIGURED"
        | "TIMEOUT"
        | "RATE_LIMITED"
        | "PROVIDER_ERROR"
        | "ABORTED";
      readonly latencyMs: number;
    };

export interface LlmProvider {
  readonly name: string;
  readonly configured: boolean;
  complete(request: ProviderRequest): Promise<ProviderResult>;
}

/**
 * The provider used when none is configured.
 *
 * Returns an explicit NOT_CONFIGURED failure rather than an apologetic
 * sentence. A gateway that answered in prose while no model existed would be
 * fabricating exactly the thing it is supposed to govern.
 */
export class UnconfiguredProvider implements LlmProvider {
  readonly name = "unconfigured";
  readonly configured = false;

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      error:
        "No LLM provider is configured. Set LLM_PROVIDER (gemini), AI_GATEWAY_URL, AI_GATEWAY_KEY and LLM_MODEL.",
      latencyMs: 0,
    };
  }
}

/**
 * Provider registry.
 *
 * Selection is by configuration, never by request input: a caller must not be
 * able to choose which model answers, which would let someone route around a
 * reviewed configuration.
 */
const providers = new Map<string, LlmProvider>();
const fallback = new UnconfiguredProvider();

export function registerProvider(provider: LlmProvider): void {
  providers.set(provider.name, provider);
}

export function resolveProvider(name: string | null): LlmProvider {
  if (!name) return fallback;
  return providers.get(name) ?? fallback;
}

export function listProviders(): readonly LlmProvider[] {
  return [...providers.values()];
}
