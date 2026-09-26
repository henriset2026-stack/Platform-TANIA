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

export const metadata: Metadata = { title: "Pengetahuan · TANIA" };

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
        <PageHeader title="Pengetahuan" />
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "ai.use").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Pengetahuan" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin ai.use."
        />
      </div>
    );
  }

  const documents = await listKnowledgeDocuments();
  const embeddingModel = process.env.EMBEDDING_MODEL ?? null;

  const columns: readonly Column<KnowledgeDocumentRow>[] = [
    {
      id: "title",
      header: "Dokumen",
      cell: (d) => (
        <Link href={`/knowledge/${d.id}`} className="hover:underline">
          {d.title}
        </Link>
      ),
    },
    { id: "source", header: "Sumber", cell: (d) => d.sourceType, hideOnMobile: true },
    {
      id: "chunks",
      header: "Chunk",
      align: "end",
      cell: (d) => <span className="tabular-nums">{d.chunkCount ?? 0}</span>,
      hideOnMobile: true,
    },
    {
      id: "searchable",
      header: "Dapat dicari",
      align: "end",
      cell: (d) =>
        d.embedded ? (
          <StatusBadge tone="success">Ter-embed</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Belum ter-embed</StatusBadge>
        ),
    },
    {
      id: "sensitivity",
      header: "Sensitivitas",
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
        title="Pengetahuan"
        description="Dokumen yang dapat menjadi dasar jawaban AI Anda — tepat dokumen yang berwenang Anda baca."
      />

      {!embeddingModel ? (
        <div
          role="note"
          className="rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
        >
          <p className="font-medium text-amber-900">
            Pencarian semantik tidak tersedia: belum ada model embedding yang dipilih.
          </p>
          <p className="mt-0.5 text-amber-800">
            EMBEDDING_MODEL belum diatur, sehingga dokumen tidak dapat di-embed
            atau dicari berdasarkan makna. TANIA tidak beralih ke pencarian kata
            kunci, yang diam-diam akan menjawab pertanyaan yang berbeda.
          </p>
        </div>
      ) : null}

      <SectionCard title="Dokumen">
        <DataTable
          caption="Dokumen pengetahuan"
          columns={columns}
          data={documents}
          getRowId={(d) => d.id}
          emptyTitle="Belum ada dokumen"
          emptyDescription="Belum ada dokumen pengetahuan dalam cakupan yang Anda berwenang."
        />
      </SectionCard>

      <SectionCard title="Cara otorisasi pengambilan" headingLevel={3}>
        <ol className="space-y-1.5 text-sm text-slate-600">
          <li>
            <strong className="text-slate-800">1. Otorisasi lebih dulu.</strong>{" "}
            Pencarian vektor berjalan di bawah sesi Anda dengan RLS diterapkan{" "}
            <em>selama</em> pemindaian indeks. Chunk yang tidak berwenang tidak
            pernah menjadi kandidat — bukan diambil lalu disaring.
          </li>
          <li>
            <strong className="text-slate-800">2. {RETRIEVAL_LIMITS.defaultMatchCount} chunk berwenang teratas.</strong>{" "}
            Diurutkan berdasarkan kemiripan, dibatasi agar tidak ada pemanggil
            yang dapat meminta context window tanpa batas.
          </li>
          <li>
            <strong className="text-slate-800">3. Dibatasi sebagai data.</strong>{" "}
            Teks yang diambil dibungkus dan diberi label tidak tepercaya. Apa pun
            di dokumen yang tampak seperti instruksi diabaikan — izin berasal
            dari sesi Anda dan database, tidak pernah dari dokumen.
          </li>
          <li>
            <strong className="text-slate-800">4. Dikutip.</strong> Setiap chunk
            diberi nomor agar jawaban dapat menyebut bagian spesifik yang digunakan.
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}
