import "server-only";

/**
 * Knowledge base reads.
 *
 * Document listing goes through RLS like everything else. A document the
 * caller cannot read is not returned, so /knowledge shows exactly the corpus
 * that could influence that person's answers — which is the point of showing
 * it at all.
 */

import { createClient } from "@/lib/supabase/server";
import { notConnected } from "@/types/data";
import type { DataPoint, Failed } from "@/types/data";

const NOT_PROVISIONED_PHASE = 2;

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function failed(reason: string): Failed {
  return { state: "failed", reason };
}

function provenance(source: string) {
  return { source, asOf: new Date().toISOString(), validated: false };
}

async function guarded<T>(
  requires: string,
  run: () => Promise<DataPoint<T>>,
): Promise<DataPoint<T>> {
  if (!supabaseConfigured()) return notConnected(NOT_PROVISIONED_PHASE, requires);
  try {
    return await run();
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Unknown error");
  }
}

export interface KnowledgeDocumentRow {
  readonly id: string;
  readonly title: string;
  readonly sourceType: string;
  readonly sourceUri: string | null;
  readonly sensitivity: string;
  readonly updatedAt: string;
  readonly chunkCount: number | null;
  readonly embedded: boolean;
}

export async function listKnowledgeDocuments(): Promise<
  DataPoint<readonly KnowledgeDocumentRow[]>
> {
  return guarded("knowledge_documents + RLS", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("id, title, source_type, source_uri, sensitivity, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    // Chunk counts in one query rather than per document.
    const { data: chunks } = await supabase
      .from("knowledge_chunks")
      .select("document_id, embedding")
      .in("document_id", data.map((d) => d.id))
      .is("deleted_at", null);

    const counts = new Map<string, { total: number; embedded: number }>();
    for (const chunk of chunks ?? []) {
      const entry = counts.get(chunk.document_id) ?? { total: 0, embedded: 0 };
      entry.total += 1;
      if (chunk.embedding !== null) entry.embedded += 1;
      counts.set(chunk.document_id, entry);
    }

    return {
      state: "live",
      value: data.map((d) => {
        const count = counts.get(d.id);
        return {
          id: d.id,
          title: d.title,
          sourceType: d.source_type,
          sourceUri: d.source_uri,
          sensitivity: d.sensitivity,
          updatedAt: d.updated_at,
          chunkCount: count?.total ?? 0,
          // A document with chunks but no embeddings is ingested but not
          // searchable — a state worth surfacing rather than hiding.
          embedded: (count?.embedded ?? 0) > 0,
        };
      }),
      provenance: provenance("supabase:knowledge_documents"),
    };
  });
}

export interface KnowledgeDocumentDetail extends KnowledgeDocumentRow {
  readonly content: string;
  readonly organizationId: string | null;
}

export async function getKnowledgeDocument(
  documentId: string,
): Promise<DataPoint<KnowledgeDocumentDetail>> {
  return guarded("knowledge_documents + RLS", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("id, title, source_type, source_uri, sensitivity, updated_at, content, organization_id")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) return failed(error.message);
    if (!data) return { state: "empty" };

    const { count } = await supabase
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .is("deleted_at", null);

    return {
      state: "live",
      value: {
        id: data.id,
        title: data.title,
        sourceType: data.source_type,
        sourceUri: data.source_uri,
        sensitivity: data.sensitivity,
        updatedAt: data.updated_at,
        content: data.content,
        organizationId: data.organization_id,
        chunkCount: count ?? 0,
        embedded: false,
      },
      provenance: provenance("supabase:knowledge_documents"),
    };
  });
}
