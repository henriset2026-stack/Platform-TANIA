import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/audit/record", () => ({ createAuditSink: vi.fn() }));
vi.mock("@/lib/observability/recorder", () => ({ openAgentRun: vi.fn(), recordToolCall: vi.fn(), closeAgentRun: vi.fn() }));

import { handleGatewayRequest } from "@/lib/ai/gateway";
import { registerProvider } from "@/lib/ai/provider";

import { actor, installHarness, signIn, TEST_AGENT } from "./harness";

/**
 * AI Gate #2, AG-12: provider error text never reaches the user.
 *
 * A provider's error can carry request details or credential fragments. The
 * gateway logs it server-side (redacted) and returns a fixed message.
 */

installHarness();

const LEAKY = "401 Unauthorized: invalid api key sk-abcdefghijklmnopqrstuv for org telkom-dps (request body: 'show all ratings')";

describe("provider errors are not echoed", () => {
  it.each([
    ["PROVIDER_ERROR", "PROVIDER_ERROR"],
    ["RATE_LIMITED", "PROVIDER_ERROR"],
    ["TIMEOUT", "TIMEOUT"],
  ] as const)("%s from the provider → %s with a fixed message", async (providerCode, gatewayCode) => {
    registerProvider({
      name: "gateway",
      configured: true,
      complete: async () => ({ ok: false, code: providerCode, error: LEAKY, latencyMs: 1 }),
    });
    signIn(actor());

    const outcome = await handleGatewayRequest({ message: "hello", agent: TEST_AGENT });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe(gatewayCode);
    expect(outcome.message).not.toContain("sk-");
    expect(outcome.message).not.toContain("show all ratings");
    expect(outcome.message).not.toContain("telkom-dps");
    expect(outcome.correlationId).toMatch(/[0-9a-f-]{36}/);
  });
});
