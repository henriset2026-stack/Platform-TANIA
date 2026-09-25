import "server-only";

/**
 * Development Agent tools.
 *
 * Three tools, all LOW risk and READ-ONLY — including the drafting tool.
 *
 * `draft_development_plan` composes a plan and returns it. It writes nothing:
 * no development_plans row, no learning_path, no activity, no enrolment. That
 * is not a policy decision that could be revisited by raising its risk level,
 * because the registry refuses `allowedForAiService` above LOW, AI_SERVICE
 * holds no development.create, and migration 20260921090001 denies AI writes
 * at the database. A writing version of this tool would be denied at
 * execution, so shipping one would be fabricated capability.
 *
 * Note what the drafting tool does NOT accept: a required level. The gap is
 * derived from capability_requirements read under RLS, never from an argument.
 * A model that could state the required level could manufacture a gap, and a
 * manufactured gap justifies real spending on a real person's behalf.
 */

import { canAccessTalent } from "@/lib/auth/authorize";
import {
  getTalentCapabilityDetail,
  listCapabilityRequirements,
} from "@/lib/capability/queries";
import {
  getDevelopmentPlans,
  listDevelopmentTemplates,
} from "@/lib/development/queries";
import { getTalentIdentity } from "@/lib/talent/queries";
import {
  ACTIVITY_TYPES,
  SPRINT_PHASES,
  UPGRADE_BLOCKER_REASON,
} from "@/lib/calculations/development";
import { ACTIVITY_STAGES } from "@/agents/development/contract";
import { draftDevelopmentPlan } from "@/agents/development/planning";
import type { ToolDefinition, JsonSchema, JsonSchemaProperty } from "@/agents/core/types";
import type { DataPoint } from "@/types/data";

const TALENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    talentId: {
      type: "string",
      format: "uuid",
      description: "Profile id of the person whose development records are read.",
    },
  },
  required: ["talentId"],
  additionalProperties: false,
};

const DRAFT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    talentId: {
      type: "string",
      format: "uuid",
      description: "Profile id of the person the plan would be for.",
    },
    capabilityId: {
      type: "string",
      format: "uuid",
      description: "The capability whose gap the plan would close.",
    },
  },
  required: ["talentId", "capabilityId"],
  additionalProperties: false,
};

const EMPTY_INPUT: JsonSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

// ===========================================================================
// Output schemas
//
// The pipeline validates every handler result against these, rejecting
// unknown keys at any depth. Each mirrors the type its handler returns —
// DevelopmentTemplate, PlanSummary and DevelopmentPlanResponse — so a query
// that starts returning a new column fails loudly instead of silently
// widening what reaches the model.
// ===========================================================================

const UPGRADE_BLOCKER_ENUM = Object.keys(UPGRADE_BLOCKER_REASON);

const TEMPLATE_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    id: { type: "string" },
    code: { type: "string" },
    name: { type: "string" },
    methodology: { type: "string" },
    totalHours: { type: "number" },
    activities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sequenceNo: { type: "integer" },
          phase: { type: "string", enum: SPRINT_PHASES },
          title: { type: "string" },
          activityType: { type: "string", enum: ACTIVITY_TYPES },
          estimatedHours: { type: "number" },
          requiresEvidence: { type: "boolean" },
        },
        required: [
          "sequenceNo",
          "phase",
          "title",
          "activityType",
          "estimatedHours",
          "requiresEvidence",
        ],
      },
    },
    approved: { type: "boolean" },
    capabilityId: { type: "string", nullable: true },
    targetLevel: { type: "integer", nullable: true },
  },
  required: [
    "id",
    "code",
    "name",
    "methodology",
    "totalHours",
    "activities",
    "approved",
    "capabilityId",
    "targetLevel",
  ],
};

const TEMPLATES_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    templates: { type: "array", items: TEMPLATE_OUTPUT },
    note: { type: "string" },
  },
  required: ["templates"],
  additionalProperties: false,
};

const PLAN_SUMMARY_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    id: { type: "string" },
    profileId: { type: "string" },
    title: { type: "string" },
    status: { type: "string" },
    approved: { type: "boolean" },
    targetDate: { type: "string", nullable: true },
    capabilityId: { type: "string", nullable: true },
    capabilityName: { type: "string", nullable: true },
    progress: {
      type: "object",
      properties: {
        percent: { type: "number" },
        completedHours: { type: "number" },
        totalHours: { type: "number" },
        completedCount: { type: "integer" },
        totalCount: { type: "integer" },
      },
      required: ["percent", "completedHours", "totalHours", "completedCount", "totalCount"],
    },
    activities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          activityType: { type: "string", enum: ACTIVITY_TYPES },
          estimatedHours: { type: "number" },
          status: { type: "string", enum: ["planned", "in_progress", "completed", "skipped"] },
          hasValidatedEvidence: { type: "boolean" },
        },
        required: ["id", "activityType", "estimatedHours", "status", "hasValidatedEvidence"],
      },
    },
    validatedEvidenceIds: { type: "array", items: { type: "string" } },
    upgrade: {
      type: "object",
      nullable: true,
      properties: {
        eligibleToPropose: { type: "boolean" },
        blockers: { type: "array", items: { type: "string", enum: UPGRADE_BLOCKER_ENUM } },
        currentLevel: { type: "integer" },
        proposedLevel: { type: "integer", nullable: true },
        requiresHumanApproval: { type: "boolean" },
        claimKind: { type: "string", enum: ["RECOMMENDATION"] },
        supportingEvidenceIds: { type: "array", items: { type: "string" } },
      },
      required: [
        "eligibleToPropose",
        "blockers",
        "currentLevel",
        "proposedLevel",
        "requiresHumanApproval",
        "claimKind",
        "supportingEvidenceIds",
      ],
    },
  },
  required: [
    "id",
    "profileId",
    "title",
    "status",
    "approved",
    "targetDate",
    "capabilityId",
    "capabilityName",
    "progress",
    "activities",
    "validatedEvidenceIds",
    "upgrade",
  ],
};

const PLANS_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    plans: { type: "array", items: PLAN_SUMMARY_OUTPUT },
    note: { type: "string" },
  },
  required: ["plans"],
  additionalProperties: false,
};

/**
 * DevelopmentPlanResponse.
 *
 * Only `plan`, `notDraftedReason` and `persisted` are required: the handler's
 * own "no requirement defined" path returns just those three, while
 * draftDevelopmentPlan() always returns the full response.
 */
const DRAFT_PLAN_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    plan: {
      type: "object",
      nullable: true,
      properties: {
        title: { type: "string" },
        objective: { type: "string" },
        capabilityId: { type: "string" },
        capabilityName: { type: "string" },
        currentProvenLevel: { type: "integer" },
        targetLevel: { type: "integer" },
        requiredLevel: { type: "integer" },
        remainingLevelsAfterPlan: { type: "integer" },
        sourceRequirementId: { type: "string" },
        totalHours: { type: "number" },
        templateId: { type: "string", nullable: true },
        contentSource: { type: "string", enum: ["approved_template", "structure_only"] },
        status: { type: "string", enum: ["draft"] },
        persisted: { type: "boolean" },
        claimKind: { type: "string", enum: ["RECOMMENDATION"] },
      },
      required: [
        "title",
        "objective",
        "capabilityId",
        "capabilityName",
        "currentProvenLevel",
        "targetLevel",
        "requiredLevel",
        "remainingLevelsAfterPlan",
        "sourceRequirementId",
        "totalHours",
        "templateId",
        "contentSource",
        "status",
        "persisted",
        "claimKind",
      ],
    },
    activities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sequenceNo: { type: "integer" },
          stage: { type: "string", enum: ACTIVITY_STAGES },
          phase: { type: "string", enum: SPRINT_PHASES },
          activityType: { type: "string", enum: ACTIVITY_TYPES },
          title: { type: "string" },
          estimatedHours: { type: "number" },
          requiresEvidence: { type: "boolean" },
        },
        required: [
          "sequenceNo",
          "stage",
          "phase",
          "activityType",
          "title",
          "estimatedHours",
          "requiresEvidence",
        ],
      },
    },
    expectedEvidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          activitySequenceNo: { type: "integer" },
          stage: { type: "string", enum: ACTIVITY_STAGES },
          evidenceType: { type: "string" },
          description: { type: "string" },
          demonstratesApplication: { type: "boolean" },
          validationRequired: { type: "boolean" },
        },
        required: [
          "activitySequenceNo",
          "stage",
          "evidenceType",
          "description",
          "demonstratesApplication",
          "validationRequired",
        ],
      },
    },
    successCriteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          statement: { type: "string" },
          measuredBy: { type: "string" },
          removesBlocker: { type: "string", enum: UPGRADE_BLOCKER_ENUM },
        },
        required: ["id", "statement", "measuredBy", "removesBlocker"],
      },
    },
    approvalRequired: {
      type: "object",
      properties: {
        required: { type: "boolean" },
        permission: { type: "string", enum: ["development.approve"] },
        approverRoles: { type: "array", items: { type: "string" } },
        whyRequired: { type: "string" },
        whatWouldBeCommitted: { type: "array", items: { type: "string" } },
      },
      required: ["required", "permission", "approverRoles", "whyRequired", "whatWouldBeCommitted"],
    },
    uncertainties: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          reason: { type: "string" },
          resolvedBy: { type: "string" },
        },
        required: ["topic", "reason", "resolvedBy"],
      },
    },
    notDraftedReason: { type: "string", nullable: true },
    generatedAt: { type: "string", format: "date-time" },
    persisted: { type: "boolean" },
  },
  required: ["plan", "notDraftedReason", "persisted"],
  additionalProperties: false,
};

/**
 * Turns a non-live DataPoint into an explicit error.
 *
 * "Restricted", "not connected" and "failed" are different facts and none of
 * them is an empty result. Collapsing them would let the model narrate a
 * permissions failure as "this person has no development plans".
 */
function describeUnavailable(
  point: Exclude<DataPoint<unknown>, { state: "live" } | { state: "empty" }>,
): string {
  switch (point.state) {
    case "restricted":
      return point.reason;
    case "failed":
      return point.reason;
    case "not-connected":
      return `No data source: requires ${point.requires}.`;
    case "not-integrated":
      return `${point.system} is not integrated.`;
  }
}

export const retrieveDevelopmentTemplates: ToolDefinition<
  Record<string, never>,
  unknown
> = {
  name: "retrieve_development_templates",
  description:
    "Retrieves the approved development templates, including the DPS 20-hour Capability Sprint, with their activities and hours.",
  inputSchema: EMPTY_INPUT,
  outputSchema: TEMPLATES_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["development.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async () => {
    const result = await listDevelopmentTemplates();
    if (result.state === "live") {
      return { ok: true, result: { templates: result.value } };
    }
    if (result.state === "empty") {
      return {
        ok: true,
        result: { templates: [], note: "No active development templates are defined." },
      };
    }
    return { ok: false, error: describeUnavailable(result) };
  },
};

export const retrieveDevelopmentPlans: ToolDefinition<
  { talentId: string },
  unknown
> = {
  name: "retrieve_development_plans",
  description:
    "Retrieves one authorized person's development plans, with progress and whether a capability upgrade may be proposed.",
  inputSchema: TALENT_SCHEMA,
  outputSchema: PLANS_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["development.read", "talent.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    // Development records are SENSITIVE, so the check uses that class rather
    // than the CONFIDENTIAL default. RLS would return nothing regardless;
    // this produces a denial the agent can report instead of an empty result
    // the model might narrate as "no development is planned for this person".
    const decision = await canAccessTalent(args.talentId, "SENSITIVE");
    if (!decision.allowed) return { ok: false, error: decision.detail };

    const result = await getDevelopmentPlans(args.talentId);
    if (result.state === "live") return { ok: true, result: { plans: result.value } };
    if (result.state === "empty") {
      return {
        ok: true,
        result: { plans: [], note: "This person has no development plans." },
      };
    }
    return { ok: false, error: describeUnavailable(result) };
  },
};

export const draftDevelopmentPlanTool: ToolDefinition<
  { talentId: string; capabilityId: string },
  unknown
> = {
  name: "draft_development_plan",
  description:
    "Composes a draft development plan that would close one authorized capability gap, and returns it for human approval. Writes nothing and enrols nobody.",
  inputSchema: DRAFT_SCHEMA,
  outputSchema: DRAFT_PLAN_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["development.read", "capability.read", "talent.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    const decision = await canAccessTalent(args.talentId, "SENSITIVE");
    if (!decision.allowed) return { ok: false, error: decision.detail };

    const identity = await getTalentIdentity(args.talentId);
    if (identity.state !== "live") {
      return {
        ok: false,
        error:
          identity.state === "empty"
            ? "No such person within your authorized scope."
            : describeUnavailable(identity),
      };
    }

    const capabilities = await getTalentCapabilityDetail(args.talentId);
    if (capabilities.state !== "live" && capabilities.state !== "empty") {
      return { ok: false, error: describeUnavailable(capabilities) };
    }

    const held =
      capabilities.state === "live"
        ? capabilities.value.find((row) => row.capabilityId === args.capabilityId)
        : undefined;

    // The required level comes from the requirement rows, never from the
    // caller and never from the person's own target_level: a self-set target
    // is not an organizational requirement, and treating it as one would let
    // anyone create a gap that justifies budget.
    const requirements = await listCapabilityRequirements();
    if (requirements.state !== "live" && requirements.state !== "empty") {
      return { ok: false, error: describeUnavailable(requirements) };
    }

    const requirement =
      requirements.state === "live"
        ? requirements.value
            .filter((row) => row.capabilityId === args.capabilityId)
            .sort((a, b) => b.requiredLevel - a.requiredLevel)[0]
        : undefined;

    if (!requirement) {
      return {
        ok: true,
        result: {
          plan: null,
          notDraftedReason:
            "No capability requirement is defined for this capability within your authorized scope, " +
            "so there is no required level to plan towards. Capability Gap = Required − Current, and " +
            "without a requirement there is no gap to close.",
          persisted: false,
        },
      };
    }

    const plans = await getDevelopmentPlans(args.talentId);
    if (plans.state !== "live" && plans.state !== "empty") {
      return { ok: false, error: describeUnavailable(plans) };
    }

    const templates = await listDevelopmentTemplates();
    if (templates.state !== "live" && templates.state !== "empty") {
      return { ok: false, error: describeUnavailable(templates) };
    }

    // Drafting is deterministic TypeScript, run here rather than by the
    // model, so the same records always produce the same plan and a manager
    // can see why each activity is in it.
    return {
      ok: true,
      result: draftDevelopmentPlan({
        talentDisplayName: identity.value.fullName,
        gap: {
          capabilityId: args.capabilityId,
          capabilityName: held?.capabilityName ?? requirement.capabilityName,
          requiredLevel: requirement.requiredLevel,
          sourceRequirementId: requirement.requirementId,
          // No record of the capability at all means nothing is proven.
          currentProvenLevel: held?.provenLevel ?? 1,
          claimedLevel: held?.claimedLevel ?? 1,
        },
        templates: templates.state === "live" ? templates.value : [],
        existingPlans:
          plans.state === "live"
            ? plans.value.map((plan) => ({
                id: plan.id,
                capabilityId: plan.capabilityId,
                status: plan.status,
                title: plan.title,
              }))
            : [],
      }),
    };
  },
};

export const DEVELOPMENT_AGENT_TOOLS = [
  retrieveDevelopmentTemplates,
  retrieveDevelopmentPlans,
  draftDevelopmentPlanTool,
] as const;

/** Registers this agent's tools. Idempotent per process. */
export function registerDevelopmentTools(registry: {
  has: (name: string) => boolean;
  register: (tool: ToolDefinition<never, unknown>) => void;
}): void {
  for (const tool of DEVELOPMENT_AGENT_TOOLS) {
    if (registry.has(tool.name)) continue;
    registry.register(tool as unknown as ToolDefinition<never, unknown>);
  }
}
