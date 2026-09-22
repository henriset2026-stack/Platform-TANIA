/**
 * Business Case Agent model. PURE.
 *
 * Runs the financial engine over explicit assumptions and reports what it
 * could and could not compute. Every refusal from lib/calculations/finance.ts
 * is passed through intact rather than being smoothed into a number.
 */

import {
  internalRateOfReturn,
  netPresentValue,
  paybackPeriod,
  returnOnInvestment,
} from "@/lib/calculations/finance";
import { isIndependentlyVerifiable, hasBlockingGap, type MissingFact } from "@/agents/core/sourcing";
import type { SourcedFact } from "@/agents/core/sourcing";
import type { Uncertainty } from "@/agents/core/output";
import { COMMERCIAL_APPROVER_ROLES, type SpecialistEnvelope } from "@/agents/dps/contract";
import type {
  Assumption,
  BusinessCase,
  BusinessRisk,
  ModelSection,
  ScenarioResult,
} from "@/agents/business-case/contract";
import type { CashflowPeriod } from "@/lib/calculations/finance";

export interface ScenarioInput {
  readonly name: string;
  readonly description: string;
  readonly variedAssumptionIds: readonly string[];
  readonly revenuePeriods: readonly CashflowPeriod[];
  readonly costPeriods: readonly CashflowPeriod[];
}

export interface BusinessCaseInput {
  readonly subject: string;
  readonly currency: string;
  /** Null refuses every NPV. A default rate would hide the key decision. */
  readonly discountRate: Assumption | null;
  readonly revenueAssumptions: readonly Assumption[];
  readonly costAssumptions: readonly Assumption[];
  readonly scenarios: readonly ScenarioInput[];
  readonly risks: readonly Omit<BusinessRisk, "claimKind">[];
}

/** Risk categories a business case must have considered. */
export const REQUIRED_RISK_CATEGORIES: readonly BusinessRisk["category"][] = [
  "market",
  "delivery",
  "capability",
  "financial",
];

export function buildBusinessCase(
  input: BusinessCaseInput,
): SpecialistEnvelope<BusinessCase> {
  const generatedAt = new Date().toISOString();
  const uncertainties: Uncertainty[] = [];
  const missing: MissingFact[] = [];

  // --- The discount rate is a decision somebody owns --------------------
  if (input.discountRate === null) {
    missing.push({
      label: "Discount rate",
      neededFor: "Any net present value. Without it there is no NPV and no IRR comparison.",
      obtainableFrom:
        "Telkom finance — the hurdle rate or weighted average cost of capital this chapter is measured against.",
      blocksConclusion: true,
    });
  }

  if (input.scenarios.length === 0) {
    missing.push({
      label: "Cashflow scenarios",
      neededFor: "Producing any financial result at all.",
      obtainableFrom: "The revenue and cost models for at least a base case.",
      blocksConclusion: true,
    });
  }

  // --- Assumptions: name the ones nobody can check ----------------------
  const allAssumptions = [...input.revenueAssumptions, ...input.costAssumptions];
  const unverified = allAssumptions.filter(
    (assumption) => !isIndependentlyVerifiable(assumption.origin),
  );

  if (unverified.length > 0) {
    uncertainties.push({
      topic: "Unverified assumptions",
      reason:
        `${unverified.length} of ${allAssumptions.length} financial assumption(s) rest on what someone said rather than ` +
        `on a document or a record: ${unverified.map((a) => a.label).join(", ")}.`,
      resolvedBy:
        "Attach the source each came from, or carry them explicitly as the sponsor's assumptions in the approval.",
    });
  }

  const untested = allAssumptions.filter((a) => a.sensitivity === "untested");
  if (untested.length > 0) {
    uncertainties.push({
      topic: "Untested sensitivity",
      reason: `${untested.length} assumption(s) have no tested sensitivity, so how much the answer moves with them is unknown.`,
      resolvedBy: "Re-run the model across a range for each, rather than asserting a sensitivity.",
    });
  }

  if (allAssumptions.length === 0) {
    missing.push({
      label: "Financial assumptions",
      neededFor: "Everything. A revenue or cost model with no stated assumptions is a set of numbers with no provenance.",
      obtainableFrom: "The product sponsor, the finance partner, or comparable delivered projects.",
      blocksConclusion: true,
    });
  }

  // --- Risks -------------------------------------------------------------
  const risks: BusinessRisk[] = input.risks.map((risk) => ({
    ...risk,
    // A rating nobody can support is downgraded to unknown rather than kept.
    likelihood: risk.basis === null ? "unknown" : risk.likelihood,
    impact: risk.basis === null ? "unknown" : risk.impact,
    claimKind: risk.basis === null ? "INFERENCE" : "ANALYSIS",
  }));

  const coveredCategories = new Set(risks.map((risk) => risk.category));
  const openCategories = REQUIRED_RISK_CATEGORIES.filter(
    (category) => !coveredCategories.has(category),
  );
  for (const category of openCategories) {
    missing.push({
      label: `Risk assessment: ${category}`,
      neededFor: "Presenting a business case that has considered how it fails.",
      obtainableFrom: "The sponsor, the delivery lead, or the chapter risk register.",
      blocksConclusion: false,
    });
  }

  // --- Scenarios ---------------------------------------------------------
  const rate = input.discountRate?.value ?? null;
  const scenarios: ScenarioResult[] = input.scenarios.map((scenario) => {
    const combined = mergePeriods(scenario.revenuePeriods, scenario.costPeriods);
    return {
      name: scenario.name,
      description: scenario.description,
      variedAssumptionIds: scenario.variedAssumptionIds,
      npv: netPresentValue(combined, rate),
      irr: internalRateOfReturn(combined),
      payback: paybackPeriod(combined),
      roi: returnOnInvestment(
        sumOrNull(scenario.revenuePeriods),
        negatedOrNull(sumOrNull(scenario.costPeriods)),
      ),
    };
  });

  const headline =
    scenarios.find((scenario) => scenario.name.toLowerCase() === "base") ??
    scenarios[0] ??
    null;

  for (const scenario of scenarios) {
    if (scenario.irr.ok && scenario.irr.value.kind === "ambiguous") {
      uncertainties.push({
        topic: `IRR is not unique (${scenario.name})`,
        reason: scenario.irr.value.detail,
        resolvedBy: "Compare the scenarios on NPV at the stated discount rate instead.",
      });
    }
    if (!scenario.npv.ok) {
      uncertainties.push({
        topic: `NPV not computed (${scenario.name})`,
        reason: scenario.npv.refusal.detail,
        resolvedBy: "Supply the missing figure; an unknown cashflow is not zero.",
      });
    }
  }

  const blocking = hasBlockingGap(missing);
  const sourcedFacts: readonly SourcedFact<unknown>[] = allAssumptions.map(
    (assumption) => ({
      value: assumption.value,
      origin: assumption.origin,
      claimKind: "FACT" as const,
      statedAs: `${assumption.label} (${assumption.unit})`,
    }),
  );

  return {
    agent: "business_case_agent",
    purpose:
      "Builds a business case from explicit, sourced assumptions: revenue and cost models, NPV, IRR, payback, ROI, scenarios and risks.",
    payload: blocking
      ? null
      : {
          subject: input.subject,
          currency: input.currency,
          discountRate: input.discountRate,
          revenueModel: section("Revenue", input.revenueAssumptions, input.scenarios[0]?.revenuePeriods ?? []),
          costModel: section("Cost", input.costAssumptions, input.scenarios[0]?.costPeriods ?? []),
          scenarios,
          risks,
          headline,
          unverifiedAssumptionIds: unverified.map((a) => a.id),
        },
    sourcedFacts,
    missingFacts: missing,
    uncertainties,
    approval: {
      required: true,
      permission: "business_impact.validate",
      approverRoles: COMMERCIAL_APPROVER_ROLES,
      whyRequired:
        "A business case authorises spending. Nothing here commits anything: the figures are a model of what would happen " +
        "if the stated assumptions hold, and whether they hold is a human judgement.",
      whatWouldBeCommitted: blocking
        ? []
        : [
            `Investment in ${input.subject} on the cost model above.`,
            `A revenue expectation the chapter would then be measured against.`,
            unverified.length > 0
              ? `Acceptance of ${unverified.length} assumption(s) that rest on assertion rather than evidence.`
              : "All stated assumptions, each with a cited source.",
          ],
    },
    risk: {
      outputRisk: "LOW",
      consequenceIfWrong:
        "Investment committed on a model whose inputs were wrong. Financial models are believed in proportion to " +
        "their precision, not their evidence, which is why every figure here carries its origin.",
      reversible: true,
      decisionsThisInforms: [
        "Whether to fund the initiative",
        "What return the chapter commits to",
        "Which risks must be mitigated before starting",
      ],
    },
    conclusionWithheld: blocking
      ? "No business case is offered: " +
        missing
          .filter((gap) => gap.blocksConclusion)
          .map((gap) => gap.label)
          .join("; ") +
        ". A case built around these holes would carry the authority of arithmetic without its basis."
      : null,
    generatedAt,
    isDecision: false,
    persisted: false,
  };
}

function section(
  label: string,
  assumptions: readonly Assumption[],
  periods: readonly CashflowPeriod[],
): ModelSection {
  return { label, assumptions, periods, total: sumOrNull(periods) };
}

/** Sums periods, or returns null if any is unknown. Unknown is not zero. */
function sumOrNull(periods: readonly CashflowPeriod[]): number | null {
  if (periods.length === 0) return null;
  let total = 0;
  for (const period of periods) {
    if (period.amount === null) return null;
    total += period.amount;
  }
  return Math.round(total * 100) / 100;
}

function negatedOrNull(value: number | null): number | null {
  return value === null ? null : -value;
}

/**
 * Combines revenue and cost into one net series.
 *
 * Costs are supplied as negative amounts, so this is addition rather than
 * subtraction, and a null on either side propagates into the combined period
 * — which then refuses the whole calculation rather than netting an unknown
 * against a known.
 */
function mergePeriods(
  revenue: readonly CashflowPeriod[],
  cost: readonly CashflowPeriod[],
): readonly CashflowPeriod[] {
  const byPeriod = new Map<number, CashflowPeriod>();

  for (const entry of [...revenue, ...cost]) {
    const existing = byPeriod.get(entry.period);
    if (!existing) {
      byPeriod.set(entry.period, entry);
      continue;
    }
    byPeriod.set(entry.period, {
      period: entry.period,
      amount:
        existing.amount === null || entry.amount === null
          ? null
          : existing.amount + entry.amount,
      label: `${existing.label} + ${entry.label}`,
    });
  }

  return [...byPeriod.values()].sort((a, b) => a.period - b.period);
}
