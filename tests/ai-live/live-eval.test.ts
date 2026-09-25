import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/audit/record", () => ({ createAuditSink: vi.fn() }));
vi.mock("@/lib/observability/recorder", () => ({ openAgentRun: vi.fn(), recordToolCall: vi.fn(), closeAgentRun: vi.fn() }));
// Real tool definitions, canned handlers (see canned.ts).
vi.mock("@/agents/capability/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agents/capability/tools")>();
  const { withCannedHandlers } = await import("./canned");
  return { ...actual, registerCapabilityTools: (r: Parameters<typeof actual.registerCapabilityTools>[0]) => actual.registerCapabilityTools(withCannedHandlers(r)) };
});
vi.mock("@/agents/performance/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agents/performance/tools")>();
  const { withCannedHandlers } = await import("./canned");
  return { ...actual, registerPerformanceTools: (r: Parameters<typeof actual.registerPerformanceTools>[0]) => actual.registerPerformanceTools(withCannedHandlers(r)) };
});
vi.mock("@/agents/development/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agents/development/tools")>();
  const { withCannedHandlers } = await import("./canned");
  return { ...actual, registerDevelopmentTools: (r: Parameters<typeof actual.registerDevelopmentTools>[0]) => actual.registerDevelopmentTools(withCannedHandlers(r)) };
});

import { readAiConfig } from "@/lib/ai/config";
import { handleGatewayRequest, type GatewayOutcome } from "@/lib/ai/gateway";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { OpenAiCompatibleProvider } from "@/lib/ai/providers/openai-compatible";
import { createAuditSink } from "@/lib/audit/record";
import { getAuthContext } from "@/lib/auth/session";
import { closeAgentRun, openAgentRun, recordToolCall } from "@/lib/observability/recorder";

import { ORG_A } from "./canned";
import { LIVE_CASES, type LiveCase } from "./cases";

/**
 * Live model evaluation: the configured Gemini model behind the REAL gateway,
 * pipeline, tool specs, output-schema check, fencing and output guard. Only
 * identity, audit/run persistence and tool data are stubbed.
 *
 * Skipped, never passed, unless LLM_PROVIDER is gemini or openai-compatible and the gateway is fully
 * configured: a green result without a model would be fabricated.
 *
 *   set -a; . ./.env.local; set +a; npm run test:ai:live
 *
 * Writes test-results/ai-live-eval-<timestamp>.json. Quality checks use
 * expect.soft, so every case runs and each miss is reported.
 */

const config = readAiConfig();
const LIVE = (config.providerName === "gemini" || config.providerName === "openai-compatible") && config.configured;
const DELAY_MS = Number(process.env.LIVE_EVAL_DELAY_MS ?? 12_000);

const PERMISSIONS = ["ai.use", "ai.analyze", "talent.read", "capability.read", "performance.read", "development.read"];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

interface ModelCall {
  toolsOffered: number;
  proposed: string[];
}

interface CaseResult {
  id: string;
  category: string;
  outcome: string;
  answer: string | null;
  proposedTools: string[];
  toolStatuses: string[];
  checks: {
    toolSelection: boolean | null;
    grounded: boolean;
    noFabrication: boolean;
    citation: boolean | null;
    argumentsFromQuestion: boolean;
  };
  missing: string[];
  forbidden: string[];
  inventedIds: string[];
  modelCalls: number;
  attempts: number;
  ignoredStepTwoToolCalls: number;
  latencyMs: number | null;
  tokens: { prompt: number | null; completion: number | null; total: number | null };
}

const results: CaseResult[] = [];
let calls: ModelCall[] = [];
let attempts = 0;

// Observe every model call, whichever adapter is configured.
for (const Adapter of [GeminiProvider, OpenAiCompatibleProvider]) {
  const original = Adapter.prototype.complete;
  vi.spyOn(Adapter.prototype, "complete").mockImplementation(async function (this: InstanceType<typeof Adapter>, request) {
    const result = await original.call(this, request);
    calls.push({ toolsOffered: request.tools.length, proposed: result.ok ? result.toolCalls.map((c) => c.toolName) : [] });
    return result;
  });
}

vi.mocked(createAuditSink).mockImplementation(() => async () => ({ ok: true, eventId: "live-eval" }));
vi.mocked(openAgentRun).mockResolvedValue({ ok: true, value: "live-eval-run" });
vi.mocked(recordToolCall).mockResolvedValue({ ok: true, value: "live-eval-call" });
vi.mocked(closeAgentRun).mockResolvedValue({ ok: true, value: true });

function signInFresh(): void {
  const userId = crypto.randomUUID();
  vi.mocked(getAuthContext).mockResolvedValue({
    userId,
    email: `${userId}@example.test`,
    organizationIds: [ORG_A],
    squadIds: [],
    roles: ["CHAPTER_LEAD"],
    permissions: PERMISSIONS,
  });
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(testCase: LiveCase): Promise<GatewayOutcome> {
  for (let attempt = 0; ; attempt += 1) {
    calls = [];
    signInFresh();
    const outcome = await handleGatewayRequest({
      message: testCase.message,
      ...(testCase.pageContext ? { pageContext: testCase.pageContext } : {}),
    });
    // Retry transient provider failures (429, 5xx, timeouts) so one outage
    // does not sink every case. The attempt count is reported per case.
    const transient = !outcome.ok && ["RATE_LIMITED", "PROVIDER_ERROR", "TIMEOUT"].includes(outcome.code);
    attempts = attempt + 1;
    if (!transient || attempt >= 2) return outcome;
    await pause(20_000);
  }
}

function idsIn(value: unknown): string[] {
  return JSON.stringify(value ?? null).match(UUID) ?? [];
}

describe.skipIf(!LIVE)(`live model evaluation (${config.model ?? "no model"})`, () => {
  it.each(LIVE_CASES.map((c) => [c.id, c] as const))("%s", async (_id, testCase) => {
    if (results.length > 0) await pause(DELAY_MS);
    const outcome = await ask(testCase);

    if (!outcome.ok) {
      results.push({
        id: testCase.id, category: testCase.category, outcome: outcome.code, answer: null, proposedTools: [], toolStatuses: [],
        checks: { toolSelection: null, grounded: false, noFabrication: false, citation: null, argumentsFromQuestion: true },
        missing: [], forbidden: [], inventedIds: [], modelCalls: calls.length, attempts, ignoredStepTwoToolCalls: 0, latencyMs: null,
        tokens: { prompt: null, completion: null, total: null },
      });
      expect.fail(`Gateway returned ${outcome.code}: ${outcome.message}`);
    }

    const { response, run } = outcome;
    const answer = response.answer;
    const proposed = run.toolCalls.map((c) => c.toolName);
    const completed = run.toolCalls.filter((c) => c.status === "completed");
    const missing = testCase.mustInclude.filter((p) => !p.test(answer)).map(String);
    const forbidden = testCase.mustNotInclude.filter((p) => p.test(answer)).map(String);
    const message = testCase.message.toLowerCase();
    const inventedIds = run.toolCalls.flatMap((c) => idsIn(c.arguments)).filter((id) => !message.includes(id.toLowerCase()));
    const stepTwo = calls.filter((c) => c.toolsOffered === 0);

    // "Ambiguous identity" accepts any id-free behaviour; argument honesty scores it.
    const toolSelection =
      testCase.category === "ambiguous_identity"
        ? null
        : testCase.expectTools.length === 0
          ? proposed.length === 0
          : testCase.expectTools.some((t) => proposed.includes(t));
    const citation = completed.length > 0 ? /\[T\d+\]/.test(answer) : null;

    results.push({
      id: testCase.id,
      category: testCase.category,
      outcome: "ok",
      answer,
      proposedTools: proposed,
      toolStatuses: run.toolCalls.map((c) => `${c.toolName}:${c.status}`),
      checks: {
        toolSelection,
        grounded: missing.length === 0,
        noFabrication: forbidden.length === 0,
        citation,
        argumentsFromQuestion: inventedIds.length === 0,
      },
      missing,
      forbidden,
      inventedIds,
      modelCalls: calls.length,
      attempts,
      ignoredStepTwoToolCalls: stepTwo.reduce((n, c) => n + c.proposed.length, 0),
      latencyMs: run.latencyMs,
      tokens: { prompt: run.usage?.promptTokens ?? null, completion: run.usage?.completionTokens ?? null, total: run.usage?.totalTokens ?? null },
    });

    // Hard: what the gateway guarantees regardless of the model.
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(calls.slice(1).every((c) => c.toolsOffered === 0)).toBe(true);

    // Soft: the model's behaviour. Each miss is a finding, not a crash.
    if (toolSelection !== null) expect.soft(toolSelection, `tool selection; proposed [${proposed.join(", ")}]`).toBe(true);
    expect.soft(missing, "facts missing from the answer").toEqual([]);
    expect.soft(forbidden, "unsupported claims in the answer").toEqual([]);
    if (citation !== null) expect.soft(citation, "tool-backed answer cites [T#]").toBe(true);
    expect.soft(inventedIds, "ids passed to tools that the question did not contain").toEqual([]);
  });

  afterAll(() => {
    const rate = (key: keyof CaseResult["checks"]) => {
      const scored = results.filter((r) => r.outcome === "ok" && r.checks[key] !== null);
      return { passed: scored.filter((r) => r.checks[key] === true).length, scored: scored.length };
    };
    const ok = results.filter((r) => r.outcome === "ok");
    const latencies = ok.map((r) => r.latencyMs ?? 0).sort((a, b) => a - b);
    const summary = {
      provider: config.providerName,
      model: config.model,
      ranAt: new Date().toISOString(),
      cases: results.length,
      gatewayOk: ok.length,
      gatewayErrors: results.filter((r) => r.outcome !== "ok").map((r) => `${r.id}:${r.outcome}`),
      toolSelection: rate("toolSelection"),
      grounded: rate("grounded"),
      noFabrication: rate("noFabrication"),
      citation: rate("citation"),
      argumentsFromQuestion: rate("argumentsFromQuestion"),
      ignoredStepTwoToolCalls: results.reduce((n, r) => n + r.ignoredStepTwoToolCalls, 0),
      latencyMs: latencies.length ? { p50: latencies[Math.floor(latencies.length / 2)], max: latencies[latencies.length - 1] } : null,
      totalTokens: ok.reduce((n, r) => n + (r.tokens.total ?? 0), 0),
    };
    const dir = join(process.cwd(), "test-results");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `ai-live-eval-${summary.ranAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify({ summary, results }, null, 2));
    process.stdout.write(`\nLive evaluation summary (${file}):\n${JSON.stringify(summary, null, 2)}\n`);
  });
});

describe.skipIf(LIVE)("live model evaluation", () => {
  it.skip("skipped: set LLM_PROVIDER (gemini or openai-compatible), AI_GATEWAY_URL, AI_GATEWAY_KEY and LLM_MODEL", () => {});
});
