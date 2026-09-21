/**
 * Capability calculation engine — TANIA_PRD_v2.0.md §7, §61.
 *
 * Deterministic, pure and total. No I/O, no randomness, no model inference.
 * CLAUDE.md §5 requires business formulas to live here rather than in UI
 * components, and AGENTS.md is clear that an agent may explain a gap but must
 * never be the thing that computes it: a capability gap drives development
 * spend and staffing decisions, so it has to be reproducible and auditable.
 */

import type { CapabilityStatus } from "@/types/status";

// ===========================================================================
// Levels — PRD §7.1
// ===========================================================================

export const CAPABILITY_LEVELS = [
  { level: 1, code: "L1", name: "Awareness" },
  { level: 2, code: "L2", name: "Foundation" },
  { level: 3, code: "L3", name: "Practitioner" },
  { level: 4, code: "L4", name: "Advanced" },
  { level: 5, code: "L5", name: "Expert / Mentor" },
] as const;

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

export function isValidLevel(level: number): boolean {
  return Number.isInteger(level) && level >= MIN_LEVEL && level <= MAX_LEVEL;
}

export function levelName(level: number): string {
  return CAPABILITY_LEVELS.find((l) => l.level === level)?.name ?? "Unknown";
}

/**
 * Clamps to the L1–L5 scale.
 *
 * NaN is genuinely unknown, so it resolves to L1 — the conservative reading,
 * which widens rather than hides a gap. Infinity is out of range rather than
 * unknown, so it clamps to the bound it exceeds. Collapsing both to L1 would
 * silently understate a requirement of +Infinity as the lowest level.
 */
export function clampLevel(level: number): number {
  if (Number.isNaN(level)) return MIN_LEVEL;
  if (level === Number.POSITIVE_INFINITY) return MAX_LEVEL;
  if (level === Number.NEGATIVE_INFINITY) return MIN_LEVEL;
  return Math.min(Math.max(Math.round(level), MIN_LEVEL), MAX_LEVEL);
}

// ===========================================================================
// Proven level — PRD §7.1, "Certification ≠ Capability"
// ===========================================================================

export type AssessmentStatus =
  | "provisional"
  | "self_assessed"
  | "manager_assessed"
  | "evidence_validated";

export interface EvidenceInput {
  /** e.g. project_deliverable, certification, assessment, peer_review. */
  readonly sourceType: string;
  readonly validationStatus: "pending" | "validated" | "rejected" | "withdrawn";
}

export interface ProvenLevelResult {
  /** The level the organization may rely on. */
  readonly provenLevel: number;
  /** The level claimed before evidence is considered. */
  readonly claimedLevel: number;
  readonly proven: boolean;
  /** Why the proven level differs from the claim, for display and audit. */
  readonly reason: string;
}

/**
 * Evidence types that demonstrate APPLICATION of a capability.
 *
 * PRD §7.1: "Capability must be supported by evidence of application."
 * A certificate demonstrates knowledge, not application, so it is absent from
 * this list by design.
 */
const APPLICATION_EVIDENCE = new Set([
  "project_deliverable",
  "assessment",
  "peer_review",
  "coaching_observation",
  "challenge",
  "code_review",
]);

/**
 * Ceiling for a capability supported only by certificates.
 *
 * L2 Foundation is the highest level describable without applied evidence:
 * L1 Awareness and L2 Foundation concern knowledge and guided work, whereas
 * L3 Practitioner onwards requires independent application. Treating a
 * certificate as proof of L3+ is precisely the error PRD §7.1 warns about.
 */
export const CERTIFICATION_ONLY_CEILING = 2;

/**
 * Resolves the level the organization may rely on.
 *
 * Deliberately conservative: an unproven claim is reported at the level the
 * evidence supports, never at the level asserted. Over-stating capability
 * misallocates staffing; under-stating it only prompts more evidence.
 */
export function calculateProvenLevel(input: {
  claimedLevel: number;
  assessmentStatus: AssessmentStatus;
  evidence: readonly EvidenceInput[];
}): ProvenLevelResult {
  const claimedLevel = clampLevel(input.claimedLevel);
  const validated = input.evidence.filter(
    (e) => e.validationStatus === "validated",
  );

  if (validated.length === 0) {
    return {
      provenLevel: MIN_LEVEL,
      claimedLevel,
      proven: false,
      reason:
        input.evidence.length === 0
          ? "No evidence recorded"
          : "No validated evidence; all evidence is pending, rejected or withdrawn",
    };
  }

  const hasApplication = validated.some((e) =>
    APPLICATION_EVIDENCE.has(e.sourceType),
  );

  if (!hasApplication) {
    const ceiling = Math.min(claimedLevel, CERTIFICATION_ONLY_CEILING);
    return {
      provenLevel: ceiling,
      claimedLevel,
      proven: claimedLevel <= CERTIFICATION_ONLY_CEILING,
      reason:
        `Validated evidence shows knowledge but not application; capped at L${CERTIFICATION_ONLY_CEILING} ` +
        "(certification is not capability, PRD §7.1)",
    };
  }

  // Applied, validated evidence exists. An evidence_validated assessment
  // confirms the claim; a self-assessment alone is not raised by it.
  if (input.assessmentStatus === "evidence_validated") {
    return {
      provenLevel: claimedLevel,
      claimedLevel,
      proven: true,
      reason: "Validated applied evidence, assessment confirmed",
    };
  }

  return {
    provenLevel: claimedLevel,
    claimedLevel,
    proven: true,
    reason: `Validated applied evidence (assessment status: ${input.assessmentStatus})`,
  };
}

// ===========================================================================
// Gap — PRD §7.3
// ===========================================================================

export interface GapResult {
  readonly requiredLevel: number;
  readonly currentLevel: number;
  /** Required − Current. Negative means the person exceeds the requirement. */
  readonly gap: number;
  /** Gap floored at zero; what development must close. */
  readonly magnitude: number;
  readonly status: CapabilityStatus;
}

/**
 * Capability Gap = Required Capability Level − Current Proven Capability Level.
 *
 * The raw signed gap is kept because exceeding a requirement is real
 * information — it identifies mentors and redeployment candidates. `magnitude`
 * is the part development has to close.
 */
export function calculateCapabilityGap(
  requiredLevel: number,
  currentLevel: number,
): GapResult {
  const required = clampLevel(requiredLevel);
  const current = clampLevel(currentLevel);
  const gap = required - current;
  const magnitude = Math.max(0, gap);

  return {
    requiredLevel: required,
    currentLevel: current,
    gap,
    magnitude,
    status: classifyGap(magnitude),
  };
}

/**
 * Maps gap magnitude onto the four-state scale used by the heatmap.
 *
 * Thresholds are a product decision, not a PRD-specified formula, and are
 * stated here so they are reviewable in one place rather than scattered
 * through the UI.
 */
export function classifyGap(magnitude: number): CapabilityStatus {
  if (magnitude <= 0) return "strong";
  if (magnitude <= 1) return "on_track";
  if (magnitude <= 2) return "needs_attention";
  return "critical_gap";
}

// ===========================================================================
// Gap priority — PRD §7.3
// ===========================================================================

export type Criticality = "low" | "medium" | "high" | "critical";
export type Urgency = "low" | "medium" | "high" | "immediate";

/**
 * Ordinal weights for the priority product.
 *
 * PRD §7.3 gives the formula — criticality × magnitude × urgency — but no
 * numeric scale for the two ordinal factors. These weights are therefore
 * DESIGNED, not specified, and are declared as constants so they can be
 * tuned or replaced by an approved product decision without touching the
 * formula. This mirrors the treatment of performance weights, which PRD §6.1
 * likewise makes configuration rather than policy.
 */
export const CRITICALITY_WEIGHT: Record<Criticality, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const URGENCY_WEIGHT: Record<Urgency, number> = {
  low: 1,
  medium: 2,
  high: 3,
  immediate: 4,
};

/** Highest achievable priority: magnitude 4 × criticality 4 × urgency 4. */
export const MAX_GAP_PRIORITY = 4 * 4 * 4;

/**
 * Gap Priority = Business Criticality × Gap Magnitude × Time Urgency.
 *
 * Zero when there is no gap, regardless of how critical or urgent the
 * capability is: a requirement already met needs no development.
 */
export function calculateGapPriority(input: {
  magnitude: number;
  criticality: Criticality;
  urgency: Urgency;
}): number {
  if (input.magnitude <= 0) return 0;
  return (
    Math.max(0, input.magnitude) *
    CRITICALITY_WEIGHT[input.criticality] *
    URGENCY_WEIGHT[input.urgency]
  );
}

/** Priority as a 0–100 index, for display alongside the raw score. */
export function gapPriorityIndex(priority: number): number {
  return Math.round((Math.min(priority, MAX_GAP_PRIORITY) / MAX_GAP_PRIORITY) * 100);
}

// ===========================================================================
// Coverage — PRD §62
// ===========================================================================

export interface CoverageInput {
  readonly requiredLevel: number;
  readonly currentLevel: number;
  /** People required at this level, if the requirement specifies headcount. */
  readonly headcountRequired?: number;
  readonly headcountMeeting?: number;
}

/**
 * Capability Coverage — the share of requirements met at or above target.
 *
 * Returns null for an empty input rather than 0. "No requirements defined"
 * and "no requirement is met" are different facts, and reporting the first as
 * 0% would be a fabricated metric.
 */
export function calculateCapabilityCoverage(
  rows: readonly CoverageInput[],
): number | null {
  if (rows.length === 0) return null;

  // Headcount-aware when the data supports it; otherwise per-requirement.
  const usesHeadcount = rows.every(
    (r) => typeof r.headcountRequired === "number" && r.headcountRequired > 0,
  );

  if (usesHeadcount) {
    let required = 0;
    let met = 0;
    for (const row of rows) {
      required += row.headcountRequired ?? 0;
      met += Math.min(row.headcountMeeting ?? 0, row.headcountRequired ?? 0);
    }
    return required === 0 ? null : Math.round((met / required) * 100);
  }

  const met = rows.filter(
    (r) => clampLevel(r.currentLevel) >= clampLevel(r.requiredLevel),
  ).length;
  return Math.round((met / rows.length) * 100);
}

// ===========================================================================
// Matrix and critical gaps
// ===========================================================================

export interface MatrixCellInput {
  readonly groupId: string;
  readonly capabilityId: string;
  readonly requiredLevel: number;
  readonly currentLevel: number;
}

export interface MatrixCell extends GapResult {
  readonly groupId: string;
  readonly capabilityId: string;
}

/**
 * Builds heatmap cells. Deterministic: cells are keyed and sorted, so the same
 * input always yields the same grid.
 */
export function buildCapabilityMatrix(
  rows: readonly MatrixCellInput[],
): readonly MatrixCell[] {
  return rows
    .map((row) => ({
      groupId: row.groupId,
      capabilityId: row.capabilityId,
      ...calculateCapabilityGap(row.requiredLevel, row.currentLevel),
    }))
    .sort(
      (a, b) =>
        a.groupId.localeCompare(b.groupId) ||
        a.capabilityId.localeCompare(b.capabilityId),
    );
}

/**
 * Scope of a capability requirement — exactly one, mirroring the CHECK
 * constraint on capability_requirements. A requirement with no scope, or with
 * several, would make the gap ambiguous, and this type refuses to represent
 * one.
 *
 * It lives here rather than in the agent contract so the dependency runs one
 * way: agents depend on the domain, never the reverse.
 */
export type RequirementScope =
  | { readonly kind: "organization"; readonly id: string }
  | { readonly kind: "squad"; readonly id: string }
  | { readonly kind: "project"; readonly id: string }
  | { readonly kind: "role"; readonly roleName: string };

export function describeScope(scope: RequirementScope): string {
  return scope.kind === "role" ? `role ${scope.roleName}` : `${scope.kind} ${scope.id}`;
}

export interface CriticalGapInput {
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly requiredLevel: number;
  readonly currentLevel: number;
  readonly criticality: Criticality;
  readonly urgency: Urgency;
}

export interface CriticalGap extends GapResult {
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly criticality: Criticality;
  readonly urgency: Urgency;
  readonly priority: number;
  readonly priorityIndex: number;
}

/**
 * Ranks open gaps by priority.
 *
 * Ties break on capability name so ordering is stable — an unstable list
 * reshuffles between renders and makes "the top three gaps" meaningless.
 */
export function rankCriticalGaps(
  rows: readonly CriticalGapInput[],
): readonly CriticalGap[] {
  return rows
    .map((row) => {
      const gap = calculateCapabilityGap(row.requiredLevel, row.currentLevel);
      const priority = calculateGapPriority({
        magnitude: gap.magnitude,
        criticality: row.criticality,
        urgency: row.urgency,
      });
      return {
        ...gap,
        capabilityId: row.capabilityId,
        capabilityName: row.capabilityName,
        criticality: row.criticality,
        urgency: row.urgency,
        priority,
        priorityIndex: gapPriorityIndex(priority),
      };
    })
    .filter((row) => row.magnitude > 0)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.capabilityName.localeCompare(b.capabilityName),
    );
}
