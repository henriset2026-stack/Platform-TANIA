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
import { draftDevelopmentPlan } from "@/agents/development/planning";
import type { ToolDefinition, JsonSchema } from "@/agents/core/types";
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

const EMPTY_OUTPUT: JsonSchema = {
  type: "object",
  properties: {},
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
  outputSchema: EMPTY_OUTPUT,
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
  outputSchema: EMPTY_OUTPUT,
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
  outputSchema: EMPTY_OUTPUT,
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
