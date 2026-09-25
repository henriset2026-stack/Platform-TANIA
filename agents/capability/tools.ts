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
import { CRITICALITY_WEIGHT, URGENCY_WEIGHT } from "@/lib/calculations/capability";
import { analyzeCapability } from "@/agents/capability/analysis";
import { DEVELOPMENT_APPROACH_LABEL } from "@/agents/capability/contract";
import type { ToolDefinition, JsonSchema, JsonSchemaProperty } from "@/agents/core/types";
import { CLAIM_KINDS } from "@/types/claim";
import type { DataPoint } from "@/types/data";
import { CAPABILITY_STATUSES } from "@/types/status";

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

// ===========================================================================
// Output schemas
//
// The pipeline validates every handler result against these, rejecting
// unknown keys at any depth. Each one mirrors the TypeScript type the handler
// returns — CapabilityRequirementRow, TalentCapabilityDetail and
// CapabilityAnalysis — so a query that starts returning a new column fails
// loudly instead of silently widening what reaches the model.
//
// Discriminated unions (RequirementScope, GapBasis) cannot be expressed in
// this schema subset, so each is declared as one object whose variant fields
// are all optional and whose `kind` is required.
// ===========================================================================

const CRITICALITY_ENUM = Object.keys(CRITICALITY_WEIGHT);
const URGENCY_ENUM = Object.keys(URGENCY_WEIGHT);

const REQUIREMENT_SCOPE_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["organization", "squad", "project", "role"] },
    id: { type: "string" },
    roleName: { type: "string" },
  },
  required: ["kind"],
};

const CAPABILITY_REQUIREMENT_ROW_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    requirementId: { type: "string" },
    capabilityId: { type: "string" },
    capabilityName: { type: "string" },
    requiredLevel: { type: "integer" },
    criticality: { type: "string", enum: CRITICALITY_ENUM },
    urgency: { type: "string", enum: URGENCY_ENUM },
    scope: REQUIREMENT_SCOPE_OUTPUT,
    headcountRequired: { type: "integer", nullable: true },
  },
  required: [
    "requirementId",
    "capabilityId",
    "capabilityName",
    "requiredLevel",
    "criticality",
    "urgency",
    "scope",
    "headcountRequired",
  ],
};

const REQUIREMENTS_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    requirements: { type: "array", items: CAPABILITY_REQUIREMENT_ROW_OUTPUT },
    note: { type: "string" },
  },
  required: ["requirements"],
  additionalProperties: false,
};

const TALENT_CAPABILITY_DETAIL_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    id: { type: "string" },
    capabilityId: { type: "string" },
    capabilityName: { type: "string" },
    domainName: { type: "string" },
    claimedLevel: { type: "integer" },
    provenLevel: { type: "integer" },
    proven: { type: "boolean" },
    provenReason: { type: "string" },
    targetLevel: { type: "integer", nullable: true },
    requiredLevel: { type: "integer", nullable: true },
    gap: { type: "integer", nullable: true },
    status: { type: "string", enum: CAPABILITY_STATUSES, nullable: true },
    assessmentStatus: { type: "string" },
    evidenceCount: { type: "integer" },
    validatedEvidenceCount: { type: "integer" },
  },
  required: [
    "id",
    "capabilityId",
    "capabilityName",
    "domainName",
    "claimedLevel",
    "provenLevel",
    "proven",
    "provenReason",
    "targetLevel",
    "requiredLevel",
    "gap",
    "status",
    "assessmentStatus",
    "evidenceCount",
    "validatedEvidenceCount",
  ],
};

const TALENT_CAPABILITIES_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    capabilities: { type: "array", items: TALENT_CAPABILITY_DETAIL_OUTPUT },
    note: { type: "string" },
  },
  required: ["capabilities"],
  additionalProperties: false,
};

const EVIDENCE_REF_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    evidenceId: { type: "string" },
    talentCapabilityId: { type: "string" },
    capabilityId: { type: "string" },
    sourceType: { type: "string" },
    validationStatus: { type: "string" },
    demonstratesApplication: { type: "boolean" },
    occurredAt: { type: "string", nullable: true },
    claimKind: { type: "string", enum: CLAIM_KINDS },
  },
  required: [
    "evidenceId",
    "talentCapabilityId",
    "capabilityId",
    "sourceType",
    "validationStatus",
    "demonstratesApplication",
    "occurredAt",
    "claimKind",
  ],
};

const REQUIREMENT_REF_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    requirementId: { type: "string" },
    capabilityId: { type: "string" },
    requiredLevel: { type: "integer" },
    scope: REQUIREMENT_SCOPE_OUTPUT,
  },
  required: ["requirementId", "capabilityId", "requiredLevel", "scope"],
};

/** GapBasis: `evidenceRefs` on evidenced / certification_only, `requirement` on unevidenced. */
const GAP_BASIS_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["evidenced", "certification_only", "unevidenced"] },
    evidenceRefs: { type: "array", items: EVIDENCE_REF_OUTPUT },
    requirement: REQUIREMENT_REF_OUTPUT,
  },
  required: ["kind"],
};

const PRIORITY_FACTORS_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    magnitude: { type: "integer" },
    businessCriticality: { type: "string", enum: CRITICALITY_ENUM },
    criticalityWeight: { type: "number" },
    timeUrgency: { type: "string", enum: URGENCY_ENUM },
    urgencyWeight: { type: "number" },
    score: { type: "number" },
    index: { type: "number" },
    formula: { type: "string" },
  },
  required: [
    "magnitude",
    "businessCriticality",
    "criticalityWeight",
    "timeUrgency",
    "urgencyWeight",
    "score",
    "index",
    "formula",
  ],
};

const AFFECTED_TALENT_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    talentId: { type: "string" },
    displayName: { type: "string" },
    claimedLevel: { type: "integer" },
    provenLevel: { type: "integer" },
    gap: { type: "integer" },
    proven: { type: "boolean" },
    provenReason: { type: "string" },
    evidenceRefs: { type: "array", items: EVIDENCE_REF_OUTPUT },
  },
  required: [
    "talentId",
    "displayName",
    "claimedLevel",
    "provenLevel",
    "gap",
    "proven",
    "provenReason",
    "evidenceRefs",
  ],
};

const GAP_FINDING_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    id: { type: "string" },
    capabilityId: { type: "string" },
    capabilityName: { type: "string" },
    requirement: REQUIREMENT_REF_OUTPUT,
    requiredLevel: { type: "integer" },
    provenLevel: { type: "integer" },
    claimedLevel: { type: "integer" },
    gap: { type: "integer" },
    magnitude: { type: "integer" },
    status: { type: "string", enum: CAPABILITY_STATUSES },
    basis: GAP_BASIS_OUTPUT,
    priority: PRIORITY_FACTORS_OUTPUT,
    affectedTalent: {
      type: "object",
      properties: {
        talent: { type: "array", items: AFFECTED_TALENT_OUTPUT },
        visibleCount: { type: "integer" },
        scopeLimited: { type: "boolean" },
      },
      required: ["talent", "visibleCount", "scopeLimited"],
    },
    claimKind: { type: "string", enum: ["ANALYSIS"] },
  },
  required: [
    "id",
    "capabilityId",
    "capabilityName",
    "requirement",
    "requiredLevel",
    "provenLevel",
    "claimedLevel",
    "gap",
    "magnitude",
    "status",
    "basis",
    "priority",
    "affectedTalent",
    "claimKind",
  ],
};

const UNCERTAINTY_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    topic: { type: "string" },
    reason: { type: "string" },
    resolvedBy: { type: "string" },
  },
  required: ["topic", "reason", "resolvedBy"],
};

const DEVELOPMENT_RECOMMENDATION_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    id: { type: "string" },
    capabilityId: { type: "string" },
    capabilityName: { type: "string" },
    title: { type: "string" },
    approach: { type: "string", enum: Object.keys(DEVELOPMENT_APPROACH_LABEL) },
    rationale: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high"] },
    basis: GAP_BASIS_OUTPUT,
    priorityFactors: PRIORITY_FACTORS_OUTPUT,
    claimKind: { type: "string", enum: ["RECOMMENDATION"] },
    requiresHumanDecision: { type: "boolean" },
  },
  required: [
    "id",
    "capabilityId",
    "capabilityName",
    "title",
    "approach",
    "rationale",
    "priority",
    "basis",
    "priorityFactors",
    "claimKind",
    "requiresHumanDecision",
  ],
};

/** CapabilityAnalysis — the result of analyzeCapability(), on every path. */
const CAPABILITY_ANALYSIS_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    gaps: { type: "array", items: GAP_FINDING_OUTPUT },
    evidence: { type: "array", items: EVIDENCE_REF_OUTPUT },
    uncertainties: { type: "array", items: UNCERTAINTY_OUTPUT },
    recommendations: { type: "array", items: DEVELOPMENT_RECOMMENDATION_OUTPUT },
    scope: { type: "string" },
    requirementCount: { type: "integer" },
    evidenceCount: { type: "integer" },
    unprovenRequirementCount: { type: "integer" },
    generatedAt: { type: "string", format: "date-time" },
    upgradesCapability: { type: "boolean" },
    isCapabilityAssessment: { type: "boolean" },
  },
  required: [
    "summary",
    "gaps",
    "evidence",
    "uncertainties",
    "recommendations",
    "scope",
    "requirementCount",
    "evidenceCount",
    "unprovenRequirementCount",
    "generatedAt",
    "upgradesCapability",
    "isCapabilityAssessment",
  ],
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
  outputSchema: REQUIREMENTS_OUTPUT,
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
  outputSchema: TALENT_CAPABILITIES_OUTPUT,
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
  outputSchema: CAPABILITY_ANALYSIS_OUTPUT,
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
