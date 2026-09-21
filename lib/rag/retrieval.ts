import "server-only";

/**
 * Authorized retrieval — TANIA_PRD_v2.0.md §42, AGENTS.md §11.
 *
 * Search runs through match_knowledge_chunks(), which is SECURITY INVOKER, so
 * RLS filters DURING the index scan. This module therefore performs NO
 * post-filtering of results by entitlement — and must never start. If a
 * filter appeared here it would mean unauthorized rows had already been read
 * and ranked, which is the pattern the security model forbids.
 *
 * The only filtering applied here is the caller's own narrowing (source type,
 * organization), which is a preference, not a control.
 */

import { detectInjectionSignals, fenceRetrievedContent, type FencedDocument } from "@/lib/rag/sanitize";
import { createClient } from "@/lib/supabase/server";
import { notConnected, notIntegrated } from "@/types/data";
import type { DataPoint, Failed } from "@/types/data";

const NOT_PROVISIONED_PHASE = 2;

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function embeddingModelConfigured(): boolean {
  return Boolean(process.env.EMBEDDING_MODEL);
}

function failed(reason: string): Failed {
  return { state: "failed", reason };
}

export interface RetrievedChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly sourceType: string;
  readonly sourceUri: string | null;
  readonly chunkIndex: number;
  readonly content: string;
  readonly similarity: number;
}

export interface RetrievalResult {
  readonly chunks: readonly RetrievedChunk[];
  /** Prompt-ready, fenced and labelled as data. */
  readonly fencedContext: string;
  /** Injection attempts observed in retrieved content, for review and audit. */
  readonly injectionSignals: readonly {
    readonly documentId: string;
    readonly documentTitle: string;
    readonly pattern: string;
    readonly excerpt: string;
  }[];
  readonly searchedAt: string;
}

export interface RetrievalOptions {
  readonly matchCount?: number;
  readonly minSimilarity?: number;
  readonly organizationId?: string;
  readonly sourceType?: string;
}

/** Bounds, so a caller cannot request an unbounded context window. */
export const RETRIEVAL_LIMITS = {
  defaultMatchCount: 8,
  maxMatchCount: 20,
  /** Below this, a match is noise and hurts more than it helps. */
  defaultMinSimilarity: 0.25,
} as const;

/**
 * Retrieves authorized chunks for a query embedding.
 *
 * Returns `not-integrated` when no embedding model is configured. That is the
 * honest state: the corpus cannot be searched semantically without one, and
 * falling back to keyword search would silently answer a different question
 * than the caller asked.
 */
export async function retrieveAuthorizedChunks(
  queryEmbedding: readonly number[],
  options: RetrievalOptions = {},
): Promise<DataPoint<RetrievalResult>> {
  if (!supabaseConfigured()) {
    return notConnected(NOT_PROVISIONED_PHASE, "knowledge_chunks + pgvector");
  }
  if (!embeddingModelConfigured()) {
    return notIntegrated("Embedding model", "vector search over the knowledge base");
  }

  const matchCount = Math.min(
    Math.max(options.matchCount ?? RETRIEVAL_LIMITS.defaultMatchCount, 1),
    RETRIEVAL_LIMITS.maxMatchCount,
  );

  try {
    const supabase = await createClient();

    // RLS applies inside this call. No entitlement filtering follows it.
    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: matchCount,
      min_similarity: options.minSimilarity ?? RETRIEVAL_LIMITS.defaultMinSimilarity,
      filter_organization_id: options.organizationId ?? null,
      filter_source_type: options.sourceType ?? null,
    });

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    const chunks: RetrievedChunk[] = data.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      sourceType: row.source_type,
      sourceUri: row.source_uri,
      chunkIndex: row.chunk_index,
      content: row.content,
      similarity: row.similarity,
    }));

    const signals = chunks.flatMap((chunk) =>
      detectInjectionSignals(chunk.content).map((signal) => ({
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        pattern: signal.pattern,
        excerpt: signal.excerpt,
      })),
    );

    const fenced: FencedDocument[] = chunks.map((chunk) => ({
      documentId: chunk.documentId,
      title: chunk.documentTitle,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
    }));

    return {
      state: "live",
      value: {
        chunks,
        fencedContext: fenceRetrievedContent(fenced),
        injectionSignals: signals,
        searchedAt: new Date().toISOString(),
      },
      provenance: {
        source: "supabase:knowledge_chunks",
        asOf: new Date().toISOString(),
        validated: false,
      },
    };
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Retrieval failed");
  }
}
