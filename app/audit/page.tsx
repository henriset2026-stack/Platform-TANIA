import type { Metadata } from "next";
import { Activity, AlertTriangle, ShieldBan, Timer } from "lucide-react";

import {
  DataTable,
  EmptyState,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { mapLive } from "@/types/data";
import type { DataPoint } from "@/types/data";
import {
  listAgentRuns,
  listAuditEvents,
  listRagRetrievals,
  listToolCalls,
  requireAuditAccess,
  type AuditLogRow,
  type RagRetrievalRow,
} from "@/lib/observability/queries";
import { summarizeRuns, summarizeToolCalls } from "@/lib/observability/metrics";

export const metadata: Metadata = { title: "Audit · TANIA" };

type ToolCallView = Awaited<ReturnType<typeof listToolCalls>> extends DataPoint<
  readonly (infer T)[]
>
  ? T
  : never;

type RunView = Awaited<ReturnType<typeof listAgentRuns>> extends DataPoint<
  readonly (infer T)[]
>
  ? T
  : never;

/**
 * Audit viewer.
 *
 * RBAC-restricted, and the restriction is stated rather than implied: someone
 * holding ai.view_audit sees their own activity and is told so, because a
 * short list with no explanation reads as "nothing happened" when it means
 * "this is your slice".
 *
 * Nothing here renders a raw argument, result or query. The tables show what
 * was called, by which gate it was decided, how long it took and whether it
 * was recorded — the questions an audit asks — and none of the payloads that
 * would put employee data on a page as a side effect of observability.
 */
export default async function AuditPage() {
  const access = await requireAuditAccess();

  if (!access.allowed) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Audit"
          description="Observabilitas aktivitas AI di seluruh Chapter."
        />
        <EmptyState
          title="Tidak berwenang"
          description={access.reason}
        />
      </div>
    );
  }

  const [events, runs, calls, retrievals] = await Promise.all([
    listAuditEvents(),
    listAgentRuns(),
    listToolCalls(),
    listRagRetrievals(),
  ]);

  const callMetrics =
    calls.state === "live" ? summarizeToolCalls(calls.value) : null;
  const runMetrics = runs.state === "live" ? summarizeRuns(runs.value) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Audit"
        description={access.audience.detail}
      />

      <section
        aria-label="Ringkasan aktivitas"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Panggilan tool"
          icon={Activity}
          point={mapLive(calls, (rows) => rows.length)}
          description="Panggilan yang tercatat, termasuk yang ditolak."
        />
        <MetricCard
          label="Penolakan otorisasi"
          icon={ShieldBan}
          tone={callMetrics && callMetrics.denied > 0 ? "warning" : "info"}
          point={mapLive(calls, () => callMetrics?.denied ?? 0)}
          description="Panggilan yang ditolak tetap tercatat di log; run yang penuh penolakan adalah sinyalnya."
        />
        <MetricCard
          label="Latensi p95"
          icon={Timer}
          point={mapLive(calls, () => callMetrics?.latency?.p95 ?? 0)}
          format={(value) => `${value} ms`}
          description="Angka yang benar-benar dialami pengguna, bukan rata-rata."
        />
        <MetricCard
          label="Panggilan tanpa audit"
          icon={AlertTriangle}
          tone={callMetrics && callMetrics.unauditedCalls > 0 ? "danger" : "info"}
          point={mapLive(calls, () => callMetrics?.unauditedCalls ?? 0)}
          description="Pembacaan yang berjalan saat log tidak dapat dijangkau. Seharusnya nol."
        />
      </section>

      <SectionCard
        title="Run agen"
        description={
          runMetrics
            ? `${runMetrics.completed} selesai, ${runMetrics.failed} gagal, ${runMetrics.awaitingApproval} menunggu persetujuan.`
            : "Run yang dibuka oleh agen TANIA."
        }
      >
        <DataTable
          caption="Run agen, terbaru lebih dulu"
          columns={RUN_COLUMNS}
          data={runs}
          getRowId={(row) => row.id}
          emptyTitle="Belum ada run agen yang tercatat"
          emptyDescription="Belum ada agen yang berjalan, atau tidak ada dalam cakupan Anda."
        />
      </SectionCard>

      <SectionCard
        title="Panggilan tool"
        description="Setiap panggilan dan gate yang memutuskannya. Argumen dan hasil tidak ditampilkan."
      >
        <DataTable
          caption="Panggilan tool agen, terbaru lebih dulu"
          columns={CALL_COLUMNS}
          data={calls}
          getRowId={(row) => row.id}
          emptyTitle="Belum ada panggilan tool yang tercatat"
          emptyDescription="Belum ada tool yang dipanggil, atau tidak ada dalam cakupan Anda."
        />
      </SectionCard>

      <SectionCard
        title="Pengambilan pengetahuan"
        description="Teks kueri sengaja tidak pernah disimpan — hanya hash-nya, sehingga pengulangan dapat dihitung tanpa menyimpan kalimatnya."
      >
        <DataTable
          caption="Pengambilan RAG, terbaru lebih dulu"
          columns={RETRIEVAL_COLUMNS}
          data={retrievals}
          getRowId={(row) => row.id}
          emptyTitle="Belum ada pengambilan yang tercatat"
          emptyDescription="Belum ada pencarian semantik yang berjalan, atau tidak ada dalam cakupan Anda."
        />
      </SectionCard>

      <SectionCard
        title="Log audit"
        description="Catatan append-only. Tidak ada kebijakan update atau delete pada tabel ini."
      >
        <DataTable
          caption="Peristiwa audit, terbaru lebih dulu"
          columns={EVENT_COLUMNS}
          data={events}
          getRowId={(row) => row.id}
          emptyTitle="Belum ada peristiwa audit"
          emptyDescription="Belum ada yang tercatat, atau tidak ada dalam cakupan Anda."
        />
      </SectionCard>
    </div>
  );
}

const RUN_COLUMNS: readonly Column<RunView>[] = [
  { id: "agent", header: "Agen", cell: (row) => row.agentName },
  {
    id: "status",
    header: "Status",
    cell: (row) => <StatusBadge tone={runTone(row.status)}>{row.status}</StatusBadge>,
  },
  {
    id: "latency",
    header: "Latensi",
    cell: (row) => (row.latencyMs === null ? "—" : `${row.latencyMs} ms`),
  },
  {
    id: "approval",
    header: "Persetujuan",
    cell: (row) =>
      row.humanApprovalRequired
        ? row.humanApproved
          ? "Disetujui"
          : "Diperlukan, belum diberikan"
        : "Tidak diperlukan",
  },
  { id: "correlation", header: "Korelasi", cell: (row) => row.correlationId ?? "—" },
  { id: "started", header: "Dimulai", cell: (row) => formatTime(row.startedAt) },
];

const CALL_COLUMNS: readonly Column<ToolCallView>[] = [
  { id: "tool", header: "Tool", cell: (row) => row.toolName },
  {
    id: "status",
    header: "Status",
    cell: (row) => <StatusBadge tone={callTone(row.status)}>{row.status}</StatusBadge>,
  },
  {
    id: "decision",
    header: "Otorisasi",
    cell: (row) => row.authorizationDecision ?? "—",
  },
  { id: "risk", header: "Risiko", cell: (row) => row.riskLevel ?? "—" },
  {
    id: "duration",
    header: "Durasi",
    cell: (row) => (row.durationMs === null ? "—" : `${row.durationMs} ms`),
  },
  {
    id: "audited",
    header: "Tercatat",
    cell: (row) => (row.audited ? "Ya" : "Tidak"),
  },
  { id: "created", header: "Waktu", cell: (row) => formatTime(row.createdAt) },
];

const RETRIEVAL_COLUMNS: readonly Column<RagRetrievalRow>[] = [
  { id: "hash", header: "Hash kueri", cell: (row) => row.queryHash },
  { id: "length", header: "Panjang kueri", cell: (row) => `${row.queryLength} karakter` },
  { id: "chunks", header: "Chunk", cell: (row) => String(row.returnedChunkCount) },
  {
    id: "injection",
    header: "Sinyal injeksi",
    cell: (row) =>
      row.injectionSignalCount === 0 ? "—" : String(row.injectionSignalCount),
  },
  {
    id: "latency",
    header: "Latensi",
    cell: (row) => (row.latencyMs === null ? "—" : `${row.latencyMs} ms`),
  },
  { id: "created", header: "Waktu", cell: (row) => formatTime(row.createdAt) },
];

const EVENT_COLUMNS: readonly Column<AuditLogRow>[] = [
  { id: "action", header: "Aksi", cell: (row) => row.action },
  { id: "resource", header: "Sumber daya", cell: (row) => row.resourceType },
  { id: "resourceId", header: "Referensi", cell: (row) => row.resourceId ?? "—" },
  { id: "request", header: "Korelasi", cell: (row) => row.requestId ?? "—" },
  { id: "created", header: "Waktu", cell: (row) => formatTime(row.createdAt) },
];

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

function runTone(status: string): Tone {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "awaiting_approval") return "warning";
  return "info";
}

/** A denial is a warning, not an error: the gate working is not a fault. */
function callTone(status: string): Tone {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "denied") return "warning";
  return "info";
}

function formatTime(value: string): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 19);
}
