import "server-only";

/**
 * Query embedding.
 *
 * There is no embedding provider. This function says so rather than
 * returning a vector, and the distinction matters more here than almost
 * anywhere else in the codebase: a zero vector, or a hashed pseudo-embedding,
 * would not fail. It would retrieve the numerically nearest chunks to an
 * arbitrary point and hand them back as "the most relevant material", and
 * every layer above — citations, the fenced context, the agent's findings —
 * would treat them as a genuine retrieval.
 *
 * Fabricated relevance is harder to spot than a fabricated fact, because the
 * documents it cites are real.
 */

import { readAiConfig } from "@/lib/ai/config";
import { notIntegrated } from "@/types/data";
import type { DataPoint } from "@/types/data";

export async function embedQuery(
  text: string,
): Promise<DataPoint<readonly number[]>> {
  if (text.trim().length === 0) return { state: "empty" };

  const config = readAiConfig();
  if (!config.embeddingModel) {
    return notIntegrated(
      "Embedding model",
      "semantic search over the knowledge base",
    );
  }

  // A model is named in configuration but nothing implements it. Named and
  // unavailable is a different fact from unconfigured, and the message says
  // which, so this reads as a wiring gap rather than a settings mistake.
  return notIntegrated(
    `Embedding provider for ${config.embeddingModel}`,
    "semantic search over the knowledge base",
  );
}
