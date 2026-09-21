/**
 * Data provenance types.
 *
 * TANIA is an evidence-based product: CLAUDE.md §16 requires performance data to
 * retain source, owner and validation status, and the project rules forbid
 * fabricating data or presenting planned functionality as implemented.
 *
 * These types make that structural rather than advisory. A numeric value cannot
 * be rendered unless it is accompanied by provenance, because the only variant
 * that carries a `value` is `live`. A screen with no backing data source can
 * only produce `NotConnected`, which the UI renders as an explicit empty state.
 *
 * There is deliberately no "sample", "mock" or "demo" variant. Placeholder
 * numbers must not be representable.
 */

/** Where a live value came from. Required — CLAUDE.md §16. */
export interface Provenance {
  /** System of record, e.g. "supabase:performance_metrics". */
  readonly source: string;
  /** ISO-8601 timestamp of the underlying measurement. */
  readonly asOf: string;
  /** Whether a human has validated the value. */
  readonly validated: boolean;
}

/** A value that exists and can be shown. */
export interface LiveValue<T> {
  readonly state: "live";
  readonly value: T;
  readonly provenance: Provenance;
}

/** No data source is wired up yet. Carries the phase that will provide it. */
export interface NotConnected {
  readonly state: "not-connected";
  /** Implementation phase that will supply this data. */
  readonly requiredPhase: number;
  /** What must exist first, e.g. "performance_metrics + RLS". */
  readonly requires: string;
}

/** The query ran but the user is not authorized to see the value. */
export interface Restricted {
  readonly state: "restricted";
  readonly reason: string;
}

/** The query ran and legitimately returned nothing. */
export interface Empty {
  readonly state: "empty";
}

/** The query failed. Explicit failure over fabricated success — CLAUDE.md §25. */
export interface Failed {
  readonly state: "failed";
  readonly reason: string;
}

export type DataPoint<T> =
  | LiveValue<T>
  | NotConnected
  | Restricted
  | Empty
  | Failed;

export type DataState = DataPoint<unknown>["state"];

/** True only when a real, sourced value is present. */
export function isLive<T>(point: DataPoint<T>): point is LiveValue<T> {
  return point.state === "live";
}

/** Convenience constructor for a not-yet-implemented data source. */
export function notConnected(
  requiredPhase: number,
  requires: string,
): NotConnected {
  return { state: "not-connected", requiredPhase, requires };
}

/**
 * Derives a new DataPoint from a live one, preserving provenance.
 *
 * Exists so UI code never hand-constructs a `live` variant. Building one by
 * hand is how an invented value gets a fabricated source attached to it; this
 * can only transform a value that was already real, and the provenance it
 * carries is the original measurement's.
 */
export function mapLive<T, U>(
  point: DataPoint<T>,
  transform: (value: T) => U,
): DataPoint<U> {
  if (point.state !== "live") return point;
  return {
    state: "live",
    value: transform(point.value),
    provenance: point.provenance,
  };
}
