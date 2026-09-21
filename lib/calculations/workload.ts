/**
 * Workload and capacity engine — TANIA_PRD_v2.0.md §33, §61.
 *
 * Deterministic and pure. Utilization drives staffing conversations about
 * real people, so the arithmetic must be reproducible and the thresholds
 * must be stated in one place rather than scattered through the UI.
 */

import type { CapabilityStatus } from "@/types/status";

// ===========================================================================
// Thresholds
// ===========================================================================

/**
 * Utilization bands.
 *
 * These are a product decision, not a PRD-specified formula, and are declared
 * here so they are reviewable and tunable together. The asymmetry is
 * deliberate: sustained overload is a wellbeing and delivery risk, so the
 * overloaded band starts close above target, while underload is tolerated
 * over a wider range because bench time has legitimate uses — development,
 * onboarding, recovery after a hard delivery.
 */
export const UTILIZATION_BANDS = {
  /** At or below this, someone has meaningful spare capacity. */
  underloaded: 60,
  /** Healthy working range starts here. */
  healthyMin: 60,
  /** Healthy working range ends here. */
  healthyMax: 100,
  /** Above this is overload requiring attention. */
  overloaded: 100,
  /** Above this is severe and should not persist. */
  severe: 120,
} as const;

export type UtilizationBand =
  | "unassigned"
  | "underloaded"
  | "healthy"
  | "overloaded"
  | "severely_overloaded";

export const UTILIZATION_BAND_LABEL: Record<UtilizationBand, string> = {
  unassigned: "Unassigned",
  underloaded: "Under-utilized",
  healthy: "Healthy",
  overloaded: "Over-allocated",
  severely_overloaded: "Severely over-allocated",
};

export function classifyUtilization(percent: number): UtilizationBand {
  if (percent <= 0) return "unassigned";
  if (percent > UTILIZATION_BANDS.severe) return "severely_overloaded";
  if (percent > UTILIZATION_BANDS.overloaded) return "overloaded";
  if (percent < UTILIZATION_BANDS.underloaded) return "underloaded";
  return "healthy";
}

/** Maps a band onto the shared four-state scale used by the heatmap. */
export function bandToStatus(band: UtilizationBand): CapabilityStatus {
  switch (band) {
    case "healthy":
      return "strong";
    case "underloaded":
      return "on_track";
    case "unassigned":
      return "needs_attention";
    case "overloaded":
      return "needs_attention";
    case "severely_overloaded":
      return "critical_gap";
  }
}

// ===========================================================================
// Allocation and utilization
// ===========================================================================

export interface AllocationInput {
  readonly assignmentId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly allocationPct: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: "proposed" | "active" | "completed" | "cancelled";
}

export interface UtilizationResult {
  readonly profileId: string;
  /** Sum of active allocations. May exceed 100 — that is the signal. */
  readonly utilizationPct: number;
  /** Allocation from proposed-but-unapproved assignments, shown separately. */
  readonly proposedPct: number;
  readonly band: UtilizationBand;
  readonly status: CapabilityStatus;
  /** 100 − utilization, floored at 0. */
  readonly spareCapacityPct: number;
  readonly activeAssignmentCount: number;
  readonly projects: readonly string[];
}

/**
 * Utilization for one person.
 *
 * Counts only ACTIVE assignments toward utilization. Proposed assignments are
 * summed separately: a proposal is not a commitment, and folding it into the
 * headline figure would show someone as overloaded because of work nobody has
 * approved. Completed and cancelled assignments are excluded entirely.
 */
export function calculateUtilization(
  profileId: string,
  allocations: readonly AllocationInput[],
  options: { asOf?: string } = {},
): UtilizationResult {
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);

  const inWindow = (a: AllocationInput): boolean => {
    if (a.startDate && a.startDate > asOf) return false;
    if (a.endDate && a.endDate < asOf) return false;
    return true;
  };

  const active = allocations.filter((a) => a.status === "active" && inWindow(a));
  const proposed = allocations.filter((a) => a.status === "proposed" && inWindow(a));

  const utilizationPct = round1(
    active.reduce((sum, a) => sum + Math.max(0, a.allocationPct), 0),
  );
  const proposedPct = round1(
    proposed.reduce((sum, a) => sum + Math.max(0, a.allocationPct), 0),
  );

  const band = classifyUtilization(utilizationPct);

  return {
    profileId,
    utilizationPct,
    proposedPct,
    band,
    status: bandToStatus(band),
    spareCapacityPct: round1(Math.max(0, 100 - utilizationPct)),
    activeAssignmentCount: active.length,
    projects: [...new Set(active.map((a) => a.projectName))].sort(),
  };
}

// ===========================================================================
// Capacity
// ===========================================================================

export interface CapacitySummary {
  readonly headcount: number;
  /** Mean utilization across the population. */
  readonly meanUtilizationPct: number;
  /** Total spare capacity expressed in full-time equivalents. */
  readonly spareCapacityFte: number;
  readonly overloadedCount: number;
  readonly underloadedCount: number;
  readonly unassignedCount: number;
  readonly healthyCount: number;
}

/**
 * Chapter capacity roll-up.
 *
 * Spare capacity is reported in FTE rather than as a percentage because
 * "40% spare" across 10 people and across 100 people are entirely different
 * staffing situations. Overloaded people contribute ZERO spare capacity, not
 * negative — you cannot borrow capacity from someone already over-allocated
 * to cover someone else.
 */
export function summarizeCapacity(
  results: readonly UtilizationResult[],
): CapacitySummary {
  if (results.length === 0) {
    return {
      headcount: 0,
      meanUtilizationPct: 0,
      spareCapacityFte: 0,
      overloadedCount: 0,
      underloadedCount: 0,
      unassignedCount: 0,
      healthyCount: 0,
    };
  }

  let totalUtilization = 0;
  let spare = 0;
  let overloaded = 0;
  let underloaded = 0;
  let unassigned = 0;
  let healthy = 0;

  for (const result of results) {
    totalUtilization += result.utilizationPct;
    spare += result.spareCapacityPct;
    switch (result.band) {
      case "overloaded":
      case "severely_overloaded":
        overloaded += 1;
        break;
      case "underloaded":
        underloaded += 1;
        break;
      case "unassigned":
        unassigned += 1;
        break;
      case "healthy":
        healthy += 1;
        break;
    }
  }

  return {
    headcount: results.length,
    meanUtilizationPct: round1(totalUtilization / results.length),
    spareCapacityFte: round1(spare / 100),
    overloadedCount: overloaded,
    underloadedCount: underloaded,
    unassignedCount: unassigned,
    healthyCount: healthy,
  };
}

// ===========================================================================
// Forecast
// ===========================================================================

export interface ForecastPoint {
  /** ISO date marking the start of the bucket. */
  readonly date: string;
  readonly committedPct: number;
  readonly band: UtilizationBand;
}

/**
 * Projects one person's committed allocation forward.
 *
 * This is ARITHMETIC over existing assignment end dates, not prediction. It
 * says "if nothing changes, this is what is already committed" — it does not
 * forecast demand, which would require modelling and is not something the
 * data supports. Naming it a forecast without that distinction would invite
 * planning decisions the inputs cannot justify.
 */
export function forecastCommittedCapacity(
  allocations: readonly AllocationInput[],
  options: { from: string; months: number },
): readonly ForecastPoint[] {
  const points: ForecastPoint[] = [];
  const start = new Date(`${options.from}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return points;

  for (let i = 0; i < Math.max(0, options.months); i += 1) {
    const bucket = new Date(start);
    bucket.setUTCMonth(bucket.getUTCMonth() + i);
    const date = bucket.toISOString().slice(0, 10);

    const committed = allocations
      .filter((a) => a.status === "active")
      .filter((a) => (!a.startDate || a.startDate <= date) && (!a.endDate || a.endDate >= date))
      .reduce((sum, a) => sum + Math.max(0, a.allocationPct), 0);

    points.push({
      date,
      committedPct: round1(committed),
      band: classifyUtilization(committed),
    });
  }

  return points;
}

function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}
