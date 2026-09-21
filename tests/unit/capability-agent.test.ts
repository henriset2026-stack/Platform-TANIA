import { describe, expect, it } from "vitest";

import {
  HIGH_PRIORITY_INDEX,
  analyzeCapability,
  demonstratesApplication,
  type CapabilityAnalysisInput,
  type RequirementInput,
  type TalentCapabilityInput,
} from "@/agents/capability/analysis";
import {
  FORBIDDEN_CAPABILITY_ACTIONS,
  basisReferences,
} from "@/agents/capability/contract";
import { CAPABILITY_AGENT, isForbiddenAction } from "@/agents/capability/agent";
import {
  CAPABILITY_AGENT_TOOLS,
  registerCapabilityTools,
} from "@/agents/capability/tools";
import { ToolRegistry } from "@/agents/core/tool-registry";
import { executeToolCall } from "@/agents/core/pipeline";
import { CERTIFICATION_ONLY_CEILING } from "@/lib/calculations/capability";
import type { AgentAuthContext } from "@/agents/core/types";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
/** Adversarial argument used to assert the pipeline rejects it. */
const MALFORMED_ID = "'; DR" + "OP TABLE talent_capabilities --";

/** First element, asserted rather than indexed — tsconfig forbids the latter. */
function first<T>(items: readonly T[]): T {
  const [head] = items;
  if (head === undefined) throw new Error("expected at least one item");
  return head;
}

function requirement(over: Partial<RequirementInput> = {}): RequirementInput {
  return {
    requirementId: "req-1",
    capabilityId: "cap-1",
    capabilityName: "Cloud Architecture",
    requiredLevel: 4,
    criticality: "high",
    urgency: "high",
    scope: { kind: "squad", id: "squad-1" },
    ...over,
  };
}

function holder(over: Partial<TalentCapabilityInput> = {}): TalentCapabilityInput {
  return {
    talentCapabilityId: "tc-1",
    talentId: "talent-1",
    displayName: "Ayu",
    capabilityId: "cap-1",
    claimedLevel: 4,
    assessmentStatus: "evidence_validated",
    evidence: [
      {
        evidenceId: "ev-1",
        sourceType: "project_deliverable",
        validationStatus: "validated",
        occurredAt: "2026-05-01T00:00:00.000Z",
      },
    ],
    ...over,
  };
}

function analyze(over: Partial<CapabilityAnalysisInput> = {}) {
  return analyzeCapability({
    requirements: [requirement()],
    talent: [holder()],
    ...over,
  });
}

// ===========================================================================
// UNIT — the deterministic gap engine
// ===========================================================================
describe("unit: capability gap analysis", () => {
  it("subtracts the PROVEN level, not the claimed level", () => {
    // Claimed L4, but the only evidence is a certificate: proven caps at L2.
    const analysis = analyze({
      talent: [
        holder({
          claimedLevel: 4,
          evidence: [
            {
              evidenceId: "ev-cert",
              sourceType: "certification",
              validationStatus: "validated",
              occurredAt: null,
            },
          ],
        }),
      ],
    });

    const gap = first(analysis.gaps);
    expect(gap.claimedLevel).toBe(4);
    expect(gap.provenLevel).toBe(CERTIFICATION_ONLY_CEILING);
    expect(gap.gap).toBe(4 - CERTIFICATION_ONLY_CEILING);
    expect(gap.magnitude).toBe(2);
  });

  // PRD §7.1. A certificate is knowledge, not application.
  it("names the certification-only case rather than hiding it", () => {
    const analysis = analyze({
      talent: [
        holder({
          evidence: [
            {
              evidenceId: "ev-cert",
              sourceType: "certification",
              validationStatus: "validated",
              occurredAt: null,
            },
          ],
        }),
      ],
    });

    expect(first(analysis.gaps).basis.kind).toBe("certification_only");
    expect(
      analysis.uncertainties.some((u) => u.topic === "Certification is not capability"),
    ).toBe(true);
  });

  it("classifies evidence source types by application, from the engine", () => {
    expect(demonstratesApplication("project_deliverable")).toBe(true);
    expect(demonstratesApplication("peer_review")).toBe(true);
    expect(demonstratesApplication("certification")).toBe(false);
    expect(demonstratesApplication("course_completion")).toBe(false);
  });

  it("reports no gap when the requirement is met by proven evidence", () => {
    const analysis = analyze({ requirements: [requirement({ requiredLevel: 3 })] });
    expect(analysis.gaps).toEqual([]);
    expect(analysis.unprovenRequirementCount).toBe(0);
  });

  it("treats an unevidenced requirement as unproven with the requirement as its citation", () => {
    const analysis = analyze({ talent: [] });
    const gap = first(analysis.gaps);
    expect(gap.basis.kind).toBe("unevidenced");
    if (gap.basis.kind === "unevidenced") {
      expect(gap.basis.requirement.requirementId).toBe("req-1");
    }
  });

  // The guarantee that replaces "every finding has evidence": a gap with no
  // evidence still resolves to a real row, and cannot be built without one.
  it("gives every gap a basis that resolves to at least one record", () => {
    const analysis = analyzeCapability({
      requirements: [
        requirement(),
        requirement({ requirementId: "req-2", capabilityId: "cap-2", capabilityName: "Data Engineering" }),
      ],
      talent: [
        holder({
          claimedLevel: 2,
          evidence: [
            {
              evidenceId: "ev-cert",
              sourceType: "certification",
              validationStatus: "validated",
              occurredAt: null,
            },
          ],
        }),
      ],
    });

    expect(analysis.gaps.length).toBe(2);
    for (const gap of analysis.gaps) {
      expect(basisReferences(gap.basis).length, gap.id).toBeGreaterThan(0);
    }
  });

  it("lists affected talent below the requirement and excludes those who meet it", () => {
    const analysis = analyzeCapability({
      requirements: [requirement({ requiredLevel: 4 })],
      talent: [
        holder({ talentCapabilityId: "tc-1", talentId: "t-1", displayName: "Ayu", claimedLevel: 4 }),
        holder({
          talentCapabilityId: "tc-2",
          talentId: "t-2",
          displayName: "Budi",
          claimedLevel: 2,
          evidence: [
            {
              evidenceId: "ev-2",
              sourceType: "project_deliverable",
              validationStatus: "validated",
              occurredAt: null,
            },
          ],
        }),
      ],
    });

    // Ayu proves L4 and closes the chapter gap, so no gap is reported at all.
    expect(analysis.gaps).toEqual([]);

    const harder = analyzeCapability({
      requirements: [requirement({ requiredLevel: 5 })],
      talent: [
        holder({ talentCapabilityId: "tc-1", talentId: "t-1", displayName: "Ayu", claimedLevel: 4 }),
        holder({
          talentCapabilityId: "tc-2",
          talentId: "t-2",
          displayName: "Budi",
          claimedLevel: 2,
          evidence: [
            {
              evidenceId: "ev-2",
              sourceType: "project_deliverable",
              validationStatus: "validated",
              occurredAt: null,
            },
          ],
        }),
      ],
    });

    const affected = first(harder.gaps).affectedTalent;
    expect(affected.talent.map((t) => t.displayName)).toEqual(["Budi", "Ayu"]);
    expect(affected.visibleCount).toBe(2);
  });

  // A count taken from an RLS-scoped read is a lower bound, never a total.
  it("marks the affected population as scope-limited", () => {
    const analysis = analyze({ requirements: [requirement({ requiredLevel: 5 })] });
    const affected = first(analysis.gaps).affectedTalent;
    expect(affected.scopeLimited).toBe(true);
    expect(affected.visibleCount).toBe(affected.talent.length);
  });

  it("exposes every priority factor rather than a single opaque score", () => {
    const analysis = analyze({
      requirements: [requirement({ requiredLevel: 5, criticality: "critical", urgency: "immediate" })],
    });
    const priority = first(analysis.gaps).priority;

    // Ayu proves L4 against a requirement of L5, so the magnitude is 1 — and
    // the score is still 16, because criticality and urgency carry it.
    expect(priority.magnitude).toBe(1);
    expect(priority.criticalityWeight).toBe(4);
    expect(priority.urgencyWeight).toBe(4);
    expect(priority.score).toBe(1 * 4 * 4);
    expect(priority.formula).toContain("magnitude 1");
    expect(priority.formula).toContain("= 16");
  });

  // PRD §7.3: criticality, magnitude and urgency together — not size alone.
  it("ranks a smaller urgent critical gap above a larger low-priority one", () => {
    const analysis = analyzeCapability({
      requirements: [
        requirement({
          requirementId: "req-big",
          capabilityId: "cap-big",
          capabilityName: "Legacy Reporting",
          requiredLevel: 5,
          criticality: "low",
          urgency: "low",
        }),
        requirement({
          requirementId: "req-urgent",
          capabilityId: "cap-urgent",
          capabilityName: "AI Engineering",
          requiredLevel: 2,
          criticality: "critical",
          urgency: "immediate",
        }),
      ],
      talent: [],
    });

    expect(analysis.gaps.map((g) => g.capabilityName)).toEqual([
      "AI Engineering",
      "Legacy Reporting",
    ]);
    expect(first(analysis.gaps).magnitude).toBeLessThan(
      first(analysis.gaps.slice(1)).magnitude,
    );
  });

  it("is deterministic across runs", () => {
    const input: CapabilityAnalysisInput = {
      requirements: [requirement(), requirement({ requirementId: "req-2", capabilityId: "cap-2" })],
      talent: [holder(), holder({ talentCapabilityId: "tc-2", talentId: "t-2", capabilityId: "cap-2" })],
    };
    const { generatedAt: _a, ...first } = analyzeCapability(input);
    const { generatedAt: _b, ...second } = analyzeCapability(input);
    expect(first).toEqual(second);
  });

  it("reports an empty analysis honestly rather than inventing gaps", () => {
    const analysis = analyzeCapability({ requirements: [], talent: [] });
    expect(analysis.gaps).toEqual([]);
    expect(analysis.recommendations).toEqual([]);
    expect(analysis.uncertainties.length).toBeGreaterThan(0);
    expect(analysis.summary).toMatch(/no capability requirements/i);
  });

  it("raises uncertainties rather than omitting what it could not assess", () => {
    const analysis = analyzeCapability({
      requirements: [requirement()],
      talent: [
        holder({
          capabilityId: "cap-other",
          evidence: [
            {
              evidenceId: "ev-pending",
              sourceType: "project_deliverable",
              validationStatus: "pending",
              occurredAt: null,
            },
          ],
        }),
      ],
    });

    const topics = analysis.uncertainties.map((u) => u.topic);
    expect(topics).toContain("Population visibility");
    expect(topics).toContain("Unvalidated evidence");
    expect(topics).toContain("Capabilities without a requirement");
    for (const uncertainty of analysis.uncertainties) {
      expect(uncertainty.resolvedBy.length).toBeGreaterThan(0);
    }
  });

  it("never changes a capability level and says so", () => {
    const analysis = analyze();
    expect(analysis.upgradesCapability).toBe(false);
    expect(analysis.isCapabilityAssessment).toBe(false);
    expect(analysis.summary).toMatch(/not an assessment/i);
    expect(analysis).not.toHaveProperty("newLevel");
  });

  it("marks gaps ANALYSIS and recommendations RECOMMENDATION", () => {
    const analysis = analyze({ requirements: [requirement({ requiredLevel: 5 })] });
    for (const gap of analysis.gaps) expect(gap.claimKind).toBe("ANALYSIS");
    for (const rec of analysis.recommendations) {
      expect(rec.claimKind).toBe("RECOMMENDATION");
      expect(rec.requiresHumanDecision).toBe(true);
    }
  });
});

// ===========================================================================
// UNIT — development recommendations
// ===========================================================================
describe("unit: development recommendations", () => {
  it("answers a certification-only gap with applied practice, not another course", () => {
    const analysis = analyze({
      talent: [
        holder({
          evidence: [
            {
              evidenceId: "ev-cert",
              sourceType: "certification",
              validationStatus: "validated",
              occurredAt: null,
            },
          ],
        }),
      ],
    });

    const rec = first(analysis.recommendations);
    expect(rec.approach).toBe("applied_practice");
    expect(rec.rationale).toMatch(/certificate cannot close this gap/i);
  });

  // The missing thing is proof, not skill — do not spend training budget.
  it("answers an unevidenced but sufficient claim with evidence, not training", () => {
    const analysis = analyze({
      talent: [
        holder({
          claimedLevel: 4,
          assessmentStatus: "self_assessed",
          evidence: [],
        }),
      ],
    });

    const rec = first(analysis.recommendations);
    expect(rec.approach).toBe("establish_evidence");
    expect(rec.rationale).toMatch(/proof, not skill/i);
  });

  it("recommends a Capability Sprint for a gap of two levels or more", () => {
    const analysis = analyze({
      talent: [holder({ claimedLevel: 2, assessmentStatus: "self_assessed", evidence: [] })],
    });
    expect(first(analysis.recommendations).approach).toBe("capability_sprint");
    expect(first(analysis.recommendations).rationale).toMatch(/20-hour|Capability Sprint/i);
  });

  it("recommends coaching for a one-level gap with applied evidence", () => {
    const analysis = analyze({
      requirements: [requirement({ requiredLevel: 4 })],
      talent: [holder({ claimedLevel: 3 })],
    });
    expect(first(analysis.recommendations).approach).toBe("coaching");
  });

  it("derives recommendation priority from the priority index", () => {
    const analysis = analyze({
      requirements: [requirement({ requiredLevel: 5, criticality: "critical", urgency: "immediate" })],
      talent: [],
    });
    expect(first(analysis.gaps).priority.index).toBeGreaterThanOrEqual(HIGH_PRIORITY_INDEX);
    expect(first(analysis.recommendations).priority).toBe("high");
  });

  it("grounds every recommendation in the same basis as its gap", () => {
    const analysis = analyze({ requirements: [requirement({ requiredLevel: 5 })] });
    expect(analysis.recommendations.length).toBe(analysis.gaps.length);
    for (const rec of analysis.recommendations) {
      expect(basisReferences(rec.basis).length, rec.id).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// AUTHORIZATION — what the agent cannot do
// ===========================================================================
describe("authorization: agent boundaries", () => {
  it("declares only read-only LOW-risk tools", () => {
    for (const tool of CAPABILITY_AGENT_TOOLS) {
      expect(tool.riskLevel, tool.name).toBe("LOW");
      expect(tool.requiresConfirmation, tool.name).toBe(false);
      expect(tool.requiredPermissions, tool.name).toContain("capability.read");
    }
  });

  // No tool exists through which it could assess, validate or upgrade.
  it("registers no tool that assesses, validates, upgrades, writes or exports", () => {
    const forbidden =
      /write|create|update|delete|assess|validat|approve|certif|upgrade|submit|export|assign/i;
    for (const tool of CAPABILITY_AGENT_TOOLS) {
      expect(tool.name, tool.name).not.toMatch(forbidden);
    }
  });

  // capability.read and capability.assess are separate permissions precisely
  // so that reading capability state never implies changing it.
  it("requests read permissions without assessment permissions", () => {
    const requested = [
      ...CAPABILITY_AGENT.requiredPermissions,
      ...CAPABILITY_AGENT_TOOLS.flatMap((t) => t.requiredPermissions),
    ];
    expect(requested).toContain("capability.read");
    expect(requested).not.toContain("capability.assess");
    expect(requested).not.toContain("capability.validate_evidence");
    expect(requested).not.toContain("capability.create");
    expect(requested).not.toContain("capability.update");
    expect(requested).not.toContain("development.approve");
  });

  it("declares no tool outside its own set", () => {
    const registered = CAPABILITY_AGENT_TOOLS.map((t) => t.name);
    expect([...CAPABILITY_AGENT.tools].sort()).toEqual([...registered].sort());
  });

  it("recognises forbidden requests, including paraphrases with filler words", () => {
    expect(isForbiddenAction("please upgrade the capability level for Budi")).toBe(true);
    expect(isForbiddenAction("assess capability level")).toBe(true);
    expect(isForbiddenAction("go ahead and validate this capability evidence")).toBe(true);
    expect(isForbiddenAction("export the capability matrix")).toBe(true);
    expect(isForbiddenAction("which capabilities have the largest gaps?")).toBe(false);
  });

  it("states its refusals and the certification rule in the system prompt", () => {
    const prompt = CAPABILITY_AGENT.systemPrompt.toLowerCase();
    expect(prompt).toContain("certification is not capability");
    expect(prompt).toContain("row-level security");
    expect(prompt).toContain("proven by validated evidence");
    for (const action of FORBIDDEN_CAPABILITY_ACTIONS) {
      expect(CAPABILITY_AGENT.systemPrompt).toContain(action);
    }
  });
});

// ===========================================================================
// INTEGRATION — the agent's tools through the governed pipeline
// ===========================================================================
describe("integration: tools through the pipeline", () => {
  function registry(): ToolRegistry {
    const r = new ToolRegistry();
    registerCapabilityTools(r);
    return r;
  }

  function auth(over: Partial<AgentAuthContext> = {}): AgentAuthContext {
    return {
      userId: "u1",
      email: "u1@telkom.test",
      organizationIds: ["org-1"],
      squadIds: [],
      roles: ["CHAPTER_LEAD"],
      permissions: ["capability.read", "talent.read", "ai.use", "ai.analyze"],
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
      allowedTools: [...CAPABILITY_AGENT.tools],
      signal: new AbortController().signal,
      log: () => undefined,
      timeoutMs: 2_000,
      ...over,
    } as Parameters<typeof executeToolCall>[1];
  }

  it("registers all three tools without error", () => {
    expect(registry().size).toBe(3);
  });

  it("is idempotent across repeated registration", () => {
    const r = registry();
    registerCapabilityTools(r);
    expect(r.size).toBe(3);
  });

  it("denies a call missing capability.read", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_capability_requirements", arguments: {} },
      options(registry(), { auth: auth({ permissions: ["ai.use"] }) }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Missing permission/);
  });

  // Naming affected people needs talent.read as well as capability.read.
  it("denies gap analysis to a caller who may read capabilities but not people", async () => {
    const record = await executeToolCall(
      { toolName: "analyze_capability_gaps", arguments: {} },
      options(registry(), {
        auth: auth({ permissions: ["capability.read", "ai.use", "ai.analyze"] }),
      }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/talent\.read/);
  });

  it("denies a malformed talent id before any query runs", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_talent_capabilities", arguments: { talentId: MALFORMED_ID } },
      options(registry()),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/must be a UUID/);
  });

  it("denies an unknown argument rather than ignoring it", async () => {
    const record = await executeToolCall(
      {
        toolName: "analyze_capability_gaps",
        arguments: { squadId: UUID, includeRestricted: true },
      },
      options(registry()),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown argument: includeRestricted/);
  });

  it("denies an upgrade tool that does not exist", async () => {
    const record = await executeToolCall(
      { toolName: "upgrade_capability_level", arguments: {} },
      options(registry(), { allowedTools: ["upgrade_capability_level"] }),
    );
    // Not registered: denied, never attempted.
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown tool/);
  });

  // These tools are read-only, so an AI identity may use them.
  it("permits an AI identity to use the read-only tools", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_capability_requirements", arguments: {} },
      options(registry(), { auth: auth({ isAiService: true }) }),
    );
    expect(record.status).not.toBe("denied");
  });

  it("fails rather than fabricates when no database exists", async () => {
    const record = await executeToolCall(
      { toolName: "analyze_capability_gaps", arguments: {} },
      options(registry()),
    );
    // An honest failure, never an empty success a model could narrate as
    // "no capability gaps found".
    expect(record.status).toBe("failed");
    expect(record.result).toBeNull();
  });
});
