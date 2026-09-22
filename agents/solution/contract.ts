/**
 * Solution Agent contract — TANIA_PRD_v2.0.md §54 (JARVIS Solution Agent).
 *
 * Architecture, technical alternatives, capability mapping and trade-offs.
 *
 * Capability mapping is the one part of this agent that runs on real data:
 * TANIA knows which capabilities the chapter can prove and at what level, so
 * "we can build this, but nobody here has proven L3 Kubernetes" is a claim
 * with records behind it. That is the agent's most valuable output and the
 * one least likely to be produced anywhere else.
 *
 * Trade-offs are the opposite. "Managed services cost more but reduce
 * operational load" is a plausible sentence about any two options, and a
 * model will generate a full comparison matrix for alternatives it knows
 * nothing about. So a trade-off without a source is typed as `unclear` rather
 * than asserted in either direction — the matrix shows what is actually
 * known, which is usually less than it would like to show.
 */

import type { FactOrigin, SourcedFact } from "@/agents/core/sourcing";
import type { ClaimKind } from "@/types/claim";

export interface SolutionAlternative {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  /** Approach as described by whoever proposed it, with attribution. */
  readonly proposedBy: SourcedFact<string>;
  /** Capabilities this approach needs, by capability id. */
  readonly requiredCapabilityIds: readonly string[];
}

/**
 * What the chapter can actually prove, per capability an alternative needs.
 *
 * `scopeLimited` is the literal true: holders are read under RLS, so this is
 * a lower bound on the chapter's capability, never its total. An architecture
 * decision made on "nobody can do this" that actually meant "nobody I can see
 * can do this" is a bad decision made confidently.
 */
export interface CapabilityCoverage {
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly requiredLevel: number;
  /** Highest level PROVEN by evidence among visible holders. */
  readonly bestProvenLevel: number;
  readonly gap: number;
  readonly provenHolderCount: number;
  readonly scopeLimited: true;
}

export type TradeOffDirection = "better" | "worse" | "unclear";

export interface TradeOff {
  readonly dimension: string;
  readonly alternativeId: string;
  readonly direction: TradeOffDirection;
  readonly statement: string;
  /**
   * Null only when direction is "unclear". A stated advantage or disadvantage
   * must rest on something; an unclear one is the honest way to record that
   * it does not.
   */
  readonly basis: FactOrigin | null;
  readonly claimKind: Extract<ClaimKind, "ANALYSIS" | "INFERENCE">;
}

export interface SolutionAssessment {
  readonly problemSummary: string;
  readonly alternatives: readonly SolutionAlternative[];
  /** Per alternative, what the chapter can prove of what it needs. */
  readonly capabilityMapping: readonly {
    readonly alternativeId: string;
    readonly coverage: readonly CapabilityCoverage[];
    readonly unmappedCapabilityIds: readonly string[];
  }[];
  readonly tradeOffs: readonly TradeOff[];
  /**
   * Null when the comparison does not support one.
   *
   * A recommendation is withheld rather than guessed whenever the trade-offs
   * that would decide it are unclear — recommending on an unsourced matrix is
   * how an architecture gets chosen by whichever option the model described
   * most fluently.
   */
  readonly recommendedAlternativeId: string | null;
  readonly recommendationBasis: string;
}
