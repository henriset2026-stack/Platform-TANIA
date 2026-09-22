/**
 * Sourcing — the structural answer to "never fabricate".
 *
 * The DPS specialist agents work on material TANIA does not hold: market
 * size, competitor positioning, vendor pricing, customer counts. A language
 * model will produce confident, plausible, specific numbers for every one of
 * those, and a business case built on them is indistinguishable from a real
 * one until someone spends the money.
 *
 * So no bare value may enter an output. Every fact carries a `FactOrigin`,
 * and the origins are a CLOSED union with a deliberate omission: there is no
 * variant for "the model knows this". A model's recollection of a market size
 * is not a source, and because the type system offers nowhere to put it, a
 * remembered figure cannot be attached to a finding at all — it has to be
 * left out or asked for.
 *
 * This is the same move as DataPoint<T> in types/data.ts, applied to the
 * facts an agent asserts rather than the figures a dashboard displays.
 */

import type { ClaimKind } from "@/types/claim";

// ===========================================================================
// Origins
// ===========================================================================

export const FACT_ORIGIN_KINDS = [
  "internal_record",
  "knowledge_document",
  "user_supplied",
  "external_document",
] as const;

export type FactOriginKind = (typeof FACT_ORIGIN_KINDS)[number];

/**
 * Where a fact came from.
 *
 * Note what is absent: `model_knowledge`, `estimate`, `industry_standard`,
 * `common_knowledge`. Adding any of them would defeat the design, because
 * each is a place to put a number nobody can check.
 */
export type FactOrigin =
  | {
      readonly kind: "internal_record";
      /** Table the row lives in, so it can be re-read. */
      readonly table: string;
      readonly recordId: string;
    }
  | {
      readonly kind: "knowledge_document";
      readonly documentId: string;
      readonly chunkId: string;
      readonly title: string;
    }
  | {
      /** Stated by a human in the conversation. Their claim, not TANIA's. */
      readonly kind: "user_supplied";
      readonly statedBy: string;
      readonly statedAt: string;
      readonly verbatim: string;
    }
  | {
      readonly kind: "external_document";
      readonly title: string;
      readonly publisher: string;
      readonly url: string;
      readonly retrievedAt: string;
    };

/**
 * Whether an origin is something a reader could independently check.
 *
 * `user_supplied` is traceable but not verified — it records who said it, not
 * that it is true. The distinction matters for a business case: "the sponsor
 * told us 40% margin" is a legitimate basis for a model and an illegitimate
 * basis for a claim about the market.
 */
export function isIndependentlyVerifiable(origin: FactOrigin): boolean {
  return origin.kind !== "user_supplied";
}

export function describeOrigin(origin: FactOrigin): string {
  switch (origin.kind) {
    case "internal_record":
      return `${origin.table}#${origin.recordId}`;
    case "knowledge_document":
      return `${origin.title} (document ${origin.documentId}, chunk ${origin.chunkId})`;
    case "user_supplied":
      return `stated by ${origin.statedBy} on ${origin.statedAt}`;
    case "external_document":
      return `${origin.title}, ${origin.publisher} (${origin.url}, retrieved ${origin.retrievedAt})`;
  }
}

// ===========================================================================
// Facts
// ===========================================================================

export interface SourcedFact<T> {
  readonly value: T;
  readonly origin: FactOrigin;
  /**
   * FACT for a measured or published figure, INFERENCE for a reading of one.
   * An INFERENCE still needs an origin: it must be an interpretation OF
   * something.
   */
  readonly claimKind: Extract<ClaimKind, "FACT" | "INFERENCE">;
  /** What the figure actually measures, in the source's own terms. */
  readonly statedAs: string;
}

/**
 * A fact that was needed and is not available.
 *
 * Returned in place of a value, so a gap in the evidence appears in the
 * output rather than being quietly filled. An agent that omitted these would
 * produce a business case that looks complete and is not.
 */
export interface MissingFact {
  readonly label: string;
  readonly neededFor: string;
  /** Who or what could supply it. Never "the model". */
  readonly obtainableFrom: string;
  readonly blocksConclusion: boolean;
}

export type FactOrMissing<T> =
  | { readonly available: true; readonly fact: SourcedFact<T> }
  | { readonly available: false; readonly missing: MissingFact };

export function available<T>(fact: SourcedFact<T>): FactOrMissing<T> {
  return { available: true, fact };
}

export function missing<T>(fact: MissingFact): FactOrMissing<T> {
  return { available: false, missing: fact };
}

/** Partitions a mixed list into what is known and what is not. */
export function partitionFacts<T>(
  items: readonly FactOrMissing<T>[],
): {
  readonly facts: readonly SourcedFact<T>[];
  readonly missing: readonly MissingFact[];
} {
  const facts: SourcedFact<T>[] = [];
  const gaps: MissingFact[] = [];
  for (const item of items) {
    if (item.available) facts.push(item.fact);
    else gaps.push(item.missing);
  }
  return { facts, missing: gaps };
}

/** True when any missing fact is one the conclusion cannot survive without. */
export function hasBlockingGap(gaps: readonly MissingFact[]): boolean {
  return gaps.some((gap) => gap.blocksConclusion);
}
