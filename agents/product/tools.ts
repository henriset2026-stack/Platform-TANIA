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
import { FEASIBILITY_STAGES } from "@/lib/calculations/feasibility";
import type { ToolDefinition, JsonSchema, JsonSchemaProperty } from "@/agents/core/types";
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

// ===========================================================================
// Output schemas
//
// The pipeline validates every handler result against these, rejecting
// unknown keys at any depth. The row and chunk shapes are exported because
// the Solution and Business Case agents return the same records
// (ProjectListRow, RetrievedChunk) and must not drift from this declaration.
// ===========================================================================

/** ProjectListRow from lib/project/queries.ts. */
export const PROJECT_ROW_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    id: { type: "string" },
    code: { type: "string" },
    name: { type: "string" },
    status: { type: "string" },
    customerName: { type: "string", nullable: true },
    startDate: { type: "string", nullable: true },
    endDate: { type: "string", nullable: true },
  },
  required: ["id", "code", "name", "status", "customerName", "startDate", "endDate"],
};

/** FeasibilityRow from lib/project/queries.ts. */
const FEASIBILITY_ROW_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    stage: { type: "string", enum: FEASIBILITY_STAGES },
    stageLabel: { type: "string" },
    customerName: { type: "string", nullable: true },
    totalScore: { type: "number", nullable: true },
    scoreCoverage: { type: "number", nullable: true },
    decidedAt: { type: "string", nullable: true },
  },
  required: [
    "id",
    "title",
    "stage",
    "stageLabel",
    "customerName",
    "totalScore",
    "scoreCoverage",
    "decidedAt",
  ],
};

/** RetrievedChunk from lib/rag/retrieval.ts. */
export const RETRIEVED_CHUNK_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    chunkId: { type: "string" },
    documentId: { type: "string" },
    documentTitle: { type: "string" },
    sourceType: { type: "string" },
    sourceUri: { type: "string", nullable: true },
    chunkIndex: { type: "integer" },
    content: { type: "string" },
    similarity: { type: "number" },
  },
  required: [
    "chunkId",
    "documentId",
    "documentTitle",
    "sourceType",
    "sourceUri",
    "chunkIndex",
    "content",
    "similarity",
  ],
};

/** RetrievalResult["injectionSignals"][number] from lib/rag/retrieval.ts. */
export const INJECTION_SIGNAL_OUTPUT: JsonSchemaProperty = {
  type: "object",
  properties: {
    documentId: { type: "string" },
    documentTitle: { type: "string" },
    pattern: { type: "string" },
    excerpt: { type: "string" },
  },
  required: ["documentId", "documentTitle", "pattern", "excerpt"],
};

const PRODUCT_CONTEXT_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    projects: { type: "array", items: PROJECT_ROW_OUTPUT },
    feasibility: { type: "array", items: FEASIBILITY_ROW_OUTPUT },
  },
  required: ["projects", "feasibility"],
  additionalProperties: false,
};

/** Live results carry signals and a timestamp; the empty result carries a note instead. */
const PRODUCT_KNOWLEDGE_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    chunks: { type: "array", items: RETRIEVED_CHUNK_OUTPUT },
    injectionSignals: { type: "array", items: INJECTION_SIGNAL_OUTPUT },
    searchedAt: { type: "string", format: "date-time" },
    note: { type: "string" },
  },
  required: ["chunks"],
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
  outputSchema: PRODUCT_CONTEXT_OUTPUT,
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
  outputSchema: PRODUCT_KNOWLEDGE_OUTPUT,
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
