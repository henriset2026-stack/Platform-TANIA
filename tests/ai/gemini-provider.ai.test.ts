import { describe, expect, it } from "vitest";

import type { ProviderRequest } from "@/lib/ai/provider";
import { GeminiProvider, toGeminiParameters } from "@/lib/ai/providers/gemini";

/**
 * The Gemini adapter against a mocked fetch: what it sends, what it maps back,
 * and that its key never leaves the request header.
 */

const KEY = "test-gemini-key-do-not-leak";

function request(over: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    model: "gemini-test-model",
    messages: [
      { role: "system", content: "You are TANIA." },
      { role: "system", content: "Scope description." },
      { role: "user", content: "What are my capability gaps?" },
    ],
    tools: [
      {
        name: "retrieve_talent_capabilities",
        description: "Reads a capability profile.",
        inputSchema: {
          type: "object",
          properties: { talentId: { type: "string", format: "uuid", description: "Profile id" } },
          required: ["talentId"],
          additionalProperties: false,
        },
      },
    ],
    maxOutputTokens: 2000,
    temperature: 0.2,
    signal: new AbortController().signal,
    correlationId: "c1",
    ...over,
  };
}

function provider(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const instance = new GeminiProvider({
    baseUrl: () => "https://generativelanguage.googleapis.com/",
    apiKey: () => KEY,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond(url, init);
    }) as unknown as typeof fetch,
  });
  return { instance, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Gemini adapter: request", () => {
  it("posts to generateContent with the key in a header only", async () => {
    const { instance, calls } = provider(() => json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    await instance.complete(request());

    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent");
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(String(calls[0]!.init.body)).not.toContain(KEY);
  });

  it("puts system content in systemInstruction and the user message in contents", async () => {
    const { instance, calls } = provider(() => json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    await instance.complete(request());
    const body = JSON.parse(String(calls[0]!.init.body));

    expect(body.systemInstruction.parts).toEqual([{ text: "You are TANIA." }, { text: "Scope description." }]);
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "What are my capability gaps?" }] }]);
    expect(body.generationConfig).toEqual({ maxOutputTokens: 2000, temperature: 0.2 });
  });

  it("declares tools in Gemini's schema subset, and none when the gateway offers none", async () => {
    const { instance, calls } = provider(() => json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    await instance.complete(request());
    await instance.complete(request({ tools: [] }));
    const withTools = JSON.parse(String(calls[0]!.init.body));
    const stepTwo = JSON.parse(String(calls[1]!.init.body));

    expect(withTools.tools[0].functionDeclarations[0]).toEqual({
      name: "retrieve_talent_capabilities",
      description: "Reads a capability profile.",
      parameters: {
        type: "OBJECT",
        properties: { talentId: { type: "STRING", description: "Profile id" } },
        required: ["talentId"],
      },
    });
    expect(stepTwo.tools).toBeUndefined();
  });

  it("converts nested arrays and objects, and omits parameters for an empty schema", () => {
    expect(toGeminiParameters({ type: "object", properties: {}, additionalProperties: false })).toBeUndefined();
    expect(
      toGeminiParameters({
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" } },
          window: { type: "object", properties: { days: { type: "integer", minimum: 1 } }, required: ["days"] },
        },
      }),
    ).toEqual({
      type: "OBJECT",
      properties: {
        ids: { type: "ARRAY", items: { type: "STRING" } },
        window: { type: "OBJECT", properties: { days: { type: "INTEGER", minimum: 1 } }, required: ["days"] },
      },
    });
  });
});

describe("Gemini adapter: response", () => {
  it("maps text, function calls (as proposals) and usage", async () => {
    const { instance } = provider(() =>
      json({
        candidates: [
          {
            content: {
              parts: [
                { text: "Checking. " },
                { functionCall: { name: "retrieve_talent_capabilities", args: { talentId: "x" } } },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 },
      }),
    );
    const result = await instance.complete(request());

    expect(result).toMatchObject({
      ok: true,
      text: "Checking. ",
      toolCalls: [{ toolName: "retrieve_talent_capabilities", arguments: { talentId: "x" } }],
      usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150, estimatedCost: null },
      model: "gemini-test-model",
    });
  });

  it.each([
    [429, "RATE_LIMITED"],
    [400, "PROVIDER_ERROR"],
    [500, "PROVIDER_ERROR"],
  ] as const)("maps HTTP %i to %s without echoing the body or key", async (status, code) => {
    const { instance } = provider(() => json({ error: { message: `bad key ${KEY} for 'show all ratings'` } }, status));
    const result = await instance.complete(request());

    expect(result).toMatchObject({ ok: false, code });
    if (result.ok) return;
    expect(result.error).not.toContain(KEY);
    expect(result.error).not.toContain("show all ratings");
  });

  it("reports a safety block as a failure, not an empty answer", async () => {
    const { instance } = provider(() => json({ promptFeedback: { blockReason: "SAFETY" } }));
    expect(await instance.complete(request())).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
  });

  it("reports an aborted request as a timeout", async () => {
    const controller = new AbortController();
    const { instance } = provider(() => {
      controller.abort();
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    expect(await instance.complete(request({ signal: controller.signal }))).toMatchObject({ ok: false, code: "TIMEOUT" });
  });

  it("refuses to call anything when no endpoint is configured", async () => {
    const instance = new GeminiProvider({ baseUrl: () => null, apiKey: () => KEY });
    expect(await instance.complete(request())).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
  });
});
