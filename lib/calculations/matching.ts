/**
 * Talent matching engine — TANIA_PRD_v2.0.md §20, §33, §61.
 *
 * Deterministic and pure. Produces MATCH, EVIDENCE, GAP, CONFIDENCE and a
 * RECOMMENDED ACTION for one person against one staffing requirement.
 *
 * It never assigns anyone. The strongest output is a recommendation that a
 * human evaluates (PRD §58, AGENTS.md §9), and `claimKind` is fixed to
 * RECOMMENDATION so the result cannot be mistaken for a decision.
 *
 * THE CENTRAL DESIGN PROBLEM
 * A score computed from two known dimensions must not look like one computed
 * from ten. Confidence here is driven by DATA COVERAGE, not by how good the
 * fit appears: a 95% match on 20% coverage is not a strong candidate, it is
 * an uninformed guess. Below a coverage floor the engine refuses to
 * recommend at all and returns INSUFFICIENT_DATA.
 */

import { clampLevel } from "@/lib/calculations/capability";
import type { ClaimKind } from "@/types/claim";

// ===========================================================================
// Dimensions
// ===========================================================================

export const MATCH_DIMENSIONS = [
  "role",
  "capability",
  "capability_level",
  "experience",
  "availability",
  "duration",
  "location",
  "project_priority",
  "workload",
  "development_objective",
] as const;

export type MatchDimension = (typeof MATCH_DIMENSIONS)[number];

export const MATCH_DIMENSION_LABEL: Record<MatchDimension, string> = {
  role: "Role",
  capability: "Capability",
  capability_level: "Capability level",
  experience: "Experience",
  availability: "Availability",
  duration: "Duration",
  location: "Location",
  project_priority: "Project priority",
  workload: "Workload",
  development_objective: "Development objective",
};

/**
 * Default dimension weights.
 *
 * DESIGNED, not PRD-specified. Unlike performance weights — which determine
 * how a person is rated and therefore live in the database (PRD §6.1) — these
 * shape a recommendation a human evaluates, so a documented constant is
 * proportionate. If matching weights ever become policy rather than a
 * heuristic, move them to data as performance weights were.
 *
 * Capability and level carry the most weight because a staffing decision that
 * gets those wrong fails regardless of how well everything else fits.
 */
export const DEFAULT_MATCH_WEIGHTS: Record<MatchDimension, number> = {
  capability: 0.2,
  capability_level: 0.18,
  availability: 0.15,
  workload: 0.12,
  role: 0.1,
  experience: 0.08,
  duration: 0.06,
  development_objective: 0.05,
  project_priority: 0.04,
  location: 0.02,
};

/**
 * Minimum share of total weight that must have real data before the engine
 * will recommend anything.
 */
export const MIN_COVERAGE_TO_RECOMMEND = 0.5;

/** Match score at or above which a candidate is worth proposing. */
export const STRONG_MATCH_THRESHOLD = 70;
/** Below this, the candidate is not recommended even with good coverage. */
export const WEAK_MATCH_THRESHOLD = 40;

// ===========================================================================
// Inputs
// ===========================================================================

export interface StaffingRequirement {
  readonly projectId: string;
  readonly projectName: string;
  readonly roleName: string | null;
  readonly capabilityId: string | null;
  readonly capabilityName: string | null;
  readonly requiredLevel: number | null;
  readonly requiredAllocationPct: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly location: string | null;
  readonly priority: "low" | "medium" | "high" | "critical" | null;
  readonly minYearsExperience: number | null;
}

export interface CandidateProfile {
  readonly profileId: string;
  readonly fullName: string;
  readonly jobTitle: string | null;
  readonly location: string | null;
  readonly yearsExperience: number | null;
  /** Proven level for the required capability, if known. */
  readonly provenLevel: number | null;
  /** Whether the proven level is backed by validated applied evidence. */
  readonly levelProven: boolean;
  readonly currentUtilizationPct: number | null;
  /** Capability ids the person holds at any level. */
  readonly capabilityIds: readonly string[];
  /** Capability ids this person has an active development objective for. */
  readonly developmentCapabilityIds: readonly string[];
  readonly availableFrom: string | null;
}

// ===========================================================================
// Output
// ===========================================================================

export interface DimensionAssessment {
  readonly dimension: MatchDimension;
  /** 0–100, or null when there is no data to judge. */
  readonly score: number | null;
  readonly weight: number;
  /** What supports the score. */
  readonly evidence: string | null;
  /** What is missing or mismatched. */
  readonly gap: string | null;
}

export type RecommendedAction =
  | "PROPOSE_ASSIGNMENT"
  | "PROPOSE_WITH_DEVELOPMENT"
  | "NOT_RECOMMENDED"
  | "INSUFFICIENT_DATA";

export const RECOMMENDED_ACTION_LABEL: Record<RecommendedAction, string> = {
  PROPOSE_ASSIGNMENT: "Propose assignment",
  PROPOSE_WITH_DEVELOPMENT: "Propose with development plan",
  NOT_RECOMMENDED: "Not recommended",
  INSUFFICIENT_DATA: "Insufficient data to recommend",
};

export interface MatchResult {
  readonly profileId: string;
  readonly fullName: string;
  /** MATCH — 0–100 over covered weight. Null when nothing is known. */
  readonly match: number | null;
  /** EVIDENCE — what supports the match. */
  readonly evidence: readonly string[];
  /** GAP — what is missing or mismatched. */
  readonly gaps: readonly string[];
  /** CONFIDENCE — 0–100, driven by data coverage, not by fit. */
  readonly confidence: number;
  /** Share of total dimension weight that had data, 0–100. */
  readonly coverage: number;
  /** RECOMMENDED ACTION. */
  readonly recommendedAction: RecommendedAction;
  readonly dimensions: readonly DimensionAssessment[];
  /** Always RECOMMENDATION. Matching never decides. */
  readonly claimKind: Extract<ClaimKind, "RECOMMENDATION">;
  /** Always true. No assignment follows from a match alone. */
  readonly requiresHumanApproval: true;
}

// ===========================================================================
// Scoring
// ===========================================================================

function assessCapability(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.capability;
  if (!requirement.capabilityId) {
    return { dimension: "capability", score: null, weight, evidence: null, gap: null };
  }
  const holds = candidate.capabilityIds.includes(requirement.capabilityId);
  return {
    dimension: "capability",
    score: holds ? 100 : 0,
    weight,
    evidence: holds
      ? `Holds ${requirement.capabilityName ?? "the required capability"}`
      : null,
    gap: holds ? null : `Does not hold ${requirement.capabilityName ?? "the required capability"}`,
  };
}

function assessCapabilityLevel(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.capability_level;
  if (requirement.requiredLevel === null || candidate.provenLevel === null) {
    return {
      dimension: "capability_level",
      score: null,
      weight,
      evidence: null,
      gap:
        requirement.requiredLevel !== null
          ? "No proven capability level recorded"
          : null,
    };
  }

  const required = clampLevel(requirement.requiredLevel);
  const proven = clampLevel(candidate.provenLevel);
  const shortfall = Math.max(0, required - proven);

  // Each level short costs 30 points; two levels short is effectively a miss.
  const score = Math.max(0, 100 - shortfall * 30);

  return {
    dimension: "capability_level",
    score,
    weight,
    evidence:
      shortfall === 0
        ? `Proven at L${proven} against L${required} required${candidate.levelProven ? "" : " (level not evidence-backed)"}`
        : null,
    gap:
      shortfall > 0
        ? `Proven L${proven}, requires L${required} — ${shortfall} level(s) short`
        : candidate.levelProven
          ? null
          : "Level is claimed but not backed by validated applied evidence",
  };
}

function assessWorkload(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.workload;
  if (candidate.currentUtilizationPct === null) {
    return { dimension: "workload", score: null, weight, evidence: null, gap: null };
  }

  const projected = candidate.currentUtilizationPct + requirement.requiredAllocationPct;

  if (projected <= 100) {
    return {
      dimension: "workload",
      score: 100,
      weight,
      evidence: `Currently ${candidate.currentUtilizationPct}%; this role takes them to ${Math.round(projected)}%`,
      gap: null,
    };
  }

  // Over 100% is a real cost, scaled by how far over.
  const overBy = projected - 100;
  return {
    dimension: "workload",
    score: Math.max(0, 100 - overBy * 2),
    weight,
    evidence: null,
    gap: `Would be over-allocated at ${Math.round(projected)}%`,
  };
}

function assessAvailability(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.availability;
  if (!requirement.startDate || !candidate.availableFrom) {
    return { dimension: "availability", score: null, weight, evidence: null, gap: null };
  }

  const available = candidate.availableFrom <= requirement.startDate;
  return {
    dimension: "availability",
    score: available ? 100 : 0,
    weight,
    evidence: available ? `Available from ${candidate.availableFrom}` : null,
    gap: available
      ? null
      : `Not available until ${candidate.availableFrom}; needed from ${requirement.startDate}`,
  };
}

function assessExperience(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.experience;
  if (requirement.minYearsExperience === null || candidate.yearsExperience === null) {
    return { dimension: "experience", score: null, weight, evidence: null, gap: null };
  }
  const meets = candidate.yearsExperience >= requirement.minYearsExperience;
  return {
    dimension: "experience",
    score: meets ? 100 : Math.round((candidate.yearsExperience / requirement.minYearsExperience) * 100),
    weight,
    evidence: meets ? `${candidate.yearsExperience} years experience` : null,
    gap: meets
      ? null
      : `${candidate.yearsExperience} years against ${requirement.minYearsExperience} required`,
  };
}

function assessRole(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.role;
  if (!requirement.roleName || !candidate.jobTitle) {
    return { dimension: "role", score: null, weight, evidence: null, gap: null };
  }
  const match = candidate.jobTitle.toLowerCase().includes(requirement.roleName.toLowerCase());
  return {
    dimension: "role",
    score: match ? 100 : 50,
    weight,
    evidence: match ? `Current role: ${candidate.jobTitle}` : null,
    gap: match ? null : `Role differs: ${candidate.jobTitle} vs ${requirement.roleName}`,
  };
}

function assessLocation(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.location;
  if (!requirement.location || !candidate.location) {
    return { dimension: "location", score: null, weight, evidence: null, gap: null };
  }
  const same = requirement.location.toLowerCase() === candidate.location.toLowerCase();
  return {
    dimension: "location",
    score: same ? 100 : 60,
    weight,
    evidence: same ? `Located in ${candidate.location}` : null,
    gap: same ? null : `Different location: ${candidate.location}`,
  };
}

function assessDuration(requirement: StaffingRequirement): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.duration;
  if (!requirement.startDate || !requirement.endDate) {
    return { dimension: "duration", score: null, weight, evidence: null, gap: null };
  }
  return {
    dimension: "duration",
    score: 100,
    weight,
    evidence: `${requirement.startDate} to ${requirement.endDate}`,
    gap: null,
  };
}

function assessPriority(requirement: StaffingRequirement): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.project_priority;
  if (!requirement.priority) {
    return { dimension: "project_priority", score: null, weight, evidence: null, gap: null };
  }
  const score = { low: 40, medium: 60, high: 80, critical: 100 }[requirement.priority];
  return {
    dimension: "project_priority",
    score,
    weight,
    evidence: `Project priority: ${requirement.priority}`,
    gap: null,
  };
}

/**
 * Development objective.
 *
 * A project that advances someone's active development objective is a better
 * match, because PRD §8.1 puts project assignment inside the development
 * loop. This is the dimension that makes staffing a development instrument
 * rather than only a resourcing one.
 */
function assessDevelopmentObjective(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): DimensionAssessment {
  const weight = DEFAULT_MATCH_WEIGHTS.development_objective;
  if (!requirement.capabilityId || candidate.developmentCapabilityIds.length === 0) {
    return {
      dimension: "development_objective",
      score: null,
      weight,
      evidence: null,
      gap: null,
    };
  }
  const advances = candidate.developmentCapabilityIds.includes(requirement.capabilityId);
  return {
    dimension: "development_objective",
    score: advances ? 100 : 50,
    weight,
    evidence: advances
      ? "Advances an active development objective for this capability"
      : null,
    gap: null,
  };
}

// ===========================================================================
// Match
// ===========================================================================

/**
 * Scores one candidate against one requirement.
 *
 * The match is a weighted mean over COVERED weight only. Unknown dimensions
 * are excluded rather than scored zero — a missing location should not make
 * someone look like a poor fit.
 *
 * Confidence is coverage-driven and capped: even full coverage yields at most
 * 95, because a heuristic over recorded data is never certain about whether a
 * person suits a piece of work.
 */
export function matchCandidate(
  requirement: StaffingRequirement,
  candidate: CandidateProfile,
): MatchResult {
  const dimensions: DimensionAssessment[] = [
    assessCapability(requirement, candidate),
    assessCapabilityLevel(requirement, candidate),
    assessAvailability(requirement, candidate),
    assessWorkload(requirement, candidate),
    assessRole(requirement, candidate),
    assessExperience(requirement, candidate),
    assessDuration(requirement),
    assessDevelopmentObjective(requirement, candidate),
    assessPriority(requirement),
    assessLocation(requirement, candidate),
  ];

  let coveredWeight = 0;
  let weighted = 0;
  const evidence: string[] = [];
  const gaps: string[] = [];

  for (const dimension of dimensions) {
    if (dimension.evidence) evidence.push(dimension.evidence);
    if (dimension.gap) gaps.push(dimension.gap);
    if (dimension.score === null) continue;
    coveredWeight += dimension.weight;
    weighted += dimension.score * dimension.weight;
  }

  const totalWeight = Object.values(DEFAULT_MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
  const coverageRatio = totalWeight > 0 ? coveredWeight / totalWeight : 0;
  const coverage = Math.round(coverageRatio * 1000) / 10;

  const match =
    coveredWeight > 0 ? Math.round((weighted / coveredWeight) * 10) / 10 : null;

  // Confidence tracks how much was actually known, never how good the fit
  // looks. Capped at 95: this is a heuristic, not a measurement.
  const confidence = Math.round(Math.min(coverageRatio, 1) * 95 * 10) / 10;

  const recommendedAction = decideAction(match, coverageRatio, gaps.length);

  return {
    profileId: candidate.profileId,
    fullName: candidate.fullName,
    match,
    evidence,
    gaps,
    confidence,
    coverage,
    recommendedAction,
    dimensions,
    claimKind: "RECOMMENDATION",
    requiresHumanApproval: true,
  };
}

function decideAction(
  match: number | null,
  coverageRatio: number,
  gapCount: number,
): RecommendedAction {
  // Coverage gates everything. A high score on thin data is not a
  // recommendation, it is a guess wearing a number.
  if (match === null || coverageRatio < MIN_COVERAGE_TO_RECOMMEND) {
    return "INSUFFICIENT_DATA";
  }
  if (match >= STRONG_MATCH_THRESHOLD) return "PROPOSE_ASSIGNMENT";
  if (match >= WEAK_MATCH_THRESHOLD && gapCount > 0) {
    return "PROPOSE_WITH_DEVELOPMENT";
  }
  return "NOT_RECOMMENDED";
}

/**
 * Ranks candidates.
 *
 * Sorted by match, then confidence, then name — a stable order, so the
 * shortlist does not reshuffle between renders. Candidates with insufficient
 * data are sorted last regardless of score, since their number means little.
 */
export function rankCandidates(
  requirement: StaffingRequirement,
  candidates: readonly CandidateProfile[],
): readonly MatchResult[] {
  return candidates
    .map((candidate) => matchCandidate(requirement, candidate))
    .sort((a, b) => {
      const aInsufficient = a.recommendedAction === "INSUFFICIENT_DATA" ? 1 : 0;
      const bInsufficient = b.recommendedAction === "INSUFFICIENT_DATA" ? 1 : 0;
      return (
        aInsufficient - bInsufficient ||
        (b.match ?? -1) - (a.match ?? -1) ||
        b.confidence - a.confidence ||
        a.fullName.localeCompare(b.fullName)
      );
    });
}
