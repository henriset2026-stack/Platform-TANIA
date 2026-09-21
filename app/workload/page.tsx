import type { Metadata } from "next";

import {
  DataTable,
  EmptyState,
  MetricCard,
  PageHeader,
  ProgressMeter,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { CapabilityStatusBadge } from "@/components/dashboard/status-badge";
import { UTILIZATION_BAND_LABEL } from "@/lib/calculations/workload";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import { resolveDashboardView } from "@/lib/dashboard/views";
import { getWorkload, type WorkloadRow } from "@/lib/workload/queries";
import { isLive, mapLive } from "@/types/data";

export const metadata: Metadata = { title: "Workload · TANIA" };

/**
 * Workload and capacity (PRD §33).
 *
 * Utilization above 100% is shown as-is rather than clamped: over-allocation
 * is the signal worth seeing. Proposed allocation is reported separately from
 * committed, because a proposal is not a commitment.
 */
export default async function WorkloadPage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Workload" />
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "assignment.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Workload" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold assignment.read."
        />
      </div>
    );
  }

  const view = resolveDashboardView(context);
  const workload = await getWorkload();
  const summary = isLive(workload) ? workload.value.summary : null;

  const columns: readonly Column<WorkloadRow>[] = [
    {
      id: "person",
      header: "Person",
      cell: (r) => (view.allowsIndividualDrilldown ? r.fullName : "Team member"),
    },
    {
      id: "utilization",
      header: "Utilization",
      cell: (r) => (
        <ProgressMeter
          value={Math.min(r.utilizationPct, 100)}
          label={`${view.allowsIndividualDrilldown ? r.fullName : "Team member"} utilization`}
          showValue={false}
        />
      ),
      width: "28%",
      hideOnMobile: true,
    },
    {
      id: "pct",
      header: "%",
      align: "end",
      cell: (r) => <span className="tabular-nums">{r.utilizationPct}%</span>,
    },
    {
      id: "proposed",
      header: "Proposed",
      align: "end",
      cell: (r) =>
        r.proposedPct > 0 ? (
          <span className="tabular-nums text-slate-500">+{r.proposedPct}%</span>
        ) : (
          "—"
        ),
      hideOnMobile: true,
    },
    {
      id: "band",
      header: "Status",
      align: "end",
      cell: (r) => (
        <span className="flex items-center justify-end gap-2">
          <CapabilityStatusBadge status={r.status} />
          <span className="sr-only">{UTILIZATION_BAND_LABEL[r.band]}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Workload"
        description="Committed allocation across your authorized scope. Proposed assignments are counted separately."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Mean utilization"
          point={mapLive(workload, (w) => w.summary.meanUtilizationPct)}
          format={(v) => `${v}%`}
          tone="info"
        />
        <MetricCard
          label="Spare capacity"
          point={mapLive(workload, (w) => w.summary.spareCapacityFte)}
          format={(v) => `${v} FTE`}
          tone="success"
          description="Overloaded people contribute zero, never negative."
        />
        <MetricCard
          label="Over-allocated"
          point={mapLive(workload, (w) => w.summary.overloadedCount)}
          tone="danger"
        />
        <MetricCard
          label="Unassigned"
          point={mapLive(workload, (w) => w.summary.unassignedCount)}
          tone="warning"
        />
      </div>

      <SectionCard
        title="Allocation heatmap"
        description={
          view.allowsIndividualDrilldown
            ? "Per person, highest utilization first."
            : "Individual names are not shown at aggregate scope."
        }
      >
        <DataTable
          caption="Workload by person"
          columns={columns}
          data={mapLive(workload, (w) => w.rows)}
          getRowId={(r) => r.profileId}
          emptyTitle="No workload data"
          emptyDescription="No active assignments exist within your authorized scope."
        />
      </SectionCard>

      {summary && summary.overloadedCount > 0 ? (
        <SectionCard title="Capacity note" headingLevel={3}>
          <p className="text-sm text-slate-600">
            {summary.overloadedCount} {summary.overloadedCount === 1 ? "person is" : "people are"}{" "}
            over-allocated. TANIA does not reassign anyone automatically — use
            talent matching to identify options, then propose an assignment for
            human approval.
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}
