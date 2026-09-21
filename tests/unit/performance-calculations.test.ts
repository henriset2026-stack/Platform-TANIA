import { describe, expect, it } from "vitest";

import {
  PERFORMANCE_DIMENSIONS,
  TREND_STABLE_BAND,
  calculatePerformanceIndex,
  calculateTrend,
  clampScore,
  dimensionName,
  evaluateReviewTransition,
  validateWeightProfile,
  type ReviewActor,
  type ReviewState,
  type WeightProfile,
} from "@/lib/calculations/performance";
import { CLAIM_KINDS, SCOREABLE_KINDS, isScoreable } from "@/types/claim";

const PRD_DIMENSIONS = [
  "Delivery",
  "Productivity",
  "Capability Application",
  "Collaboration",
  "Innovation",
  "AI Augmentation",
  "Business Impact",
];

/** A valid profile. Weights are supplied by the test, never by the engine. */
function profile(
  weights: Array<[string, number]>,
  approved = true,
): WeightProfile {
  return {
    id: "wp-1",
    code: "test",
    name: "Test profile",
    approved,
    weights: weights.map(([dimensionCode, weight]) => ({ dimensionCode, weight })),
  };
}

describe("dimensions", () => {
  it("matches the PRD §6.1 vocabulary", () => {
    expect(PERFORMANCE_DIMENSIONS.map((d) => d.name)).toEqual(PRD_DIMENSIONS);
  });

  it("does not ship weights with the vocabulary", () => {
    for (const dimension of PERFORMANCE_DIMENSIONS) {
      expect(Object.keys(dimension).sort()).toEqual(["code", "name"]);
    }
  });

  it("names dimensions, falling back to the code", () => {
    expect(dimensionName("delivery")).toBe("Delivery");
    expect(dimensionName("unknown_code")).toBe("unknown_code");
  });
});

describe("weight profile validation", () => {
  it("accepts a profile summing to one", () => {
    expect(validateWeightProfile(profile([["delivery", 0.6], ["innovation", 0.4]]))).toEqual([]);
  });

  it("rejects an empty profile", () => {
    expect(validateWeightProfile(profile([]))).toEqual([{ kind: "EMPTY" }]);
  });

  it("rejects weights that do not sum to one", () => {
    const problems = validateWeightProfile(profile([["delivery", 0.5]]));
    expect(problems).toContainEqual({ kind: "SUM_NOT_ONE", total: 0.5 });
  });

  it("rejects a negative weight", () => {
    const problems = validateWeightProfile(
      profile([["delivery", 1.5], ["innovation", -0.5]]),
    );
    expect(problems).toContainEqual({
      kind: "NEGATIVE_WEIGHT",
      dimensionCode: "innovation",
    });
  });

  it("rejects a duplicated dimension", () => {
    const problems = validateWeightProfile(
      profile([["delivery", 0.5], ["delivery", 0.5]]),
    );
    expect(problems).toContainEqual({
      kind: "DUPLICATE_DIMENSION",
      dimensionCode: "delivery",
    });
  });

  it("reports every problem, not just the first", () => {
    const problems = validateWeightProfile(
      profile([["delivery", -0.2], ["delivery", 0.5]]),
    );
    expect(problems.length).toBeGreaterThan(1);
  });
});

describe("performance index", () => {
  it("computes a weighted mean over covered weight", () => {
    const result = calculatePerformanceIndex({
      profile: profile([["delivery", 0.5], ["innovation", 0.5]]),
      scores: [
        { dimensionCode: "delivery", score: 80, kind: "FACT" },
        { dimensionCode: "innovation", score: 60, kind: "ANALYSIS" },
      ],
    });
    expect(result.computed).toBe(true);
    if (!result.computed) return;
    expect(result.index).toBe(70);
    expect(result.coverage).toBe(100);
  });

  // A missing dimension must not be scored as zero.
  it("normalises over covered weight when a dimension is missing", () => {
    const result = calculatePerformanceIndex({
      profile: profile([["delivery", 0.5], ["innovation", 0.5]]),
      scores: [{ dimensionCode: "delivery", score: 80, kind: "FACT" }],
    });
    expect(result.computed).toBe(true);
    if (!result.computed) return;
    expect(result.index).toBe(80);
    expect(result.coverage).toBe(50);
    expect(result.missingDimensions).toEqual(["innovation"]);
  });

  it("refuses to compute from an invalid profile", () => {
    const result = calculatePerformanceIndex({
      profile: profile([["delivery", 0.3]]),
      scores: [{ dimensionCode: "delivery", score: 90, kind: "FACT" }],
    });
    expect(result.computed).toBe(false);
    if (result.computed) return;
    expect(result.problems).toContainEqual({ kind: "SUM_NOT_ONE", total: 0.3 });
  });

  // The central rule: a model's reading is not an input to a rating.
  it("excludes INFERENCE and RECOMMENDATION from the score", () => {
    const result = calculatePerformanceIndex({
      profile: profile([["delivery", 0.5], ["innovation", 0.5]]),
      scores: [
        { dimensionCode: "delivery", score: 100, kind: "FACT" },
        { dimensionCode: "innovation", score: 0, kind: "INFERENCE" },
      ],
    });
    expect(result.computed).toBe(true);
    if (!result.computed) return;
    expect(result.index).toBe(100);
    expect(result.excludedNonScoreable).toEqual(["innovation"]);
  });

  it("refuses when the only inputs are inference", () => {
    const result = calculatePerformanceIndex({
      profile: profile([["delivery", 1]]),
      scores: [{ dimensionCode: "delivery", score: 95, kind: "INFERENCE" }],
    });
    expect(result.computed).toBe(false);
    if (result.computed) return;
    expect(result.reason).toMatch(/inference|recommendation/i);
  });

  it("flags use of an unapproved weighting model", () => {
    const result = calculatePerformanceIndex({
      profile: profile([["delivery", 1]], false),
      scores: [{ dimensionCode: "delivery", score: 70, kind: "FACT" }],
    });
    expect(result.computed).toBe(true);
    if (!result.computed) return;
    expect(result.usedUnapprovedProfile).toBe(true);
  });

  it("clamps scores to 0-100 and ignores non-finite input", () => {
    expect(clampScore(-20)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(Number.NaN)).toBe(0);
  });
});

describe("trend", () => {
  const point = (name: string, end: string, index: number) => ({
    periodId: name,
    periodName: name,
    periodEnd: end,
    index,
  });

  it("orders points by period end regardless of input order", () => {
    const trend = calculateTrend([
      point("Q3", "2026-09-30", 80),
      point("Q1", "2026-03-31", 60),
      point("Q2", "2026-06-30", 70),
    ]);
    expect(trend.points.map((p) => p.periodName)).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("reports direction and change", () => {
    expect(
      calculateTrend([point("a", "2026-01-31", 60), point("b", "2026-02-28", 75)]),
    ).toMatchObject({ direction: "improving", change: 15 });
    expect(
      calculateTrend([point("a", "2026-01-31", 75), point("b", "2026-02-28", 60)]),
    ).toMatchObject({ direction: "declining", change: -15 });
  });

  it("treats small movement as stable rather than a trend", () => {
    const trend = calculateTrend([
      point("a", "2026-01-31", 70),
      point("b", "2026-02-28", 70 + TREND_STABLE_BAND),
    ]);
    expect(trend.direction).toBe("stable");
  });

  it("calls a single measurement unknown, not stable", () => {
    expect(calculateTrend([point("a", "2026-01-31", 70)]).direction).toBe("unknown");
    expect(calculateTrend([]).direction).toBe("unknown");
  });
});

// ===========================================================================
// Review workflow — the consequential part
// ===========================================================================
describe("review workflow", () => {
  const human = (permissions: string[], userId = "u-reviewer"): ReviewActor => ({
    userId,
    permissions,
    isAiService: false,
  });
  const ai: ReviewActor = {
    userId: "u-ai",
    permissions: ["performance.approve_review", "performance.submit_review"],
    isAiService: true,
  };
  const draft: ReviewState = {
    status: "draft",
    reviewerId: "u-reviewer",
    subjectId: "u-subject",
  };
  const submitted: ReviewState = { ...draft, status: "submitted" };

  it("refuses every action to an AI identity, whatever its permissions", () => {
    for (const action of ["save_draft", "submit", "approve", "reject", "reopen"] as const) {
      const result = evaluateReviewTransition(submitted, action, ai);
      expect(result.allowed, action).toBe(false);
      if (!result.allowed) expect(result.reason).toMatch(/human/i);
    }
  });

  it("requires submit permission to submit", () => {
    expect(evaluateReviewTransition(draft, "submit", human([])).allowed).toBe(false);
    expect(
      evaluateReviewTransition(draft, "submit", human(["performance.submit_review"]))
        .allowed,
    ).toBe(true);
  });

  it("requires approve permission to approve — submit is not enough", () => {
    const result = evaluateReviewTransition(
      submitted,
      "approve",
      human(["performance.submit_review"], "u-other"),
    );
    expect(result.allowed).toBe(false);
  });

  // Separation of duties is what makes an approval mean anything.
  it("forbids the reviewer approving their own submission", () => {
    const result = evaluateReviewTransition(
      submitted,
      "approve",
      human(["performance.approve_review"], "u-reviewer"),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/second person/i);
  });

  it("allows a different authorized person to approve", () => {
    const result = evaluateReviewTransition(
      submitted,
      "approve",
      human(["performance.approve_review"], "u-manager"),
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.nextStatus).toBe("approved");
  });

  it("forbids reviewing yourself", () => {
    const selfReview: ReviewState = {
      status: "draft",
      reviewerId: "u-self",
      subjectId: "u-self",
    };
    const result = evaluateReviewTransition(
      selfReview,
      "submit",
      human(["performance.submit_review"], "u-self"),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/themselves/i);
  });

  it("enforces the status machine", () => {
    // Cannot approve a draft.
    expect(
      evaluateReviewTransition(draft, "approve", human(["performance.approve_review"], "u-m"))
        .allowed,
    ).toBe(false);
    // Cannot submit an already-submitted review.
    expect(
      evaluateReviewTransition(submitted, "submit", human(["performance.submit_review"]))
        .allowed,
    ).toBe(false);
  });

  it("reopens only a rejected review", () => {
    const rejected: ReviewState = { ...draft, status: "rejected" };
    expect(
      evaluateReviewTransition(rejected, "reopen", human(["performance.submit_review"]))
        .allowed,
    ).toBe(true);
    expect(
      evaluateReviewTransition(submitted, "reopen", human(["performance.submit_review"]))
        .allowed,
    ).toBe(false);
  });
});

describe("claim kinds", () => {
  it("declares four kinds", () => {
    expect([...CLAIM_KINDS]).toEqual(["FACT", "ANALYSIS", "INFERENCE", "RECOMMENDATION"]);
  });

  it("scores only FACT and ANALYSIS", () => {
    expect([...SCOREABLE_KINDS]).toEqual(["FACT", "ANALYSIS"]);
    expect(isScoreable("FACT")).toBe(true);
    expect(isScoreable("ANALYSIS")).toBe(true);
    expect(isScoreable("INFERENCE")).toBe(false);
    expect(isScoreable("RECOMMENDATION")).toBe(false);
  });
});
