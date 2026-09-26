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
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "assignment.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Workload" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin assignment.read."
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
      header: "Talent",
      cell: (r) => (view.allowsIndividualDrilldown ? r.fullName : "Anggota tim"),
    },
    {
      id: "utilization",
      header: "Utilisasi",
      cell: (r) => (
        <ProgressMeter
          value={Math.min(r.utilizationPct, 100)}
          label={`Utilisasi ${view.allowsIndividualDrilldown ? r.fullName : "anggota tim"}`}
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
      header: "Diusulkan",
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
        description="Alokasi yang sudah berkomitmen dalam cakupan yang Anda berwenang. Penugasan yang diusulkan dihitung terpisah."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Utilisasi rata-rata"
          point={mapLive(workload, (w) => w.summary.meanUtilizationPct)}
          format={(v) => `${v}%`}
          tone="info"
        />
        <MetricCard
          label="Kapasitas tersisa"
          point={mapLive(workload, (w) => w.summary.spareCapacityFte)}
          format={(v) => `${v} FTE`}
          tone="success"
          description="Talent berstatus Over dihitung nol, tidak pernah negatif."
        />
        <MetricCard
          label="Kelebihan alokasi"
          point={mapLive(workload, (w) => w.summary.overloadedCount)}
          tone="danger"
        />
        <MetricCard
          label="Belum ditugaskan"
          point={mapLive(workload, (w) => w.summary.unassignedCount)}
          tone="warning"
        />
      </div>

      <SectionCard
        title="Heatmap alokasi"
        description={
          view.allowsIndividualDrilldown
            ? "Per talent, utilisasi tertinggi lebih dulu."
            : "Nama individu tidak ditampilkan pada cakupan agregat."
        }
      >
        <DataTable
          caption="Workload per talent"
          columns={columns}
          data={mapLive(workload, (w) => w.rows)}
          getRowId={(r) => r.profileId}
          emptyTitle="Belum ada data Workload"
          emptyDescription="Belum ada penugasan aktif dalam cakupan yang Anda berwenang."
        />
      </SectionCard>

      {summary && summary.overloadedCount > 0 ? (
        <SectionCard title="Catatan kapasitas" headingLevel={3}>
          <p className="text-sm text-slate-600">
            {summary.overloadedCount} orang mengalami kelebihan alokasi. TANIA
            tidak memindahkan siapa pun secara otomatis — gunakan pencocokan
            Talent untuk mengidentifikasi opsi, lalu ajukan usulan penugasan
            untuk disetujui manusia.
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}
