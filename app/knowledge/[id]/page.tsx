import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/dashboard";
import { DataStateNotice } from "@/components/data/data-state";
import { chunkDocument } from "@/lib/rag/chunking";
import { detectInjectionSignals } from "@/lib/rag/sanitize";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/policy";
import { getKnowledgeDocument } from "@/lib/rag/queries";
import { isLive } from "@/types/data";

export const metadata: Metadata = { title: "Document · TANIA" };

/**
 * Knowledge document detail.
 *
 * Shows how the document would be chunked and flags any passage that looks
 * like an injection attempt. Surfacing that to a human reviewer is the point:
 * the corpus is the one place where attacker-influenced text can reach the
 * model, so someone should be able to inspect what is in it.
 *
 * A document the viewer cannot read returns notFound() rather than a denial,
 * so the response does not confirm it exists.
 */
export default async function KnowledgeDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) notFound();
  if (!can(context, "ai.use").allowed) notFound();

  const document = await getKnowledgeDocument(id);
  if (document.state === "empty" || document.state === "restricted") notFound();

  const preview = isLive(document) ? chunkDocument(document.value.content) : [];
  const signals = isLive(document)
    ? detectInjectionSignals(document.value.content)
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={isLive(document) ? document.value.title : "Document"}
        description={isLive(document) ? document.value.sourceType : undefined}
      />

      {!isLive(document) ? (
        <SectionCard title="Document">
          <DataStateNotice point={document} />
        </SectionCard>
      ) : (
        <>
          {signals.length > 0 ? (
            <div
              role="alert"
              className="rounded-[var(--radius-card)] border border-red-300 bg-red-50 px-4 py-3 text-sm"
            >
              <p className="font-medium text-red-900">
                This document contains {signals.length} passage
                {signals.length === 1 ? "" : "s"} resembling a prompt-injection
                attempt.
              </p>
              <p className="mt-0.5 text-red-800">
                Retrieval still fences the content as untrusted data, and
                permissions come from your session rather than from any
                document. This is flagged so a human can review how it entered
                the corpus.
              </p>
              <ul className="mt-2 space-y-1">
                {signals.map((signal) => (
                  <li key={signal.pattern} className="font-mono text-xs text-red-800">
                    {signal.pattern}: “{signal.excerpt}”
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <SectionCard title="Metadata">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="Source type" value={document.value.sourceType} />
              <Field label="Source" value={document.value.sourceUri} />
              <Field label="Sensitivity" value={document.value.sensitivity} />
              <Field label="Stored chunks" value={String(document.value.chunkCount ?? 0)} />
            </dl>
          </SectionCard>

          <SectionCard
            title="Chunking preview"
            description={`This document would produce ${preview.length} chunk(s). Chunking is deterministic, so a citation always points at the same passage.`}
          >
            {preview.length === 0 ? (
              <p className="text-sm text-slate-500">No content to chunk.</p>
            ) : (
              <ol className="space-y-2">
                {preview.slice(0, 5).map((chunk) => (
                  <li
                    key={chunk.index}
                    className="rounded-[var(--radius-control)] border border-slate-200 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        Chunk {chunk.index + 1}
                      </span>
                      <StatusBadge tone="neutral">
                        ~{chunk.estimatedTokens} tokens
                      </StatusBadge>
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm text-slate-700">
                      {chunk.content}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            {preview.length > 5 ? (
              <p className="mt-2 text-xs text-slate-500">
                Showing the first 5 of {preview.length} chunks.
              </p>
            ) : null}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="truncate text-slate-800">{value ?? "—"}</dd>
    </div>
  );
}
