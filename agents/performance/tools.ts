import "server-only";

/**
 * Performance Agent tools.
 *
 * Every tool here is LOW risk and READ-ONLY. There is deliberately no tool to
 * write evidence, set a score, submit or approve a review, or export anything.
 * The agent cannot finalize a rating or make a promotion or disciplinary
 * decision because no tool exists through which it could, and the registry is
 * closed so it cannot name one into being.
 *
 * Each tool reads through the caller's RLS-scoped client, so "access
 * unauthorized talent records" is prevented by the database rather than by
 * this file — the agent simply sees nothing it is not entitled to.
 */

import { canAccessTalent } from "@/lib/auth/authorize";
import { getEvidenceTimeline, getPerformanceTrend } from "@/lib/performance/queries";
import { detectAnomalies } from "@/lib/calculations/anomaly";
import type { ToolDefinition, JsonSchema } from "@/agents/core/types";

const TALENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    talentId: {
      type: "string",
      format: "uuid",
      description: "Profile id of the person whose performance is being analysed.",
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

/**
 * Second authorization check, in addition to RLS.
 *
 * Performance data is SENSITIVE, so the check uses that class rather than the
 * CONFIDENTIAL default. RLS would return nothing anyway; this produces an
 * explicit denial the agent can report, instead of an empty result the model
 * might narrate as "this person has no performance issues".
 */
async function requireSensitiveAccess(talentId: string): Promise<string | null> {
  const decision = await canAccessTalent(talentId, "SENSITIVE");
  return decision.allowed ? null : decision.detail;
}

export const retrievePerformanceEvidence: ToolDefinition<
  { talentId: string },
  unknown
> = {
  name: "retrieve_performance_evidence",
  description:
    "Retrieves authorized performance evidence for one person, with source, validation status and claim kind.",
  inputSchema: TALENT_SCHEMA,
  outputSchema: EMPTY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["performance.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    const denial = await requireSensitiveAccess(args.talentId);
    if (denial) return { ok: false, error: denial };

    const result = await getEvidenceTimeline(args.talentId);
    if (result.state === "restricted") return { ok: false, error: result.reason };
    if (result.state === "failed") return { ok: false, error: result.reason };
    if (result.state === "not-connected") {
      return { ok: false, error: `No data source: requires ${result.requires}.` };
    }
    if (result.state === "not-integrated") {
      return { ok: false, error: `${result.system} is not integrated.` };
    }
    if (result.state === "empty") {
      return { ok: true, result: { evidence: [], note: "No evidence recorded." } };
    }

    return { ok: true, result: { evidence: result.value } };
  },
};

export const calculatePerformanceTrendTool: ToolDefinition<
  { talentId: string },
  unknown
> = {
  name: "calculate_performance_trend",
  description:
    "Calculates the trend of recorded performance metrics across periods for one authorized person.",
  inputSchema: TALENT_SCHEMA,
  outputSchema: EMPTY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["performance.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    const denial = await requireSensitiveAccess(args.talentId);
    if (denial) return { ok: false, error: denial };

    const result = await getPerformanceTrend(args.talentId);
    if (result.state === "live") return { ok: true, result: result.value };
    if (result.state === "empty") {
      return { ok: true, result: { points: [], direction: "unknown", change: null } };
    }
    return {
      ok: false,
      error:
        result.state === "restricted" || result.state === "failed"
          ? result.reason
          : "Performance metrics are unavailable.",
    };
  },
};

export const detectPerformanceAnomalies: ToolDefinition<
  { talentId: string },
  unknown
> = {
  name: "detect_performance_anomalies",
  description:
    "Identifies statistical outliers and sudden changes in an authorized person's performance evidence.",
  inputSchema: TALENT_SCHEMA,
  outputSchema: EMPTY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["performance.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    const denial = await requireSensitiveAccess(args.talentId);
    if (denial) return { ok: false, error: denial };

    const result = await getEvidenceTimeline(args.talentId);
    if (result.state !== "live") {
      if (result.state === "empty") return { ok: true, result: { anomalies: [] } };
      return {
        ok: false,
        error:
          result.state === "restricted" || result.state === "failed"
            ? result.reason
            : "Evidence is unavailable.",
      };
    }

    // Detection is deterministic statistics, run here rather than by the
    // model, so a flagged anomaly is reproducible and explainable.
    const anomalies = detectAnomalies(
      result.value
        .filter((e) => e.value !== null && e.occurredAt !== null)
        .map((e) => ({
          id: e.id,
          value: e.value!,
          occurredAt: e.occurredAt!,
          dimension: e.dimension,
        })),
    );

    return { ok: true, result: { anomalies } };
  },
};

export const PERFORMANCE_AGENT_TOOLS = [
  retrievePerformanceEvidence,
  calculatePerformanceTrendTool,
  detectPerformanceAnomalies,
] as const;

/** Registers this agent's tools. Idempotent per process. */
export function registerPerformanceTools(registry: {
  has: (name: string) => boolean;
  register: (tool: ToolDefinition<never, unknown>) => void;
}): void {
  for (const tool of PERFORMANCE_AGENT_TOOLS) {
    if (registry.has(tool.name)) continue;
    registry.register(tool as unknown as ToolDefinition<never, unknown>);
  }
}
