/**
 * Development Agent planning.
 *
 * PURE. A gap, the available templates and the person's existing plans in;
 * the draft contract out. No I/O, no model call, no randomness.
 *
 * Two properties are worth stating because they are load-bearing rather than
 * stylistic:
 *
 *  - The required level is never taken from a caller argument. It arrives
 *    from capability_requirements, read under RLS. A model that could state
 *    the required level could manufacture a gap, and a manufactured gap
 *    justifies real development spend on someone's behalf.
 *  - The success criteria are generated FROM the UpgradeBlocker enum that
 *    evaluateCapabilityUpgrade tests. They are the same conditions, not a
 *    parallel description of them, so a plan that meets its stated criteria
 *    is exactly a plan that can propose the upgrade.
 */

import {
  APPLIED_ACTIVITY_TYPES,
  validateTemplate,
  type DevelopmentTemplate,
  type UpgradeBlocker,
} from "@/lib/calculations/development";
import { MAX_LEVEL, clampLevel, levelName } from "@/lib/calculations/capability";
import type { Uncertainty } from "@/agents/core/output";
import {
  ACTIVITY_STAGES,
  DEVELOPMENT_APPROVER_ROLES,
  STAGE_ACTIVITY_TYPE,
  STAGE_SPRINT_PHASE,
  type ActivityStage,
  type ApprovalRequirement,
  type DevelopmentPlanDraft,
  type DevelopmentPlanResponse,
  type DraftActivity,
  type DraftContentSource,
  type ExpectedEvidence,
  type SuccessCriterion,
} from "@/agents/development/contract";

// ===========================================================================
// Designed constants
// ===========================================================================

/**
 * Levels a single plan may target.
 *
 * DESIGNED, not specified. The PRD gives no cap, but a twenty-hour sprint
 * closing three capability levels is not a plan, it is a wish: L1→L4 spans
 * awareness to advanced practice. A draft that targets one level at a time
 * produces a plan that can actually be assessed, and says plainly how many
 * levels remain rather than quietly promising the lot.
 */
export const MAX_LEVELS_PER_PLAN = 1;

/** PRD §8.2 — the DPS Capability Sprint is twenty hours. */
export const DEFAULT_SPRINT_HOURS = 20;

/**
 * Fallback hour split across the four stages, summing to DEFAULT_SPRINT_HOURS.
 *
 * DESIGNED. PRD §8.2 gives an example curriculum for one role, not a
 * universal split, so this is a shape rather than a schedule. More than half
 * the hours sit in practice and work application because the principle the
 * sprint exists to serve is "don't train people to know, train people to do"
 * — a split weighted towards learning would contradict the thing it
 * implements.
 */
export const FALLBACK_STAGE_HOURS: Record<ActivityStage, number> = {
  learning: 5,
  practice: 5,
  work_application: 7,
  assessment: 3,
};

/** Plan statuses that mean a plan is already in flight for this capability. */
const ACTIVE_PLAN_STATUSES = new Set([
  "draft",
  "proposed",
  "approved",
  "in_progress",
]);

// ===========================================================================
// Input
// ===========================================================================

export interface GapInput {
  readonly capabilityId: string;
  readonly capabilityName: string;
  /** From capability_requirements, never from a caller argument. */
  readonly requiredLevel: number;
  readonly sourceRequirementId: string;
  /** The level evidence supports — calculateProvenLevel's output. */
  readonly currentProvenLevel: number;
  /** The level asserted before evidence, shown so the difference is visible. */
  readonly claimedLevel: number;
}

export interface ExistingPlanInput {
  readonly id: string;
  readonly capabilityId: string | null;
  readonly status: string;
  readonly title: string;
}

export interface PlanningInput {
  readonly talentDisplayName: string;
  readonly gap: GapInput;
  readonly templates: readonly DevelopmentTemplate[];
  readonly existingPlans: readonly ExistingPlanInput[];
}

// ===========================================================================
// Draft
// ===========================================================================

export function draftDevelopmentPlan(
  input: PlanningInput,
): DevelopmentPlanResponse {
  const generatedAt = new Date().toISOString();
  const gap = input.gap;
  const required = clampLevel(gap.requiredLevel);
  const proven = clampLevel(gap.currentProvenLevel);
  const uncertainties: Uncertainty[] = [];

  // --- No gap, no plan --------------------------------------------------
  if (proven >= required) {
    return notDrafted(
      `${input.talentDisplayName} already proves L${proven} ${levelName(proven)} against a requirement of ` +
        `L${required} ${levelName(required)} for ${gap.capabilityName}. Drafting a plan here would spend ` +
        "development budget on a requirement that is already met.",
      generatedAt,
      [],
    );
  }

  // --- An in-flight plan is a human's decision to leave alone ------------
  const inFlight = input.existingPlans.find(
    (plan) =>
      plan.capabilityId === gap.capabilityId &&
      ACTIVE_PLAN_STATUSES.has(plan.status),
  );
  if (inFlight) {
    return notDrafted(
      `A ${inFlight.status} plan for ${gap.capabilityName} already exists ("${inFlight.title}"). ` +
        "Drafting a second would duplicate a commitment someone has already made; review or revise that plan instead.",
      generatedAt,
      [],
    );
  }

  const target = Math.min(proven + MAX_LEVELS_PER_PLAN, required, MAX_LEVEL);
  const remaining = required - target;

  if (remaining > 0) {
    uncertainties.push({
      topic: "Levels beyond this plan",
      reason:
        `The requirement is L${required} ${levelName(required)} and this plan targets L${target} ${levelName(target)}. ` +
        `${remaining} level(s) remain open after it succeeds.`,
      resolvedBy:
        "Plan the remaining levels separately, once this plan's evidence has been validated.",
    });
  }

  if (gap.claimedLevel > proven) {
    uncertainties.push({
      topic: "Claimed level exceeds proven level",
      reason:
        `The capability is claimed at L${gap.claimedLevel} but only L${proven} is supported by validated applied evidence, ` +
        "so this plan is built from the proven level.",
      resolvedBy:
        "If the claim is accurate, validating existing evidence may close part of this gap without any development at all.",
    });
  }

  // --- Structure: an approved template if one fits, otherwise a shape ----
  const template = selectTemplate(input.templates, gap.capabilityId, target);
  const contentSource: DraftContentSource = template
    ? "approved_template"
    : "structure_only";

  if (!template) {
    uncertainties.push({
      topic: "No approved template",
      reason:
        `No approved development template targets ${gap.capabilityName} at L${target}, so this draft provides the ` +
        "structure of a sprint — stages, hours and evidence requirements — but not its curriculum.",
      resolvedBy:
        "A human must supply the activities from the Chapter DPS capability catalogue, or approve a template for this capability.",
    });
  }

  const activities = template
    ? fromTemplate(template)
    : fallbackActivities(gap.capabilityName, target);

  const totalHours =
    Math.round(activities.reduce((sum, a) => sum + a.estimatedHours, 0) * 100) / 100;

  const expectedEvidence = activities
    .filter((activity) => activity.requiresEvidence)
    .map((activity) => expectedFor(activity, gap.capabilityName));

  // A plan whose expected evidence is all knowledge cannot reach L3+, whatever
  // it says its target is. Said here rather than discovered after twenty hours.
  if (
    target > 2 &&
    !expectedEvidence.some((evidence) => evidence.demonstratesApplication)
  ) {
    uncertainties.push({
      topic: "Evidence cannot support the target",
      reason:
        `The plan targets L${target} ${levelName(target)}, but no expected evidence demonstrates application. ` +
        "Evidence of knowing cannot raise a capability past L2 (PRD §7.1).",
      resolvedBy:
        "Add an applied activity — practice, assignment or challenge — that produces evidence of doing.",
    });
  }

  for (const problem of validateDraftStructure(activities, totalHours)) {
    uncertainties.push(problem);
  }

  const draft: DevelopmentPlanDraft = {
    title: `${gap.capabilityName}: L${proven} → L${target}`,
    objective:
      `Close the capability gap for ${input.talentDisplayName} in ${gap.capabilityName} from ` +
      `L${proven} ${levelName(proven)} to L${target} ${levelName(target)}, evidenced by applied work.`,
    capabilityId: gap.capabilityId,
    capabilityName: gap.capabilityName,
    currentProvenLevel: proven,
    targetLevel: target,
    requiredLevel: required,
    remainingLevelsAfterPlan: remaining,
    sourceRequirementId: gap.sourceRequirementId,
    totalHours,
    templateId: template?.id ?? null,
    contentSource,
    status: "draft",
    persisted: false,
    claimKind: "RECOMMENDATION",
  };

  return {
    plan: draft,
    activities,
    expectedEvidence,
    successCriteria: buildSuccessCriteria(draft),
    approvalRequired: buildApproval(draft, input.talentDisplayName, totalHours),
    uncertainties,
    notDraftedReason: null,
    generatedAt,
    persisted: false,
  };
}

function notDrafted(
  reason: string,
  generatedAt: string,
  uncertainties: readonly Uncertainty[],
): DevelopmentPlanResponse {
  return {
    plan: null,
    activities: [],
    expectedEvidence: [],
    successCriteria: [],
    approvalRequired: {
      required: true,
      permission: "development.approve",
      approverRoles: DEVELOPMENT_APPROVER_ROLES,
      whyRequired:
        "No plan was drafted. Committing any development plan remains a human decision regardless (PRD §58).",
      whatWouldBeCommitted: [],
    },
    uncertainties,
    notDraftedReason: reason,
    generatedAt,
    persisted: false,
  };
}

// ===========================================================================
// Structure
// ===========================================================================

/**
 * Picks an approved template for this capability and level.
 *
 * Unapproved templates are ignored entirely. An unapproved template is
 * someone's working draft, and building a person's development plan on it
 * would launder it into use without anyone having agreed to it. Ties break on
 * code so the choice is stable across runs.
 */
export function selectTemplate(
  templates: readonly DevelopmentTemplate[],
  capabilityId: string,
  targetLevel: number,
): DevelopmentTemplate | null {
  const usable = templates
    .filter((template) => template.approved)
    .filter((template) => validateTemplate(template).length === 0);

  const exact = usable
    .filter((template) => matchesCapability(template, capabilityId, targetLevel))
    .sort((a, b) => a.code.localeCompare(b.code));

  return exact[0] ?? null;
}

/**
 * A template matches when it targets this capability, at this level or at no
 * particular level. A generic template — one with no capability at all — does
 * NOT match: a sprint that was not written for this capability cannot be
 * assumed to close a gap in it.
 */
function matchesCapability(
  template: DevelopmentTemplate,
  capabilityId: string,
  targetLevel: number,
): boolean {
  if (template.capabilityId !== capabilityId) return false;
  return template.targetLevel === null || template.targetLevel === targetLevel;
}

function fromTemplate(template: DevelopmentTemplate): readonly DraftActivity[] {
  return [...template.activities]
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .map((activity) => ({
      sequenceNo: activity.sequenceNo,
      stage: stageForActivityType(activity.activityType),
      phase: activity.phase,
      activityType: activity.activityType,
      title: activity.title,
      estimatedHours: activity.estimatedHours,
      requiresEvidence: activity.requiresEvidence,
    }));
}

function stageForActivityType(activityType: string): ActivityStage {
  const match = ACTIVITY_STAGES.find(
    (stage) => STAGE_ACTIVITY_TYPE[stage] === activityType,
  );
  // coaching and challenge have no stage of their own; both are practice in
  // the workflow sense — supervised doing rather than learning or assessing.
  return match ?? "practice";
}

/**
 * The shape of a sprint when no approved template exists.
 *
 * Titles name the capability and the stage and nothing more. The agent does
 * not invent a curriculum: a plausible reading list attributed to Chapter DPS
 * would be indistinguishable from a real one to the manager approving it.
 */
function fallbackActivities(
  capabilityName: string,
  targetLevel: number,
): readonly DraftActivity[] {
  const titles: Record<ActivityStage, string> = {
    learning: `Learn the ${capabilityName} concepts required at L${targetLevel} (content to be supplied)`,
    practice: `Practise ${capabilityName} on a guided exercise (content to be supplied)`,
    work_application: `Apply ${capabilityName} on real chapter work`,
    assessment: `Assess ${capabilityName} against the L${targetLevel} criteria`,
  };

  return ACTIVITY_STAGES.map((stage, index) => ({
    sequenceNo: index + 1,
    stage,
    phase: STAGE_SPRINT_PHASE[stage],
    activityType: STAGE_ACTIVITY_TYPE[stage],
    title: titles[stage],
    estimatedHours: FALLBACK_STAGE_HOURS[stage],
    // Learning produces no capability evidence: attending is not applying.
    requiresEvidence: stage !== "learning",
  }));
}

/**
 * Holds a draft to the same standard as an approved template.
 *
 * validateTemplate already knows what makes a plan incapable of raising a
 * capability — no applied activity, no assessment, hours that do not add up.
 * Running the draft through it means a draft cannot be weaker than a template
 * someone would have had to approve.
 */
function validateDraftStructure(
  activities: readonly DraftActivity[],
  totalHours: number,
): readonly Uncertainty[] {
  const problems = validateTemplate({
    id: "draft",
    code: "draft",
    name: "draft",
    methodology: "dps_20_hour_sprint",
    totalHours,
    approved: false,
    capabilityId: null,
    targetLevel: null,
    activities: activities.map((activity) => ({
      sequenceNo: activity.sequenceNo,
      phase: activity.phase,
      title: activity.title,
      activityType: activity.activityType,
      estimatedHours: activity.estimatedHours,
      requiresEvidence: activity.requiresEvidence,
    })),
  });

  return problems.map((problem) => ({
    topic: "Draft structure",
    reason: describeProblem(problem),
    resolvedBy:
      "Correct the template this draft was built from, or supply the missing activity before approving.",
  }));
}

function describeProblem(problem: {
  kind: string;
  declared?: number;
  actual?: number;
  sequenceNo?: number;
}): string {
  switch (problem.kind) {
    case "NO_ACTIVITIES":
      return "The draft contains no activities.";
    case "HOURS_MISMATCH":
      return `Declared hours (${problem.declared}) do not match the activities (${problem.actual}).`;
    case "DUPLICATE_SEQUENCE":
      return `Two activities share sequence number ${problem.sequenceNo}.`;
    case "NO_APPLIED_ACTIVITY":
      return "No activity applies the capability, so completing this plan could never raise a level.";
    case "NO_ASSESSMENT":
      return "No assessment activity, so the plan has no way to conclude.";
    default:
      return `Unrecognised structural problem: ${problem.kind}.`;
  }
}

// ===========================================================================
// Expected evidence
// ===========================================================================

function expectedFor(
  activity: DraftActivity,
  capabilityName: string,
): ExpectedEvidence {
  const applied = APPLIED_ACTIVITY_TYPES.includes(activity.activityType);

  const byStage: Record<ActivityStage, { type: string; description: string }> = {
    learning: {
      type: "learning_record",
      description: `A record that the ${capabilityName} material was completed. Knowledge, not application.`,
    },
    practice: {
      type: "practice_artifact",
      description: `The artifact produced while practising ${capabilityName}, with the reviewer's feedback.`,
    },
    work_application: {
      type: "project_deliverable",
      description: `A deliverable from real chapter work where ${capabilityName} was applied, attributable to this person.`,
    },
    assessment: {
      type: "assessment_result",
      description: `The assessment outcome against the ${capabilityName} level criteria, recorded by the assessor.`,
    },
  };

  const shape = byStage[activity.stage];

  return {
    activitySequenceNo: activity.sequenceNo,
    stage: activity.stage,
    evidenceType: shape.type,
    description: shape.description,
    demonstratesApplication: applied,
    validationRequired: true,
  };
}

// ===========================================================================
// Success criteria — generated from the blockers they remove
// ===========================================================================

/**
 * The criteria a plan must meet, one per UpgradeBlocker it would otherwise
 * raise.
 *
 * TARGET_NOT_ABOVE_CURRENT and TARGET_EXCEEDS_SCALE are absent because the
 * draft satisfies both by construction — the target is proven + 1, clamped to
 * the scale — so listing them would give a manager a box to tick that cannot
 * fail.
 */
const CRITERION_BLOCKERS: readonly UpgradeBlocker[] = [
  "PLAN_NOT_APPROVED",
  "PLAN_NOT_COMPLETE",
  "NO_APPLIED_ACTIVITY_COMPLETED",
  "NO_ASSESSMENT_COMPLETED",
  "NO_VALIDATED_EVIDENCE",
];

export function buildSuccessCriteria(
  draft: DevelopmentPlanDraft,
): readonly SuccessCriterion[] {
  const statements: Record<UpgradeBlocker, { statement: string; measuredBy: string }> = {
    PLAN_NOT_APPROVED: {
      statement: "The plan has been approved by a human holding development.approve.",
      measuredBy: "development_plans.approved_by and approved_at are both set.",
    },
    PLAN_NOT_COMPLETE: {
      statement: "Every activity not explicitly skipped is complete.",
      measuredBy: "learning_activities.status is 'completed' for all counted activities.",
    },
    NO_APPLIED_ACTIVITY_COMPLETED: {
      statement: `${draft.capabilityName} has been applied on real work, not only studied.`,
      measuredBy: "At least one completed activity is practice, assignment or challenge.",
    },
    NO_ASSESSMENT_COMPLETED: {
      statement: `Capability has been assessed against the L${draft.targetLevel} criteria.`,
      measuredBy: "A completed activity of type 'assessment' exists.",
    },
    NO_VALIDATED_EVIDENCE: {
      statement: "The evidence produced has been validated by a human.",
      measuredBy: "learning_evidence rows for this plan are evaluated and not withdrawn.",
    },
    TARGET_NOT_ABOVE_CURRENT: {
      statement: `The target L${draft.targetLevel} is above the proven L${draft.currentProvenLevel}.`,
      measuredBy: "Satisfied by construction when the draft was produced.",
    },
    TARGET_EXCEEDS_SCALE: {
      statement: `The target L${draft.targetLevel} is within the L1–L5 scale.`,
      measuredBy: "Satisfied by construction when the draft was produced.",
    },
  };

  return CRITERION_BLOCKERS.map((blocker) => ({
    id: `criterion:${blocker.toLowerCase()}`,
    statement: statements[blocker].statement,
    measuredBy: statements[blocker].measuredBy,
    removesBlocker: blocker,
  }));
}

// ===========================================================================
// Approval
// ===========================================================================

function buildApproval(
  draft: DevelopmentPlanDraft,
  talentDisplayName: string,
  totalHours: number,
): ApprovalRequirement {
  return {
    required: true,
    permission: "development.approve",
    approverRoles: DEVELOPMENT_APPROVER_ROLES,
    whyRequired:
      "Committing a development plan commits a person's time and the chapter's budget, which PRD §58 places " +
      "outside what an agent may do unattended. Nothing in this response has been written.",
    whatWouldBeCommitted: [
      `${totalHours} hour(s) of ${talentDisplayName}'s time.`,
      `A development plan for ${draft.capabilityName} targeting L${draft.targetLevel} ${levelName(draft.targetLevel)}.`,
      draft.contentSource === "structure_only"
        ? "Activity content that a human must still supply — this draft provides structure only."
        : `The activities of template ${draft.templateId ?? "unknown"}.`,
      "An expectation that the evidence produced will be validated before any capability level changes.",
    ],
  };
}
