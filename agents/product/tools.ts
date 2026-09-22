import "server-only";

/**
 * Product Agent tools. All LOW risk and read-only.
 *
 * There is no tool that searches the open web, and that absence is the
 * point: a web-search tool would let the agent return material nobody
 * curated, under TANIA's name, as chapter research. Market evidence enters
 * through the knowledge base — documents someone loaded and scoped — or
 * through a human stating it in conversation, where it is recorded as their
 * claim rather than as a fact.
 */

import { listProjects, listFeasibilityAssessments } from "@/lib/project/queries";
import { retrieveAuthorizedChunks } from "@/lib/rag/retrieval";
import { embedQuery } from "@/lib/rag/embedding";
import type { ToolDefinition, JsonSchema } from "@/agents/core/types";
import type { DataPoint } from "@/types/data";

const EMPTY_INPUT: JsonSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

const QUERY_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      maxLength: 500,
      description: "What to look for in the authorized knowledge base.",
    },
  },
  required: ["query"],
  additionalProperties: false,
};

const EMPTY_OUTPUT: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

export function describeUnavailable(
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

export const retrieveProductContext: ToolDefinition<Record<string, never>, unknown> = {
  name: "retrieve_product_context",
  description:
    "Retrieves the projects and feasibility assessments visible to the caller, as internal context for a product analysis.",
  inputSchema: EMPTY_INPUT,
  outputSchema: EMPTY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["project.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async () => {
    const [projects, feasibility] = await Promise.all([
      listProjects(),
      listFeasibilityAssessments(),
    ]);

    if (projects.state !== "live" && projects.state !== "empty") {
      return { ok: false, error: describeUnavailable(projects) };
    }
    if (feasibility.state !== "live" && feasibility.state !== "empty") {
      return { ok: false, error: describeUnavailable(feasibility) };
    }

    return {
      ok: true,
      result: {
        projects: projects.state === "live" ? projects.value : [],
        feasibility: feasibility.state === "live" ? feasibility.value : [],
      },
    };
  },
};

/**
 * Searches the authorized knowledge base.
 *
 * Retrieval is scope-filtered in the database during the index scan, so this
 * is not a retrieve-then-filter path. Returned content is untrusted data:
 * injection signals observed in it are passed back for review rather than
 * stripped silently, because a document trying to instruct the agent is
 * something a human should see.
 */
export const searchProductKnowledge: ToolDefinition<{ query: string }, unknown> = {
  name: "search_product_knowledge",
  description:
    "Searches the authorized DPS knowledge base for product and market material, returning cited excerpts.",
  inputSchema: QUERY_SCHEMA,
  outputSchema: EMPTY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["ai.use"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async (args) => {
    const embedding = await embedQuery(args.query);
    if (embedding.state === "empty") {
      return { ok: false, error: "An empty query cannot be searched." };
    }
    if (embedding.state !== "live") {
      return { ok: false, error: describeUnavailable(embedding) };
    }

    const result = await retrieveAuthorizedChunks(embedding.value);
    if (result.state === "empty") {
      return {
        ok: true,
        result: {
          chunks: [],
          note:
            "Nothing in the authorized knowledge base matches. That is not evidence of absence in the market, " +
            "only absence from the corpus.",
        },
      };
    }
    if (result.state !== "live") {
      return { ok: false, error: describeUnavailable(result) };
    }

    return {
      ok: true,
      result: {
        chunks: result.value.chunks,
        injectionSignals: result.value.injectionSignals,
        searchedAt: result.value.searchedAt,
      },
    };
  },
};

export const PRODUCT_AGENT_TOOLS = [
  retrieveProductContext,
  searchProductKnowledge,
] as const;

export function registerProductTools(registry: {
  has: (name: string) => boolean;
  register: (tool: ToolDefinition<never, unknown>) => void;
}): void {
  for (const tool of PRODUCT_AGENT_TOOLS) {
    if (registry.has(tool.name)) continue;
    registry.register(tool as unknown as ToolDefinition<never, unknown>);
  }
}
