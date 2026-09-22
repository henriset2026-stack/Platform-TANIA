/**
 * Business Case Agent contract — TANIA_PRD_v2.0.md §55 (JARVIS Business Case
 * Agent).
 *
 * Revenue model, cost model, ROI, NPV, IRR, scenarios and risks.
 *
 * Every number in a business case is an assumption until someone says where
 * it came from, so this contract has no bare numbers in it. An `Assumption`
 * carries its value, its unit, its origin and the rationale for it, and the
 * financial engine consumes assumptions rather than numbers. A figure with no
 * origin cannot be constructed, so it cannot reach an NPV.
 *
 * Two deliberate absences:
 *
 *  - There is no probability field on a scenario, and no expected value
 *    across scenarios. Weighting an optimistic case at 25% requires knowing
 *    it is 25% likely, which nobody does; the arithmetic would launder a
 *    guess into a single confident number, which is precisely what an
 *    expected NPV looks like to a decision-maker.
 *  - There is no overall "confidence score". A case resting on four sourced
 *    figures and three sponsor assertions is not 57% confident; it is a case
 *    whose three weakest inputs a reader needs to see by name.
 */

import type { FactOrigin } from "@/agents/core/sourcing";
import type {
  CashflowPeriod,
  FinanceResult,
  IrrOutcome,
  NpvResult,
  PaybackOutcome,
  RoiResult,
} from "@/lib/calculations/finance";
import type { ClaimKind } from "@/types/claim";

// ===========================================================================
// Assumptions
// ===========================================================================

/**
 * How much the conclusion moves with this input.
 *
 * Stated per assumption rather than computed, because computing it properly
 * means re-running the model across a range, and asserting a sensitivity the
 * model did not test would be the same failure this agent exists to prevent.
 * `untested` is the honest default.
 */
export type Sensitivity = "untested" | "low" | "medium" | "high";

export interface Assumption {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  /** e.g. "IDR", "IDR/month", "customers", "%/yr". Never omitted. */
  readonly unit: string;
  /** Where the number came from. No origin, no assumption. */
  readonly origin: FactOrigin;
  readonly rationale: string;
  readonly sensitivity: Sensitivity;
}

export interface ModelSection {
  readonly label: string;
  readonly assumptions: readonly Assumption[];
  readonly periods: readonly CashflowPeriod[];
  /** Null when any period is unknown; unknown is never treated as zero. */
  readonly total: number | null;
}

// ===========================================================================
// Scenarios
// ===========================================================================

export interface ScenarioResult {
  readonly name: string;
  readonly description: string;
  /** Which assumptions differ from the base case, by id. */
  readonly variedAssumptionIds: readonly string[];
  readonly npv: FinanceResult<NpvResult>;
  readonly irr: FinanceResult<IrrOutcome>;
  readonly payback: FinanceResult<PaybackOutcome>;
  readonly roi: FinanceResult<RoiResult>;
}

// ===========================================================================
// Risks
// ===========================================================================

export type RiskCategory =
  | "market"
  | "delivery"
  | "capability"
  | "financial"
  | "regulatory"
  | "operational";

export type RiskLikelihood = "unknown" | "low" | "medium" | "high";

export interface BusinessRisk {
  readonly id: string;
  readonly category: RiskCategory;
  readonly description: string;
  /**
   * "unknown" unless something supports a rating. A risk matrix filled with
   * plausible ratings is worse than an empty one: it gets colour-coded, put
   * on a slide, and treated as analysis.
   */
  readonly likelihood: RiskLikelihood;
  readonly impact: RiskLikelihood;
  readonly basis: FactOrigin | null;
  readonly mitigation: string | null;
  readonly claimKind: Extract<ClaimKind, "ANALYSIS" | "INFERENCE">;
}

// ===========================================================================
// The case
// ===========================================================================

export interface BusinessCase {
  readonly subject: string;
  readonly currency: string;
  readonly discountRate: Assumption | null;
  readonly revenueModel: ModelSection;
  readonly costModel: ModelSection;
  readonly scenarios: readonly ScenarioResult[];
  readonly risks: readonly BusinessRisk[];
  /**
   * The base case's headline figures, or null when they could not be
   * computed. Null is a real outcome here, not an error.
   */
  readonly headline: ScenarioResult | null;
  /** Assumptions with no independently verifiable origin, named. */
  readonly unverifiedAssumptionIds: readonly string[];
}
