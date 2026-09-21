import "server-only";

/**
 * Capability Agent tools.
 *
 * Three tools, all LOW risk and READ-ONLY. There is deliberately no tool to
 * assess a level, validate evidence, upgrade a capability, certify anyone, or
 * export a matrix. The agent cannot do those things because no tool exists
 * through which it could, and the registry is closed so it cannot name one
 * into being.
 *
 * `capability.assess` and `capability.validate_evidence` are separate
 * permissions from `capability.read` precisely so that reading capability
 * state never implies changing it (CLAUDE.md §6). This agent requests only
 * the read.
 *
 * Every read runs through the caller's RLS-scoped client, so "no unauthorized
 * data access" is enforced by the database rather than by this file — the
 * agent simply never sees what it is not entitled to.
 */

import { canAccessTalent } from "@/lib/auth/authorize";
import {
  getCapabilityHolders,
  getTalentCapabilityDetail,
  listCapabilityRequirements,
} from "@/lib/capability/queries";
import { analyzeCapability } from "@/agents/capability/analysis";
import type { ToolDefinition, JsonSchema } from "@/agents/core/types";
import type { DataPoint } from "@/types/data";

/**
 * Optional scope filter.
 *
 * Narrowing only. A scope id the caller cannot see returns nothing, because
 * RLS filters rows before the query result reaches the handler — the filter
 * selects within the caller's scope and can never reach outside it.
 */
const SCOPE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    organizationId: {
      type: "string",
      format: "uuid",
      description: "Limit to requirements defined for this organization.",
    },
    squadId: {
      type: "string",
      format: "uuid",
      description: "Limit to requirements defined for this squad.",
    },
    projectId: {
      type: "string",
      format: "uuid",
      description: "Limit to requirements defined for this project.",
    },
    roleName: {
      type: "string",
      maxLength: 120,
      description: "Limit to requirements defined for this role name.",
    },
  },
  required: [],
  additionalProperties: false,
};

const TALENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    talentId: {
      type: "string",
      format: "uuid",
      description: "Profile id of the person whose capability profile is read.",
    },
  },
  required: ["talentId"],
  additionalProperties: false,
};

const EMPTY_OUTPUT: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

interface ScopeArgs {
  organizationId?: string;
  squadId?: string;
  projectId?: string;
  roleName?: string;
}

function scopeLabel(args: ScopeArgs): string {
  if (args.projectId) return `project ${args.projectId}`;
  if (args.squadId) return `squad ${args.squadId}`;
  if (args.organizationId) return `organization ${args.organizationId}`;
  if (args.roleName) return `role ${args.roleName}`;
  return "your authorized scope";
}

/**
 * Turns a non-live DataPoint into an explicit error.
 *
 * "Restricted", "not connected" and "failed" are different facts and none of
 * them is an empty result. Collapsing them into `[]` would let the model
 * narrate a permissions failure or a missing database as "no capability gaps
 * found", which is the fabricated-success failure mode CLAUDE.md §16 forbids.
 */
function describeUnavailable(point: Exclude<DataPoint<unknown>, { state: "live" } | { state: "empty" }>): string {
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

export const retrieveCapabilityRequirements: ToolDefinition<ScopeArgs, unknown> = {
  name: "retrieve_capability_requirements",
  description:
    "Retrieves the required capability levels defined for an organization, squad, project or role within the caller's scope.",
  inputSchema: SCOPE_SCHEMA,
  outputSchema: EMPTY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["capability.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    const result = await listCapabilityRequirements(args);
    if (result.state === "live") {
      return { ok: true, result: { requirements: result.value } };
    }
    if (result.state === "empty") {
      return {
        ok: true,
        result: {
          requirements: [],
          note: `No capability requirements are defined within ${scopeLabel(args)}.`,
        },
      };
    }
    return { ok: false, error: describeUnavailable(result) };
  },
};

export const retrieveTalentCapabilities: ToolDefinition<
  { talentId: string },
  unknown
> = {
  name: "retrieve_talent_capabilities",
  description:
    "Retrieves one authorized person's capability profile, with claimed level, proven level and the evidence behind each.",
  inputSchema: TALENT_SCHEMA,
  outputSchema: EMPTY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["capability.read", "talent.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    // Second check alongside RLS. RLS would return nothing anyway; this
    // produces an explicit denial the agent can report, rather than an empty
    // result the model might narrate as "this person has no capabilities".
    const decision = await canAccessTalent(args.talentId, "CONFIDENTIAL");
    if (!decision.allowed) return { ok: false, error: decision.detail };

    const result = await getTalentCapabilityDetail(args.talentId);
    if (result.state === "live") {
      return { ok: true, result: { capabilities: result.value } };
    }
    if (result.state === "empty") {
      return {
        ok: true,
        result: {
          capabilities: [],
          note: "No capability records exist for this person.",
        },
      };
    }
    return { ok: false, error: describeUnavailable(result) };
  },
};

export const analyzeCapabilityGaps: ToolDefinition<ScopeArgs, unknown> = {
  name: "analyze_capability_gaps",
  description:
    "Calculates capability gaps (required level minus proven level) for the caller's scope, with affected talent, evidence, priority factors and development recommendations.",
  inputSchema: SCOPE_SCHEMA,
  outputSchema: EMPTY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["capability.read", "talent.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    const requirements = await listCapabilityRequirements(args);

    if (requirements.state === "empty") {
      return {
        ok: true,
        result: analyzeCapability({
          requirements: [],
          talent: [],
          scopeLabel: scopeLabel(args),
        }),
      };
    }
    if (requirements.state !== "live") {
      return { ok: false, error: describeUnavailable(requirements) };
    }

    const holders = await getCapabilityHolders(
      [...new Set(requirements.value.map((r) => r.capabilityId))],
    );
    if (holders.state !== "live" && holders.state !== "empty") {
      return { ok: false, error: describeUnavailable(holders) };
    }

    // The analysis itself is deterministic TypeScript, run here rather than
    // by the model, so a reported gap is reproducible from the same rows and
    // can be defended in a development budget conversation.
    return {
      ok: true,
      result: analyzeCapability({
        requirements: requirements.value.map((r) => ({
          requirementId: r.requirementId,
          capabilityId: r.capabilityId,
          capabilityName: r.capabilityName,
          requiredLevel: r.requiredLevel,
          criticality: r.criticality,
          urgency: r.urgency,
          scope: r.scope,
        })),
        talent: holders.state === "live" ? holders.value : [],
        scopeLabel: scopeLabel(args),
      }),
    };
  },
};

export const CAPABILITY_AGENT_TOOLS = [
  retrieveCapabilityRequirements,
  retrieveTalentCapabilities,
  analyzeCapabilityGaps,
] as const;

/** Registers this agent's tools. Idempotent per process. */
export function registerCapabilityTools(registry: {
  has: (name: string) => boolean;
  register: (tool: ToolDefinition<never, unknown>) => void;
}): void {
  for (const tool of CAPABILITY_AGENT_TOOLS) {
    if (registry.has(tool.name)) continue;
    registry.register(tool as unknown as ToolDefinition<never, unknown>);
  }
}
