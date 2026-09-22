/**
 * Solution Agent analysis. PURE.
 *
 * Maps alternatives onto the chapter's proven capability, records trade-offs
 * only where something supports them, and recommends only when the record
 * supports a recommendation.
 */

import { calculateCapabilityGap, clampLevel } from "@/lib/calculations/capability";
import type { MissingFact, SourcedFact } from "@/agents/core/sourcing";
import { hasBlockingGap } from "@/agents/core/sourcing";
import type { Uncertainty } from "@/agents/core/output";
import { COMMERCIAL_APPROVER_ROLES, type SpecialistEnvelope } from "@/agents/dps/contract";
import type {
  CapabilityCoverage,
  SolutionAlternative,
  SolutionAssessment,
  TradeOff,
} from "@/agents/solution/contract";

export interface CapabilityInventoryRow {
  readonly capabilityId: string;
  readonly capabilityName: string;
  /** Highest proven level among holders the caller can see. */
  readonly bestProvenLevel: number;
  readonly provenHolderCount: number;
}

export interface SolutionInput {
  readonly problemSummary: string;
  readonly alternatives: readonly SolutionAlternative[];
  /** Level each required capability must reach for the solution to be built. */
  readonly requiredLevels: Readonly<Record<string, number>>;
  readonly inventory: readonly CapabilityInventoryRow[];
  readonly tradeOffs: readonly TradeOff[];
}

/**
 * Dimensions a technical comparison must address before it can recommend.
 *
 * Fixed rather than generated: these are the axes on which an architecture
 * decision is later defended, and letting the model choose the axes invites
 * it to pick the ones it has something to say about.
 */
export const REQUIRED_TRADEOFF_DIMENSIONS: readonly string[] = [
  "capability fit",
  "operational load",
  "cost",
  "delivery time",
  "reversibility",
];

export function analyzeSolution(
  input: SolutionInput,
): SpecialistEnvelope<SolutionAssessment> {
  const generatedAt = new Date().toISOString();
  const uncertainties: Uncertainty[] = [];
  const missing: MissingFact[] = [];

  if (input.alternatives.length === 0) {
    missing.push({
      label: "Technical alternatives",
      neededFor: "Comparing approaches. A single option is not an architecture decision.",
      obtainableFrom: "The solution architect, or a design document in the knowledge base.",
      blocksConclusion: true,
    });
  }

  if (input.alternatives.length === 1) {
    uncertainties.push({
      topic: "Single alternative",
      reason: "Only one approach was supplied, so nothing is being compared against it.",
      resolvedBy:
        "Supply at least one genuine alternative, including the option of not building it.",
    });
  }

  const byCapability = new Map(input.inventory.map((row) => [row.capabilityId, row]));

  // --- Capability mapping: the part with records behind it --------------
  const capabilityMapping = input.alternatives.map((alternative) => {
    const coverage: CapabilityCoverage[] = [];
    const unmapped: string[] = [];

    for (const capabilityId of alternative.requiredCapabilityIds) {
      const row = byCapability.get(capabilityId);
      const requiredLevel = clampLevel(input.requiredLevels[capabilityId] ?? 3);

      if (!row) {
        // Not in the inventory means not visible, which is not the same as
        // absent from the chapter. Recorded as unmapped rather than as a gap.
        unmapped.push(capabilityId);
        continue;
      }

      const gap = calculateCapabilityGap(requiredLevel, row.bestProvenLevel);
      coverage.push({
        capabilityId,
        capabilityName: row.capabilityName,
        requiredLevel: gap.requiredLevel,
        bestProvenLevel: gap.currentLevel,
        gap: gap.magnitude,
        provenHolderCount: row.provenHolderCount,
        scopeLimited: true,
      });
    }

    if (unmapped.length > 0) {
      missing.push({
        label: `Capability records for ${alternative.name}`,
        neededFor: "Judging whether the chapter can build this alternative.",
        obtainableFrom:
          "Someone with wider scope, or the capability catalogue if these capabilities are not yet defined.",
        blocksConclusion: false,
      });
    }

    return {
      alternativeId: alternative.id,
      coverage,
      unmappedCapabilityIds: unmapped,
    };
  });

  // --- Trade-offs: only where something supports them -------------------
  const tradeOffs: TradeOff[] = input.tradeOffs.map((tradeOff) =>
    tradeOff.basis === null
      ? {
          ...tradeOff,
          // Downgraded, not dropped: that a dimension was considered and could
          // not be settled is itself worth recording.
          direction: "unclear" as const,
          claimKind: "INFERENCE" as const,
        }
      : { ...tradeOff, claimKind: "ANALYSIS" as const },
  );

  const coveredDimensions = new Set(
    tradeOffs.filter((t) => t.direction !== "unclear").map((t) => t.dimension.toLowerCase()),
  );
  const openDimensions = REQUIRED_TRADEOFF_DIMENSIONS.filter(
    (dimension) => !coveredDimensions.has(dimension),
  );

  for (const dimension of openDimensions) {
    missing.push({
      label: `Trade-off evidence: ${dimension}`,
      neededFor: "Choosing between the alternatives on this axis.",
      obtainableFrom:
        "A spike, a vendor document, a reference architecture, or the architect's stated experience.",
      blocksConclusion: false,
    });
  }

  // --- Recommendation ----------------------------------------------------
  const { recommendedAlternativeId, recommendationBasis } = recommend({
    alternatives: input.alternatives,
    capabilityMapping,
    openDimensions,
  });

  if (recommendedAlternativeId === null && input.alternatives.length > 1) {
    uncertainties.push({
      topic: "Recommendation withheld",
      reason: recommendationBasis,
      resolvedBy:
        "Settle the open trade-off dimensions, or ask the architect to decide on grounds TANIA does not hold.",
    });
  }

  const blocking = hasBlockingGap(missing);
  const sourcedFacts: readonly SourcedFact<unknown>[] = input.alternatives.map(
    (alternative) => alternative.proposedBy,
  );

  return {
    agent: "solution_agent",
    purpose:
      "Compares technical alternatives against the chapter's proven capability and records the trade-offs that actually have evidence behind them.",
    payload: blocking
      ? null
      : {
          problemSummary: input.problemSummary,
          alternatives: input.alternatives,
          capabilityMapping,
          tradeOffs,
          recommendedAlternativeId,
          recommendationBasis,
        },
    sourcedFacts,
    missingFacts: missing,
    uncertainties,
    approval: {
      required: true,
      permission: "project.create",
      approverRoles: COMMERCIAL_APPROVER_ROLES,
      whyRequired:
        "An architecture decision commits the chapter to a build, a skill set and a set of operational obligations. " +
        "This comparison informs that decision and does not make it.",
      whatWouldBeCommitted: blocking
        ? []
        : [
            "A technical approach the chapter would then be building on.",
            "Closing whatever capability gaps that approach leaves open.",
          ],
    },
    risk: {
      outputRisk: "LOW",
      consequenceIfWrong:
        "An architecture the chapter cannot staff, or one chosen on a trade-off nobody verified. " +
        "Architecture decisions are among the least reversible a chapter makes.",
      reversible: true,
      decisionsThisInforms: [
        "Which technical approach to build",
        "Which capability gaps must be closed first",
        "Whether the chapter can deliver this at all",
      ],
    },
    conclusionWithheld: blocking
      ? "No solution assessment is offered: " +
        missing
          .filter((gap) => gap.blocksConclusion)
          .map((gap) => gap.label)
          .join("; ") +
        ". Comparing one option against nothing is not a comparison."
      : null,
    generatedAt,
    isDecision: false,
    persisted: false,
  };
}

/**
 * Recommends only when the record supports it.
 *
 * Two conditions, both necessary. Every alternative must have complete
 * capability coverage, or the comparison is between a measured option and an
 * unmeasured one. And no required trade-off dimension may be open, because
 * the open ones are exactly the dimensions that would decide it.
 */
function recommend(input: {
  alternatives: readonly SolutionAlternative[];
  capabilityMapping: readonly {
    alternativeId: string;
    coverage: readonly CapabilityCoverage[];
    unmappedCapabilityIds: readonly string[];
  }[];
  openDimensions: readonly string[];
}): { recommendedAlternativeId: string | null; recommendationBasis: string } {
  if (input.alternatives.length < 2) {
    return {
      recommendedAlternativeId: null,
      recommendationBasis:
        "Fewer than two alternatives were supplied, so there is nothing to choose between.",
    };
  }

  if (input.openDimensions.length > 0) {
    return {
      recommendedAlternativeId: null,
      recommendationBasis:
        `No recommendation: ${input.openDimensions.join(", ")} ` +
        `${input.openDimensions.length === 1 ? "is" : "are"} unsettled, and those are the dimensions that would decide it. ` +
        "Recommending anyway would pick whichever option was described most fluently.",
    };
  }

  const incomplete = input.capabilityMapping.filter(
    (mapping) => mapping.unmappedCapabilityIds.length > 0,
  );
  if (incomplete.length > 0) {
    return {
      recommendedAlternativeId: null,
      recommendationBasis:
        "No recommendation: capability coverage is incomplete for " +
        `${incomplete.map((m) => m.alternativeId).join(", ")}, so the comparison would weigh a measured option against an unmeasured one.`,
    };
  }

  // Smallest total capability gap wins; ties break on id so the result is
  // stable. This ranks on the one axis TANIA has records for, and says so.
  const ranked = [...input.capabilityMapping]
    .map((mapping) => ({
      alternativeId: mapping.alternativeId,
      totalGap: mapping.coverage.reduce((sum, row) => sum + row.gap, 0),
    }))
    .sort((a, b) => a.totalGap - b.totalGap || a.alternativeId.localeCompare(b.alternativeId));

  const best = ranked[0];
  if (!best) {
    return {
      recommendedAlternativeId: null,
      recommendationBasis: "No alternative could be ranked.",
    };
  }

  return {
    recommendedAlternativeId: best.alternativeId,
    recommendationBasis:
      `Ranked on total proven-capability gap, the one axis TANIA holds records for: ${best.alternativeId} ` +
      `leaves the smallest gap (${best.totalGap} level(s) across its required capabilities). ` +
      "The trade-offs recorded above are the other axes, and a human weighs them.",
  };
}
