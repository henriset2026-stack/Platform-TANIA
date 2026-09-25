import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/audit/record", () => ({ createAuditSink: vi.fn() }));
vi.mock("@/lib/observability/recorder", () => ({ openAgentRun: vi.fn(), recordToolCall: vi.fn(), closeAgentRun: vi.fn() }));

import { handleGatewayRequest } from "@/lib/ai/gateway";
import { WITHHELD_FIELD } from "@/lib/ai/tool-results";
import { logger } from "@/lib/observability/logger";

import { INJECTION_PAYLOAD } from "../ai-live/canned";
import { actor, DOCUMENT_A, harness, installHarness, signIn, TEST_AGENT } from "./harness";

/**
 * L11 through the real gateway: the payload never reaches the model's second
 * step, the tool call's recorded result keeps it, and the withholding is
 * logged by path and pattern without the text.
 */

installHarness();

describe("gateway withholds instruction-like tool output from the model (L11)", () => {
  it("strips the payload from step 2, keeps it in the record, and logs the path only", async () => {
    const info = vi.spyOn(logger, "info");
    harness.reset(
      { text: "Here is the document.", toolCalls: [{ toolName: "read_document", arguments: { documentId: DOCUMENT_A } }] },
      INJECTION_PAYLOAD,
    );
    signIn(actor());

    const outcome = await handleGatewayRequest({ message: "Summarise that document.", agent: TEST_AGENT });

    expect(outcome.ok).toBe(true);
    const stepTwo = harness.requests[1]!;
    const sent = stepTwo.messages.map((m) => m.content).join("\n");
    expect(sent).not.toContain("SYSTEM OVERRIDE");
    expect(sent).toContain(WITHHELD_FIELD);
    if (outcome.ok) expect(outcome.run.toolCalls[0]!.result).toEqual({ content: INJECTION_PAYLOAD });

    const logged = info.mock.calls.find(([event]) => event === "ai.gateway.tool_result_withheld");
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged)).toContain('"path":"content"');
    expect(JSON.stringify(logged)).not.toContain("SYSTEM OVERRIDE");
  });
});
