/**
 * Citations — TANIA_PRD_v2.0.md §41.
 *
 * "Every important AI answer should be able to identify its source
 * documents." That is only meaningful if a citation points at the specific
 * chunk the model was shown, not merely at a document — a document can be
 * long, and "it's in there somewhere" is not verifiable.
 */

import type { Citation } from "@/agents/core/types";
import type { RetrievedChunk } from "@/lib/rag/retrieval";

export interface SourceCitation extends Citation {
  /** The bracket number used in the prompt, e.g. 1 for [1]. */
  readonly ordinal: number;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly similarity: number;
  readonly excerpt: string;
}

/**
 * Builds citations in the order chunks were presented, so [1] in an answer
 * resolves to the same chunk the model saw at position 1.
 */
export function buildCitations(
  chunks: readonly RetrievedChunk[],
): readonly SourceCitation[] {
  return chunks.map((chunk, i) => ({
    ordinal: i + 1,
    kind: "document" as const,
    source: chunk.documentTitle,
    reference: chunk.sourceUri ?? `${chunk.documentId}#${chunk.chunkIndex}`,
    documentId: chunk.documentId,
    chunkIndex: chunk.chunkIndex,
    similarity: chunk.similarity,
    excerpt: chunk.content.slice(0, 200),
  }));
}

/** Bracket references the model actually used, e.g. [1] and [3]. */
export function extractCitedOrdinals(answer: string): readonly number[] {
  const found = new Set<number>();
  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number.parseInt(match[1] ?? "", 10);
    if (Number.isInteger(n) && n > 0) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

export interface CitationAudit {
  /** Citations the answer actually used. */
  readonly used: readonly SourceCitation[];
  /** Retrieved but never cited — usually harmless, sometimes a recall signal. */
  readonly unused: readonly SourceCitation[];
  /**
   * Ordinals cited that do not exist. A model inventing [7] when six sources
   * were supplied is fabricating provenance, which is worse than not citing:
   * it looks verifiable and is not.
   */
  readonly dangling: readonly number[];
  readonly hasFabricatedCitation: boolean;
}

export function auditCitations(
  answer: string,
  citations: readonly SourceCitation[],
): CitationAudit {
  const cited = extractCitedOrdinals(answer);
  const byOrdinal = new Map(citations.map((c) => [c.ordinal, c] as const));

  const used = cited
    .map((ordinal) => byOrdinal.get(ordinal))
    .filter((c): c is SourceCitation => c !== undefined);

  const dangling = cited.filter((ordinal) => !byOrdinal.has(ordinal));

  return {
    used,
    unused: citations.filter((c) => !cited.includes(c.ordinal)),
    dangling,
    hasFabricatedCitation: dangling.length > 0,
  };
}
