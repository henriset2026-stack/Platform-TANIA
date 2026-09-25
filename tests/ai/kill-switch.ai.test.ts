import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/audit/record", () => ({ createAuditSink: vi.fn() }));
vi.mock("@/lib/observability/recorder", () => ({ openAgentRun: vi.fn(), recordToolCall: vi.fn(), closeAgentRun: vi.fn() }));

import { handleGatewayRequest } from "@/lib/ai/gateway";
import { isEnabled } from "@/lib/ai/switches";

import { actor, harness, installHarness, signIn, TEST_AGENT } from "./harness";

/** Security Gate #3, step 35: server-side AI kill switches. */

installHarness();

afterEach(() => vi.unstubAllEnvs());

describe("switch parsing fails closed", () => {
  it.each([
    [undefined, true],
    ["", true],
    ["true", true],
    ["ON", true],
    ["1", true],
    ["false", false],
    ["0", false],
    ["off", false],
    ["flase", false],
    ["disabled", false],
  ] as const)("AI_ASSISTANT_ENABLED=%s → %s", (value, expected) => {
    expect(isEnabled("AI_ASSISTANT_ENABLED", { AI_ASSISTANT_ENABLED: value })).toBe(expected);
  });

  it("keeps JARVIS handoff off unless explicitly enabled", () => {
    expect(isEnabled("JARVIS_HANDOFF_ENABLED", {})).toBe(false);
    expect(isEnabled("JARVIS_HANDOFF_ENABLED", { JARVIS_HANDOFF_ENABLED: "true" })).toBe(true);
  });
});

describe("gateway honours the switches", () => {
  it("AI_ASSISTANT_ENABLED=false: refuses before any model call", async () => {
    vi.stubEnv("AI_ASSISTANT_ENABLED", "false");
    harness.reset({ text: "should never be produced" });
    signIn(actor());
    const outcome = await handleGatewayRequest({ message: "Hello", agent: TEST_AGENT });

    expect(outcome).toMatchObject({ ok: false, code: "DISABLED" });
    expect(harness.requests).toHaveLength(0);
    expect(harness.runs.opened).toBe(0);
  });

  it("still refuses an anonymous caller as UNAUTHENTICATED, revealing nothing about the switch", async () => {
    vi.stubEnv("AI_ASSISTANT_ENABLED", "false");
    signIn(null);
    expect(await handleGatewayRequest({ message: "Hello", agent: TEST_AGENT })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });

  it("TOOL_EXECUTION_ENABLED=false: offers no tools and runs none the model proposes", async () => {
    vi.stubEnv("TOOL_EXECUTION_ENABLED", "false");
    harness.reset({ text: "Answering without tools.", toolCalls: [{ toolName: "search_talent", arguments: { query: "x" } }] });
    signIn(actor());
    const outcome = await handleGatewayRequest({ message: "Who knows cloud?", agent: TEST_AGENT });

    expect(outcome.ok).toBe(true);
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0]!.tools).toEqual([]);
    expect(harness.executions.size).toBe(0);
    if (outcome.ok) expect(outcome.run.toolCalls).toEqual([]);
  });
});
