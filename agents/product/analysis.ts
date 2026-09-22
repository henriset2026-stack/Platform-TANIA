/**
 * Product Agent analysis. PURE.
 *
 * Structures what was supplied and what TANIA holds, and refuses to fill the
 * rest. The agent's value is in the shape and in the gaps — a list of the
 * four market questions that must be answered before this is a product case
 * is worth more than a case that answers them by assertion.
 */

import { hasBlockingGap, partitionFacts, type MissingFact, type SourcedFact } from "@/agents/core/sourcing";
import { toNonEmpty, type Uncertainty } from "@/agents/core/output";
import { COMMERCIAL_APPROVER_ROLES, type SpecialistEnvelope } from "@/agents/dps/contract";
import type {
  MarketClaim,
  PositioningStatement,
  ProductAnalysis,
  ProductRequirement,
  RequirementPriority,
} from "@/agents/product/contract";
import type { FactOrMissing } from "@/agents/core/sourcing";

export interface ProductInput {
  readonly productName: string;
  readonly problemStatement: FactOrMissing<string>;
  readonly targetSegments: readonly SourcedFact<string>[];
  readonly differentiator: SourcedFact<string> | null;
  readonly closestAlternative: SourcedFact<string> | null;
  readonly primaryNeed: SourcedFact<string> | null;
  readonly categoryDescription: string;
  readonly valueDelivered: string;
  readonly marketFindings: readonly SourcedFact<MarketClaim>[];
  readonly candidateRequirements: readonly {
    readonly id: string;
    readonly statement: string;
    readonly priority: RequirementPriority;
    readonly rationale: string;
    readonly derivedFrom: readonly SourcedFact<string>[];
  }[];
}

/**
 * Market questions a product case must answer.
 *
 * Fixed list rather than a generated one: the questions that decide whether a
 * product is worth building do not vary with the product, and generating them
 * would invite the model to produce the ones it can already answer.
 */
export const REQUIRED_MARKET_QUESTIONS: Record<string, string> = {
  market_size: "How large is the addressable market, measured how, and as of when?",
  growth_rate: "Is the market growing or shrinking, at what rate, and on whose figures?",
  segment_need: "What evidence is there that the target segment has this need?",
  competitor_capability: "Who already serves this need, and how well?",
  pricing_reference: "What do comparable offerings charge?",
  regulatory_constraint: "What regulatory constraints apply to this offering?",
};

export function analyzeProduct(
  input: ProductInput,
): SpecialistEnvelope<ProductAnalysis> {
  const generatedAt = new Date().toISOString();
  const uncertainties: Uncertainty[] = [];
  const missing: MissingFact[] = [];

  if (!input.problemStatement.available) {
    missing.push(input.problemStatement.missing);
  }

  if (input.targetSegments.length === 0) {
    missing.push({
      label: "Target segment",
      neededFor: "Positioning, requirements prioritisation and any market sizing.",
      obtainableFrom: "The product sponsor, or a customer research document.",
      blocksConclusion: true,
    });
  }

  // --- Market coverage: name what is not known -------------------------
  const covered = new Set(input.marketFindings.map((finding) => finding.value.kind));
  const openMarketQuestions: string[] = [];
  for (const [kind, question] of Object.entries(REQUIRED_MARKET_QUESTIONS)) {
    if (covered.has(kind as MarketClaim["kind"])) continue;
    openMarketQuestions.push(question);
    missing.push({
      label: `Market research: ${kind.replace(/_/g, " ")}`,
      neededFor: "Establishing whether this product is worth building.",
      obtainableFrom:
        "A published market study, a customer research document loaded into the knowledge base, or the product sponsor.",
      // Only segment need and market size stop a product case outright. The
      // others shape it; these two decide whether there is one.
      blocksConclusion: kind === "market_size" || kind === "segment_need",
    });
  }

  // Findings a person asserted are traceable but not verified. A business
  // case built on "the sponsor said the market is large" should say so.
  const unverified = input.marketFindings.filter(
    (finding) => finding.origin.kind === "user_supplied",
  );
  if (unverified.length > 0) {
    uncertainties.push({
      topic: "Unverified market claims",
      reason: `${unverified.length} market finding(s) were stated in conversation rather than drawn from a document.`,
      resolvedBy:
        "Attach the source they came from, or record them as the sponsor's assumptions rather than as market facts.",
    });
  }

  // --- Requirements ------------------------------------------------------
  const requirements: ProductRequirement[] = [];
  for (const candidate of input.candidateRequirements) {
    const derivedFrom = toNonEmpty(candidate.derivedFrom);
    if (!derivedFrom) {
      // Dropped rather than downgraded: an unsourced requirement in a
      // prioritised list still consumes build capacity.
      missing.push({
        label: `Basis for requirement "${candidate.statement}"`,
        neededFor: "Justifying that this requirement belongs in the product.",
        obtainableFrom: "The customer conversation, research, or constraint that produced it.",
        blocksConclusion: false,
      });
      continue;
    }
    requirements.push({
      id: candidate.id,
      statement: candidate.statement,
      priority: candidate.priority,
      rationale: candidate.rationale,
      derivedFrom,
      claimKind: "ANALYSIS",
    });
  }

  const mustHaves = requirements.filter((r) => r.priority === "must");
  if (requirements.length > 0 && mustHaves.length === requirements.length) {
    uncertainties.push({
      topic: "Prioritisation",
      reason: "Every requirement is a must-have, which is the same as none of them being one.",
      resolvedBy: "Ask the sponsor which requirements a first release could ship without.",
    });
  }

  // --- Positioning -------------------------------------------------------
  const positioning = buildPositioning(input);
  if (!positioning) {
    missing.push({
      label: "Positioning inputs",
      neededFor: "Stating who this is for and why they would choose it.",
      obtainableFrom:
        "The product sponsor: the target segment, their primary need, the closest alternative and the differentiator.",
      blocksConclusion: false,
    });
  }

  const blocking = hasBlockingGap(missing);
  const analysis: ProductAnalysis = {
    productName: input.productName,
    problemStatement: input.problemStatement,
    targetSegments: input.targetSegments,
    positioning,
    requirements,
    marketFindings: input.marketFindings,
    openMarketQuestions,
  };

  const { facts } = partitionFacts<unknown>([
    ...input.targetSegments.map((fact) => ({ available: true as const, fact })),
    ...input.marketFindings.map((fact) => ({ available: true as const, fact })),
  ]);

  return {
    agent: "product_agent",
    purpose:
      "Analyses a product opportunity: problem, segments, positioning, requirements and the market evidence behind them.",
    payload: blocking ? null : analysis,
    sourcedFacts: facts,
    missingFacts: missing,
    uncertainties,
    approval: {
      required: true,
      permission: "project.create",
      approverRoles: COMMERCIAL_APPROVER_ROLES,
      whyRequired:
        "Deciding to build a product commits chapter capacity and budget. This analysis informs that decision and does not make it.",
      whatWouldBeCommitted: blocking
        ? []
        : [
            `Building ${input.productName} for the stated segments.`,
            `${mustHaves.length} must-have requirement(s) as scope.`,
            "A market position the chapter would have to defend.",
          ],
    },
    risk: {
      outputRisk: "LOW",
      consequenceIfWrong:
        "A product built for a segment that does not have the need, or positioned against the wrong alternative. " +
        "The analysis is cheap; acting on a wrong one is not.",
      reversible: true,
      decisionsThisInforms: [
        "Whether to build the product at all",
        "What a first release must contain",
        "How the offering is positioned commercially",
      ],
    },
    conclusionWithheld: blocking
      ? withheldReason(missing)
      : null,
    generatedAt,
    isDecision: false,
    persisted: false,
  };
}

function withheldReason(missing: readonly MissingFact[]): string {
  const blockers = missing.filter((gap) => gap.blocksConclusion);
  return (
    "No product conclusion is offered because the evidence it would rest on is not available: " +
    `${blockers.map((gap) => gap.label).join("; ")}. ` +
    "The structure and the open questions are returned instead — answering them is the work, and " +
    "filling them in would produce something that reads like a decision basis without being one."
  );
}

function buildPositioning(input: ProductInput): PositioningStatement | null {
  const segment = input.targetSegments[0];
  if (!segment || !input.primaryNeed || !input.closestAlternative || !input.differentiator) {
    return null;
  }
  return {
    forSegment: segment,
    whoNeed: input.primaryNeed,
    productIs: input.categoryDescription,
    thatProvides: input.valueDelivered,
    unlike: input.closestAlternative,
    differentiator: input.differentiator,
  };
}
