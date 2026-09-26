import type { Metadata } from "next";

import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { PERFORMANCE_DIMENSIONS, validateWeightProfile } from "@/lib/calculations/performance";
import type { WeightProfile } from "@/lib/calculations/performance";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import {
  listPerformancePeriods,
  listWeightProfiles,
  type PeriodRow,
} from "@/lib/performance/queries";
import { isLive } from "@/types/data";

export const metadata: Metadata = { title: "Kinerja · TANIA" };

/**
 * S05 — Performance Cockpit (PRD §29).
 *
 * Shows the dimension vocabulary and the CONFIGURED weighting models. It does
 * not show a default model, because PRD §6.1 makes weights configuration and
 * an implicit default is universal policy by another name.
 */
export default async function PerformancePage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Kinerja" />
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "performance.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Kinerja" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin performance.read."
        />
      </div>
    );
  }

  const [periods, profiles] = await Promise.all([
    listPerformancePeriods(),
    listWeightProfiles(),
  ]);

  const periodColumns: readonly Column<PeriodRow>[] = [
    { id: "name", header: "Periode", cell: (p) => p.name },
    { id: "type", header: "Jenis", cell: (p) => p.periodType, hideOnMobile: true },
    {
      id: "dates",
      header: "Tanggal",
      cell: (p) => `${p.startDate} → ${p.endDate}`,
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: (p) => (
        <StatusBadge tone={p.status === "open" ? "success" : "neutral"}>
          {p.status}
        </StatusBadge>
      ),
    },
  ];

  const profileColumns: readonly Column<WeightProfile>[] = [
    { id: "name", header: "Model", cell: (p) => p.name },
    {
      id: "dimensions",
      header: "Dimensi",
      align: "end",
      cell: (p) => <span className="tabular-nums">{p.weights.length}</span>,
      hideOnMobile: true,
    },
    {
      id: "valid",
      header: "Validitas",
      align: "end",
      cell: (p) => {
        const problems = validateWeightProfile(p);
        return problems.length === 0 ? (
          <StatusBadge tone="success">Valid</StatusBadge>
        ) : (
          <StatusBadge tone="danger">{problems.length} masalah</StatusBadge>
        );
      },
    },
    {
      id: "approved",
      header: "Persetujuan",
      align: "end",
      cell: (p) =>
        p.approved ? (
          <StatusBadge tone="success">Disetujui</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Belum disetujui</StatusBadge>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Kinerja"
        description="Kinerja berbasis bukti. Bobot adalah konfigurasi, bukan kebijakan universal (PRD §6.1)."
      />

      <SectionCard
        title="Dimensi"
        description="Kosakata dari PRD §6.1. Pembobotan ditetapkan per model di bawah, tidak di sini."
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PERFORMANCE_DIMENSIONS.map((d) => (
            <li
              key={d.code}
              className="rounded-[var(--radius-control)] border border-slate-200 px-3 py-2 text-sm text-slate-700"
            >
              {d.name}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title="Model pembobotan"
        description="Model harus dipilih secara eksplisit. Tidak ada default implisit."
      >
        <DataTable
          caption="Model pembobotan kinerja"
          columns={profileColumns}
          data={profiles}
          getRowId={(p) => p.id}
          emptyTitle="Belum ada model pembobotan yang dikonfigurasi"
          emptyDescription="PRD §6.1 mencantumkan contoh bobot, tetapi menyatakan bahwa bobot adalah konfigurasi, bukan kebijakan. Administrator harus menetapkan dan menyetujui model sebelum indeks kinerja dapat dihitung."
        />
      </SectionCard>

      <SectionCard title="Periode kinerja">
        <DataTable
          caption="Periode kinerja"
          columns={periodColumns}
          data={periods}
          getRowId={(p) => p.id}
          emptyTitle="Belum ada periode kinerja"
        />
      </SectionCard>

      {isLive(profiles) && profiles.value.length === 0 ? (
        <EmptyState
          title="Indeks kinerja belum dapat dihitung"
          description="Belum ada model pembobotan yang dikonfigurasi."
        />
      ) : null}
    </div>
  );
}
