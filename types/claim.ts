/**
 * Epistemic classification of anything TANIA asserts.
 *
 * The product's core risk is that a model's interpretation quietly becomes a
 * person's performance record. These four kinds keep that separation
 * explicit, in the type system rather than in a naming convention:
 *
 *   FACT            A measured value with a source. Did happen.
 *   ANALYSIS        Deterministic computation over facts. Reproducible from
 *                   the same inputs by lib/calculations/.
 *   INFERENCE       A model's interpretation. May be wrong, and is never
 *                   reproducible in the way ANALYSIS is.
 *   RECOMMENDATION  A proposed action awaiting a human decision.
 *
 * CLAUDE.md §16: an AI-generated claim never becomes a performance fact
 * without provenance and human validation. AGENTS.md §9: AI may analyse and
 * recommend but must not make the final consequential decision.
 */

export const CLAIM_KINDS = [
  "FACT",
  "ANALYSIS",
  "INFERENCE",
  "RECOMMENDATION",
] as const;

export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const CLAIM_KIND_LABEL: Record<ClaimKind, string> = {
  FACT: "Fakta",
  ANALYSIS: "Analisis",
  INFERENCE: "Inferensi AI",
  RECOMMENDATION: "Rekomendasi",
};

export const CLAIM_KIND_DESCRIPTION: Record<ClaimKind, string> = {
  FACT: "Nilai terukur dengan sumber tercatat.",
  ANALYSIS: "Dihitung secara deterministik dari fakta. Dapat direproduksi.",
  INFERENCE: "Interpretasi yang dihasilkan model. Bukan fakta.",
  RECOMMENDATION: "Usulan tindakan. Memerlukan keputusan manusia.",
};

/**
 * Kinds that may contribute to a scored performance result.
 *
 * INFERENCE and RECOMMENDATION are excluded by design: a model's reading of
 * someone's work is not an input to their rating. Excluding them here rather
 * than at each call site means the rule cannot be forgotten.
 */
export const SCOREABLE_KINDS: readonly ClaimKind[] = ["FACT", "ANALYSIS"];

export function isScoreable(kind: ClaimKind): boolean {
  return SCOREABLE_KINDS.includes(kind);
}

/** Provenance every claim must carry. */
export interface ClaimProvenance {
  /** System of record or producing agent. */
  readonly source: string;
  /** ISO-8601 timestamp of the measurement or computation. */
  readonly asOf: string;
  /** Period the claim belongs to, where applicable. */
  readonly periodId?: string;
  readonly periodName?: string;
  /** Whether a human has validated it. */
  readonly validated: boolean;
  readonly validatedBy?: string;
  /** 0-100. Meaningful for INFERENCE; usually absent for FACT. */
  readonly confidence?: number;
  /** Ids of the evidence rows supporting the claim. */
  readonly evidenceIds?: readonly string[];
}

/**
 * A claim TANIA displays.
 *
 * Every field the brief requires — value, period, source, evidence,
 * validation, confidence — lives on the claim itself, so a value cannot be
 * rendered detached from what supports it.
 */
export interface Claim<T> {
  readonly kind: ClaimKind;
  readonly label: string;
  readonly value: T;
  readonly unit?: string;
  readonly provenance: ClaimProvenance;
}

/** Narrows to claims that may contribute to a score. */
export function scoreableClaims<T>(
  claims: readonly Claim<T>[],
): readonly Claim<T>[] {
  return claims.filter((claim) => isScoreable(claim.kind));
}
