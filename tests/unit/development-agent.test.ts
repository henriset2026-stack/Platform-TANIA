import { describe, expect, it } from "vitest";

import {
  DEFAULT_SPRINT_HOURS,
  FALLBACK_STAGE_HOURS,
  MAX_LEVELS_PER_PLAN,
  draftDevelopmentPlan,
  selectTemplate,
  type PlanningInput,
} from "@/agents/development/planning";
import {
  ACTIVITY_STAGES,
  DEVELOPMENT_APPROVER_ROLES,
  FORBIDDEN_DEVELOPMENT_ACTIONS,
} from "@/agents/development/contract";
import { DEVELOPMENT_AGENT, isForbiddenAction } from "@/agents/development/agent";
import {
  DEVELOPMENT_AGENT_TOOLS,
  registerDevelopmentTools,
} from "@/agents/development/tools";
import { ToolRegistry } from "@/agents/core/tool-registry";
import { executeToolCall } from "@/agents/core/pipeline";
import {
  evaluateCapabilityUpgrade,
  type DevelopmentTemplate,
  type PlanActivity,
} from "@/lib/calculations/development";
import type { AgentAuthContext } from "@/agents/core/types";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
/** Adversarial argument used to assert the pipeline rejects it. */
const MALFORMED_ID = "'; DR" + "OP TABLE development_plans --";

/** First element, asserted rather than indexed — tsconfig forbids the latter. */
function first<T>(items: readonly T[]): T {
  const [head] = items;
  if (head === undefined) throw new Error("expected at least one item");
  return head;
}

function planning(over: Partial<PlanningInput> = {}): PlanningInput {
  return {
    talentDisplayName: "Ayu",
    gap: {
      capabilityId: "cap-1",
      capabilityName: "Cloud Architecture",
      requiredLevel: 4,
      sourceRequirementId: "req-1",
      currentProvenLevel: 1,
      claimedLevel: 1,
    },
    templates: [],
    existingPlans: [],
    ...over,
  };
}

function template(over: Partial<DevelopmentTemplate> = {}): DevelopmentTemplate {
  return {
    id: "tpl-1",
    code: "DPS-CLOUD-L2",
    name: "Cloud Architecture Sprint",
    methodology: "dps_20_hour_sprint",
    totalHours: 20,
    approved: true,
    capabilityId: "cap-1",
    targetLevel: 2,
    activities: [
      {
        sequenceNo: 1,
        phase: "learn",
        title: "Cloud patterns",
        activityType: "learn",
        estimatedHours: 6,
        requiresEvidence: false,
      },
      {
        sequenceNo: 2,
        phase: "build",
        title: "Build a reference architecture",
        activityType: "assignment",
        estimatedHours: 10,
        requiresEvidence: true,
      },
      {
        sequenceNo: 3,
        phase: "assess",
        title: "Architecture review",
        activityType: "assessment",
        estimatedHours: 4,
        requiresEvidence: true,
      },
    ],
    ...over,
  };
}

// ===========================================================================
// UNIT — drafting
// ===========================================================================
describe("unit: drafting a development plan", () => {
  it("builds from the proven level, never the claimed level", () => {
    const response = draftDevelopmentPlan(
      planning({
        gap: {
          capabilityId: "cap-1",
          capabilityName: "Cloud Architecture",
          requiredLevel: 4,
          sourceRequirementId: "req-1",
          currentProvenLevel: 1,
          claimedLevel: 4,
        },
      }),
    );

    const plan = response.plan;
    expect(plan).not.toBeNull();
    expect(plan?.currentProvenLevel).toBe(1);
    expect(plan?.targetLevel).toBe(1 + MAX_LEVELS_PER_PLAN);
    expect(
      response.uncertainties.some((u) => u.topic === "Claimed level exceeds proven level"),
    ).toBe(true);
  });

  // L1 to L4 in twenty hours is a wish, not a plan.
  it("targets one level at a time and reports what remains", () => {
    const response = draftDevelopmentPlan(planning());
    expect(response.plan?.targetLevel).toBe(2);
    expect(response.plan?.requiredLevel).toBe(4);
    expect(response.plan?.remainingLevelsAfterPlan).toBe(2);
    expect(
      response.uncertainties.some((u) => u.topic === "Levels beyond this plan"),
    ).toBe(true);
  });

  it("declines to draft when the requirement is already met", () => {
    const response = draftDevelopmentPlan(
      planning({
        gap: {
          capabilityId: "cap-1",
          capabilityName: "Cloud Architecture",
          requiredLevel: 2,
          sourceRequirementId: "req-1",
          currentProvenLevel: 3,
          claimedLevel: 3,
        },
      }),
    );

    expect(response.plan).toBeNull();
    expect(response.notDraftedReason).toMatch(/already met/i);
    expect(response.activities).toEqual([]);
  });

  // A second plan would duplicate a commitment a human already made.
  it("declines to draft over an in-flight plan for the same capability", () => {
    const response = draftDevelopmentPlan(
      planning({
        existingPlans: [
          { id: "plan-1", capabilityId: "cap-1", status: "approved", title: "Cloud L1→L2" },
        ],
      }),
    );

    expect(response.plan).toBeNull();
    expect(response.notDraftedReason).toMatch(/already exists/i);
  });

  it("ignores a completed plan for the same capability", () => {
    const response = draftDevelopmentPlan(
      planning({
        existingPlans: [
          { id: "plan-1", capabilityId: "cap-1", status: "completed", title: "Old sprint" },
        ],
      }),
    );
    expect(response.plan).not.toBeNull();
  });

  it("sets exactly one of plan and notDraftedReason", () => {
    for (const response of [
      draftDevelopmentPlan(planning()),
      draftDevelopmentPlan(
        planning({
          gap: {
            capabilityId: "cap-1",
            capabilityName: "Cloud Architecture",
            requiredLevel: 1,
            sourceRequirementId: "req-1",
            currentProvenLevel: 3,
            claimedLevel: 3,
          },
        }),
      ),
    ]) {
      expect(response.plan === null).toBe(response.notDraftedReason !== null);
    }
  });

  it("is deterministic across runs", () => {
    const input = planning({ templates: [template()] });
    const { generatedAt: _a, ...one } = draftDevelopmentPlan(input);
    const { generatedAt: _b, ...two } = draftDevelopmentPlan(input);
    expect(one).toEqual(two);
  });
});

// ===========================================================================
// UNIT — the workflow the plan must implement
// ===========================================================================
describe("unit: Gap → Plan → Learning → Practice → Work Application → Assessment → Evidence", () => {
  it("covers every activity stage in workflow order", () => {
    const response = draftDevelopmentPlan(planning());
    expect(response.activities.map((a) => a.stage)).toEqual([...ACTIVITY_STAGES]);
    expect(response.activities.map((a) => a.sequenceNo)).toEqual([1, 2, 3, 4]);
  });

  it("allocates the DPS twenty hours", () => {
    const response = draftDevelopmentPlan(planning());
    expect(response.plan?.totalHours).toBe(DEFAULT_SPRINT_HOURS);
  });

  // "Don't train people to know. Train people to do." (PRD §8)
  it("weights doing above knowing", () => {
    const doing = FALLBACK_STAGE_HOURS.practice + FALLBACK_STAGE_HOURS.work_application;
    expect(doing).toBeGreaterThan(DEFAULT_SPRINT_HOURS / 2);
    expect(doing).toBeGreaterThan(FALLBACK_STAGE_HOURS.learning);
  });

  it("expects applied evidence from work application and knowledge-only from learning", () => {
    const response = draftDevelopmentPlan(planning());
    const application = response.expectedEvidence.find(
      (e) => e.stage === "work_application",
    );
    expect(application?.demonstratesApplication).toBe(true);
    expect(application?.validationRequired).toBe(true);
    // Learning produces no capability evidence at all: attending is not applying.
    expect(response.expectedEvidence.some((e) => e.stage === "learning")).toBe(false);
  });

  // A plan whose evidence is all knowledge cannot reach L3, whatever it targets.
  it("warns when the expected evidence cannot support the target level", () => {
    const knowledgeOnly = template({
      capabilityId: "cap-1",
      targetLevel: 3,
      totalHours: 10,
      activities: [
        {
          sequenceNo: 1,
          phase: "learn",
          title: "Study",
          activityType: "learn",
          estimatedHours: 6,
          requiresEvidence: true,
        },
        {
          sequenceNo: 2,
          phase: "assess",
          title: "Quiz",
          activityType: "assessment",
          estimatedHours: 4,
          requiresEvidence: false,
        },
      ],
    });

    const response = draftDevelopmentPlan(
      planning({
        gap: {
          capabilityId: "cap-1",
          capabilityName: "Cloud Architecture",
          requiredLevel: 4,
          sourceRequirementId: "req-1",
          currentProvenLevel: 2,
          claimedLevel: 2,
        },
        templates: [knowledgeOnly],
      }),
    );

    expect(response.plan?.targetLevel).toBe(3);
    expect(
      response.uncertainties.some((u) => u.topic === "Evidence cannot support the target"),
    ).toBe(true);
  });
});

// ===========================================================================
// UNIT — templates, and not inventing curriculum
// ===========================================================================
describe("unit: template selection", () => {
  it("uses an approved template that targets this capability and level", () => {
    const response = draftDevelopmentPlan(planning({ templates: [template()] }));
    expect(response.plan?.contentSource).toBe("approved_template");
    expect(response.plan?.templateId).toBe("tpl-1");
    expect(response.activities.map((a) => a.title)).toContain(
      "Build a reference architecture",
    );
  });

  // An unapproved template is someone's working draft, not organizational content.
  it("ignores an unapproved template", () => {
    const response = draftDevelopmentPlan(
      planning({ templates: [template({ approved: false })] }),
    );
    expect(response.plan?.contentSource).toBe("structure_only");
  });

  it("ignores a template for a different capability or level", () => {
    expect(selectTemplate([template({ capabilityId: "cap-other" })], "cap-1", 2)).toBeNull();
    expect(selectTemplate([template({ targetLevel: 5 })], "cap-1", 2)).toBeNull();
    expect(selectTemplate([template({ targetLevel: null })], "cap-1", 2)).not.toBeNull();
  });

  it("ignores a structurally invalid template", () => {
    const broken = template({ totalHours: 999 });
    expect(selectTemplate([broken], "cap-1", 2)).toBeNull();
  });

  // The DPS catalogue is real organizational content and is not fabricated.
  it("provides structure without inventing curriculum when no template fits", () => {
    const response = draftDevelopmentPlan(planning());
    expect(response.plan?.contentSource).toBe("structure_only");
    expect(response.plan?.templateId).toBeNull();
    expect(
      response.uncertainties.some((u) => u.topic === "No approved template"),
    ).toBe(true);
    expect(
      response.activities.filter((a) => a.title.includes("to be supplied")).length,
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// UNIT — success criteria are the upgrade conditions, not prose beside them
// ===========================================================================
describe("unit: success criteria", () => {
  /** A plan state that satisfies every criterion the draft states. */
  function satisfyingState(over: {
    planApproved?: boolean;
    activities?: readonly PlanActivity[];
    validatedEvidenceIds?: readonly string[];
  } = {}) {
    const activities: readonly PlanActivity[] = over.activities ?? [
      { id: "a1", activityType: "learn", estimatedHours: 5, status: "completed", hasValidatedEvidence: false },
      { id: "a2", activityType: "assignment", estimatedHours: 10, status: "completed", hasValidatedEvidence: true },
      { id: "a3", activityType: "assessment", estimatedHours: 5, status: "completed", hasValidatedEvidence: true },
    ];
    return {
      planApproved: over.planApproved ?? true,
      activities,
      currentLevel: 1,
      targetLevel: 2,
      validatedEvidenceIds: over.validatedEvidenceIds ?? ["ev-1"],
    };
  }

  it("names a real upgrade blocker for every criterion", () => {
    const response = draftDevelopmentPlan(planning());
    expect(response.successCriteria.length).toBeGreaterThan(0);
    for (const criterion of response.successCriteria) {
      expect(criterion.removesBlocker, criterion.id).toBeTruthy();
      expect(criterion.measuredBy.length).toBeGreaterThan(0);
    }
  });

  // The criteria are not a description of the system, they are the system's
  // own conditions: meeting all of them is exactly what makes an upgrade
  // proposable.
  it("is exactly eligibility: satisfying every criterion clears every blocker", () => {
    const evaluation = evaluateCapabilityUpgrade(satisfyingState());
    expect(evaluation.blockers).toEqual([]);
    expect(evaluation.eligibleToPropose).toBe(true);
    expect(evaluation.requiresHumanApproval).toBe(true);
  });

  it("raises the matching blocker when any single criterion is broken", () => {
    const response = draftDevelopmentPlan(planning());
    const stated = new Set(response.successCriteria.map((c) => c.removesBlocker));

    const breakages = [
      {
        blocker: "PLAN_NOT_APPROVED" as const,
        state: satisfyingState({ planApproved: false }),
      },
      {
        blocker: "PLAN_NOT_COMPLETE" as const,
        state: satisfyingState({
          activities: [
            { id: "a1", activityType: "assignment", estimatedHours: 10, status: "in_progress", hasValidatedEvidence: false },
            { id: "a2", activityType: "assessment", estimatedHours: 5, status: "completed", hasValidatedEvidence: true },
          ],
        }),
      },
      {
        blocker: "NO_APPLIED_ACTIVITY_COMPLETED" as const,
        state: satisfyingState({
          activities: [
            { id: "a1", activityType: "learn", estimatedHours: 5, status: "completed", hasValidatedEvidence: false },
            { id: "a2", activityType: "coaching", estimatedHours: 5, status: "completed", hasValidatedEvidence: false },
          ],
        }),
      },
      {
        blocker: "NO_ASSESSMENT_COMPLETED" as const,
        state: satisfyingState({
          activities: [
            { id: "a1", activityType: "assignment", estimatedHours: 10, status: "completed", hasValidatedEvidence: true },
          ],
        }),
      },
      {
        blocker: "NO_VALIDATED_EVIDENCE" as const,
        state: satisfyingState({ validatedEvidenceIds: [] }),
      },
    ];

    for (const { blocker, state } of breakages) {
      expect(stated.has(blocker), `criterion for ${blocker}`).toBe(true);
      const evaluation = evaluateCapabilityUpgrade(state);
      expect(evaluation.blockers, blocker).toContain(blocker);
      expect(evaluation.eligibleToPropose, blocker).toBe(false);
    }
  });

  // Completing a plan makes an upgrade proposable, never automatic.
  it("never yields a level to apply, only one to propose", () => {
    const evaluation = evaluateCapabilityUpgrade(satisfyingState());
    expect(evaluation.claimKind).toBe("RECOMMENDATION");
    expect(evaluation.requiresHumanApproval).toBe(true);
  });
});

// ===========================================================================
// UNIT — approval and persistence
// ===========================================================================
describe("unit: approval is never optional", () => {
  it("requires approval even when no plan was drafted", () => {
    const response = draftDevelopmentPlan(
      planning({
        gap: {
          capabilityId: "cap-1",
          capabilityName: "Cloud Architecture",
          requiredLevel: 1,
          sourceRequirementId: "req-1",
          currentProvenLevel: 4,
          claimedLevel: 4,
        },
      }),
    );
    expect(response.plan).toBeNull();
    expect(response.approvalRequired.required).toBe(true);
    expect(response.approvalRequired.whatWouldBeCommitted).toEqual([]);
  });

  it("names what a human would be committing to", () => {
    const response = draftDevelopmentPlan(planning());
    const committed = response.approvalRequired.whatWouldBeCommitted.join(" ");
    expect(committed).toContain("Ayu");
    expect(committed).toContain("Cloud Architecture");
    expect(committed).toMatch(/20 hour/);
  });

  // TALENT holds development.create and development.update but not approve.
  it("excludes the person themselves from the approver roles", () => {
    expect(DEVELOPMENT_APPROVER_ROLES).not.toContain("TALENT");
    expect(DEVELOPMENT_APPROVER_ROLES).toContain("MANAGER");
    expect(DEVELOPMENT_APPROVER_ROLES).toContain("CHAPTER_LEAD");
  });

  it("writes nothing, and says so in the type", () => {
    const response = draftDevelopmentPlan(planning());
    expect(response.persisted).toBe(false);
    expect(response.plan?.persisted).toBe(false);
    expect(response.plan?.status).toBe("draft");
    expect(response.plan?.claimKind).toBe("RECOMMENDATION");
  });
});

// ===========================================================================
// AUTHORIZATION — what the agent cannot do
// ===========================================================================
describe("authorization: agent boundaries", () => {
  it("declares only read-only LOW-risk tools, including the drafting one", () => {
    for (const tool of DEVELOPMENT_AGENT_TOOLS) {
      expect(tool.riskLevel, tool.name).toBe("LOW");
      expect(tool.requiresConfirmation, tool.name).toBe(false);
      expect(tool.reversible, tool.name).toBe(true);
    }
  });

  it("registers no tool that commits, approves, enrols or completes anything", () => {
    const forbidden =
      /write|create|save|commit|approve|enrol|enroll|assign|validat|complete|delete|update|export|upgrade/i;
    for (const tool of DEVELOPMENT_AGENT_TOOLS) {
      expect(tool.name, tool.name).not.toMatch(forbidden);
    }
  });

  // development.read and development.create/approve are separate permissions
  // precisely so that reading a plan never implies committing one.
  it("requests read permissions without create or approve", () => {
    const requested = [
      ...DEVELOPMENT_AGENT.requiredPermissions,
      ...DEVELOPMENT_AGENT_TOOLS.flatMap((t) => t.requiredPermissions),
    ];
    expect(requested).toContain("development.read");
    expect(requested).not.toContain("development.create");
    expect(requested).not.toContain("development.update");
    expect(requested).not.toContain("development.approve");
    expect(requested).not.toContain("development.submit_evidence");
    expect(requested).not.toContain("capability.assess");
  });

  // A model that can state the required level can manufacture the gap that
  // justifies the plan it drafts.
  it("accepts no required level as a tool argument", () => {
    for (const tool of DEVELOPMENT_AGENT_TOOLS) {
      const properties = Object.keys(tool.inputSchema.properties);
      for (const property of properties) {
        expect(property, `${tool.name}.${property}`).not.toMatch(/level|gap|required|hours|target/i);
      }
    }
  });

  it("declares no tool outside its own set", () => {
    const registered = DEVELOPMENT_AGENT_TOOLS.map((t) => t.name);
    expect([...DEVELOPMENT_AGENT.tools].sort()).toEqual([...registered].sort());
  });

  it("recognises forbidden requests, including paraphrases with filler words", () => {
    expect(isForbiddenAction("please approve the development plan for Budi")).toBe(true);
    expect(isForbiddenAction("just commit this development plan")).toBe(true);
    expect(isForbiddenAction("enrol this talent on the sprint")).toBe(true);
    expect(isForbiddenAction("go ahead and upgrade the capability level")).toBe(true);
    expect(isForbiddenAction("what would a plan for this gap look like?")).toBe(false);
  });

  it("tells the model plainly that nothing it drafts is saved", () => {
    const prompt = DEVELOPMENT_AGENT.systemPrompt.toLowerCase();
    expect(prompt).toContain("nothing you produce is saved");
    expect(prompt).toContain("cannot approve their own plan");
    expect(prompt).toContain("invent curriculum");
    for (const role of DEVELOPMENT_APPROVER_ROLES) {
      expect(DEVELOPMENT_AGENT.systemPrompt).toContain(role);
    }
    for (const action of FORBIDDEN_DEVELOPMENT_ACTIONS) {
      expect(DEVELOPMENT_AGENT.systemPrompt).toContain(action);
    }
  });
});

// ===========================================================================
// INTEGRATION — the agent's tools through the governed pipeline
// ===========================================================================
describe("integration: tools through the pipeline", () => {
  function registry(): ToolRegistry {
    const r = new ToolRegistry();
    registerDevelopmentTools(r);
    return r;
  }

  function auth(over: Partial<AgentAuthContext> = {}): AgentAuthContext {
    return {
      userId: "u1",
      email: "u1@telkom.test",
      organizationIds: ["org-1"],
      squadIds: [],
      roles: ["MANAGER"],
      permissions: [
        "development.read",
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
      allowedTools: [...DEVELOPMENT_AGENT.tools],
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
    registerDevelopmentTools(r);
    expect(r.size).toBe(3);
  });

  it("denies a call missing development.read", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_development_templates", arguments: {} },
      options(registry(), { auth: auth({ permissions: ["ai.use"] }) }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Missing permission/);
  });

  it("denies drafting to a caller who may read development but not people", async () => {
    const record = await executeToolCall(
      { toolName: "draft_development_plan", arguments: { talentId: UUID, capabilityId: UUID } },
      options(registry(), {
        auth: auth({ permissions: ["development.read", "capability.read", "ai.use"] }),
      }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/talent\.read/);
  });

  it("denies a malformed talent id before any query runs", async () => {
    const record = await executeToolCall(
      { toolName: "draft_development_plan", arguments: { talentId: MALFORMED_ID, capabilityId: UUID } },
      options(registry()),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/must be a UUID/);
  });

  it("denies an unknown argument rather than ignoring it", async () => {
    const record = await executeToolCall(
      {
        toolName: "draft_development_plan",
        arguments: { talentId: UUID, capabilityId: UUID, requiredLevel: 5 },
      },
      options(registry()),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown argument: requiredLevel/);
  });

  it("denies an approval tool that does not exist", async () => {
    const record = await executeToolCall(
      { toolName: "approve_development_plan", arguments: {} },
      options(registry(), { allowedTools: ["approve_development_plan"] }),
    );
    // Not registered: denied, never attempted.
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown tool/);
  });

  it("permits an AI identity to use the read-only tools", async () => {
    const record = await executeToolCall(
      { toolName: "retrieve_development_templates", arguments: {} },
      options(registry(), { auth: auth({ isAiService: true }) }),
    );
    expect(record.status).not.toBe("denied");
  });

  it("fails rather than fabricates when no database exists", async () => {
    const record = await executeToolCall(
      { toolName: "draft_development_plan", arguments: { talentId: UUID, capabilityId: UUID } },
      options(registry()),
    );
    // An honest failure, never a plausible draft built on nothing.
    expect(record.status).toBe("failed");
    expect(record.result).toBeNull();
  });
});
