import type { Metadata } from "next";

import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import {
  DEVELOPMENT_LOOP,
  SPRINT_PHASES,
  SPRINT_PHASE_LABEL,
  hoursByPhase,
  validateTemplate,
  type DevelopmentTemplate,
} from "@/lib/calculations/development";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import {
  listDevelopmentTemplates,
  listUpgradeProposals,
  type UpgradeProposalRow,
} from "@/lib/development/queries";

export const metadata: Metadata = { title: "Pengembangan · TANIA" };

const LOOP_LABEL: Record<string, string> = {
  capability_gap: "Gap capability",
  development_plan: "Rencana pengembangan",
  learn: "Belajar",
  practice: "Praktik",
  ai_coaching: "Coaching AI",
  project_assignment: "Penugasan proyek",
  evidence: "Bukti",
  assessment: "Asesmen",
  capability_update: "Pembaruan capability",
  business_impact: "Dampak bisnis",
};

/**
 * S08 — Development Center (PRD §32).
 *
 * Shows the loop, the configured sprint templates, and the queue of capability
 * upgrade proposals awaiting a human decision.
 *
 * The PRD's 20-hour breakdown for AI Product Manager is an example for one
 * role and is not seeded. A template must be configured and approved.
 */
export default async function DevelopmentPage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Pengembangan" />
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "development.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Pengembangan" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin development.read."
        />
      </div>
    );
  }

  const [templates, proposals] = await Promise.all([
    listDevelopmentTemplates(),
    listUpgradeProposals({ status: "proposed" }),
  ]);

  const templateColumns: readonly Column<DevelopmentTemplate>[] = [
    { id: "name", header: "Template", cell: (t) => t.name },
    {
      id: "hours",
      header: "Jam",
      align: "end",
      cell: (t) => <span className="tabular-nums">{t.totalHours}</span>,
    },
    {
      id: "phases",
      header: "Fase",
      cell: (t) => (
        <span className="text-xs text-slate-600">
          {hoursByPhase(t)
            .map((p) => `${SPRINT_PHASE_LABEL[p.phase]} ${p.hours} jam`)
            .join(" · ")}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      id: "valid",
      header: "Validitas",
      align: "end",
      cell: (t) => {
        const problems = validateTemplate(t);
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
      cell: (t) =>
        t.approved ? (
          <StatusBadge tone="success">Disetujui</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Belum disetujui</StatusBadge>
        ),
    },
  ];

  const proposalColumns: readonly Column<UpgradeProposalRow>[] = [
    {
      id: "change",
      header: "Perubahan yang diusulkan",
      cell: (p) => (
        <span className="tabular-nums">
          L{p.fromLevel} → L{p.toLevel}
        </span>
      ),
    },
    {
      id: "origin",
      header: "Diusulkan oleh",
      cell: (p) => (
        <StatusBadge tone={p.proposedByAgent ? "warning" : "neutral"}>
          {p.proposedByAgent ? `${p.proposedByAgent} (AI)` : "Manusia"}
        </StatusBadge>
      ),
      hideOnMobile: true,
    },
    {
      id: "rationale",
      header: "Alasan",
      cell: (p) => p.rationale ?? "—",
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: () => <StatusBadge tone="warning">Menunggu keputusan manusia</StatusBadge>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Pengembangan"
        description="Jangan melatih orang sekadar untuk tahu. Latih orang untuk mampu melakukan."
      />

      <SectionCard
        title="Siklus pengembangan"
        description="PRD §8.1. Bukti dan asesmen selalu mendahului pembaruan capability — tidak pernah sebaliknya."
      >
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {DEVELOPMENT_LOOP.map((stage, index) => (
            <li key={stage} className="flex items-center gap-2">
              <span className="rounded-[var(--radius-control)] border border-slate-200 px-2.5 py-1 text-xs text-slate-700">
                {LOOP_LABEL[stage] ?? stage}
              </span>
              {index < DEVELOPMENT_LOOP.length - 1 ? (
                <span aria-hidden="true" className="text-slate-300">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard
        title="Kerangka sprint capability"
        description="PRD §8.2. Kerangkanya tetap; rincian aktivitas ditetapkan per template."
      >
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {SPRINT_PHASES.map((phase, index) => (
            <li key={phase} className="flex items-center gap-2">
              <span className="rounded-[var(--radius-control)] bg-[var(--color-telkom-blue-100)] px-2.5 py-1 text-xs font-medium text-[var(--color-telkom-navy)]">
                {SPRINT_PHASE_LABEL[phase]}
              </span>
              {index < SPRINT_PHASES.length - 1 ? (
                <span aria-hidden="true" className="text-slate-300">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard
        title="Template pengembangan"
        description="Kurikulum yang dapat dikonfigurasi. Template tanpa aktivitas penerapan tidak akan pernah menaikkan capability."
      >
        <DataTable
          caption="Template pengembangan"
          columns={templateColumns}
          data={templates}
          getRowId={(t) => t.id}
          emptyTitle="Belum ada template pengembangan yang dikonfigurasi"
          emptyDescription="PRD §8.2 memberikan rincian 20 jam untuk satu peran sebagai contoh. Rincian itu tidak dimuat sebagai kebijakan universal — administrator harus menetapkan dan menyetujui template."
        />
      </SectionCard>

      <SectionCard
        title="Usulan kenaikan capability"
        description="Rencana yang selesai mengusulkan kenaikan; rencana tidak pernah melakukannya sendiri. Setiap usulan harus menyertakan bukti dan menunggu keputusan manusia."
      >
        <DataTable
          caption="Usulan kenaikan capability yang menunggu keputusan"
          columns={proposalColumns}
          data={proposals}
          getRowId={(p) => p.id}
          emptyTitle="Tidak ada usulan yang menunggu keputusan"
        />
      </SectionCard>
    </div>
  );
}
