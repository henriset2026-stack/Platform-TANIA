/**
 * Product Agent contract — TANIA_PRD_v2.0.md §53 (JARVIS Product Agent).
 *
 * Product analysis, positioning, requirements and market research.
 *
 * Market research is the dangerous half. "The Indonesian digital banking
 * market is worth $4.2bn and growing 18% annually" is the kind of sentence a
 * model produces effortlessly, that reads exactly like a researched finding,
 * and that nobody downstream can distinguish from one. So a market finding is
 * a SourcedFact and nothing else: without an origin from the closed union in
 * agents/core/sourcing.ts there is nowhere to put it.
 */

import type { NonEmpty } from "@/agents/core/output";
import type { FactOrMissing, SourcedFact } from "@/agents/core/sourcing";
import type { ClaimKind } from "@/types/claim";

export type MarketClaimKind =
  | "market_size"
  | "growth_rate"
  | "segment_need"
  | "competitor_capability"
  | "pricing_reference"
  | "regulatory_constraint";

export interface MarketClaim {
  readonly kind: MarketClaimKind;
  readonly statement: string;
  /** As the source expresses it — currency, period, geography. */
  readonly measure: string | null;
  readonly asOf: string | null;
}

/**
 * Positioning, in the classical form.
 *
 * Every slot is a sourced fact or an explicit gap. A positioning statement
 * with an invented differentiator is a marketing claim TANIA would be making
 * on the chapter's behalf, and `differentiator` is typed so it cannot be
 * filled without a source.
 */
export interface PositioningStatement {
  readonly forSegment: SourcedFact<string>;
  readonly whoNeed: SourcedFact<string>;
  readonly productIs: string;
  readonly thatProvides: string;
  readonly unlike: SourcedFact<string>;
  readonly differentiator: SourcedFact<string>;
}

export type RequirementPriority = "must" | "should" | "could" | "wont";

export interface ProductRequirement {
  readonly id: string;
  readonly statement: string;
  readonly priority: RequirementPriority;
  readonly rationale: string;
  /**
   * What the requirement rests on. Non-empty: a requirement nobody asked for
   * is a preference, and shipping it as a requirement spends build capacity
   * on a guess.
   */
  readonly derivedFrom: NonEmpty<SourcedFact<string>>;
  readonly claimKind: Extract<ClaimKind, "ANALYSIS">;
}

export interface ProductAnalysis {
  readonly productName: string;
  readonly problemStatement: FactOrMissing<string>;
  readonly targetSegments: readonly SourcedFact<string>[];
  /** Null when the segment or differentiator could not be sourced. */
  readonly positioning: PositioningStatement | null;
  readonly requirements: readonly ProductRequirement[];
  readonly marketFindings: readonly SourcedFact<MarketClaim>[];
  /** Market questions that must be answered before this is a product case. */
  readonly openMarketQuestions: readonly string[];
}
