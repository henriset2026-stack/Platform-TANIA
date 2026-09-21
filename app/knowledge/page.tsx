import Link from "next/link";
import type { Metadata } from "next";

import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { RETRIEVAL_LIMITS } from "@/lib/rag/retrieval";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import { listKnowledgeDocuments, type KnowledgeDocumentRow } from "@/lib/rag/queries";

export const metadata: Metadata = { title: "Knowledge · TANIA" };

const SENSITIVITY_TONE: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  INTERNAL: "neutral",
  CONFIDENTIAL: "info",
  SENSITIVE: "warning",
  RESTRICTED: "danger",
};

/**
 * Knowledge base (PRD §42).
 *
 * Lists the corpus the CURRENT VIEWER is authorized to read — the same set
 * that can influence their AI answers. Showing a different set here than
 * retrieval uses would make the page misleading precisely where it needs to
 * be trustworthy.
 */
export default async function KnowledgePage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Knowledge" />
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "ai.use").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Knowledge" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold ai.use."
        />
      </div>
    );
  }

  const documents = await listKnowledgeDocuments();
  const embeddingModel = process.env.EMBEDDING_MODEL ?? null;

  const columns: readonly Column<KnowledgeDocumentRow>[] = [
    {
      id: "title",
      header: "Document",
      cell: (d) => (
        <Link href={`/knowledge/${d.id}`} className="hover:underline">
          {d.title}
        </Link>
      ),
    },
    { id: "source", header: "Source", cell: (d) => d.sourceType, hideOnMobile: true },
    {
      id: "chunks",
      header: "Chunks",
      align: "end",
      cell: (d) => <span className="tabular-nums">{d.chunkCount ?? 0}</span>,
      hideOnMobile: true,
    },
    {
      id: "searchable",
      header: "Searchable",
      align: "end",
      cell: (d) =>
        d.embedded ? (
          <StatusBadge tone="success">Embedded</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Not embedded</StatusBadge>
        ),
    },
    {
      id: "sensitivity",
      header: "Sensitivity",
      align: "end",
      cell: (d) => (
        <StatusBadge tone={SENSITIVITY_TONE[d.sensitivity] ?? "neutral"}>
          {d.sensitivity}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Knowledge"
        description="The documents that can inform your AI answers — exactly those you are authorized to read."
      />

      {!embeddingModel ? (
        <div
          role="note"
          className="rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
        >
          <p className="font-medium text-amber-900">
            Semantic search is unavailable: no embedding model is selected.
          </p>
          <p className="mt-0.5 text-amber-800">
            EMBEDDING_MODEL is unset, so documents cannot be embedded or
            searched by meaning. TANIA does not fall back to keyword search,
            which would quietly answer a different question than the one asked.
          </p>
        </div>
      ) : null}

      <SectionCard title="Documents">
        <DataTable
          caption="Knowledge documents"
          columns={columns}
          data={documents}
          getRowId={(d) => d.id}
          emptyTitle="No documents"
          emptyDescription="No knowledge document exists within your authorized scope."
        />
      </SectionCard>

      <SectionCard title="How retrieval is authorized" headingLevel={3}>
        <ol className="space-y-1.5 text-sm text-slate-600">
          <li>
            <strong className="text-slate-800">1. Authorization first.</strong>{" "}
            Vector search runs under your session with RLS applied{" "}
            <em>during</em> the index scan. An unauthorized chunk is never a
            candidate — it is not retrieved and then filtered out.
          </li>
          <li>
            <strong className="text-slate-800">2. Top {RETRIEVAL_LIMITS.defaultMatchCount} authorized chunks.</strong>{" "}
            Ranked by similarity, bounded so no caller can request an unlimited
            context window.
          </li>
          <li>
            <strong className="text-slate-800">3. Fenced as data.</strong>{" "}
            Retrieved text is wrapped and labelled untrusted. Anything in a
            document that looks like an instruction is ignored — permissions
            come from your session and the database, never from a document.
          </li>
          <li>
            <strong className="text-slate-800">4. Cited.</strong> Each chunk is
            numbered so an answer can name the specific passage it used.
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}
