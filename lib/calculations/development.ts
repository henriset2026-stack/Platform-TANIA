/**
 * Development calculation engine — TANIA_PRD_v2.0.md §8, §61.
 *
 * Deterministic and pure. The most important function here,
 * evaluateCapabilityUpgrade, decides whether a completed development plan may
 * even be PROPOSED as a capability increase. It never performs one.
 */

import { clampLevel, MAX_LEVEL } from "@/lib/calculations/capability";
import type { ClaimKind } from "@/types/claim";

// ===========================================================================
// The loop and the sprint framework — PRD §8.1, §8.2
// ===========================================================================

/** PRD §8.1. The order matters: evidence precedes assessment, which precedes update. */
export const DEVELOPMENT_LOOP = [
  "capability_gap",
  "development_plan",
  "learn",
  "practice",
  "ai_coaching",
  "project_assignment",
  "evidence",
  "assessment",
  "capability_update",
  "business_impact",
] as const;

export type DevelopmentStage = (typeof DEVELOPMENT_LOOP)[number];

/** PRD §8.2 sprint framework. Structure, not curriculum. */
export const SPRINT_PHASES = [
  "define",
  "deconstruct",
  "learn",
  "practice",
  "feedback",
  "build",
  "assess",
  "deploy",
] as const;

export type SprintPhase = (typeof SPRINT_PHASES)[number];

export const SPRINT_PHASE_LABEL: Record<SprintPhase, string> = {
  define: "Define",
  deconstruct: "Deconstruct",
  learn: "Learn",
  practice: "Practice",
  feedback: "Feedback",
  build: "Build",
  assess: "Assess",
  deploy: "Deploy",
};

export const ACTIVITY_TYPES = [
  "learn",
  "practice",
  "coaching",
  "assignment",
  "challenge",
  "assessment",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * Activity types that demonstrate DOING rather than knowing.
 *
 * "Don't train people to know. Train people to do." (PRD §8). Only these can
 * support a capability upgrade, which is the same distinction
 * lib/calculations/capability.ts draws between certificates and applied
 * evidence.
 */
export const APPLIED_ACTIVITY_TYPES: readonly ActivityType[] = [
  "practice",
  "assignment",
  "challenge",
  "assessment",
];

// ===========================================================================
// Templates
// ===========================================================================

export interface TemplateActivity {
  readonly sequenceNo: number;
  readonly phase: SprintPhase;
  readonly title: string;
  readonly activityType: ActivityType;
  readonly estimatedHours: number;
  readonly requiresEvidence: boolean;
}

export interface DevelopmentTemplate {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly methodology: string;
  readonly totalHours: number;
  readonly activities: readonly TemplateActivity[];
  readonly approved: boolean;
  /**
   * Optional targeting. Null means the template is generic.
   *
   * Both are carried on the domain type rather than left in the database
   * because template SELECTION depends on them: without the capability a
   * caller can only pick a template by name, which is how someone ends up
   * enrolled on a sprint for the wrong skill.
   */
  readonly capabilityId: string | null;
  readonly targetLevel: number | null;
}

export type TemplateProblem =
  | { readonly kind: "NO_ACTIVITIES" }
  | { readonly kind: "HOURS_MISMATCH"; readonly declared: number; readonly actual: number }
  | { readonly kind: "DUPLICATE_SEQUENCE"; readonly sequenceNo: number }
  | { readonly kind: "NO_APPLIED_ACTIVITY" }
  | { readonly kind: "NO_ASSESSMENT" };

/**
 * Validates a template before anyone is enrolled on it.
 *
 * Two checks go beyond arithmetic:
 *  - a template with no applied activity teaches knowledge only, and cannot
 *    ever support a capability upgrade;
 *  - a template with no assessment has no way to conclude.
 * Both would produce a plan that can be completed but can never raise a
 * capability, which is a waste of someone's twenty hours.
 */
export function validateTemplate(
  template: DevelopmentTemplate,
): readonly TemplateProblem[] {
  const problems: TemplateProblem[] = [];

  if (template.activities.length === 0) {
    return [{ kind: "NO_ACTIVITIES" }];
  }

  const seen = new Set<number>();
  let actual = 0;
  for (const activity of template.activities) {
    if (seen.has(activity.sequenceNo)) {
      problems.push({ kind: "DUPLICATE_SEQUENCE", sequenceNo: activity.sequenceNo });
    }
    seen.add(activity.sequenceNo);
    actual += activity.estimatedHours;
  }

  if (Math.abs(actual - template.totalHours) > 0.01) {
    problems.push({
      kind: "HOURS_MISMATCH",
      declared: template.totalHours,
      actual: Math.round(actual * 100) / 100,
    });
  }

  if (!template.activities.some((a) => APPLIED_ACTIVITY_TYPES.includes(a.activityType))) {
    problems.push({ kind: "NO_APPLIED_ACTIVITY" });
  }

  if (!template.activities.some((a) => a.activityType === "assessment")) {
    problems.push({ kind: "NO_ASSESSMENT" });
  }

  return problems;
}

/** Hours grouped by sprint phase, in framework order. */
export function hoursByPhase(
  template: DevelopmentTemplate,
): readonly { phase: SprintPhase; hours: number }[] {
  const totals = new Map<SprintPhase, number>();
  for (const activity of template.activities) {
    totals.set(
      activity.phase,
      (totals.get(activity.phase) ?? 0) + activity.estimatedHours,
    );
  }
  return SPRINT_PHASES.filter((phase) => totals.has(phase)).map((phase) => ({
    phase,
    hours: Math.round((totals.get(phase) ?? 0) * 100) / 100,
  }));
}

// ===========================================================================
// Progress
// ===========================================================================

export interface PlanActivity {
  readonly id: string;
  readonly activityType: ActivityType;
  readonly estimatedHours: number;
  readonly status: "planned" | "in_progress" | "completed" | "skipped";
  readonly hasValidatedEvidence: boolean;
}

export interface ProgressResult {
  /** 0–100, weighted by estimated hours. */
  readonly percent: number;
  readonly completedHours: number;
  readonly totalHours: number;
  readonly completedCount: number;
  readonly totalCount: number;
}

/**
 * Development progress, weighted by hours rather than activity count.
 *
 * A three-hour build and a one-hour reading are not equal progress. Skipped
 * activities are removed from the denominator entirely — counting a skipped
 * activity as incomplete would permanently cap a plan below 100%.
 */
export function calculateDevelopmentProgress(
  activities: readonly PlanActivity[],
): ProgressResult {
  const counted = activities.filter((a) => a.status !== "skipped");

  if (counted.length === 0) {
    return {
      percent: 0,
      completedHours: 0,
      totalHours: 0,
      completedCount: 0,
      totalCount: 0,
    };
  }

  let totalHours = 0;
  let completedHours = 0;
  let completedCount = 0;

  for (const activity of counted) {
    const hours = Math.max(0, activity.estimatedHours);
    totalHours += hours;
    if (activity.status === "completed") {
      completedHours += hours;
      completedCount += 1;
    }
  }

  // With no hours recorded anywhere, fall back to activity count so a plan
  // does not sit at 0% purely because nobody estimated it.
  const percent =
    totalHours > 0
      ? (completedHours / totalHours) * 100
      : (completedCount / counted.length) * 100;

  return {
    percent: Math.round(percent * 10) / 10,
    completedHours: Math.round(completedHours * 100) / 100,
    totalHours: Math.round(totalHours * 100) / 100,
    completedCount,
    totalCount: counted.length,
  };
}

// ===========================================================================
// Capability upgrade — THE SAFEGUARD
// ===========================================================================

export type UpgradeBlocker =
  | "PLAN_NOT_APPROVED"
  | "PLAN_NOT_COMPLETE"
  | "NO_ASSESSMENT_COMPLETED"
  | "NO_APPLIED_ACTIVITY_COMPLETED"
  | "NO_VALIDATED_EVIDENCE"
  | "TARGET_NOT_ABOVE_CURRENT"
  | "TARGET_EXCEEDS_SCALE";

export const UPGRADE_BLOCKER_REASON: Record<UpgradeBlocker, string> = {
  PLAN_NOT_APPROVED: "The development plan has not been approved by a human.",
  PLAN_NOT_COMPLETE: "Not every required activity is complete.",
  NO_ASSESSMENT_COMPLETED: "No assessment activity has been completed.",
  NO_APPLIED_ACTIVITY_COMPLETED:
    "No applied activity is complete. Capability requires evidence of doing, not knowing.",
  NO_VALIDATED_EVIDENCE:
    "No validated learning evidence supports this upgrade.",
  TARGET_NOT_ABOVE_CURRENT: "The proposed level is not above the current level.",
  TARGET_EXCEEDS_SCALE: "The proposed level is outside the L1–L5 scale.",
};

export interface UpgradeEvaluation {
  /** Whether an upgrade may be PROPOSED. Never whether one may be applied. */
  readonly eligibleToPropose: boolean;
  readonly blockers: readonly UpgradeBlocker[];
  readonly currentLevel: number;
  readonly proposedLevel: number | null;
  /**
   * Always true. Typed as the literal so no caller can branch on it being
   * false: there is no path by which a capability upgrade happens
   * automatically.
   */
  readonly requiresHumanApproval: true;
  /**
   * Always RECOMMENDATION. A completed plan produces a proposal, never a
   * fact (types/claim.ts).
   */
  readonly claimKind: Extract<ClaimKind, "RECOMMENDATION">;
  readonly supportingEvidenceIds: readonly string[];
}

/**
 * Decides whether a completed development plan may PROPOSE a capability
 * increase.
 *
 * This is the guard against the failure mode PRD §7.1 names: completing a
 * course becoming proof of capability. The development loop in §8.1 ends in
 * "Capability Update", and the tempting implementation is to write the new
 * level when the plan hits 100%. That would make attendance equal capability.
 *
 * So: this function never writes, never returns a level to apply, and its
 * result always requires human approval. The strongest outcome available is
 * "this may be proposed, here is the evidence".
 *
 * Every blocker is returned rather than the first, so a manager sees the full
 * picture in one pass.
 */
export function evaluateCapabilityUpgrade(input: {
  readonly planApproved: boolean;
  readonly activities: readonly PlanActivity[];
  readonly currentLevel: number;
  readonly targetLevel: number;
  /** Ids of validated learning evidence attached to the plan. */
  readonly validatedEvidenceIds: readonly string[];
}): UpgradeEvaluation {
  const blockers: UpgradeBlocker[] = [];
  const currentLevel = clampLevel(input.currentLevel);

  if (!input.planApproved) blockers.push("PLAN_NOT_APPROVED");

  const counted = input.activities.filter((a) => a.status !== "skipped");
  const completed = counted.filter((a) => a.status === "completed");

  if (counted.length === 0 || completed.length !== counted.length) {
    blockers.push("PLAN_NOT_COMPLETE");
  }

  if (!completed.some((a) => a.activityType === "assessment")) {
    blockers.push("NO_ASSESSMENT_COMPLETED");
  }

  if (!completed.some((a) => APPLIED_ACTIVITY_TYPES.includes(a.activityType))) {
    blockers.push("NO_APPLIED_ACTIVITY_COMPLETED");
  }

  if (input.validatedEvidenceIds.length === 0) {
    blockers.push("NO_VALIDATED_EVIDENCE");
  }

  if (input.targetLevel > MAX_LEVEL || input.targetLevel < 1) {
    blockers.push("TARGET_EXCEEDS_SCALE");
  } else if (input.targetLevel <= currentLevel) {
    blockers.push("TARGET_NOT_ABOVE_CURRENT");
  }

  const eligible = blockers.length === 0;

  return {
    eligibleToPropose: eligible,
    blockers,
    currentLevel,
    proposedLevel: eligible ? clampLevel(input.targetLevel) : null,
    requiresHumanApproval: true,
    claimKind: "RECOMMENDATION",
    supportingEvidenceIds: input.validatedEvidenceIds,
  };
}

/** Human-readable blockers, for display and audit. */
export function describeBlockers(
  blockers: readonly UpgradeBlocker[],
): readonly string[] {
  return blockers.map((blocker) => UPGRADE_BLOCKER_REASON[blocker]);
}
