/**
 * Feasibility scoring engine — TANIA_PRD_v2.0.md §35, §61.
 *
 * Deterministic and pure. Weights and thresholds are INJECTED: scoring a
 * business case decides whether work happens and how money is spent, so a
 * built-in default would make one team's judgement the organization's policy.
 */

import type { ClaimKind } from "@/types/claim";

export interface FeasibilityCriterion {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  /** False for risk-style criteria, where a high raw score is bad. */
  readonly higherIsBetter: boolean;
}

export interface CriterionWeight {
  readonly criterionId: string;
  readonly weight: number;
}

export interface FeasibilityProfile {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly weights: readonly CriterionWeight[];
  /** Score at or above which the case may be recommended for approval. */
  readonly approveThreshold: number;
  /** Score at or above which the case warrants review rather than rejection. */
  readonly reviewThreshold: number;
  readonly approved: boolean;
}

export interface CriterionScore {
  readonly criterionId: string;
  /** 0–100 raw. Null when not yet scored. */
  readonly score: number | null;
}

export type FeasibilityProblem =
  | { readonly kind: "EMPTY_PROFILE" }
  | { readonly kind: "WEIGHTS_NOT_ONE"; readonly total: number }
  | { readonly kind: "THRESHOLDS_INVERTED" };

export function validateFeasibilityProfile(
  profile: FeasibilityProfile,
): readonly FeasibilityProblem[] {
  const problems: FeasibilityProblem[] = [];

  if (profile.weights.length === 0) return [{ kind: "EMPTY_PROFILE" }];

  const total = profile.weights.reduce((sum, w) => sum + w.weight, 0);
  if (Math.abs(total - 1) > 0.0001) {
    problems.push({ kind: "WEIGHTS_NOT_ONE", total: Math.round(total * 10000) / 10000 });
  }
  if (profile.approveThreshold < profile.reviewThreshold) {
    problems.push({ kind: "THRESHOLDS_INVERTED" });
  }
  return problems;
}

export type FeasibilityRecommendation =
  | "RECOMMEND_APPROVE"
  | "RECOMMEND_REVIEW"
  | "RECOMMEND_REJECT"
  | "INSUFFICIENT_DATA";

export const FEASIBILITY_RECOMMENDATION_LABEL: Record<FeasibilityRecommendation, string> = {
  RECOMMEND_APPROVE: "Recommend approval",
  RECOMMEND_REVIEW: "Recommend review",
  RECOMMEND_REJECT: "Recommend rejection",
  INSUFFICIENT_DATA: "Insufficient data to recommend",
};

/** Minimum share of weight that must be scored before recommending. */
export const MIN_FEASIBILITY_COVERAGE = 0.6;

export type FeasibilityResult =
  | {
      readonly scored: true;
      /** 0–100 over covered weight. */
      readonly totalScore: number;
      /** Share of profile weight actually scored, 0–100. */
      readonly coverage: number;
      readonly recommendation: FeasibilityRecommendation;
      readonly unscoredCriterionIds: readonly string[];
      readonly usedUnapprovedProfile: boolean;
      /** Always RECOMMENDATION — a score never decides. */
      readonly claimKind: Extract<ClaimKind, "RECOMMENDATION">;
      readonly requiresHumanApproval: true;
    }
  | {
      readonly scored: false;
      readonly reason: string;
      readonly problems?: readonly FeasibilityProblem[];
    };

/**
 * Scores a feasibility case.
 *
 * Inverts risk-style criteria so every contribution points the same way, and
 * normalises over scored weight so an unscored criterion does not silently
 * count as zero and sink a viable case.
 *
 * Below MIN_FEASIBILITY_COVERAGE the result is INSUFFICIENT_DATA: a business
 * case judged on a third of its criteria is not a judgement, and presenting a
 * number would invite a decision the evidence does not support.
 */
export function scoreFeasibility(input: {
  profile: FeasibilityProfile;
  criteria: readonly FeasibilityCriterion[];
  scores: readonly CriterionScore[];
}): FeasibilityResult {
  const problems = validateFeasibilityProfile(input.profile);
  if (problems.length > 0) {
    return { scored: false, reason: "Feasibility profile is not valid", problems };
  }

  const criterionById = new Map(input.criteria.map((c) => [c.id, c] as const));
  const scoreById = new Map(
    input.scores
      .filter((s) => s.score !== null && Number.isFinite(s.score))
      .map((s) => [s.criterionId, Math.min(Math.max(s.score!, 0), 100)] as const),
  );

  let coveredWeight = 0;
  let weighted = 0;
  const unscored: string[] = [];

  for (const entry of input.profile.weights) {
    const raw = scoreById.get(entry.criterionId);
    if (raw === undefined) {
      unscored.push(entry.criterionId);
      continue;
    }
    const criterion = criterionById.get(entry.criterionId);
    // A risk criterion scored 80 means high risk, which is bad. Invert so all
    // contributions point the same direction.
    const effective = criterion && !criterion.higherIsBetter ? 100 - raw : raw;
    coveredWeight += entry.weight;
    weighted += effective * entry.weight;
  }

  if (coveredWeight <= 0) {
    return { scored: false, reason: "No criterion has been scored" };
  }

  const totalWeight = input.profile.weights.reduce((sum, w) => sum + w.weight, 0);
  const coverageRatio = totalWeight > 0 ? coveredWeight / totalWeight : 0;
  const totalScore = Math.round((weighted / coveredWeight) * 10) / 10;

  const recommendation: FeasibilityRecommendation =
    coverageRatio < MIN_FEASIBILITY_COVERAGE
      ? "INSUFFICIENT_DATA"
      : totalScore >= input.profile.approveThreshold
        ? "RECOMMEND_APPROVE"
        : totalScore >= input.profile.reviewThreshold
          ? "RECOMMEND_REVIEW"
          : "RECOMMEND_REJECT";

  return {
    scored: true,
    totalScore,
    coverage: Math.round(coverageRatio * 1000) / 10,
    recommendation,
    unscoredCriterionIds: unscored,
    usedUnapprovedProfile: !input.profile.approved,
    claimKind: "RECOMMENDATION",
    requiresHumanApproval: true,
  };
}

// ===========================================================================
// Pipeline
// ===========================================================================

export const FEASIBILITY_STAGES = [
  "intake",
  "scoring",
  "resource_check",
  "business_case",
  "decision",
  "approved",
  "rejected",
  "delivered",
  "reviewed",
] as const;

export type FeasibilityStage = (typeof FEASIBILITY_STAGES)[number];

export const FEASIBILITY_STAGE_LABEL: Record<FeasibilityStage, string> = {
  intake: "Intake",
  scoring: "Penilaian skor",
  resource_check: "Cek sumber daya",
  business_case: "Business case",
  decision: "Keputusan",
  approved: "Disetujui",
  rejected: "Ditolak",
  delivered: "Selesai dikerjakan",
  reviewed: "Ditinjau",
};

/** Stages that represent a concluded case. */
export const TERMINAL_STAGES: readonly FeasibilityStage[] = [
  "rejected",
  "reviewed",
];

export type StageTransition =
  | { readonly allowed: true; readonly nextStage: FeasibilityStage }
  | { readonly allowed: false; readonly reason: string };

const NEXT_STAGES: Record<FeasibilityStage, readonly FeasibilityStage[]> = {
  intake: ["scoring", "rejected"],
  scoring: ["resource_check", "rejected"],
  resource_check: ["business_case", "rejected"],
  business_case: ["decision", "rejected"],
  decision: ["approved", "rejected"],
  approved: ["delivered"],
  rejected: [],
  delivered: ["reviewed"],
  reviewed: [],
};

/**
 * Feasibility pipeline transitions.
 *
 * Deciding a case is consequential (PRD §58), so an AI identity is refused
 * outright and approval requires project.update rather than project.read.
 * A case may be rejected from any pre-decision stage — stopping work early is
 * always permitted — but may only be approved from `decision`.
 */
export function evaluateStageTransition(
  current: FeasibilityStage,
  next: FeasibilityStage,
  actor: { permissions: readonly string[]; isAiService: boolean },
): StageTransition {
  if (actor.isAiService) {
    return {
      allowed: false,
      reason:
        "An AI identity may not advance a feasibility case. Deciding whether work happens is a human decision.",
    };
  }

  if (!NEXT_STAGES[current].includes(next)) {
    return {
      allowed: false,
      reason: `Cannot move from ${FEASIBILITY_STAGE_LABEL[current]} to ${FEASIBILITY_STAGE_LABEL[next]}.`,
    };
  }

  if ((next === "approved" || next === "rejected") &&
      !actor.permissions.includes("project.update")) {
    return { allowed: false, reason: "Missing permission: project.update" };
  }

  return { allowed: true, nextStage: next };
}
