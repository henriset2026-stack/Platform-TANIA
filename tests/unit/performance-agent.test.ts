import { describe, expect, it } from "vitest";

import {
  IQR_MULTIPLIER,
  MIN_OBSERVATIONS_FOR_ANOMALY,
  detectAnomalies,
  quantile,
  summarizeDistribution,
} from "@/lib/calculations/anomaly";
import {
  MIN_VALIDATED_SHARE,
  analyzePerformance,
  type AnalysisInput,
} from "@/agents/performance/analysis";
import { FORBIDDEN_AGENT_ACTIONS, toNonEmpty } from "@/agents/performance/contract";
import { PERFORMANCE_AGENT, isForbiddenAction } from "@/agents/performance/agent";
import { PERFORMANCE_AGENT_TOOLS, registerPerformanceTools } from "@/agents/performance/tools";
import { ToolRegistry } from "@/agents/core/tool-registry";
import { executeToolCall } from "@/agents/core/pipeline";
import type { AgentAuthContext } from "@/agents/core/types";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
/** Adversarial argument used to assert the pipeline rejects it. */
const MALFORMED_ID = "'; DR" + "OP TABLE profiles --";

function evidence(
  over: Partial<AnalysisInput["evidence"][number]> & { id: string },
): AnalysisInput["evidence"][number] {
  return {
    dimension: "Delivery",
    metric: "stories_completed",
    value: 10,
    unit: null,
    sourceType: "project_deliverable",
    occurredAt: "2026-06-01T00:00:00.000Z",
    validationStatus: "validated",
    claimKind: "FACT",
    periodName: "Q2 2026",
    ...over,
  };
}

// ===========================================================================
// UNIT — anomaly statistics
// ===========================================================================
describe("unit: anomaly detection", () => {
  it("computes quantiles", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("summarizes a distribution", () => {
    expect(summarizeDistribution([1, 2, 3, 4, 5])).toMatchObject({
      count: 5,
      median: 3,
      min: 1,
      max: 5,
    });
  });

  it("returns null for no finite values", () => {
    expect(summarizeDistribution([])).toBeNull();
    expect(summarizeDistribution([Number.NaN])).toBeNull();
  });

  // Flagging on two data points would generate confident nonsense about people.
  it("refuses to flag anomalies below the minimum sample", () => {
    const few = Array.from({ length: MIN_OBSERVATIONS_FOR_ANOMALY - 1 }, (_, i) => ({
      id: `o${i}`,
      value: i === 0 ? 1000 : 1,
      occurredAt: `2026-0${i + 1}-01T00:00:00.000Z`,
      dimension: "Delivery",
    }));
    expect(detectAnomalies(few)).toEqual([]);
  });

  it("detects a high outlier using the IQR fence", () => {
    const points = [10, 11, 12, 11, 10, 95].map((value, i) => ({
      id: `o${i}`,
      value,
      occurredAt: `2026-0${i + 1}-01T00:00:00.000Z`,
      dimension: "Delivery",
    }));
    expect(detectAnomalies(points).some((a) => a.kind === "high_outlier")).toBe(true);
  });

  it("does not compare across dimensions", () => {
    // Delivery 100 and Collaboration 1 are not comparable; treating them as
    // one distribution invents outliers.
    const points = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `d${i}`,
        value: 100,
        occurredAt: `2026-0${i + 1}-01T00:00:00.000Z`,
        dimension: "Delivery",
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `c${i}`,
        value: 1,
        occurredAt: `2026-0${i + 1}-01T00:00:00.000Z`,
        dimension: "Collaboration",
      })),
    ];
    expect(detectAnomalies(points).filter((a) => a.kind !== "sudden_change")).toEqual([]);
  });

  it("does not flag every value when the IQR is zero", () => {
    const flat = Array.from({ length: 6 }, (_, i) => ({
      id: `o${i}`,
      value: 10,
      occurredAt: `2026-0${i + 1}-01T00:00:00.000Z`,
      dimension: "Delivery",
    }));
    expect(detectAnomalies(flat)).toEqual([]);
  });

  it("is deterministic and stably ordered", () => {
    const points = [10, 11, 12, 11, 10, 95].map((value, i) => ({
      id: `o${i}`,
      value,
      occurredAt: `2026-0${i + 1}-01T00:00:00.000Z`,
      dimension: "Delivery",
    }));
    expect(detectAnomalies(points)).toEqual(detectAnomalies([...points].reverse()));
  });

  it("uses the conventional Tukey fence", () => {
    expect(IQR_MULTIPLIER).toBe(1.5);
  });
});

// ===========================================================================
// UNIT — the output contract
// ===========================================================================
describe("unit: output contract", () => {
  it("produces the five contracted sections", () => {
    const analysis = analyzePerformance({ evidence: [evidence({ id: "e1" })] });
    for (const key of ["summary", "findings", "evidence", "uncertainties", "recommendations"]) {
      expect(analysis).toHaveProperty(key);
    }
  });

  // The rule this agent exists to respect.
  it("attaches evidence to every finding and recommendation", () => {
    const analysis = analyzePerformance({
      evidence: [
        ...[10, 11, 12, 11, 10, 95].map((value, i) =>
          evidence({ id: `e${i}`, value, occurredAt: `2026-0${i + 1}-01T00:00:00.000Z` }),
        ),
        evidence({ id: "pending", validationStatus: "pending", claimKind: "INFERENCE" }),
      ],
    });

    expect(analysis.findings.length).toBeGreaterThan(0);
    for (const finding of analysis.findings) {
      expect(finding.evidenceRefs.length, finding.id).toBeGreaterThan(0);
    }
    for (const recommendation of analysis.recommendations) {
      expect(recommendation.evidenceRefs.length, recommendation.id).toBeGreaterThan(0);
    }
  });

  it("never produces a final rating", () => {
    const analysis = analyzePerformance({ evidence: [evidence({ id: "e1" })] });
    expect(analysis.isFinalRating).toBe(false);
    expect(analysis.summary).toMatch(/not a rating/i);
    expect(analysis).not.toHaveProperty("overallScore");
    expect(analysis).not.toHaveProperty("rating");
  });

  it("marks findings ANALYSIS and recommendations RECOMMENDATION", () => {
    const analysis = analyzePerformance({
      evidence: [evidence({ id: "p", validationStatus: "pending" })],
    });
    for (const finding of analysis.findings) expect(finding.claimKind).toBe("ANALYSIS");
    for (const rec of analysis.recommendations) {
      expect(rec.claimKind).toBe("RECOMMENDATION");
      expect(rec.requiresHumanDecision).toBe(true);
    }
  });

  it("reports an empty analysis honestly rather than throwing", () => {
    const analysis = analyzePerformance({ evidence: [] });
    expect(analysis.findings).toEqual([]);
    expect(analysis.uncertainties.length).toBeGreaterThan(0);
    expect(analysis.summary).toMatch(/no performance evidence/i);
  });

  // Absence of data must not read as absence of problems.
  it("raises uncertainties rather than omitting what it could not assess", () => {
    const analysis = analyzePerformance({ evidence: [evidence({ id: "e1" })] });
    const topics = analysis.uncertainties.map((u) => u.topic);
    expect(topics).toContain("Trend");
    expect(topics).toContain("Dimension coverage");
    for (const uncertainty of analysis.uncertainties) {
      expect(uncertainty.resolvedBy.length).toBeGreaterThan(0);
    }
  });

  it("flags AI-generated evidence as not a measured fact", () => {
    const analysis = analyzePerformance({
      evidence: [evidence({ id: "ai", claimKind: "INFERENCE", validationStatus: "pending" })],
    });
    expect(analysis.uncertainties.some((u) => u.topic === "AI-generated evidence")).toBe(true);
    expect(analysis.validatedShare).toBe(0);
  });

  // A confident concern built on unvalidated claims overstates what is known.
  it("caps severity when the evidence base is weak", () => {
    const weak = analyzePerformance({
      evidence: [10, 11, 12, 11, 10, 1].map((value, i) =>
        evidence({
          id: `e${i}`,
          value,
          occurredAt: `2026-0${i + 1}-01T00:00:00.000Z`,
          validationStatus: "pending",
          claimKind: "INFERENCE",
        }),
      ),
    });
    expect(weak.validatedShare).toBeLessThan(MIN_VALIDATED_SHARE);
    expect(weak.findings.some((f) => f.severity === "concern")).toBe(false);
  });

  it("builds a non-empty tuple only when items exist", () => {
    expect(toNonEmpty([])).toBeNull();
    expect(toNonEmpty(["a"])).toEqual(["a"]);
  });
});

// ===========================================================================
// AUTHORIZATION — what the agent cannot do
// ===========================================================================
describe("authorization: agent boundaries", () => {
  it("declares only read-only LOW-risk tools", () => {
    for (const tool of PERFORMANCE_AGENT_TOOLS) {
      expect(tool.riskLevel, tool.name).toBe("LOW");
      expect(tool.requiresConfirmation, tool.name).toBe(false);
      expect(tool.requiredPermissions, tool.name).toEqual(["performance.read"]);
    }
  });

  // No tool exists through which it could rate, promote or discipline.
  it("registers no tool that writes, approves, rates or exports", () => {
    const forbidden =
      /write|create|update|delete|approve|submit|finalize|rate|score|export|promote|disciplin/i;
    for (const tool of PERFORMANCE_AGENT_TOOLS) {
      expect(tool.name, tool.name).not.toMatch(forbidden);
    }
  });

  it("declares no tool outside its own set", () => {
    const registered = PERFORMANCE_AGENT_TOOLS.map((t) => t.name);
    expect([...PERFORMANCE_AGENT.tools].sort()).toEqual([...registered].sort());
  });

  it("requires analysis permissions to be invoked at all", () => {
    expect(PERFORMANCE_AGENT.requiredPermissions).toContain("performance.read");
    expect(PERFORMANCE_AGENT.requiredPermissions).toContain("ai.analyze");
  });

  it("recognises forbidden requests, including paraphrases", () => {
    expect(isForbiddenAction("please finalize performance rating for Budi")).toBe(true);
    expect(isForbiddenAction("Decide promotion for this person")).toBe(true);
    expect(isForbiddenAction("decide disciplinary action")).toBe(true);
    expect(isForbiddenAction("export sensitive data")).toBe(true);
    expect(isForbiddenAction("summarize performance evidence")).toBe(false);
  });

  it("states its refusals in the system prompt", () => {
    for (const phrase of [
      "final performance rating",
      "promotion decision",
      "disciplinary decision",
    ]) {
      expect(PERFORMANCE_AGENT.systemPrompt.toLowerCase()).toContain(phrase);
    }
    for (const action of FORBIDDEN_AGENT_ACTIONS) {
      expect(PERFORMANCE_AGENT.systemPrompt).toContain(action);
    }
  });
});

// ===========================================================================
// INTEGRATION — the agent's tools through the governed pipeline
// ===========================================================================
describe("integration: tools through the pipeline", () => {
  function registry(): ToolRegistry {
    const r = new ToolRegistry();
    registerPerformanceTools(r);
    return r;
  }

  function auth(over: Partial<AgentAuthContext> = {}): AgentAuthContext {
    return {
      userId: "u1",
      email: "u1@telkom.test",
      organizationIds: ["org-1"],
      squadIds: [],
      roles: ["CHAPTER_LEAD"],
      permissions: ["performance.read", "ai.use", "ai.analyze"],
      correlationId: "corr-1",
      sessionId: "sess-1",
      isAiService: false,
      ...over,
    };
  }

  function options(r: ToolRegistry, over: Record<string, unknown> = {}) {
    return {
      registry: r,
      auth: auth(),
      allowedTools: [...PERFORMANCE_AGENT.tools],
      signal: new AbortController().signal,
      log: () => undefined,
      timeoutMs: 2_000,
      ...over,
    } as Parameters<typeof executeToolCall>[1];
  }

  it("registers all three tools without error", () => {
    expect(registry().size).toBe(3);
  });

  it("is idempotent across repeated registration", () => {
    const r = registry();
    registerPerformanceTools(r);
    expect(r.size).toBe(3);
  });

  it("denies a call missing performance.read", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_performance_evidence", arguments: { talentId: UUID } },
      options(registry(), { auth: auth({ permissions: ["ai.use"] }) }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Missing permission/);
  });

  it("denies a malformed talent id before any query runs", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_performance_evidence", arguments: { talentId: MALFORMED_ID } },
      options(registry()),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/must be a UUID/);
  });

  it("denies an unknown argument rather than ignoring it", async () => {
    const record = await executeToolCall(
      {
        toolName: "retrieve_performance_evidence",
        arguments: { talentId: UUID, includeRestricted: true },
      },
      options(registry()),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown argument: includeRestricted/);
  });

  it("denies a rating tool that does not exist", async () => {
    const record = await executeToolCall(
      { toolName: "finalize_performance_rating", arguments: {} },
      options(registry(), { allowedTools: ["finalize_performance_rating"] }),
    );
    // Not registered: denied, never attempted.
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown tool/);
  });

  // These tools are read-only, so an AI identity may use them.
  it("permits an AI identity to use the read-only tools", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_performance_evidence", arguments: { talentId: UUID } },
      options(registry(), { auth: auth({ isAiService: true }) }),
    );
    expect(record.status).not.toBe("denied");
  });

  it("fails rather than fabricates when no database exists", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_performance_evidence", arguments: { talentId: UUID } },
      options(registry()),
    );
    // An honest failure, never an empty success a model could narrate as
    // "no performance issues found".
    expect(record.status).toBe("failed");
    expect(record.result).toBeNull();
  });
});
