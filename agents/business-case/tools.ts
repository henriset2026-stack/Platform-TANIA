import "server-only";

/**
 * Business Case Agent tools. All LOW risk and read-only.
 *
 * There is no tool that fetches market or pricing data, because no such
 * source is integrated. A tool that returned plausible figures from an
 * unintegrated system would be the single most damaging thing in this
 * codebase: financial figures are believed in proportion to their precision.
 *
 * Financial inputs therefore arrive as assumptions from a human, or from the
 * budget records TANIA actually holds — which today report themselves as
 * not-integrated, and say so rather than returning zero.
 */

import { listProjects } from "@/lib/project/queries";
import { describeUnavailable, PROJECT_ROW_OUTPUT } from "@/agents/product/tools";
import type { ToolDefinition, JsonSchema } from "@/agents/core/types";

const EMPTY_INPUT: JsonSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

/**
 * Validated by the pipeline, unknown keys rejected at any depth. The project
 * row shape is shared with the Product Agent, which returns the same
 * ProjectListRow records.
 */
const FINANCIAL_CONTEXT_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    projects: { type: "array", items: PROJECT_ROW_OUTPUT },
    unavailableSources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          system: { type: "string" },
          provides: { type: "string" },
          consequence: { type: "string" },
        },
        required: ["system", "provides", "consequence"],
      },
    },
  },
  required: ["projects", "unavailableSources"],
  additionalProperties: false,
};

/**
 * Internal financial context.
 *
 * Returns the projects the caller can see, so a case can be compared against
 * work already under way. It does NOT return revenue or market figures: TANIA
 * does not hold them, and the absence is reported rather than filled.
 */
export const retrieveFinancialContext: ToolDefinition<
  Record<string, never>,
  unknown
> = {
  name: "retrieve_financial_context",
  description:
    "Retrieves the projects visible to the caller as internal context for a business case, and states which external financial systems are unavailable.",
  inputSchema: EMPTY_INPUT,
  outputSchema: FINANCIAL_CONTEXT_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["project.read", "business_impact.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async () => {
    const projects = await listProjects();
    if (projects.state !== "live" && projects.state !== "empty") {
      return { ok: false, error: describeUnavailable(projects) };
    }

    return {
      ok: true,
      result: {
        projects: projects.state === "live" ? projects.value : [],
        // Named explicitly so the model cannot treat their absence as a
        // reason to supply the figures itself.
        unavailableSources: [
          {
            system: "SAP / finance system",
            provides: "committed and realized spend, actual revenue",
            consequence:
              "Cost and revenue actuals must come from a human with access; they are not in TANIA.",
          },
          {
            system: "Market research",
            provides: "market size, growth, competitor pricing",
            consequence:
              "No market figure may be stated unless it comes from a document or a named person.",
          },
          {
            system: "CRM",
            provides: "customer counts, pipeline, win rates",
            consequence: "Customer numbers must be sourced, never estimated.",
          },
        ],
      },
    };
  },
};

export const BUSINESS_CASE_AGENT_TOOLS = [retrieveFinancialContext] as const;

export function registerBusinessCaseTools(registry: {
  has: (name: string) => boolean;
  register: (tool: ToolDefinition<never, unknown>) => void;
}): void {
  for (const tool of BUSINESS_CASE_AGENT_TOOLS) {
    if (registry.has(tool.name)) continue;
    registry.register(tool as unknown as ToolDefinition<never, unknown>);
  }
}
