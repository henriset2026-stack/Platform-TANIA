/**
 * Anomaly detection over performance evidence.
 *
 * Deterministic statistics, not model inference. An "anomaly" in someone's
 * performance record can start a difficult conversation, so the method must
 * be inspectable, reproducible and explainable to the person concerned — none
 * of which is true of an LLM's impression that something looks off.
 */

export interface Observation {
  readonly id: string;
  readonly value: number;
  /** ISO date, used for ordering and for reporting when it happened. */
  readonly occurredAt: string;
  readonly dimension: string;
}

export type AnomalyKind = "high_outlier" | "low_outlier" | "sudden_change";

export interface Anomaly {
  readonly observationId: string;
  readonly kind: AnomalyKind;
  readonly dimension: string;
  readonly value: number;
  readonly occurredAt: string;
  /** How far from typical, in interquartile ranges. */
  readonly deviation: number;
  readonly explanation: string;
}

/**
 * Minimum observations before anything is called anomalous.
 *
 * With fewer than this, "unusual" has no meaning — every point is both the
 * maximum and the minimum of a tiny sample. Flagging on two data points would
 * generate confident nonsense about people.
 */
export const MIN_OBSERVATIONS_FOR_ANOMALY = 5;

/** IQR multiplier. 1.5 is the conventional Tukey fence. */
export const IQR_MULTIPLIER = 1.5;

/**
 * Relative change between consecutive points that counts as sudden.
 *
 * Deliberately high: performance data is noisy and a 30% swing between two
 * periods is common. Flagging smaller moves produces alerts nobody can act on.
 */
export const SUDDEN_CHANGE_RATIO = 0.5;

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

export interface DistributionSummary {
  readonly count: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
  readonly iqr: number;
  readonly min: number;
  readonly max: number;
}

export function summarizeDistribution(
  values: readonly number[],
): DistributionSummary | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;

  const sorted = [...finite].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);

  return {
    count: sorted.length,
    median: quantile(sorted, 0.5),
    q1,
    q3,
    iqr: q3 - q1,
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

/**
 * Detects outliers and sudden changes.
 *
 * Uses the IQR fence rather than standard deviations because performance data
 * is rarely normally distributed and a single extreme value inflates the
 * standard deviation enough to hide itself. The IQR is resistant to exactly
 * the point it is being asked to find.
 *
 * Anomalies are grouped by dimension: comparing a Delivery score against a
 * Collaboration score would produce a meaningless "outlier".
 */
export function detectAnomalies(
  observations: readonly Observation[],
): readonly Anomaly[] {
  const byDimension = new Map<string, Observation[]>();
  for (const observation of observations) {
    if (!Number.isFinite(observation.value)) continue;
    const list = byDimension.get(observation.dimension) ?? [];
    list.push(observation);
    byDimension.set(observation.dimension, list);
  }

  const anomalies: Anomaly[] = [];

  for (const [dimension, points] of byDimension) {
    if (points.length < MIN_OBSERVATIONS_FOR_ANOMALY) continue;

    const summary = summarizeDistribution(points.map((p) => p.value));
    if (!summary) continue;

    // A zero IQR means at least half the values are identical; a fence of
    // zero width would flag every differing value as an outlier.
    if (summary.iqr > 0) {
      const upper = summary.q3 + IQR_MULTIPLIER * summary.iqr;
      const lower = summary.q1 - IQR_MULTIPLIER * summary.iqr;

      for (const point of points) {
        if (point.value > upper) {
          anomalies.push({
            observationId: point.id,
            kind: "high_outlier",
            dimension,
            value: point.value,
            occurredAt: point.occurredAt,
            deviation: round2((point.value - summary.q3) / summary.iqr),
            explanation: `${point.value} is above the typical range for ${dimension} (Q3 ${round2(summary.q3)}, IQR ${round2(summary.iqr)}).`,
          });
        } else if (point.value < lower) {
          anomalies.push({
            observationId: point.id,
            kind: "low_outlier",
            dimension,
            value: point.value,
            occurredAt: point.occurredAt,
            deviation: round2((summary.q1 - point.value) / summary.iqr),
            explanation: `${point.value} is below the typical range for ${dimension} (Q1 ${round2(summary.q1)}, IQR ${round2(summary.iqr)}).`,
          });
        }
      }
    }

    // Sudden change between consecutive observations in time order.
    const ordered = [...points].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1]!;
      const current = ordered[i]!;
      if (previous.value === 0) continue;

      const ratio = Math.abs(current.value - previous.value) / Math.abs(previous.value);
      if (ratio >= SUDDEN_CHANGE_RATIO) {
        anomalies.push({
          observationId: current.id,
          kind: "sudden_change",
          dimension,
          value: current.value,
          occurredAt: current.occurredAt,
          deviation: round2(ratio),
          explanation: `${dimension} moved from ${previous.value} to ${current.value} between ${previous.occurredAt.slice(0, 10)} and ${current.occurredAt.slice(0, 10)}.`,
        });
      }
    }
  }

  // Stable ordering so the same evidence always produces the same report.
  return anomalies.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) ||
      a.dimension.localeCompare(b.dimension) ||
      a.observationId.localeCompare(b.observationId),
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
