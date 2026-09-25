import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/audit/record", () => ({ createAuditSink: vi.fn() }));
vi.mock("@/lib/observability/recorder", () => ({ openAgentRun: vi.fn(), recordToolCall: vi.fn(), closeAgentRun: vi.fn() }));

import { handleGatewayRequest, NO_ANSWER_APPROVAL_PENDING } from "@/lib/ai/gateway";
import { closeAgentRun } from "@/lib/observability/recorder";

import { actor, harness, installHarness, PROJECT_A, signIn, TALENT_A, TEST_AGENT } from "./harness";

/**
 * AI Gate #2 finding L16 (live rerun, 2026-09-25): the model returned an
 * empty answer and the gateway passed it on as a successful response.
 */

installHarness();

const MANAGER = ["ai.use", "talent.read", "assignment.read", "assignment.recommend", "assignment.create"];

function lastCloseDetail(): unknown {
  const calls = vi.mocked(closeAgentRun).mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe("an empty model answer is a failure (L16)", () => {
  it("fails when the model answers nothing and calls no tool", async () => {
    harness.reset({ text: "" });
    signIn(actor());
    const outcome = await handleGatewayRequest({ message: "What are the gaps?", agent: TEST_AGENT });

    expect(outcome).toMatchObject({ ok: false, code: "PROVIDER_ERROR", message: "The model returned no answer." });
    expect(harness.runs.closed).toEqual(["failed"]);
    expect(lastCloseDetail()).toMatchObject({ status: "failed", errorDetail: "EMPTY_ANSWER" });
  });

  it("fails when the answer after tool results is only whitespace", async () => {
    harness.reset({ text: "  \n ", toolCalls: [{ toolName: "search_talent", arguments: { query: "cloud" } }] });
    signIn(actor());
    const outcome = await handleGatewayRequest({ message: "Who knows cloud?", agent: TEST_AGENT });

    expect(harness.requests).toHaveLength(2);
    expect(outcome).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
    expect(harness.runs.closed).toEqual(["failed"]);
  });

  it("keeps an approval prompt, with a factual line in place of the missing text", async () => {
    harness.reset({
      text: "",
      toolCalls: [{ toolName: "create_assignment", arguments: { projectId: PROJECT_A, talentId: TALENT_A, allocationPct: 50 } }],
    });
    signIn(actor(["MANAGER"], MANAGER));
    const outcome = await handleGatewayRequest({ message: "Assign them.", agent: TEST_AGENT });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.response.answer).toBe(NO_ANSWER_APPROVAL_PENDING);
    expect(outcome.response.requiresApproval).toBe(true);
    expect(harness.executions.get("create_assignment")).toBeUndefined();
    expect(harness.runs.closed).toEqual(["awaiting_approval"]);
  });
});
