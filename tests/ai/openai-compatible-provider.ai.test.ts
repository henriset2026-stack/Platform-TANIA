import { describe, expect, it } from "vitest";

import type { ProviderRequest } from "@/lib/ai/provider";
import { OpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";

/** The OpenAI-compatible adapter against a mocked fetch. */

const KEY = "test-router-key-do-not-leak";

function request(over: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    model: "router-test-model",
    messages: [
      { role: "system", content: "You are TANIA." },
      { role: "user", content: "What are the gaps?" },
    ],
    tools: [{ name: "retrieve_capability_requirements", description: "Reads requirements.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }],
    maxOutputTokens: 2000,
    temperature: 0.2,
    signal: new AbortController().signal,
    correlationId: "c1",
    ...over,
  };
}

function provider(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const instance = new OpenAiCompatibleProvider({
    baseUrl: () => "https://router.test.invalid/v1/",
    apiKey: () => KEY,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond();
    }) as unknown as typeof fetch,
  });
  return { instance, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const answer = (message: unknown, extra: object = {}) => json({ choices: [{ message, finish_reason: "stop" }], ...extra });

describe("OpenAI-compatible adapter", () => {
  it("posts chat completions with the key in the Authorization header only", async () => {
    const { instance, calls } = provider(() => answer({ content: "ok" }));
    await instance.complete(request());
    await instance.complete(request({ tools: [] }));

    expect(calls[0]!.url).toBe("https://router.test.invalid/v1/chat/completions");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(String(calls[0]!.init.body)).not.toContain(KEY);
    expect(body.messages).toEqual([
      { role: "system", content: "You are TANIA." },
      { role: "user", content: "What are the gaps?" },
    ]);
    expect(body.tools[0]).toMatchObject({ type: "function", function: { name: "retrieve_capability_requirements" } });
    expect(JSON.parse(String(calls[1]!.init.body)).tools).toBeUndefined();
  });

  it("maps text, tool calls (as proposals) and usage", async () => {
    const { instance } = provider(() =>
      answer(
        { content: null, tool_calls: [{ function: { name: "retrieve_capability_requirements", arguments: '{"roleName":"PM"}' } }] },
        { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
      ),
    );
    expect(await instance.complete(request())).toMatchObject({
      ok: true,
      text: "",
      toolCalls: [{ toolName: "retrieve_capability_requirements", arguments: { roleName: "PM" } }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
  });

  it("passes malformed tool arguments through unparsed, for the schema check to refuse", async () => {
    const { instance } = provider(() => answer({ content: "", tool_calls: [{ function: { name: "x_tool", arguments: "{not json" } }] }));
    expect(await instance.complete(request())).toMatchObject({ ok: true, toolCalls: [{ toolName: "x_tool", arguments: "{not json" }] });
  });

  it.each([
    [429, "RATE_LIMITED"],
    [503, "PROVIDER_ERROR"],
  ] as const)("maps HTTP %i to %s without echoing the body or key", async (status, code) => {
    const { instance } = provider(() => json({ error: { message: `bad ${KEY} 'secret prompt'` } }, status));
    const result = await instance.complete(request());
    expect(result).toMatchObject({ ok: false, code });
    if (result.ok) return;
    expect(result.error).not.toContain(KEY);
    expect(result.error).not.toContain("secret prompt");
  });

  it("treats a filtered or empty answer as a failure", async () => {
    expect(await provider(() => json({ choices: [{ message: { content: "" }, finish_reason: "content_filter" }] })).instance.complete(request())).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
    expect(await provider(() => json({ choices: [] })).instance.complete(request())).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
  });

  it("refuses to call anything when no endpoint is configured", async () => {
    const instance = new OpenAiCompatibleProvider({ baseUrl: () => null, apiKey: () => KEY });
    expect(await instance.complete(request())).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
  });
});
