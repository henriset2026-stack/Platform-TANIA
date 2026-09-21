import { describe, expect, it } from "vitest";

import {
  MIN_FEASIBILITY_COVERAGE,
  evaluateStageTransition,
  scoreFeasibility,
  validateFeasibilityProfile,
  type FeasibilityCriterion,
  type FeasibilityProfile,
} from "@/lib/calculations/feasibility";
import {
  calculateBudgetPosition,
  classifyFigure,
  evaluateBudgetAlerts,
  summarizePortfolio,
  type BudgetLine,
  type BudgetThreshold,
} from "@/lib/calculations/budget";

// ===========================================================================
// Feasibility
// ===========================================================================
const criteria: FeasibilityCriterion[] = [
  { id: "c1", code: "value", name: "Business value", higherIsBetter: true },
  { id: "c2", code: "risk", name: "Delivery risk", higherIsBetter: false },
];

function profile(over: Partial<FeasibilityProfile> = {}): FeasibilityProfile {
  return {
    id: "p1",
    code: "default",
    name: "Default",
    weights: [
      { criterionId: "c1", weight: 0.5 },
      { criterionId: "c2", weight: 0.5 },
    ],
    approveThreshold: 70,
    reviewThreshold: 50,
    approved: true,
    ...over,
  };
}

describe("feasibility profile validation", () => {
  it("accepts a valid profile", () => {
    expect(validateFeasibilityProfile(profile())).toEqual([]);
  });

  it("rejects weights that do not sum to one", () => {
    expect(
      validateFeasibilityProfile(profile({ weights: [{ criterionId: "c1", weight: 0.4 }] })),
    ).toContainEqual({ kind: "WEIGHTS_NOT_ONE", total: 0.4 });
  });

  it("rejects inverted thresholds", () => {
    expect(
      validateFeasibilityProfile(profile({ approveThreshold: 40, reviewThreshold: 60 })),
    ).toContainEqual({ kind: "THRESHOLDS_INVERTED" });
  });

  it("rejects an empty profile", () => {
    expect(validateFeasibilityProfile(profile({ weights: [] }))).toEqual([
      { kind: "EMPTY_PROFILE" },
    ]);
  });
});

describe("feasibility scoring", () => {
  // A risk score of 80 means high risk, which is bad.
  it("inverts criteria where a high score is bad", () => {
    const result = scoreFeasibility({
      profile: profile(),
      criteria,
      scores: [
        { criterionId: "c1", score: 80 },
        { criterionId: "c2", score: 80 },
      ],
    });
    expect(result.scored).toBe(true);
    if (!result.scored) return;
    // (80 + (100-80)) / 2 = 50, not 80.
    expect(result.totalScore).toBe(50);
  });

  it("recommends approval above the configured threshold", () => {
    const result = scoreFeasibility({
      profile: profile(),
      criteria,
      scores: [
        { criterionId: "c1", score: 90 },
        { criterionId: "c2", score: 10 },
      ],
    });
    if (!result.scored) throw new Error("expected scored");
    expect(result.totalScore).toBe(90);
    expect(result.recommendation).toBe("RECOMMEND_APPROVE");
  });

  it("honours a different configured threshold", () => {
    const strict = profile({ approveThreshold: 95 });
    const result = scoreFeasibility({
      profile: strict,
      criteria,
      scores: [
        { criterionId: "c1", score: 90 },
        { criterionId: "c2", score: 10 },
      ],
    });
    if (!result.scored) throw new Error("expected scored");
    expect(result.recommendation).toBe("RECOMMEND_REVIEW");
  });

  // A case judged on a third of its criteria is not a judgement.
  it("refuses to recommend below the coverage floor", () => {
    const wide = profile({
      weights: [
        { criterionId: "c1", weight: 0.2 },
        { criterionId: "c2", weight: 0.8 },
      ],
    });
    const result = scoreFeasibility({
      profile: wide,
      criteria,
      scores: [{ criterionId: "c1", score: 100 }],
    });
    if (!result.scored) throw new Error("expected scored");
    expect(result.coverage).toBeLessThan(MIN_FEASIBILITY_COVERAGE * 100);
    expect(result.recommendation).toBe("INSUFFICIENT_DATA");
  });

  it("does not count an unscored criterion as zero", () => {
    const result = scoreFeasibility({
      profile: profile(),
      criteria,
      scores: [{ criterionId: "c1", score: 100 }],
    });
    if (!result.scored) throw new Error("expected scored");
    expect(result.totalScore).toBe(100);
    expect(result.unscoredCriterionIds).toEqual(["c2"]);
  });

  it("refuses when nothing is scored", () => {
    const result = scoreFeasibility({ profile: profile(), criteria, scores: [] });
    expect(result.scored).toBe(false);
  });

  it("never decides — a score is a recommendation", () => {
    const result = scoreFeasibility({
      profile: profile(),
      criteria,
      scores: [
        { criterionId: "c1", score: 100 },
        { criterionId: "c2", score: 0 },
      ],
    });
    if (!result.scored) throw new Error("expected scored");
    expect(result.claimKind).toBe("RECOMMENDATION");
    expect(result.requiresHumanApproval).toBe(true);
  });

  it("flags an unapproved weighting profile", () => {
    const result = scoreFeasibility({
      profile: profile({ approved: false }),
      criteria,
      scores: [
        { criterionId: "c1", score: 80 },
        { criterionId: "c2", score: 20 },
      ],
    });
    if (!result.scored) throw new Error("expected scored");
    expect(result.usedUnapprovedProfile).toBe(true);
  });
});

describe("feasibility stage transitions", () => {
  const human = (permissions: string[]) => ({ permissions, isAiService: false });

  it("refuses an AI identity outright", () => {
    const result = evaluateStageTransition("decision", "approved", {
      permissions: ["project.update"],
      isAiService: true,
    });
    expect(result.allowed).toBe(false);
  });

  it("requires project.update to approve", () => {
    expect(
      evaluateStageTransition("decision", "approved", human(["project.read"])).allowed,
    ).toBe(false);
    expect(
      evaluateStageTransition("decision", "approved", human(["project.update"])).allowed,
    ).toBe(true);
  });

  it("allows rejection from any pre-decision stage", () => {
    for (const stage of ["intake", "scoring", "resource_check", "business_case"] as const) {
      expect(
        evaluateStageTransition(stage, "rejected", human(["project.update"])).allowed,
        stage,
      ).toBe(true);
    }
  });

  it("does not allow approval from intake", () => {
    expect(
      evaluateStageTransition("intake", "approved", human(["project.update"])).allowed,
    ).toBe(false);
  });

  it("does not reopen a rejected case", () => {
    expect(
      evaluateStageTransition("rejected", "scoring", human(["project.update"])).allowed,
    ).toBe(false);
  });
});

// ===========================================================================
// Budget — the no-fabrication rules
// ===========================================================================
function line(over: Partial<BudgetLine> = {}): BudgetLine {
  return {
    projectId: "p1",
    projectName: "Project",
    fiscalYear: 2026,
    currency: "IDR",
    planned: 1000,
    committed: 600,
    realized: 300,
    externalSource: "SAP",
    externalSyncedAt: "2026-09-21T00:00:00.000Z",
    ...over,
  };
}

describe("budget figures", () => {
  it("distinguishes unknown from not-integrated", () => {
    expect(classifyFigure(null, null, null, { externalOwned: true }).state).toBe(
      "not-integrated",
    );
    expect(
      classifyFigure(null, "SAP", "2026-09-21T00:00:00.000Z", { externalOwned: true }).state,
    ).toBe("unknown");
    expect(classifyFigure(500, "SAP", "2026-09-21T00:00:00.000Z").state).toBe("known");
  });
});

describe("budget position", () => {
  it("derives from known figures", () => {
    const position = calculateBudgetPosition(line());
    expect(position.uncommitted).toBe(400);
    expect(position.outstanding).toBe(300);
    expect(position.commitmentPct).toBe(60);
    expect(position.realizationPct).toBe(30);
  });

  // The rule that prevents overspend: unknown must not become zero.
  it("propagates null rather than assuming zero", () => {
    const position = calculateBudgetPosition(
      line({ committed: null, realized: null, externalSource: null, externalSyncedAt: null }),
    );
    expect(position.uncommitted).toBeNull();
    expect(position.outstanding).toBeNull();
    expect(position.commitmentPct).toBeNull();
    expect(position.realizationPct).toBeNull();
    expect(position.committed.state).toBe("not-integrated");
  });

  it("returns null rather than infinity for a zero plan", () => {
    const position = calculateBudgetPosition(line({ planned: 0 }));
    expect(position.commitmentPct).toBeNull();
    expect(position.realizationPct).toBeNull();
  });

  it("keeps a partially known position partial", () => {
    const position = calculateBudgetPosition(line({ realized: null }));
    expect(position.commitmentPct).toBe(60);
    expect(position.realizationPct).toBeNull();
  });
});

describe("budget alerts", () => {
  const thresholds: BudgetThreshold[] = [
    { code: "warn", name: "Approaching plan", thresholdPct: 80, severity: "warning" },
    { code: "crit", name: "Over plan", thresholdPct: 100, severity: "critical" },
  ];

  it("fires the most severe breached threshold only", () => {
    const l = line({ committed: 1100 });
    const alerts = evaluateBudgetAlerts(l, calculateBudgetPosition(l), thresholds);
    const commitment = alerts.filter((a) => a.basis === "commitment");
    expect(commitment).toHaveLength(1);
    expect(commitment[0]?.severity).toBe("critical");
  });

  // Neither invent a breach nor suppress one by assuming zero.
  it("never fires on an unknown figure", () => {
    const l = line({ committed: null, realized: null, externalSource: null, externalSyncedAt: null });
    expect(evaluateBudgetAlerts(l, calculateBudgetPosition(l), thresholds)).toEqual([]);
  });

  it("does not fire below the threshold", () => {
    const l = line({ committed: 500, realized: 100 });
    expect(evaluateBudgetAlerts(l, calculateBudgetPosition(l), thresholds)).toEqual([]);
  });
});

describe("portfolio roll-up", () => {
  it("sums known figures and flags partial totals", () => {
    const summary = summarizePortfolio([
      line({ projectId: "a" }),
      line({ projectId: "b", realized: null }),
    ]);
    if ("error" in summary) throw new Error("unexpected error");
    expect(summary.totalPlanned).toBe(2000);
    expect(summary.totalRealized).toBe(300);
    expect(summary.realizedKnownCount).toBe(1);
    // The flag that stops a partial total being read as complete.
    expect(summary.partial).toBe(true);
  });

  it("is not partial when everything is known", () => {
    const summary = summarizePortfolio([line({ projectId: "a" }), line({ projectId: "b" })]);
    if ("error" in summary) throw new Error("unexpected error");
    expect(summary.partial).toBe(false);
  });

  it("refuses to sum mixed currencies", () => {
    const summary = summarizePortfolio([
      line({ projectId: "a", currency: "IDR" }),
      line({ projectId: "b", currency: "USD" }),
    ]);
    expect(summary).toEqual({ error: "MIXED_CURRENCY" });
  });

  it("handles an empty portfolio without inventing zeros", () => {
    const summary = summarizePortfolio([]);
    if ("error" in summary) throw new Error("unexpected error");
    expect(summary.totalPlanned).toBeNull();
    expect(summary.lineCount).toBe(0);
  });
});
