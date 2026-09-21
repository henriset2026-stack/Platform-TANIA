/**
 * Capability Agent analysis.
 *
 * PURE. Requirements, talent capabilities and evidence in; the output
 * contract out. No I/O, no model call, no randomness, no clock beyond the
 * generation timestamp.
 *
 * A capability gap drives development spend and staffing decisions, so the
 * arithmetic has to be reproducible by anyone holding the same rows. The LLM's
 * role in this agent is to phrase a summary and answer follow-up questions —
 * it never decides what the gaps are, how large they are, or who is affected.
 * Every number below comes from lib/calculations/capability.ts, which is where
 * CLAUDE.md §5 requires business formulas to live.
 */

import {
  CERTIFICATION_ONLY_CEILING,
  CRITICALITY_WEIGHT,
  MIN_LEVEL,
  URGENCY_WEIGHT,
  calculateCapabilityGap,
  calculateGapPriority,
  calculateProvenLevel,
  clampLevel,
  gapPriorityIndex,
  levelName,
  type AssessmentStatus,
  type Criticality,
  type EvidenceInput,
  type Urgency,
} from "@/lib/calculations/capability";
import { toNonEmpty, type Uncertainty } from "@/agents/core/output";
import {
  describeScope,
  type AffectedTalent,
  type CapabilityAnalysis,
  type CapabilityEvidenceRef,
  type CapabilityGapFinding,
  type DevelopmentApproach,
  type DevelopmentRecommendation,
  type GapBasis,
  type PriorityFactors,
  type RequirementRef,
  type RequirementScope,
} from "@/agents/capability/contract";

// ===========================================================================
// Input
// ===========================================================================

export interface EvidenceRecordInput {
  readonly evidenceId: string;
  readonly sourceType: string;
  readonly validationStatus: "pending" | "validated" | "rejected" | "withdrawn";
  readonly occurredAt: string | null;
}

export interface TalentCapabilityInput {
  readonly talentCapabilityId: string;
  readonly talentId: string;
  readonly displayName: string;
  readonly capabilityId: string;
  readonly claimedLevel: number;
  readonly assessmentStatus: AssessmentStatus;
  readonly evidence: readonly EvidenceRecordInput[];
}

export interface RequirementInput {
  readonly requirementId: string;
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly requiredLevel: number;
  readonly criticality: Criticality;
  readonly urgency: Urgency;
  readonly scope: RequirementScope;
}

export interface CapabilityAnalysisInput {
  readonly requirements: readonly RequirementInput[];
  /** Capability records for people the caller is permitted to see. */
  readonly talent: readonly TalentCapabilityInput[];
  readonly scopeLabel?: string;
}

/**
 * Evidence source types that demonstrate APPLICATION.
 *
 * Deliberately not re-declared here: calculateProvenLevel owns the list, and a
 * second copy would drift. This predicate asks the engine the same question
 * the engine asks itself, by running one record through it.
 */
export function demonstratesApplication(sourceType: string): boolean {
  const result = calculateProvenLevel({
    claimedLevel: CERTIFICATION_ONLY_CEILING + 1,
    assessmentStatus: "evidence_validated",
    evidence: [{ sourceType, validationStatus: "validated" }],
  });
  return result.provenLevel > CERTIFICATION_ONLY_CEILING;
}

/** Recommendation priority thresholds over the 0–100 priority index. */
export const HIGH_PRIORITY_INDEX = 50;
export const MEDIUM_PRIORITY_INDEX = 20;

// ===========================================================================
// Analysis
// ===========================================================================

export function analyzeCapability(
  input: CapabilityAnalysisInput,
): CapabilityAnalysis {
  const generatedAt = new Date().toISOString();
  const scope = input.scopeLabel ?? "your authorized scope";

  const byCapability = new Map<string, TalentCapabilityInput[]>();
  for (const row of input.talent) {
    const list = byCapability.get(row.capabilityId) ?? [];
    list.push(row);
    byCapability.set(row.capabilityId, list);
  }

  const allEvidence: CapabilityEvidenceRef[] = input.talent.flatMap((row) =>
    row.evidence.map((e) => toEvidenceRef(row, e)),
  );

  const uncertainties: Uncertainty[] = [];
  const gaps: CapabilityGapFinding[] = [];
  const unheldCapabilities: string[] = [];

  if (input.requirements.length === 0) {
    return {
      summary:
        `No capability requirements are defined within ${scope}, so no gap can be calculated. ` +
        "Capability Gap = Required − Current, and without a required level there is nothing to subtract from.",
      gaps: [],
      evidence: allEvidence,
      uncertainties: [
        {
          topic: "Capability requirements",
          reason: "No requirement rows were returned for the analysed scope.",
          resolvedBy:
            "Define capability requirements for the organization, squad, project or role, or confirm your scope includes them.",
        },
      ],
      recommendations: [],
      scope,
      requirementCount: 0,
      evidenceCount: allEvidence.length,
      unprovenRequirementCount: 0,
      generatedAt,
      upgradesCapability: false,
      isCapabilityAssessment: false,
    };
  }

  for (const requirement of input.requirements) {
    const holders = byCapability.get(requirement.capabilityId) ?? [];
    const requirementRef: RequirementRef = {
      requirementId: requirement.requirementId,
      capabilityId: requirement.capabilityId,
      requiredLevel: clampLevel(requirement.requiredLevel),
      scope: requirement.scope,
    };

    if (holders.length === 0) unheldCapabilities.push(requirement.capabilityName);

    // Each holder's proven level, from the engine — never from the claim.
    const assessed = holders.map((holder) => {
      const proven = calculateProvenLevel({
        claimedLevel: holder.claimedLevel,
        assessmentStatus: holder.assessmentStatus,
        evidence: holder.evidence.map(
          (e): EvidenceInput => ({
            sourceType: e.sourceType,
            validationStatus: e.validationStatus,
          }),
        ),
      });
      return { holder, proven };
    });

    // The chapter's position on a requirement is its strongest proven holder.
    // With nobody visible, MIN_LEVEL is the conservative reading — it widens
    // the gap rather than hiding it, and an uncertainty records that this may
    // be a scope limit rather than an absence.
    const bestProven = assessed.reduce(
      (best, row) => Math.max(best, row.proven.provenLevel),
      MIN_LEVEL,
    );
    const bestClaimed = assessed.reduce(
      (best, row) => Math.max(best, row.proven.claimedLevel),
      MIN_LEVEL,
    );

    const gap = calculateCapabilityGap(requirementRef.requiredLevel, bestProven);
    if (gap.magnitude <= 0) continue;

    const priority = buildPriority(gap.magnitude, requirement.criticality, requirement.urgency);

    const affected: AffectedTalent[] = assessed
      .filter((row) => row.proven.provenLevel < requirementRef.requiredLevel)
      .map((row) => ({
        talentId: row.holder.talentId,
        displayName: row.holder.displayName,
        claimedLevel: row.proven.claimedLevel,
        provenLevel: row.proven.provenLevel,
        gap: requirementRef.requiredLevel - row.proven.provenLevel,
        proven: row.proven.proven,
        provenReason: row.proven.reason,
        evidenceRefs: row.holder.evidence.map((e) => toEvidenceRef(row.holder, e)),
      }))
      .sort(
        (a, b) => b.gap - a.gap || a.displayName.localeCompare(b.displayName),
      );

    gaps.push({
      id: `gap:${requirement.requirementId}`,
      capabilityId: requirement.capabilityId,
      capabilityName: requirement.capabilityName,
      requirement: requirementRef,
      requiredLevel: requirementRef.requiredLevel,
      provenLevel: bestProven,
      claimedLevel: bestClaimed,
      gap: gap.gap,
      magnitude: gap.magnitude,
      status: gap.status,
      basis: buildBasis(holders, requirementRef),
      priority,
      affectedTalent: {
        talent: affected,
        visibleCount: affected.length,
        scopeLimited: true,
      },
      claimKind: "ANALYSIS",
    });
  }

  gaps.sort(
    (a, b) =>
      b.priority.score - a.priority.score ||
      a.capabilityName.localeCompare(b.capabilityName),
  );

  // --- Uncertainties ----------------------------------------------------
  if (unheldCapabilities.length > 0) {
    uncertainties.push({
      topic: "Population visibility",
      reason:
        `No one visible to you holds a record for: ${unheldCapabilities.sort().join(", ")}. ` +
        "Row-level security scopes this read, so that may be a limit of your scope rather than an absence in the chapter.",
      resolvedBy:
        "Confirm with someone holding wider scope before treating these as chapter-wide gaps.",
    });
  }

  const pending = allEvidence.filter((e) => e.validationStatus === "pending");
  if (pending.length > 0) {
    uncertainties.push({
      topic: "Unvalidated evidence",
      reason: `${pending.length} evidence record(s) await validation and therefore do not raise any proven level.`,
      resolvedBy:
        "Validate them; a level supported only by pending evidence is reported at the level the validated evidence supports.",
    });
  }

  const certificationOnly = gaps.filter((g) => g.basis.kind === "certification_only");
  if (certificationOnly.length > 0) {
    uncertainties.push({
      topic: "Certification is not capability",
      reason:
        `${certificationOnly.length} gap(s) rest on validated evidence that demonstrates knowledge but not application, ` +
        `so the proven level is capped at L${CERTIFICATION_ONLY_CEILING} (${levelName(CERTIFICATION_ONLY_CEILING)}) regardless of the claim.`,
      resolvedBy:
        "Record evidence of applied work — a deliverable, an assessment or a peer review — rather than a further certificate.",
    });
  }

  const requiredCapabilityIds = new Set(input.requirements.map((r) => r.capabilityId));
  const heldWithoutRequirement = [...byCapability.keys()].filter(
    (id) => !requiredCapabilityIds.has(id),
  );
  if (heldWithoutRequirement.length > 0) {
    uncertainties.push({
      topic: "Capabilities without a requirement",
      reason: `${heldWithoutRequirement.length} held capability(ies) have no required level defined, so no gap can be calculated for them.`,
      resolvedBy:
        "Define a requirement for them if they matter to the scope, or accept that they are outside the gap analysis.",
    });
  }

  const recommendations = gaps.map(recommendFor);

  return {
    summary: buildSummary({
      scope,
      requirementCount: input.requirements.length,
      gapCount: gaps.length,
      evidenceCount: allEvidence.length,
      topGap: gaps[0] ?? null,
    }),
    gaps,
    evidence: allEvidence,
    uncertainties,
    recommendations,
    scope,
    requirementCount: input.requirements.length,
    evidenceCount: allEvidence.length,
    unprovenRequirementCount: gaps.length,
    generatedAt,
    upgradesCapability: false,
    isCapabilityAssessment: false,
  };
}

// ===========================================================================
// Basis
// ===========================================================================

function toEvidenceRef(
  holder: TalentCapabilityInput,
  record: EvidenceRecordInput,
): CapabilityEvidenceRef {
  return {
    evidenceId: record.evidenceId,
    talentCapabilityId: holder.talentCapabilityId,
    capabilityId: holder.capabilityId,
    sourceType: record.sourceType,
    validationStatus: record.validationStatus,
    demonstratesApplication: demonstratesApplication(record.sourceType),
    occurredAt: record.occurredAt,
    // A recorded evidence row is a FACT about what was filed. Whether it
    // supports the claimed level is a separate question, answered by the
    // proven-level engine rather than by the row itself.
    claimKind: "FACT",
  };
}

/**
 * Chooses the basis, preferring the strongest evidence available.
 *
 * Validated applied evidence wins; validated knowledge-only evidence is named
 * as such; nothing validated falls back to citing the requirement. The order
 * matters — reporting "unevidenced" when certificates exist would misdirect
 * development towards a course the person has already taken.
 */
function buildBasis(
  holders: readonly TalentCapabilityInput[],
  requirement: RequirementRef,
): GapBasis {
  const refs = holders.flatMap((holder) =>
    holder.evidence.map((e) => toEvidenceRef(holder, e)),
  );
  const validated = refs.filter((ref) => ref.validationStatus === "validated");

  const applied = toNonEmpty(validated.filter((ref) => ref.demonstratesApplication));
  if (applied) return { kind: "evidenced", evidenceRefs: applied };

  const knowledgeOnly = toNonEmpty(validated);
  if (knowledgeOnly) {
    return { kind: "certification_only", evidenceRefs: knowledgeOnly };
  }

  return { kind: "unevidenced", requirement };
}

// ===========================================================================
// Priority
// ===========================================================================

function buildPriority(
  magnitude: number,
  criticality: Criticality,
  urgency: Urgency,
): PriorityFactors {
  const score = calculateGapPriority({ magnitude, criticality, urgency });
  const criticalityWeight = CRITICALITY_WEIGHT[criticality];
  const urgencyWeight = URGENCY_WEIGHT[urgency];

  return {
    magnitude,
    businessCriticality: criticality,
    criticalityWeight,
    timeUrgency: urgency,
    urgencyWeight,
    score,
    index: gapPriorityIndex(score),
    formula:
      `magnitude ${magnitude} × criticality ${criticality} (${criticalityWeight}) ` +
      `× urgency ${urgency} (${urgencyWeight}) = ${score}`,
  };
}

// ===========================================================================
// Development recommendations
// ===========================================================================

/**
 * One recommendation per gap, chosen deterministically from the gap's basis
 * and magnitude.
 *
 * The basis drives the approach before the magnitude does, because the two
 * describe different problems: an unevidenced claim at or above the required
 * level is a proof problem, and a certification-only gap is an application
 * problem. Reaching for a course in either case spends budget without closing
 * anything.
 */
export function recommendFor(gap: CapabilityGapFinding): DevelopmentRecommendation {
  const { approach, title, rationale } = chooseApproach(gap);

  return {
    id: `recommend:${gap.requirement.requirementId}:${approach}`,
    capabilityId: gap.capabilityId,
    capabilityName: gap.capabilityName,
    title,
    approach,
    rationale,
    priority:
      gap.priority.index >= HIGH_PRIORITY_INDEX
        ? "high"
        : gap.priority.index >= MEDIUM_PRIORITY_INDEX
          ? "medium"
          : "low",
    basis: gap.basis,
    priorityFactors: gap.priority,
    claimKind: "RECOMMENDATION",
    requiresHumanDecision: true,
  };
}

function chooseApproach(gap: CapabilityGapFinding): {
  approach: DevelopmentApproach;
  title: string;
  rationale: string;
} {
  const target = `L${gap.requiredLevel} ${levelName(gap.requiredLevel)}`;
  const current = `L${gap.provenLevel} ${levelName(gap.provenLevel)}`;
  const where = describeScope(gap.requirement.scope);

  if (gap.basis.kind === "certification_only") {
    return {
      approach: "applied_practice",
      title: `Evidence applied ${gap.capabilityName} work towards ${target}`,
      rationale:
        `Validated evidence exists but demonstrates knowledge rather than application, so the proven level is capped at ` +
        `L${CERTIFICATION_ONLY_CEILING} against a requirement of ${target} for ${where}. ` +
        "A further certificate cannot close this gap; applied work — a deliverable, an assessment or a peer review — can.",
    };
  }

  if (gap.basis.kind === "unevidenced" && gap.claimedLevel >= gap.requiredLevel) {
    return {
      approach: "establish_evidence",
      title: `Evidence the existing ${gap.capabilityName} claim`,
      rationale:
        `The capability is claimed at L${gap.claimedLevel} against a requirement of ${target}, but no validated evidence supports it, ` +
        `so the organization can only rely on ${current}. What is missing here is proof, not skill — ` +
        "confirm the claim with evidence before committing development budget.",
    };
  }

  if (gap.magnitude >= 2) {
    return {
      approach: "capability_sprint",
      title: `Run a Capability Sprint on ${gap.capabilityName}`,
      rationale:
        `The gap is ${gap.magnitude} level(s) — ${current} against ${target} for ${where} — which is more than coaching closes. ` +
        "The DPS 20-hour Capability Sprint pairs learning with applied practice, so it produces the evidence the level needs " +
        "rather than only the knowledge.",
    };
  }

  return {
    approach: "coaching",
    title: `Coach ${gap.capabilityName} towards ${target}`,
    rationale:
      `The gap is one level — ${current} against ${target} for ${where} — which guided practice on current work can close. ` +
      "Record the resulting work as evidence, or the proven level will not move even if the capability does.",
  };
}

// ===========================================================================
// Summary
// ===========================================================================

function buildSummary(input: {
  scope: string;
  requirementCount: number;
  gapCount: number;
  evidenceCount: number;
  topGap: CapabilityGapFinding | null;
}): string {
  const opening =
    `Analysed ${input.requirementCount} capability requirement(s) against ${input.evidenceCount} evidence record(s) within ${input.scope}.`;

  const body =
    input.gapCount === 0
      ? " No requirement is unmet by the evidence available to you."
      : ` ${input.gapCount} requirement(s) are not met at the proven level.` +
        (input.topGap
          ? ` The highest priority is ${input.topGap.capabilityName}: ${input.topGap.priority.formula}.`
          : "");

  return (
    opening +
    body +
    " Levels here are proven from evidence, not claimed — certification is not capability (PRD §7.1)." +
    " This is an analysis, not an assessment: no capability level is changed by it and none follows from it."
  );
}
