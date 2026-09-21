/**
 * Capability Agent output contract — TANIA_PRD_v2.0.md §7, §45; AGENTS.md §10.
 *
 * The Performance Agent's rule was "every finding must have evidence". That
 * rule cannot be carried over unchanged here, because for capability the
 * ABSENCE of evidence is the most important finding there is: a requirement
 * nobody has proven is the largest gap in the chapter, and a contract that
 * demanded evidence refs would force that case either to invent them or to go
 * unreported.
 *
 * So the guarantee is restated rather than dropped. Every gap carries a
 * `basis`, a discriminated union in which each variant holds at least one
 * resolvable reference — evidence rows when evidence exists, the requirement
 * row when it does not. A claim without a traceable source still does not
 * compile; what changed is that "no evidence" became a nameable state instead
 * of a missing one.
 */

import type { NonEmpty, Uncertainty } from "@/agents/core/output";
import type {
  Criticality,
  RequirementScope,
  Urgency,
} from "@/lib/calculations/capability";
import type { ClaimKind } from "@/types/claim";
import type { CapabilityStatus } from "@/types/status";

export type { NonEmpty, Uncertainty } from "@/agents/core/output";

// ===========================================================================
// References
// ===========================================================================

export interface CapabilityEvidenceRef {
  /** capability_evidence.id — resolvable back to the row. */
  readonly evidenceId: string;
  readonly talentCapabilityId: string;
  readonly capabilityId: string;
  /** e.g. project_deliverable, certification, peer_review. */
  readonly sourceType: string;
  readonly validationStatus: string;
  /**
   * Whether this record demonstrates APPLICATION of the capability.
   *
   * A certificate is evidence of knowledge; it is not evidence of application
   * and cannot raise a proven level past L2 (PRD §7.1). Carrying the
   * distinction on the reference means a reader can see why a well-evidenced
   * person is still reported below the required level.
   */
  readonly demonstratesApplication: boolean;
  readonly occurredAt: string | null;
  readonly claimKind: ClaimKind;
}

// Requirement scope is a domain concept, declared in the calculation engine
// and re-exported here so agent code has one import for the contract.
export { describeScope } from "@/lib/calculations/capability";
export type { RequirementScope } from "@/lib/calculations/capability";

export interface RequirementRef {
  /** capability_requirements.id. */
  readonly requirementId: string;
  readonly capabilityId: string;
  readonly requiredLevel: number;
  readonly scope: RequirementScope;
}

// ===========================================================================
// Basis — what a gap rests on
// ===========================================================================

/**
 * Why the proven level is what it is.
 *
 *  evidenced           validated evidence of APPLICATION exists
 *  certification_only  validated evidence exists but shows knowledge only, so
 *                      the level is capped — the "certification is not
 *                      capability" case, named rather than hidden
 *  unevidenced         nothing validated exists; the requirement row is the
 *                      citation, and the gap is a gap in PROOF as much as in
 *                      capability
 */
export type GapBasis =
  | {
      readonly kind: "evidenced";
      readonly evidenceRefs: NonEmpty<CapabilityEvidenceRef>;
    }
  | {
      readonly kind: "certification_only";
      readonly evidenceRefs: NonEmpty<CapabilityEvidenceRef>;
    }
  | {
      readonly kind: "unevidenced";
      readonly requirement: RequirementRef;
    };

/** Every basis resolves to at least one record, whichever variant it is. */
export function basisReferences(basis: GapBasis): NonEmpty<string> {
  if (basis.kind === "unevidenced") return [basis.requirement.requirementId];
  const [first, ...rest] = basis.evidenceRefs;
  return [first.evidenceId, ...rest.map((ref) => ref.evidenceId)];
}

// ===========================================================================
// Priority
// ===========================================================================

/**
 * Priority, decomposed.
 *
 * PRD §7.3 is explicit that a gap is prioritised by business criticality,
 * magnitude and time urgency TOGETHER, not by size alone. A single opaque
 * score would hide which factor drove the ranking, so every factor and its
 * weight is reported alongside the product, and `formula` states the
 * arithmetic in words for whoever has to justify the ranking.
 */
export interface PriorityFactors {
  readonly magnitude: number;
  readonly businessCriticality: Criticality;
  readonly criticalityWeight: number;
  readonly timeUrgency: Urgency;
  readonly urgencyWeight: number;
  /** magnitude × criticality weight × urgency weight. */
  readonly score: number;
  /** The same score as a 0–100 index, for display. */
  readonly index: number;
  readonly formula: string;
}

// ===========================================================================
// Affected talent
// ===========================================================================

export interface AffectedTalent {
  readonly talentId: string;
  readonly displayName: string;
  /** The level asserted before evidence is considered. */
  readonly claimedLevel: number;
  /** The level the organization may rely on. */
  readonly provenLevel: number;
  readonly gap: number;
  readonly proven: boolean;
  /** Why proven differs from claimed, for display and audit. */
  readonly provenReason: string;
  /** May be empty. An empty list is the finding, not a missing value. */
  readonly evidenceRefs: readonly CapabilityEvidenceRef[];
}

/**
 * The affected population, as far as the caller is permitted to see it.
 *
 * `scopeLimited` is the literal `true` so no caller can branch on this being
 * a complete population: the underlying reads run under RLS, so the list is a
 * lower bound on who is affected, never an organizational total. A manager
 * reading "3 people affected" must not take that as "3 people in the chapter".
 */
export interface AffectedTalentSummary {
  readonly talent: readonly AffectedTalent[];
  readonly visibleCount: number;
  readonly scopeLimited: true;
}

// ===========================================================================
// Gaps
// ===========================================================================

export interface CapabilityGapFinding {
  readonly id: string;
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly requirement: RequirementRef;
  readonly requiredLevel: number;
  /** Highest level PROVEN by evidence among visible holders. */
  readonly provenLevel: number;
  /** Highest level CLAIMED among visible holders, before evidence. */
  readonly claimedLevel: number;
  /** Required − Proven. Negative means the requirement is exceeded. */
  readonly gap: number;
  /** The part development has to close. */
  readonly magnitude: number;
  readonly status: CapabilityStatus;
  readonly basis: GapBasis;
  readonly priority: PriorityFactors;
  readonly affectedTalent: AffectedTalentSummary;
  /** Always ANALYSIS: a deterministic reading of records, never a decision. */
  readonly claimKind: Extract<ClaimKind, "ANALYSIS">;
}

// ===========================================================================
// Development recommendations
// ===========================================================================

/**
 * How a gap should be closed.
 *
 * `establish_evidence` is not a training action at all, and separating it
 * matters: when someone claims a level they have simply never evidenced,
 * booking them onto a course spends development budget on a problem they do
 * not have. The missing thing is proof, not skill.
 *
 * `applied_practice` is the answer to a certification-only gap, for the same
 * reason in reverse — another certificate cannot close a gap that exists
 * precisely because certificates do not demonstrate application (PRD §7.1).
 */
export type DevelopmentApproach =
  | "establish_evidence"
  | "applied_practice"
  | "coaching"
  | "capability_sprint";

export const DEVELOPMENT_APPROACH_LABEL: Record<DevelopmentApproach, string> = {
  establish_evidence: "Establish evidence",
  applied_practice: "Applied practice on real work",
  coaching: "Coaching and guided practice",
  capability_sprint: "DPS 20-hour Capability Sprint",
};

export interface DevelopmentRecommendation {
  readonly id: string;
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly title: string;
  readonly approach: DevelopmentApproach;
  readonly rationale: string;
  readonly priority: "low" | "medium" | "high";
  /** Grounded in the same traceable basis as the gap it addresses. */
  readonly basis: GapBasis;
  readonly priorityFactors: PriorityFactors;
  readonly claimKind: Extract<ClaimKind, "RECOMMENDATION">;
  readonly requiresHumanDecision: true;
}

// ===========================================================================
// Analysis
// ===========================================================================

export interface CapabilityAnalysis {
  readonly summary: string;
  readonly gaps: readonly CapabilityGapFinding[];
  readonly evidence: readonly CapabilityEvidenceRef[];
  readonly uncertainties: readonly Uncertainty[];
  readonly recommendations: readonly DevelopmentRecommendation[];
  /** What was analysed, in words, so the reader knows the boundary. */
  readonly scope: string;
  readonly requirementCount: number;
  readonly evidenceCount: number;
  /** Requirements no visible person has proven at the required level. */
  readonly unprovenRequirementCount: number;
  readonly generatedAt: string;
  /**
   * Always false. Typed as the literal so no caller can branch on this
   * analysis having changed anyone's capability level: it cannot, and no tool
   * exists through which it could.
   */
  readonly upgradesCapability: false;
  /**
   * Always false. An analysis of evidence is not an assessment of a person.
   * capability.assess is a permission this agent does not hold.
   */
  readonly isCapabilityAssessment: false;
}

/**
 * Actions this agent must refuse — its own refusal list.
 *
 * The pipeline already prevents all of them: no such tool is registered, the
 * registry is closed, and migration 20260921090001 denies AI writes at the
 * database regardless of configured permissions. This list exists so the
 * refusal is stated where the agent is defined, and so a future tool
 * registration that contradicts it fails a test rather than shipping.
 */
export const FORBIDDEN_CAPABILITY_ACTIONS: readonly string[] = [
  "assess_capability_level",
  "upgrade_capability_level",
  "validate_capability_evidence",
  "certify_talent",
  "approve_development_plan",
  "assign_talent_to_project",
  "export_capability_matrix",
];
