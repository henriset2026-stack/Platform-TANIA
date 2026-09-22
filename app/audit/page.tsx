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
          description="Observability for AI activity across the chapter."
        />
        <EmptyState
          title="Not authorized"
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
        aria-label="Activity summary"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Tool calls"
          icon={Activity}
          point={mapLive(calls, (rows) => rows.length)}
          description="Recorded calls, including refused ones."
        />
        <MetricCard
          label="Authorization denials"
          icon={ShieldBan}
          tone={callMetrics && callMetrics.denied > 0 ? "warning" : "info"}
          point={mapLive(calls, () => callMetrics?.denied ?? 0)}
          description="A refused call stays in the log; a run full of them is the signal."
        />
        <MetricCard
          label="p95 latency"
          icon={Timer}
          point={mapLive(calls, () => callMetrics?.latency?.p95 ?? 0)}
          format={(value) => `${value} ms`}
          description="The number a person actually experiences, not the mean."
        />
        <MetricCard
          label="Unaudited calls"
          icon={AlertTriangle}
          tone={callMetrics && callMetrics.unauditedCalls > 0 ? "danger" : "info"}
          point={mapLive(calls, () => callMetrics?.unauditedCalls ?? 0)}
          description="Reads that ran while the log was unreachable. Should be zero."
        />
      </section>

      <SectionCard
        title="Agent runs"
        description={
          runMetrics
            ? `${runMetrics.completed} completed, ${runMetrics.failed} failed, ${runMetrics.awaitingApproval} awaiting approval.`
            : "Runs opened by TANIA agents."
        }
      >
        <DataTable
          caption="Agent runs, most recent first"
          columns={RUN_COLUMNS}
          data={runs}
          getRowId={(row) => row.id}
          emptyTitle="No agent runs recorded"
          emptyDescription="No agent has run, or none within your scope."
        />
      </SectionCard>

      <SectionCard
        title="Tool calls"
        description="Every call and the gate that decided it. Arguments and results are not shown."
      >
        <DataTable
          caption="Agent tool calls, most recent first"
          columns={CALL_COLUMNS}
          data={calls}
          getRowId={(row) => row.id}
          emptyTitle="No tool calls recorded"
          emptyDescription="No tool has been invoked, or none within your scope."
        />
      </SectionCard>

      <SectionCard
        title="Knowledge retrieval"
        description="Query text is deliberately never stored — only a hash, so repeats can be counted without keeping the sentence."
      >
        <DataTable
          caption="RAG retrievals, most recent first"
          columns={RETRIEVAL_COLUMNS}
          data={retrievals}
          getRowId={(row) => row.id}
          emptyTitle="No retrievals recorded"
          emptyDescription="No semantic search has run, or none within your scope."
        />
      </SectionCard>

      <SectionCard
        title="Audit log"
        description="The append-only record. No update or delete policy exists on this table."
      >
        <DataTable
          caption="Audit events, most recent first"
          columns={EVENT_COLUMNS}
          data={events}
          getRowId={(row) => row.id}
          emptyTitle="No audit events"
          emptyDescription="Nothing has been recorded, or none within your scope."
        />
      </SectionCard>
    </div>
  );
}

const RUN_COLUMNS: readonly Column<RunView>[] = [
  { id: "agent", header: "Agent", cell: (row) => row.agentName },
  {
    id: "status",
    header: "Status",
    cell: (row) => <StatusBadge tone={runTone(row.status)}>{row.status}</StatusBadge>,
  },
  {
    id: "latency",
    header: "Latency",
    cell: (row) => (row.latencyMs === null ? "—" : `${row.latencyMs} ms`),
  },
  {
    id: "approval",
    header: "Approval",
    cell: (row) =>
      row.humanApprovalRequired
        ? row.humanApproved
          ? "Approved"
          : "Required, not given"
        : "Not required",
  },
  { id: "correlation", header: "Correlation", cell: (row) => row.correlationId ?? "—" },
  { id: "started", header: "Started", cell: (row) => formatTime(row.startedAt) },
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
    header: "Authorization",
    cell: (row) => row.authorizationDecision ?? "—",
  },
  { id: "risk", header: "Risk", cell: (row) => row.riskLevel ?? "—" },
  {
    id: "duration",
    header: "Duration",
    cell: (row) => (row.durationMs === null ? "—" : `${row.durationMs} ms`),
  },
  {
    id: "audited",
    header: "Recorded",
    cell: (row) => (row.audited ? "Yes" : "No"),
  },
  { id: "created", header: "At", cell: (row) => formatTime(row.createdAt) },
];

const RETRIEVAL_COLUMNS: readonly Column<RagRetrievalRow>[] = [
  { id: "hash", header: "Query hash", cell: (row) => row.queryHash },
  { id: "length", header: "Query length", cell: (row) => `${row.queryLength} chars` },
  { id: "chunks", header: "Chunks", cell: (row) => String(row.returnedChunkCount) },
  {
    id: "injection",
    header: "Injection signals",
    cell: (row) =>
      row.injectionSignalCount === 0 ? "—" : String(row.injectionSignalCount),
  },
  {
    id: "latency",
    header: "Latency",
    cell: (row) => (row.latencyMs === null ? "—" : `${row.latencyMs} ms`),
  },
  { id: "created", header: "At", cell: (row) => formatTime(row.createdAt) },
];

const EVENT_COLUMNS: readonly Column<AuditLogRow>[] = [
  { id: "action", header: "Action", cell: (row) => row.action },
  { id: "resource", header: "Resource", cell: (row) => row.resourceType },
  { id: "resourceId", header: "Reference", cell: (row) => row.resourceId ?? "—" },
  { id: "request", header: "Correlation", cell: (row) => row.requestId ?? "—" },
  { id: "created", header: "At", cell: (row) => formatTime(row.createdAt) },
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
