/**
 * Performance calculation engine — TANIA_PRD_v2.0.md §6, §61, §62.
 *
 * Deterministic and pure. The weighting model is always INJECTED, never
 * defaulted: PRD §6.1 states weights are configuration and that different
 * roles may use different models, so a function that silently supplied its
 * own would be encoding universal policy (CLAUDE.md §16).
 */

import { isScoreable, type Claim, type ClaimKind } from "@/types/claim";

// ===========================================================================
// Dimensions — PRD §6.1 vocabulary. Names only; no weights.
// ===========================================================================

export const PERFORMANCE_DIMENSIONS = [
  { code: "delivery", name: "Delivery" },
  { code: "productivity", name: "Productivity" },
  { code: "capability_application", name: "Capability Application" },
  { code: "collaboration", name: "Collaboration" },
  { code: "innovation", name: "Innovation" },
  { code: "ai_augmentation", name: "AI Augmentation" },
  { code: "business_impact", name: "Business Impact" },
] as const;

export type DimensionCode = (typeof PERFORMANCE_DIMENSIONS)[number]["code"];

export function dimensionName(code: string): string {
  return PERFORMANCE_DIMENSIONS.find((d) => d.code === code)?.name ?? code;
}

// ===========================================================================
// Weight profiles
// ===========================================================================

export interface DimensionWeight {
  readonly dimensionCode: string;
  /** 0–1. */
  readonly weight: number;
}

export interface WeightProfile {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly weights: readonly DimensionWeight[];
  /** Whether a human has approved this model as policy. */
  readonly approved: boolean;
}

export const WEIGHT_SUM_TOLERANCE = 0.0001;

export type WeightProfileProblem =
  | { readonly kind: "EMPTY" }
  | { readonly kind: "SUM_NOT_ONE"; readonly total: number }
  | { readonly kind: "NEGATIVE_WEIGHT"; readonly dimensionCode: string }
  | { readonly kind: "DUPLICATE_DIMENSION"; readonly dimensionCode: string };

/**
 * Validates a profile before it is used to score anyone.
 *
 * Returns every problem rather than the first, because an administrator
 * fixing a profile should see all of them at once.
 */
export function validateWeightProfile(
  profile: WeightProfile,
): readonly WeightProfileProblem[] {
  const problems: WeightProfileProblem[] = [];

  if (profile.weights.length === 0) {
    problems.push({ kind: "EMPTY" });
    return problems;
  }

  const seen = new Set<string>();
  let total = 0;

  for (const entry of profile.weights) {
    if (seen.has(entry.dimensionCode)) {
      problems.push({
        kind: "DUPLICATE_DIMENSION",
        dimensionCode: entry.dimensionCode,
      });
    }
    seen.add(entry.dimensionCode);

    if (entry.weight < 0) {
      problems.push({
        kind: "NEGATIVE_WEIGHT",
        dimensionCode: entry.dimensionCode,
      });
    }
    total += entry.weight;
  }

  if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
    problems.push({ kind: "SUM_NOT_ONE", total });
  }

  return problems;
}

// ===========================================================================
// Performance index
// ===========================================================================

export interface DimensionScore {
  readonly dimensionCode: string;
  /** 0–100. */
  readonly score: number;
  readonly kind: ClaimKind;
}

export type PerformanceIndexResult =
  | {
      readonly computed: true;
      /** 0–100, rounded to one decimal. */
      readonly index: number;
      readonly profileId: string;
      /** Share of the profile's weight actually covered by scoreable data. */
      readonly coverage: number;
      readonly contributions: readonly {
        readonly dimensionCode: string;
        readonly score: number;
        readonly weight: number;
        readonly contribution: number;
      }[];
      /** Dimensions in the profile with no scoreable input. */
      readonly missingDimensions: readonly string[];
      /** Inputs excluded because they were INFERENCE or RECOMMENDATION. */
      readonly excludedNonScoreable: readonly string[];
      readonly usedUnapprovedProfile: boolean;
    }
  | {
      readonly computed: false;
      readonly reason: string;
      readonly problems?: readonly WeightProfileProblem[];
    };

/**
 * Weighted performance index.
 *
 * Refuses rather than approximates. It will not produce a number when:
 *  - the weight profile is invalid;
 *  - no dimension has scoreable input.
 *
 * A number that looks authoritative but rests on a broken model is worse than
 * no number, because it will be used (CLAUDE.md §25: explicit failure over
 * fabricated success).
 *
 * INFERENCE and RECOMMENDATION inputs are dropped and reported, never scored:
 * a model's reading of someone's work is not an input to their rating.
 *
 * `coverage` is returned so a caller can see that an index rests on, say, 40%
 * of the intended model. The index is the weighted mean over COVERED weight,
 * not over total weight — otherwise a missing dimension silently scores zero
 * and depresses the result.
 */
export function calculatePerformanceIndex(input: {
  profile: WeightProfile;
  scores: readonly DimensionScore[];
}): PerformanceIndexResult {
  const problems = validateWeightProfile(input.profile);
  if (problems.length > 0) {
    return {
      computed: false,
      reason: "Weight profile is not valid",
      problems,
    };
  }

  const excluded = input.scores
    .filter((s) => !isScoreable(s.kind))
    .map((s) => s.dimensionCode);

  const usable = new Map<string, number>();
  for (const score of input.scores) {
    if (!isScoreable(score.kind)) continue;
    if (!Number.isFinite(score.score)) continue;
    usable.set(score.dimensionCode, clampScore(score.score));
  }

  const contributions: {
    dimensionCode: string;
    score: number;
    weight: number;
    contribution: number;
  }[] = [];
  const missing: string[] = [];
  let coveredWeight = 0;
  let weighted = 0;

  for (const entry of input.profile.weights) {
    const score = usable.get(entry.dimensionCode);
    if (score === undefined) {
      missing.push(entry.dimensionCode);
      continue;
    }
    coveredWeight += entry.weight;
    weighted += score * entry.weight;
    contributions.push({
      dimensionCode: entry.dimensionCode,
      score,
      weight: entry.weight,
      contribution: score * entry.weight,
    });
  }

  if (coveredWeight <= 0) {
    return {
      computed: false,
      reason:
        excluded.length > 0
          ? "No scoreable input. The only inputs available were AI inference or recommendations, which are not scored."
          : "No scoreable input for any dimension in the profile",
    };
  }

  return {
    computed: true,
    index: round1((weighted / coveredWeight) * 1),
    profileId: input.profile.id,
    coverage: round1(coveredWeight * 100),
    contributions,
    missingDimensions: missing,
    excludedNonScoreable: excluded,
    usedUnapprovedProfile: !input.profile.approved,
  };
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(Math.max(score, 0), 100);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ===========================================================================
// Trend
// ===========================================================================

export interface TrendPoint {
  readonly periodId: string;
  readonly periodName: string;
  /** Period end, ISO date — used for ordering. */
  readonly periodEnd: string;
  readonly index: number;
}

export type TrendDirection = "improving" | "declining" | "stable" | "unknown";

export interface TrendResult {
  readonly points: readonly TrendPoint[];
  readonly direction: TrendDirection;
  /** Change from first to last point, in index units. */
  readonly change: number | null;
}

/**
 * Orders trend points and reports direction.
 *
 * `stable` is a band, not exact equality: a 0.2 move between periods is noise,
 * and reporting it as "improving" would invite action on nothing. A single
 * point yields `unknown` rather than `stable` — one measurement is not a trend.
 */
export const TREND_STABLE_BAND = 1;

export function calculateTrend(
  points: readonly TrendPoint[],
): TrendResult {
  const ordered = [...points].sort((a, b) =>
    a.periodEnd.localeCompare(b.periodEnd),
  );

  if (ordered.length < 2) {
    return { points: ordered, direction: "unknown", change: null };
  }

  const first = ordered[0]!.index;
  const last = ordered.at(-1)!.index;
  const change = round1(last - first);

  const direction: TrendDirection =
    Math.abs(change) <= TREND_STABLE_BAND
      ? "stable"
      : change > 0
        ? "improving"
        : "declining";

  return { points: ordered, direction, change };
}

// ===========================================================================
// Review workflow — PRD §58, AGENTS.md §9
// ===========================================================================

export type ReviewStatus = "draft" | "submitted" | "approved" | "rejected";

export type ReviewAction = "save_draft" | "submit" | "approve" | "reject" | "reopen";

export interface ReviewState {
  readonly status: ReviewStatus;
  readonly reviewerId: string;
  readonly subjectId: string;
}

export interface ReviewActor {
  readonly userId: string;
  readonly permissions: readonly string[];
  readonly isAiService: boolean;
}

export type TransitionResult =
  | { readonly allowed: true; readonly nextStatus: ReviewStatus }
  | { readonly allowed: false; readonly reason: string };

/**
 * Review workflow transitions.
 *
 * Four rules are enforced here rather than trusted to the UI:
 *
 *  1. An AI identity may perform NO transition. A final performance rating is
 *     a consequential human decision (PRD §58, AGENTS.md §9) — the refusal is
 *     unconditional, not permission-dependent.
 *  2. Submitting requires performance.submit_review; approving requires
 *     performance.approve_review. Read never implies write (CLAUDE.md §9).
 *  3. The reviewer may not approve their own submission. Separation of duties
 *     is what makes an approval mean anything.
 *  4. Nobody may review themselves.
 */
export function evaluateReviewTransition(
  state: ReviewState,
  action: ReviewAction,
  actor: ReviewActor,
): TransitionResult {
  if (actor.isAiService) {
    return {
      allowed: false,
      reason:
        "An AI identity may not act on a performance review. A final rating requires a human decision.",
    };
  }

  if (state.subjectId === actor.userId && action !== "save_draft") {
    return {
      allowed: false,
      reason: "A person may not review themselves.",
    };
  }

  switch (action) {
    case "save_draft":
      if (state.status !== "draft") {
        return { allowed: false, reason: "Only a draft review can be edited." };
      }
      if (state.reviewerId !== actor.userId) {
        return { allowed: false, reason: "Only the reviewer may edit the draft." };
      }
      return { allowed: true, nextStatus: "draft" };

    case "submit":
      if (state.status !== "draft") {
        return { allowed: false, reason: "Only a draft review can be submitted." };
      }
      if (state.reviewerId !== actor.userId) {
        return { allowed: false, reason: "Only the reviewer may submit." };
      }
      if (!actor.permissions.includes("performance.submit_review")) {
        return { allowed: false, reason: "Missing permission: performance.submit_review" };
      }
      return { allowed: true, nextStatus: "submitted" };

    case "approve":
    case "reject": {
      if (state.status !== "submitted") {
        return {
          allowed: false,
          reason: "Only a submitted review can be approved or rejected.",
        };
      }
      if (!actor.permissions.includes("performance.approve_review")) {
        return { allowed: false, reason: "Missing permission: performance.approve_review" };
      }
      if (state.reviewerId === actor.userId) {
        return {
          allowed: false,
          reason:
            "The reviewer may not approve their own review. Approval requires a second person.",
        };
      }
      return { allowed: true, nextStatus: action === "approve" ? "approved" : "rejected" };
    }

    case "reopen":
      if (state.status !== "rejected") {
        return { allowed: false, reason: "Only a rejected review can be reopened." };
      }
      if (!actor.permissions.includes("performance.submit_review")) {
        return { allowed: false, reason: "Missing permission: performance.submit_review" };
      }
      return { allowed: true, nextStatus: "draft" };
  }
}

/** Claims that may never be presented as a final rating. */
export function isFinalRatingClaim(claim: Claim<unknown>): boolean {
  return claim.kind === "FACT" || claim.kind === "ANALYSIS";
}
