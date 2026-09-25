import "server-only";

/**
 * Solution Agent tools. All LOW risk and read-only.
 *
 * The capability inventory is the tool that matters: it reads what the
 * chapter can actually prove, under RLS, so an architecture comparison rests
 * on records rather than on impressions of who is good at what.
 */

import { listCapabilities, getCapabilityHolders } from "@/lib/capability/queries";
import { calculateProvenLevel } from "@/lib/calculations/capability";
import { retrieveAuthorizedChunks } from "@/lib/rag/retrieval";
import { embedQuery } from "@/lib/rag/embedding";
import {
  describeUnavailable,
  INJECTION_SIGNAL_OUTPUT,
  RETRIEVED_CHUNK_OUTPUT,
} from "@/agents/product/tools";
import type { ToolDefinition, JsonSchema } from "@/agents/core/types";

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
// unknown keys at any depth. Chunk and injection-signal shapes are shared
// with the Product Agent, which returns the same RetrievedChunk records.
// ===========================================================================

const INVENTORY_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    inventory: {
      type: "array",
      items: {
        type: "object",
        properties: {
          capabilityId: { type: "string" },
          capabilityName: { type: "string" },
          bestProvenLevel: { type: "integer" },
          provenHolderCount: { type: "integer" },
          scopeLimited: { type: "boolean" },
        },
        required: [
          "capabilityId",
          "capabilityName",
          "bestProvenLevel",
          "provenHolderCount",
          "scopeLimited",
        ],
      },
    },
    note: { type: "string" },
  },
  required: ["inventory"],
  additionalProperties: false,
};

/** Live results carry injection signals (no timestamp); the empty result carries a note. */
const SOLUTION_KNOWLEDGE_OUTPUT: JsonSchema = {
  type: "object",
  properties: {
    chunks: { type: "array", items: RETRIEVED_CHUNK_OUTPUT },
    injectionSignals: { type: "array", items: INJECTION_SIGNAL_OUTPUT },
    note: { type: "string" },
  },
  required: ["chunks"],
  additionalProperties: false,
};

/**
 * What the chapter can prove, per capability.
 *
 * Proven levels come from the capability engine, not from talent_capabilities
 * directly, so a self-assessed L5 with no applied evidence does not become an
 * architecture decision's justification.
 */
export const retrieveCapabilityInventory: ToolDefinition<
  Record<string, never>,
  unknown
> = {
  name: "retrieve_capability_inventory",
  description:
    "Retrieves the capability catalogue with the highest evidence-proven level the caller can see for each, for mapping onto a solution.",
  inputSchema: EMPTY_INPUT,
  outputSchema: INVENTORY_OUTPUT,
  riskLevel: "LOW",
  requiredPermissions: ["capability.read", "talent.read"],
  requiresConfirmation: false,
  reversible: true,
  allowedForAiService: true,
  handler: async () => {
    const catalogue = await listCapabilities();
    if (catalogue.state === "empty") {
      return { ok: true, result: { inventory: [], note: "No capabilities are defined." } };
    }
    if (catalogue.state !== "live") {
      return { ok: false, error: describeUnavailable(catalogue) };
    }

    const holders = await getCapabilityHolders(
      catalogue.value.map((capability) => capability.id),
    );
    if (holders.state !== "live" && holders.state !== "empty") {
      return { ok: false, error: describeUnavailable(holders) };
    }

    const best = new Map<string, { level: number; count: number }>();
    if (holders.state === "live") {
      for (const holder of holders.value) {
        const proven = calculateProvenLevel({
          claimedLevel: holder.claimedLevel,
          assessmentStatus: holder.assessmentStatus,
          evidence: holder.evidence.map((e) => ({
            sourceType: e.sourceType,
            validationStatus: e.validationStatus,
          })),
        });
        const current = best.get(holder.capabilityId) ?? { level: 0, count: 0 };
        best.set(holder.capabilityId, {
          level: Math.max(current.level, proven.provenLevel),
          // Counts only those whose level is actually proven by evidence.
          count: current.count + (proven.proven ? 1 : 0),
        });
      }
    }

    return {
      ok: true,
      result: {
        inventory: catalogue.value.map((capability) => ({
          capabilityId: capability.id,
          capabilityName: capability.name,
          bestProvenLevel: best.get(capability.id)?.level ?? 1,
          provenHolderCount: best.get(capability.id)?.count ?? 0,
          // Read under RLS: a lower bound on the chapter, never its total.
          scopeLimited: true,
        })),
      },
    };
  },
};

export const searchSolutionKnowledge: ToolDefinition<{ query: string }, unknown> = {
  name: "search_solution_knowledge",
  description:
    "Searches the authorized DPS knowledge base for architecture and reference material, returning cited excerpts.",
  inputSchema: QUERY_SCHEMA,
  outputSchema: SOLUTION_KNOWLEDGE_OUTPUT,
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
            "Nothing in the authorized knowledge base matches. That is absence from the corpus, " +
            "not evidence that no such approach exists.",
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
      },
    };
  },
};

export const SOLUTION_AGENT_TOOLS = [
  retrieveCapabilityInventory,
  searchSolutionKnowledge,
] as const;

export function registerSolutionTools(registry: {
  has: (name: string) => boolean;
  register: (tool: ToolDefinition<never, unknown>) => void;
}): void {
  for (const tool of SOLUTION_AGENT_TOOLS) {
    if (registry.has(tool.name)) continue;
    registry.register(tool as unknown as ToolDefinition<never, unknown>);
  }
}
