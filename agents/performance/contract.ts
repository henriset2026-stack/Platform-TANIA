/**
 * Performance Agent output contract.
 *
 * "Every finding must have evidence references."
 *
 * That is enforced by the TYPE, not by a validator that someone could forget
 * to call: `evidenceRefs` is a non-empty tuple, so a finding without evidence
 * does not compile. An agent that could emit an unsupported finding would be
 * asserting something about a person's performance with nothing behind it —
 * exactly what CLAUDE.md §16 forbids.
 */

import type { ClaimKind } from "@/types/claim";

/** At least one element, checked at compile time. */
export type NonEmpty<T> = readonly [T, ...T[]];

export interface EvidenceRef {
  /** performance_evidence.id — resolvable back to the row. */
  readonly evidenceId: string;
  readonly dimension: string;
  readonly occurredAt: string | null;
  /** What produced the underlying record. */
  readonly sourceType: string;
  readonly validationStatus: string;
  /**
   * Whether this record is a measured fact or an AI-generated claim.
   * A finding resting only on INFERENCE is reported as such.
   */
  readonly claimKind: ClaimKind;
}

export type FindingSeverity = "info" | "attention" | "concern";

export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly severity: FindingSeverity;
  readonly dimension: string | null;
  /** Non-empty by construction. */
  readonly evidenceRefs: NonEmpty<EvidenceRef>;
  /**
   * Always ANALYSIS. A finding is a deterministic reading of evidence, never
   * a measured fact and never a decision.
   */
  readonly claimKind: Extract<ClaimKind, "ANALYSIS">;
}

/**
 * Something the agent could not determine.
 *
 * Uncertainties are a first-class part of the output rather than an omission.
 * An analysis that silently skips what it could not assess reads as more
 * complete than it is, and a reader cannot tell the difference between "no
 * problem here" and "no data here".
 */
export interface Uncertainty {
  readonly topic: string;
  readonly reason: string;
  /** What would resolve it. */
  readonly resolvedBy: string;
}

export interface Recommendation {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly priority: "low" | "medium" | "high";
  /** Recommendations must also be grounded. */
  readonly evidenceRefs: NonEmpty<EvidenceRef>;
  /** Always RECOMMENDATION, and always for a human to act on. */
  readonly claimKind: Extract<ClaimKind, "RECOMMENDATION">;
  readonly requiresHumanDecision: true;
}

export interface PerformanceAnalysis {
  readonly summary: string;
  readonly findings: readonly Finding[];
  readonly evidence: readonly EvidenceRef[];
  readonly uncertainties: readonly Uncertainty[];
  readonly recommendations: readonly Recommendation[];
  /** Period the analysis covers, when scoped to one. */
  readonly periodName: string | null;
  /** Number of evidence records considered. */
  readonly evidenceCount: number;
  /** Share of evidence that is validated fact rather than unvalidated claim. */
  readonly validatedShare: number;
  readonly generatedAt: string;
  /**
   * Always false. Typed as the literal so no caller can branch on the agent
   * having produced a rating: it cannot.
   */
  readonly isFinalRating: false;
}

/**
 * Actions this agent must never perform — its own refusal list.
 *
 * The pipeline already prevents these (no such tool is registered, and an
 * AI identity is denied write everywhere). This list exists so the refusal is
 * stated where the agent is defined, and so a future tool registration that
 * contradicts it fails a test rather than shipping.
 */
export const FORBIDDEN_AGENT_ACTIONS: readonly string[] = [
  "finalize_performance_rating",
  "approve_performance_review",
  "set_overall_score",
  "decide_promotion",
  "decide_disciplinary_action",
  "terminate_employment",
  "export_sensitive_data",
];

/** Helper: builds a non-empty evidence tuple, or null when there is none. */
export function toNonEmpty<T>(items: readonly T[]): NonEmpty<T> | null {
  const [first, ...rest] = items;
  return first === undefined ? null : [first, ...rest];
}
