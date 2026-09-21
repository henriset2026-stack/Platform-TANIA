/**
 * Development Agent output contract — TANIA_PRD_v2.0.md §8, §58; AGENTS.md §9.
 *
 * The brief says the agent "may draft a development plan" and "must not
 * silently commit consequential changes". The second clause is stronger than
 * it reads, and this contract takes it at full strength: the agent cannot
 * commit at all, silently or otherwise.
 *
 * That is not caution, it follows from three independent facts. AI_SERVICE is
 * granted `development.read` and never `development.create` or
 * `development.approve` (TANIA_SUPABASE_RLS.sql lines 79–81). Migration
 * 20260921090001 adds RESTRICTIVE policies denying AI writes whatever
 * permissions are configured. The tool registry refuses `allowedForAiService`
 * above LOW risk. A tool that wrote a draft row would therefore be denied at
 * execution, and shipping one would be fabricated capability (CLAUDE.md §16).
 *
 * So a draft here is an object returned to the caller, not a row. The
 * distinction matters beyond mechanics: a `status='draft'` row in someone's
 * development record is already visible to their manager, already appears in
 * their plan list, and already implies a commitment was proposed on their
 * behalf. Drafting into the conversation is a different act from drafting
 * into the database, and only the first is this agent's to perform.
 */

import type { Uncertainty } from "@/agents/core/output";
import type {
  ActivityType,
  SprintPhase,
  UpgradeBlocker,
} from "@/lib/calculations/development";
import type { ClaimKind } from "@/types/claim";

export type { Uncertainty } from "@/agents/core/output";

// ===========================================================================
// Workflow — PRD §8.1
// ===========================================================================

/**
 * Gap → Plan → Learning → Practice → Work Application → Assessment → Evidence.
 *
 * The first two are inputs to a plan rather than activities within it, and
 * evidence is produced BY activities rather than being one. So the four
 * stages an activity may occupy are the middle of this list, and
 * ACTIVITY_STAGES rather than PLAN_WORKFLOW is what a draft must cover.
 */
export const PLAN_WORKFLOW = [
  "gap",
  "plan",
  "learning",
  "practice",
  "work_application",
  "assessment",
  "evidence",
] as const;

export type WorkflowStage = (typeof PLAN_WORKFLOW)[number];

export const ACTIVITY_STAGES = [
  "learning",
  "practice",
  "work_application",
  "assessment",
] as const;

export type ActivityStage = (typeof ACTIVITY_STAGES)[number];

/**
 * How a workflow stage maps onto the existing domain vocabulary.
 *
 * Declared once here rather than inline so a drafted activity cannot end up
 * with a stage and an activity_type that disagree — the database CHECK on
 * learning_activities.activity_type would accept the mismatch, and nothing
 * downstream would notice.
 */
export const STAGE_ACTIVITY_TYPE: Record<ActivityStage, ActivityType> = {
  learning: "learn",
  practice: "practice",
  work_application: "assignment",
  assessment: "assessment",
};

export const STAGE_SPRINT_PHASE: Record<ActivityStage, SprintPhase> = {
  learning: "learn",
  practice: "practice",
  work_application: "build",
  assessment: "assess",
};

// ===========================================================================
// The draft
// ===========================================================================

/**
 * Where a draft's content came from.
 *
 * `approved_template` means the activities are organizational content someone
 * approved. `structure_only` means no template matched and the agent produced
 * the SHAPE of a plan — stages, hours, evidence requirements — with generic
 * titles.
 *
 * The agent never invents curriculum. The DPS capability catalogue is real
 * organizational content and is deliberately not fabricated (CLAUDE.md §2f);
 * a plausible-looking reading list attributed to Chapter DPS would be exactly
 * that fabrication, and a manager would have no way to tell.
 */
export type DraftContentSource = "approved_template" | "structure_only";

export interface DraftActivity {
  readonly sequenceNo: number;
  readonly stage: ActivityStage;
  readonly phase: SprintPhase;
  readonly activityType: ActivityType;
  readonly title: string;
  readonly estimatedHours: number;
  readonly requiresEvidence: boolean;
}

/**
 * Evidence a completed activity is expected to produce.
 *
 * `demonstratesApplication` is the field that decides whether this plan can
 * ever move a capability level. Evidence of knowing does not raise a level
 * past L2 (PRD §7.1), so a plan whose expected evidence is all knowledge is a
 * plan that cannot succeed at its stated target — and the draft says so
 * rather than letting twenty hours find out.
 */
export interface ExpectedEvidence {
  readonly activitySequenceNo: number;
  readonly stage: ActivityStage;
  readonly evidenceType: string;
  readonly description: string;
  readonly demonstratesApplication: boolean;
  readonly validationRequired: true;
}

/**
 * A condition that must hold for the plan to have succeeded.
 *
 * Each criterion names the UpgradeBlocker it removes, so the criteria are not
 * prose alongside the system but the same conditions
 * evaluateCapabilityUpgrade tests. Satisfying all of them is exactly what
 * makes a capability upgrade proposable — a property asserted in the tests
 * rather than asserted here.
 */
export interface SuccessCriterion {
  readonly id: string;
  readonly statement: string;
  readonly measuredBy: string;
  readonly removesBlocker: UpgradeBlocker;
}

export interface DevelopmentPlanDraft {
  readonly title: string;
  readonly objective: string;
  readonly capabilityId: string;
  readonly capabilityName: string;
  /** The level the organization may currently rely on — proven, not claimed. */
  readonly currentProvenLevel: number;
  /** What this plan targets. One level at a time; see MAX_LEVELS_PER_PLAN. */
  readonly targetLevel: number;
  /** The level the requirement asks for, which may be higher than the target. */
  readonly requiredLevel: number;
  /** Levels still open after this plan succeeds. */
  readonly remainingLevelsAfterPlan: number;
  /** capability_requirements.id the gap was derived from. */
  readonly sourceRequirementId: string;
  readonly totalHours: number;
  readonly templateId: string | null;
  readonly contentSource: DraftContentSource;
  /**
   * Always "draft", and always unpersisted. Typed as literals so no caller can
   * branch on this being a saved plan: nothing was written.
   */
  readonly status: "draft";
  readonly persisted: false;
  /** Always RECOMMENDATION. A draft is a proposal, never a commitment. */
  readonly claimKind: Extract<ClaimKind, "RECOMMENDATION">;
}

// ===========================================================================
// Approval
// ===========================================================================

/**
 * Roles holding `development.approve` (TANIA_SUPABASE_RLS.sql lines 69, 71,
 * 77, plus SUPER_ADMIN which receives every permission at line 51).
 *
 * TALENT is deliberately absent: it holds development.create and
 * development.update but not approve, so a person cannot approve their own
 * plan. Listed here so that asymmetry is visible at the point a draft is
 * handed over, and a test asserts it stays that way.
 */
export const DEVELOPMENT_APPROVER_ROLES: readonly string[] = [
  "CHAPTER_LEAD",
  "MANAGER",
  "HR",
  "SUPER_ADMIN",
];

export interface ApprovalRequirement {
  /**
   * Always the literal true. There is no drafted plan, and no set of
   * circumstances, in which this agent returns "no approval needed".
   */
  readonly required: true;
  readonly permission: "development.approve";
  readonly approverRoles: readonly string[];
  readonly whyRequired: string;
  /** Exactly what a human would be committing to by approving. */
  readonly whatWouldBeCommitted: readonly string[];
}

// ===========================================================================
// Response
// ===========================================================================

export interface DevelopmentPlanResponse {
  /** Null when no plan was drafted; notDraftedReason then says why. */
  readonly plan: DevelopmentPlanDraft | null;
  readonly activities: readonly DraftActivity[];
  readonly expectedEvidence: readonly ExpectedEvidence[];
  readonly successCriteria: readonly SuccessCriterion[];
  readonly approvalRequired: ApprovalRequirement;
  readonly uncertainties: readonly Uncertainty[];
  /**
   * Why no plan was drafted, or null when one was.
   *
   * Exactly one of `plan` and this is set. Returning an empty plan with no
   * explanation would read as "nothing to do here", which is a different
   * claim from "a plan was not appropriate" and from "I could not tell".
   */
  readonly notDraftedReason: string | null;
  readonly generatedAt: string;
  /** Always false. Nothing in this response was written anywhere. */
  readonly persisted: false;
}

/**
 * Actions this agent must refuse — its own refusal list.
 *
 * Every one is already impossible: no such tool is registered, the registry
 * is closed, AI_SERVICE holds no write permission, and the database denies AI
 * writes outright. The list is stated where the agent is defined so a future
 * tool registration that contradicts it fails a test rather than shipping.
 */
export const FORBIDDEN_DEVELOPMENT_ACTIONS: readonly string[] = [
  "approve_development_plan",
  "commit_development_plan",
  "enrol_talent",
  "assign_learning_path",
  "upgrade_capability_level",
  "validate_learning_evidence",
  "complete_activity",
];
