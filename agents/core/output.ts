/**
 * Output primitives shared by every TANIA agent.
 *
 * These were written for the Performance Agent and are lifted here as the
 * second agent arrives: copying `NonEmpty` into each agent would leave eleven
 * near-identical definitions, and the compile-time guarantee it provides is
 * only as good as its being the same type everywhere.
 */

/** At least one element, checked at compile time. */
export type NonEmpty<T> = readonly [T, ...T[]];

/** Builds a non-empty tuple, or null when there is nothing to put in one. */
export function toNonEmpty<T>(items: readonly T[]): NonEmpty<T> | null {
  const [first, ...rest] = items;
  return first === undefined ? null : [first, ...rest];
}

/**
 * Something an agent could not determine.
 *
 * Uncertainties are part of the output rather than an omission. An analysis
 * that silently skips what it could not assess reads as more complete than it
 * is, and a reader cannot tell "no problem here" from "no data here".
 */
export interface Uncertainty {
  readonly topic: string;
  readonly reason: string;
  /** What would resolve it. */
  readonly resolvedBy: string;
}
