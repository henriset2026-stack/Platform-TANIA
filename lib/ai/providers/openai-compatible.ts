import type { LlmProvider, ProviderRequest, ProviderResult, ProviderToolCall } from "@/lib/ai/provider";

/**
 * OpenAI-compatible adapter (`POST {base}/chat/completions`).
 *
 * For routers and gateways that speak the OpenAI chat-completions dialect,
 * selected by LLM_PROVIDER=openai-compatible. Approved for EVALUATION on
 * fictional data only (2026-09-25): a third-party router forwards prompts to
 * upstream vendors, so sending real talent data through one needs a
 * data-governance decision first (docs/DEPLOYMENT.md).
 *
 * Same contract as the Gemini adapter:
 *  - a tool call the model returns is a PROPOSAL handed to the pipeline;
 *  - when the gateway offers no tools (step 2), none are declared;
 *  - the key travels only in the Authorization header and appears in no
 *    error, log or result; errors report the HTTP status only.
 */

export interface OpenAiCompatibleDependencies {
  readonly baseUrl: () => string | null;
  readonly apiKey: () => string;
  readonly fetch?: typeof fetch;
}

interface ChatToolCall {
  readonly function?: { readonly name?: string; readonly arguments?: string };
}

interface ChatResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string | null; readonly tool_calls?: readonly ChatToolCall[] };
    readonly finish_reason?: string;
  }>;
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number; readonly total_tokens?: number };
}

/** Malformed JSON is passed through as a string, so the schema check refuses it. */
function parseArguments(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai-compatible";
  readonly configured = true;

  constructor(private readonly deps: OpenAiCompatibleDependencies) {}

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;
    const base = this.deps.baseUrl();
    if (!base) {
      return { ok: false, code: "NOT_CONFIGURED", error: "AI_GATEWAY_URL is not set.", latencyMs: 0 };
    }

    const body = {
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(request.tools.length > 0
        ? {
            tools: request.tools.map((tool) => ({
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
            })),
          }
        : {}),
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature,
    };

    let response: Response;
    try {
      response = await (this.deps.fetch ?? fetch)(`${base.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.deps.apiKey()}` },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      const aborted = request.signal.aborted || (error instanceof Error && error.name === "AbortError");
      return aborted
        ? { ok: false, code: "TIMEOUT", error: "The model provider did not respond before the deadline.", latencyMs: elapsed() }
        : { ok: false, code: "PROVIDER_ERROR", error: "The model provider could not be reached.", latencyMs: elapsed() };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: response.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
        // Status only: a provider error body can echo the request.
        error: `The model provider returned HTTP ${response.status}.`,
        latencyMs: elapsed(),
      };
    }

    let payload: ChatResponse;
    try {
      payload = (await response.json()) as ChatResponse;
    } catch {
      return { ok: false, code: "PROVIDER_ERROR", error: "The model provider returned a malformed response.", latencyMs: elapsed() };
    }

    const choice = payload.choices?.[0];
    if (!choice?.message || choice.finish_reason === "content_filter") {
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        error: choice?.finish_reason === "content_filter" ? "The model provider filtered the answer." : "The model provider returned no answer.",
        latencyMs: elapsed(),
      };
    }

    const toolCalls: ProviderToolCall[] = (choice.message.tool_calls ?? [])
      .filter((call) => call.function?.name)
      .map((call) => ({ toolName: call.function!.name!, arguments: parseArguments(call.function!.arguments) }));
    const usage = payload.usage;

    return {
      ok: true,
      text: choice.message.content ?? "",
      toolCalls,
      usage: {
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        totalTokens: usage?.total_tokens ?? null,
        estimatedCost: null,
        currency: null,
      },
      latencyMs: elapsed(),
      model: request.model,
    };
  }
}
