import type { JsonSchema, JsonSchemaProperty } from "@/agents/core/types";
import type { LlmProvider, ProviderRequest, ProviderResult, ProviderToolCall } from "@/lib/ai/provider";

/**
 * Google Gemini adapter (REST `models/{model}:generateContent`).
 *
 * Only the gateway calls this. It maps TANIA's provider contract onto Gemini
 * and back, and nothing else:
 *
 *  - system messages go to `systemInstruction`, never into the conversation;
 *  - tool SPECS become `functionDeclarations`; a function call Gemini returns
 *    is a PROPOSAL handed back to the pipeline, never executed here;
 *  - when the gateway offers no tools (step 2), none are declared, so the
 *    model has nothing to call;
 *  - the key travels in the `x-goog-api-key` header and appears in no error,
 *    log or result.
 *
 * Endpoint, key and model come from configuration (AI_GATEWAY_URL,
 * AI_GATEWAY_KEY, LLM_MODEL) with LLM_PROVIDER=gemini. The request cannot
 * choose any of them.
 */

export interface GeminiDependencies {
  readonly baseUrl: () => string | null;
  readonly apiKey: () => string;
  readonly fetch?: typeof fetch;
}

type GeminiSchema = Record<string, unknown>;

/** Gemini's function-declaration schema is an OpenAPI subset: map, and drop what it lacks. */
function convertProperty(property: JsonSchemaProperty): GeminiSchema {
  const out: GeminiSchema = { type: property.type.toUpperCase() };
  if (property.description) out.description = property.description;
  if (property.enum) out.enum = [...property.enum];
  if (property.nullable) out.nullable = true;
  if (property.format === "date-time") out.format = "date-time";
  if (property.minimum !== undefined) out.minimum = property.minimum;
  if (property.maximum !== undefined) out.maximum = property.maximum;
  if (property.type === "array" && property.items) out.items = convertProperty(property.items);
  if (property.type === "object") {
    out.properties = Object.fromEntries(
      Object.entries(property.properties ?? {}).map(([key, child]) => [key, convertProperty(child)]),
    );
    if (property.required?.length) out.required = [...property.required];
  }
  return out;
}

export function toGeminiParameters(schema: JsonSchema): GeminiSchema | undefined {
  const entries = Object.entries(schema.properties);
  if (entries.length === 0) return undefined;
  return {
    type: "OBJECT",
    properties: Object.fromEntries(entries.map(([key, property]) => [key, convertProperty(property)])),
    ...(schema.required?.length ? { required: [...schema.required] } : {}),
  };
}

interface GeminiPart {
  readonly text?: string;
  readonly functionCall?: { readonly name?: string; readonly args?: unknown };
}

interface GeminiResponse {
  readonly candidates?: ReadonlyArray<{ readonly content?: { readonly parts?: readonly GeminiPart[] } }>;
  readonly promptFeedback?: { readonly blockReason?: string };
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly totalTokenCount?: number;
  };
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  readonly configured = true;

  constructor(private readonly deps: GeminiDependencies) {}

  async complete(request: ProviderRequest): Promise<ProviderResult> {
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;
    const base = this.deps.baseUrl();
    if (!base) {
      return { ok: false, code: "NOT_CONFIGURED", error: "AI_GATEWAY_URL is not set.", latencyMs: 0 };
    }

    const system = request.messages.filter((m) => m.role === "system").map((m) => ({ text: m.content }));
    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const declarations = request.tools.map((tool) => {
      const parameters = toGeminiParameters(tool.inputSchema as JsonSchema);
      return { name: tool.name, description: tool.description, ...(parameters ? { parameters } : {}) };
    });

    const body = {
      ...(system.length > 0 ? { systemInstruction: { parts: system } } : {}),
      contents,
      ...(declarations.length > 0 ? { tools: [{ functionDeclarations: declarations }] } : {}),
      generationConfig: { maxOutputTokens: request.maxOutputTokens, temperature: request.temperature },
    };

    const url = `${base.replace(/\/+$/, "")}/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    let response: Response;
    try {
      response = await (this.deps.fetch ?? fetch)(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.deps.apiKey() },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      const aborted = request.signal.aborted || (error instanceof Error && error.name === "AbortError");
      return aborted
        ? { ok: false, code: "TIMEOUT", error: "Gemini did not respond before the deadline.", latencyMs: elapsed() }
        : { ok: false, code: "PROVIDER_ERROR", error: "Gemini could not be reached.", latencyMs: elapsed() };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: response.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
        // Status only: a provider error body can echo the request.
        error: `Gemini returned HTTP ${response.status}.`,
        latencyMs: elapsed(),
      };
    }

    let payload: GeminiResponse;
    try {
      payload = (await response.json()) as GeminiResponse;
    } catch {
      return { ok: false, code: "PROVIDER_ERROR", error: "Gemini returned a malformed response.", latencyMs: elapsed() };
    }

    const parts = payload.candidates?.[0]?.content?.parts;
    if (!parts) {
      const reason = payload.promptFeedback?.blockReason;
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        error: reason ? `Gemini returned no answer (blocked: ${reason}).` : "Gemini returned no answer.",
        latencyMs: elapsed(),
      };
    }

    const toolCalls: ProviderToolCall[] = parts
      .filter((part) => part.functionCall?.name)
      .map((part) => ({ toolName: part.functionCall!.name!, arguments: part.functionCall!.args ?? {} }));
    const usage = payload.usageMetadata;

    return {
      ok: true,
      text: parts.map((part) => part.text ?? "").join(""),
      toolCalls,
      usage: {
        promptTokens: usage?.promptTokenCount ?? null,
        completionTokens: usage?.candidatesTokenCount ?? null,
        totalTokens: usage?.totalTokenCount ?? null,
        estimatedCost: null,
        currency: null,
      },
      latencyMs: elapsed(),
      model: request.model,
    };
  }
}
