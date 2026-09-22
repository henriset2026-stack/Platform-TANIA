import { describe, expect, it } from "vitest";

import {
  FACT_ORIGIN_KINDS,
  describeOrigin,
  hasBlockingGap,
  isIndependentlyVerifiable,
  partitionFacts,
  type FactOrigin,
  type SourcedFact,
} from "@/agents/core/sourcing";
import { analyzeProduct, REQUIRED_MARKET_QUESTIONS, type ProductInput } from "@/agents/product/analysis";
import { analyzeSolution, REQUIRED_TRADEOFF_DIMENSIONS, type SolutionInput } from "@/agents/solution/analysis";
import { buildBusinessCase, REQUIRED_RISK_CATEGORIES, type BusinessCaseInput } from "@/agents/business-case/model";
import type { Assumption } from "@/agents/business-case/contract";
import type { MarketClaim } from "@/agents/product/contract";
import {
  BUSINESS_CASE_AGENT,
  DPS_SPECIALIST_AGENTS,
  PRODUCT_AGENT,
  SOLUTION_AGENT,
  isForbiddenAction,
} from "@/agents/dps/agents";
import { PRODUCT_AGENT_TOOLS, registerProductTools } from "@/agents/product/tools";
import { SOLUTION_AGENT_TOOLS, registerSolutionTools } from "@/agents/solution/tools";
import { BUSINESS_CASE_AGENT_TOOLS, registerBusinessCaseTools } from "@/agents/business-case/tools";
import { FORBIDDEN_SPECIALIST_ACTIONS } from "@/agents/dps/contract";
import { ToolRegistry } from "@/agents/core/tool-registry";
import { executeToolCall } from "@/agents/core/pipeline";
import type { AgentAuthContext } from "@/agents/core/types";

const DOC: FactOrigin = {
  kind: "external_document",
  title: "Indonesia Digital Banking 2026",
  publisher: "Statista",
  url: "https://example.test/report",
  retrievedAt: "2026-09-01",
};

const SPONSOR: FactOrigin = {
  kind: "user_supplied",
  statedBy: "Product sponsor",
  statedAt: "2026-09-20",
  verbatim: "Our margin is about 40%.",
};

function fact<T>(value: T, origin: FactOrigin = DOC): SourcedFact<T> {
  return { value, origin, claimKind: "FACT", statedAs: String(value) };
}

function marketFact(kind: MarketClaim["kind"], origin: FactOrigin = DOC) {
  return fact<MarketClaim>({ kind, statement: `${kind} finding`, measure: null, asOf: "2026" }, origin);
}

// ===========================================================================
// UNIT — sourcing is the anti-fabrication mechanism
// ===========================================================================
describe("unit: sourcing", () => {
  // The omission is the design: there is nowhere to put a remembered figure.
  it("offers no origin for the model's own knowledge", () => {
    expect(FACT_ORIGIN_KINDS).toEqual([
      "internal_record",
      "knowledge_document",
      "user_supplied",
      "external_document",
    ]);
    for (const forbidden of ["model_knowledge", "estimate", "industry_standard", "assumption"]) {
      expect(FACT_ORIGIN_KINDS as readonly string[]).not.toContain(forbidden);
    }
  });

  it("separates traceable from independently verifiable", () => {
    expect(isIndependentlyVerifiable(DOC)).toBe(true);
    expect(isIndependentlyVerifiable(SPONSOR)).toBe(false);
  });

  it("describes an origin well enough to go and check it", () => {
    expect(describeOrigin(DOC)).toContain("Statista");
    expect(describeOrigin(DOC)).toContain("https://example.test/report");
    expect(describeOrigin(SPONSOR)).toContain("Product sponsor");
  });

  it("partitions what is known from what is not", () => {
    const { facts, missing } = partitionFacts<string>([
      { available: true, fact: fact("known") },
      {
        available: false,
        missing: { label: "gap", neededFor: "x", obtainableFrom: "y", blocksConclusion: true },
      },
    ]);
    expect(facts).toHaveLength(1);
    expect(missing).toHaveLength(1);
    expect(hasBlockingGap(missing)).toBe(true);
  });
});

// ===========================================================================
// PRODUCT AGENT
// ===========================================================================
describe("unit: Product Agent", () => {
  function input(over: Partial<ProductInput> = {}): ProductInput {
    return {
      productName: "DPS Onboarding Accelerator",
      problemStatement: { available: true, fact: fact("Onboarding takes 14 days.") },
      targetSegments: [fact("Tier-2 regional banks")],
      differentiator: fact("Pre-built Telkom regulatory templates"),
      closestAlternative: fact("In-house build"),
      primaryNeed: fact("Faster regulated onboarding"),
      categoryDescription: "an onboarding accelerator",
      valueDelivered: "reduces onboarding to under 3 days",
      marketFindings: (
        Object.keys(REQUIRED_MARKET_QUESTIONS) as MarketClaim["kind"][]
      ).map((kind) => marketFact(kind)),
      candidateRequirements: [
        {
          id: "R1",
          statement: "Support e-KYC",
          priority: "must",
          rationale: "Regulatory",
          derivedFrom: [fact("OJK requires e-KYC")],
        },
        {
          id: "R2",
          statement: "White-label theming",
          priority: "should",
          rationale: "Brand fit",
          derivedFrom: [fact("Two banks asked for it")],
        },
      ],
      ...over,
    };
  }

  it("produces an analysis when the market evidence is there", () => {
    const result = analyzeProduct(input());
    expect(result.conclusionWithheld).toBeNull();
    expect(result.payload?.positioning).not.toBeNull();
    expect(result.payload?.requirements).toHaveLength(2);
    expect(result.payload?.openMarketQuestions).toEqual([]);
  });

  // The agent's most useful output when the evidence is thin.
  it("withholds the conclusion and names the market questions instead", () => {
    const result = analyzeProduct(input({ marketFindings: [] }));
    expect(result.payload).toBeNull();
    expect(result.conclusionWithheld).toMatch(/market_size|market size/i);
    expect(result.missingFacts.length).toBeGreaterThan(0);
    expect(result.approval.whatWouldBeCommitted).toEqual([]);
  });

  it("names every unanswered market question", () => {
    const result = analyzeProduct(
      input({ marketFindings: [marketFact("market_size"), marketFact("segment_need")] }),
    );
    // Those two unblock the conclusion; the rest are still reported open.
    expect(result.payload).not.toBeNull();
    expect(result.payload?.openMarketQuestions.length).toBe(
      Object.keys(REQUIRED_MARKET_QUESTIONS).length - 2,
    );
  });

  it("flags market claims that were asserted rather than sourced", () => {
    const result = analyzeProduct(
      input({
        marketFindings: (Object.keys(REQUIRED_MARKET_QUESTIONS) as MarketClaim["kind"][]).map(
          (kind) => marketFact(kind, SPONSOR),
        ),
      }),
    );
    expect(result.uncertainties.some((u) => u.topic === "Unverified market claims")).toBe(true);
  });

  // An unsourced requirement still consumes build capacity.
  it("drops a requirement with no basis and records the gap", () => {
    const result = analyzeProduct(
      input({
        candidateRequirements: [
          { id: "R1", statement: "AI copilot", priority: "must", rationale: "", derivedFrom: [] },
        ],
      }),
    );
    expect(result.payload?.requirements).toEqual([]);
    expect(result.missingFacts.some((gap) => gap.label.includes("AI copilot"))).toBe(true);
  });

  it("will not write positioning without a sourced differentiator", () => {
    const result = analyzeProduct(input({ differentiator: null }));
    expect(result.payload?.positioning).toBeNull();
  });

  it("notices that everything being a must-have is no prioritisation at all", () => {
    const result = analyzeProduct(
      input({
        candidateRequirements: [
          { id: "R1", statement: "A", priority: "must", rationale: "", derivedFrom: [fact("x")] },
          { id: "R2", statement: "B", priority: "must", rationale: "", derivedFrom: [fact("y")] },
        ],
      }),
    );
    expect(result.uncertainties.some((u) => u.topic === "Prioritisation")).toBe(true);
  });

  it("is an analysis, never a decision, and is never persisted", () => {
    const result = analyzeProduct(input());
    expect(result.isDecision).toBe(false);
    expect(result.persisted).toBe(false);
    expect(result.approval.required).toBe(true);
    expect(result.risk.outputRisk).toBe("LOW");
    expect(result.risk.decisionsThisInforms.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// SOLUTION AGENT
// ===========================================================================
describe("unit: Solution Agent", () => {
  function input(over: Partial<SolutionInput> = {}): SolutionInput {
    return {
      problemSummary: "Serve 10k concurrent onboarding sessions.",
      alternatives: [
        {
          id: "A",
          name: "Managed platform",
          summary: "Vendor-managed",
          proposedBy: fact("Architect"),
          requiredCapabilityIds: ["cap-cloud"],
        },
        {
          id: "B",
          name: "Self-hosted",
          summary: "Run it ourselves",
          proposedBy: fact("Architect"),
          requiredCapabilityIds: ["cap-cloud", "cap-k8s"],
        },
      ],
      requiredLevels: { "cap-cloud": 3, "cap-k8s": 4 },
      inventory: [
        { capabilityId: "cap-cloud", capabilityName: "Cloud", bestProvenLevel: 3, provenHolderCount: 4 },
        { capabilityId: "cap-k8s", capabilityName: "Kubernetes", bestProvenLevel: 2, provenHolderCount: 1 },
      ],
      tradeOffs: REQUIRED_TRADEOFF_DIMENSIONS.map((dimension) => ({
        dimension,
        alternativeId: "A",
        direction: "better" as const,
        statement: `${dimension} favours A`,
        basis: DOC,
        claimKind: "ANALYSIS" as const,
      })),
      ...over,
    };
  }

  it("maps alternatives onto the capability the chapter can prove", () => {
    const result = analyzeSolution(input());
    const mapping = result.payload?.capabilityMapping.find((m) => m.alternativeId === "B");
    const k8s = mapping?.coverage.find((c) => c.capabilityId === "cap-k8s");
    expect(k8s?.requiredLevel).toBe(4);
    expect(k8s?.bestProvenLevel).toBe(2);
    expect(k8s?.gap).toBe(2);
    expect(k8s?.scopeLimited).toBe(true);
  });

  // A fluent comparison matrix about unknown options is convincing and wrong.
  it("downgrades an unsupported trade-off to unclear instead of asserting it", () => {
    const result = analyzeSolution(
      input({
        tradeOffs: [
          {
            dimension: "cost",
            alternativeId: "A",
            direction: "better",
            statement: "A is cheaper",
            basis: null,
            claimKind: "ANALYSIS",
          },
        ],
      }),
    );
    const tradeOff = result.payload?.tradeOffs[0];
    expect(tradeOff?.direction).toBe("unclear");
    expect(tradeOff?.claimKind).toBe("INFERENCE");
  });

  it("withholds a recommendation while decisive dimensions are unsettled", () => {
    const result = analyzeSolution(input({ tradeOffs: [] }));
    expect(result.payload?.recommendedAlternativeId).toBeNull();
    expect(result.payload?.recommendationBasis).toMatch(/described most fluently/i);
  });

  it("recommends on proven-capability gap once the trade-offs are settled", () => {
    const result = analyzeSolution(input());
    // A needs only Cloud at L3, which is proven; B additionally needs L4 K8s.
    expect(result.payload?.recommendedAlternativeId).toBe("A");
    expect(result.payload?.recommendationBasis).toMatch(/smallest gap/i);
  });

  it("refuses to compare a single option against nothing", () => {
    const result = analyzeSolution(input({ alternatives: [] }));
    expect(result.payload).toBeNull();
    expect(result.conclusionWithheld).toMatch(/not a comparison/i);
  });

  // Unseen is not absent.
  it("records an unmapped capability rather than reporting a gap it cannot see", () => {
    const result = analyzeSolution(input({ inventory: [] }));
    const mapping = result.payload?.capabilityMapping.find((m) => m.alternativeId === "A");
    expect(mapping?.unmappedCapabilityIds).toEqual(["cap-cloud"]);
    expect(mapping?.coverage).toEqual([]);
    expect(result.payload?.recommendedAlternativeId).toBeNull();
  });
});

// ===========================================================================
// BUSINESS CASE AGENT
// ===========================================================================
describe("unit: Business Case Agent", () => {
  function assumption(over: Partial<Assumption> = {}): Assumption {
    return {
      id: "a1",
      label: "Licence revenue per bank",
      value: 500_000_000,
      unit: "IDR/yr",
      origin: DOC,
      rationale: "Comparable delivered project",
      sensitivity: "medium",
      ...over,
    };
  }

  function input(over: Partial<BusinessCaseInput> = {}): BusinessCaseInput {
    return {
      subject: "Onboarding Accelerator",
      currency: "IDR",
      discountRate: assumption({ id: "rate", label: "Hurdle rate", value: 0.12, unit: "%/yr" }),
      revenueAssumptions: [assumption()],
      costAssumptions: [assumption({ id: "a2", label: "Build cost", value: 800_000_000 })],
      scenarios: [
        {
          name: "Base",
          description: "Three banks over three years",
          variedAssumptionIds: [],
          revenuePeriods: [1, 2, 3].map((period) => ({
            period,
            amount: 500_000_000,
            label: `Revenue Y${period}`,
          })),
          costPeriods: [{ period: 0, amount: -800_000_000, label: "Build" }],
        },
      ],
      risks: REQUIRED_RISK_CATEGORIES.map((category) => ({
        id: `risk-${category}`,
        category,
        description: `${category} risk`,
        likelihood: "medium" as const,
        impact: "medium" as const,
        basis: DOC,
        mitigation: null,
      })),
      ...over,
    };
  }

  it("computes the headline figures from explicit assumptions", () => {
    const result = buildBusinessCase(input());
    expect(result.conclusionWithheld).toBeNull();
    const headline = result.payload?.headline;
    expect(headline?.npv.ok).toBe(true);
    expect(headline?.npv.ok && headline.npv.value.discountRate).toBe(0.12);
    expect(headline?.irr.ok && headline.irr.value.kind).toBe("unique");
  });

  // The discount rate is a decision somebody owns.
  it("refuses the whole case without a discount rate", () => {
    const result = buildBusinessCase(input({ discountRate: null }));
    expect(result.payload).toBeNull();
    expect(result.conclusionWithheld).toMatch(/discount rate/i);
  });

  it("refuses when there are no stated assumptions at all", () => {
    const result = buildBusinessCase(input({ revenueAssumptions: [], costAssumptions: [] }));
    expect(result.payload).toBeNull();
    expect(result.conclusionWithheld).toMatch(/assumptions/i);
  });

  it("names the assumptions nobody can independently check", () => {
    const result = buildBusinessCase(
      input({ revenueAssumptions: [assumption({ origin: SPONSOR })] }),
    );
    expect(result.payload?.unverifiedAssumptionIds).toContain("a1");
    expect(result.uncertainties.some((u) => u.topic === "Unverified assumptions")).toBe(true);
    expect(result.approval.whatWouldBeCommitted.join(" ")).toMatch(/rest on assertion/i);
  });

  it("flags assumptions whose sensitivity was never tested", () => {
    const result = buildBusinessCase(
      input({ revenueAssumptions: [assumption({ sensitivity: "untested" })] }),
    );
    expect(result.uncertainties.some((u) => u.topic === "Untested sensitivity")).toBe(true);
  });

  // Weighting scenarios would launder a guess into one confident number.
  it("produces no probability, weighting or expected value", () => {
    const result = buildBusinessCase(input());
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/"probability"/i);
    expect(serialized).not.toMatch(/expectedValue/i);
    expect(serialized).not.toMatch(/"confidence"/i);
    for (const scenario of result.payload?.scenarios ?? []) {
      expect(scenario).not.toHaveProperty("probability");
    }
  });

  it("passes a finance refusal through instead of smoothing it into a number", () => {
    const result = buildBusinessCase(
      input({
        scenarios: [
          {
            name: "Base",
            description: "One period unknown",
            variedAssumptionIds: [],
            revenuePeriods: [{ period: 1, amount: null, label: "Revenue Y1" }],
            costPeriods: [{ period: 0, amount: -100, label: "Build" }],
          },
        ],
      }),
    );
    const headline = result.payload?.headline;
    expect(headline?.npv.ok).toBe(false);
    expect(result.uncertainties.some((u) => u.topic.startsWith("NPV not computed"))).toBe(true);
  });

  it("reports an ambiguous IRR as an uncertainty", () => {
    const result = buildBusinessCase(
      input({
        scenarios: [
          {
            name: "Base",
            description: "Sign changes twice",
            variedAssumptionIds: [],
            revenuePeriods: [{ period: 1, amount: 300, label: "R" }],
            costPeriods: [
              { period: 0, amount: -100, label: "Build" },
              { period: 2, amount: -250, label: "Decommission" },
            ],
          },
        ],
      }),
    );
    expect(result.uncertainties.some((u) => u.topic.startsWith("IRR is not unique"))).toBe(true);
  });

  // A risk matrix full of plausible ratings gets colour-coded and believed.
  it("downgrades an unsupported risk rating to unknown", () => {
    const result = buildBusinessCase(
      input({
        risks: [
          {
            id: "r1",
            category: "market",
            description: "Adoption may be slow",
            likelihood: "high",
            impact: "high",
            basis: null,
            mitigation: null,
          },
        ],
      }),
    );
    const risk = result.payload?.risks[0];
    expect(risk?.likelihood).toBe("unknown");
    expect(risk?.impact).toBe("unknown");
    expect(risk?.claimKind).toBe("INFERENCE");
  });

  it("names the risk categories that were never considered", () => {
    const result = buildBusinessCase(input({ risks: [] }));
    for (const category of REQUIRED_RISK_CATEGORIES) {
      expect(result.missingFacts.some((gap) => gap.label.includes(category))).toBe(true);
    }
  });
});

// ===========================================================================
// AUTHORIZATION — shared boundaries
// ===========================================================================
describe("authorization: DPS specialist boundaries", () => {
  const ALL_TOOLS = [
    ...PRODUCT_AGENT_TOOLS,
    ...SOLUTION_AGENT_TOOLS,
    ...BUSINESS_CASE_AGENT_TOOLS,
  ];

  it("declares only read-only LOW-risk tools", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.riskLevel, tool.name).toBe("LOW");
      expect(tool.requiresConfirmation, tool.name).toBe(false);
      expect(tool.reversible, tool.name).toBe(true);
    }
  });

  it("registers no tool that writes, approves, commits or contacts anyone", () => {
    const forbidden =
      /write|create|update|delete|approve|commit|send|email|contact|publish|sign|export|start/i;
    for (const tool of ALL_TOOLS) {
      expect(tool.name, tool.name).not.toMatch(forbidden);
    }
  });

  // A web-search tool would return uncurated material under TANIA's name.
  it("has no tool that reaches the open internet", () => {
    const external = /web|internet|browse|http|crawl|scrape|market_data|pricing_feed/i;
    for (const tool of ALL_TOOLS) {
      expect(tool.name, tool.name).not.toMatch(external);
    }
  });

  it("requests no write or approval permission", () => {
    const requested = [
      ...DPS_SPECIALIST_AGENTS.flatMap((agent) => agent.requiredPermissions),
      ...ALL_TOOLS.flatMap((tool) => tool.requiredPermissions),
    ];
    for (const permission of [
      "project.create",
      "project.update",
      "business_impact.create",
      "business_impact.validate",
      "report.export",
      "ai.execute",
    ]) {
      expect(requested, permission).not.toContain(permission);
    }
  });

  it("declares only its own tools, per agent", () => {
    expect([...PRODUCT_AGENT.tools].sort()).toEqual(PRODUCT_AGENT_TOOLS.map((t) => t.name).sort());
    expect([...SOLUTION_AGENT.tools].sort()).toEqual(SOLUTION_AGENT_TOOLS.map((t) => t.name).sort());
    expect([...BUSINESS_CASE_AGENT.tools].sort()).toEqual(
      BUSINESS_CASE_AGENT_TOOLS.map((t) => t.name).sort(),
    );
  });

  it("recognises forbidden requests, including paraphrases", () => {
    expect(isForbiddenAction("please approve this business case")).toBe(true);
    expect(isForbiddenAction("go ahead and commit the budget")).toBe(true);
    expect(isForbiddenAction("contact the customer with this proposal")).toBe(true);
    expect(isForbiddenAction("what does the market evidence say?")).toBe(false);
  });

  it("tells every specialist, in the same words, not to invent figures", () => {
    for (const agent of DPS_SPECIALIST_AGENTS) {
      const prompt = agent.systemPrompt;
      expect(prompt, agent.name).toMatch(/You do not know these things/);
      expect(prompt, agent.name).toMatch(/specific, plausible and wrong/);
      expect(prompt, agent.name).toMatch(/untrusted data/);
      for (const action of FORBIDDEN_SPECIALIST_ACTIONS) {
        expect(prompt, `${agent.name}: ${action}`).toContain(action);
      }
    }
  });

  it("tells the business case agent specifically not to weight scenarios", () => {
    expect(BUSINESS_CASE_AGENT.systemPrompt).toMatch(/not weight scenarios by probability/i);
    expect(BUSINESS_CASE_AGENT.systemPrompt).toMatch(/discount rate is never assumed/i);
  });

  it("tells the solution agent that unseen is not absent", () => {
    expect(SOLUTION_AGENT.systemPrompt).toMatch(/never conclude 'nobody here can do this'/i);
  });
});

// ===========================================================================
// INTEGRATION — through the governed pipeline, with audit
// ===========================================================================
describe("integration: DPS tools through the pipeline", () => {
  function registry(): ToolRegistry {
    const r = new ToolRegistry();
    registerProductTools(r);
    registerSolutionTools(r);
    registerBusinessCaseTools(r);
    return r;
  }

  function auth(over: Partial<AgentAuthContext> = {}): AgentAuthContext {
    return {
      userId: "u1",
      email: "u1@telkom.test",
      organizationIds: ["org-1"],
      squadIds: [],
      roles: ["CHAPTER_LEAD"],
      permissions: [
        "project.read",
        "business_impact.read",
        "capability.read",
        "talent.read",
        "ai.use",
        "ai.analyze",
        "ai.recommend",
      ],
      correlationId: "corr-1",
      sessionId: "sess-1",
      isAiService: false,
      ...over,
    };
  }

  function options(r: ToolRegistry, over: Record<string, unknown> = {}) {
    return {
      registry: r,
      auth: auth(),
      allowedTools: [
        ...PRODUCT_AGENT.tools,
        ...SOLUTION_AGENT.tools,
        ...BUSINESS_CASE_AGENT.tools,
      ],
      signal: new AbortController().signal,
      log: () => undefined,
      timeoutMs: 2_000,
      ...over,
    } as Parameters<typeof executeToolCall>[1];
  }

  it("registers all five tools without collision", () => {
    expect(registry().size).toBe(5);
  });

  it("is idempotent across repeated registration", () => {
    const r = registry();
    registerProductTools(r);
    registerSolutionTools(r);
    expect(r.size).toBe(5);
  });

  it("denies a call missing project.read", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_product_context", arguments: {} },
      options(registry(), { auth: auth({ permissions: ["ai.use"] }) }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Missing permission/);
  });

  it("denies an unknown argument rather than ignoring it", async () => {
    const record = await executeToolCall(
      { toolName: "search_product_knowledge", arguments: { query: "market", limit: 100 } },
      options(registry()),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown argument: limit/);
  });

  it("denies a market-data tool that does not exist", async () => {
    const record = await executeToolCall(
      { toolName: "fetch_market_data", arguments: {} },
      options(registry(), { allowedTools: ["fetch_market_data"] }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown tool/);
  });

  // Every call, including refused ones, reaches the log.
  it("audits each call with the agent that made it", async () => {
    const events: { action: string; agentName: string }[] = [];
    await executeToolCall(
      { toolName: "retrieve_financial_context", arguments: {} },
      options(registry(), {
        agentName: "business_case_agent",
        audit: async (event: { action: string; agentName: string }) => {
          events.push(event);
          return { ok: true, eventId: "1" };
        },
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.agentName).toBe("business_case_agent");
  });

  it("fails rather than fabricates when no knowledge base exists", async () => {
    const record = await executeToolCall(
      { toolName: "search_solution_knowledge", arguments: { query: "kubernetes" } },
      options(registry()),
    );
    // No embedding provider: an honest failure, never invented excerpts.
    expect(record.status).toBe("failed");
    expect(record.result).toBeNull();
    expect(record.errorDetail).toMatch(/not integrated/i);
  });
});
