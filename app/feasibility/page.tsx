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
  FEASIBILITY_STAGES,
  FEASIBILITY_STAGE_LABEL,
  MIN_FEASIBILITY_COVERAGE,
} from "@/lib/calculations/feasibility";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import { listFeasibilityAssessments, type FeasibilityRow } from "@/lib/project/queries";

export const metadata: Metadata = { title: "Feasibility · TANIA" };

const STAGE_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  intake: "neutral",
  scoring: "info",
  resource_check: "info",
  business_case: "info",
  decision: "warning",
  approved: "success",
  rejected: "danger",
  delivered: "success",
  reviewed: "neutral",
};

/**
 * Feasibility pipeline (PRD §35).
 *
 * Intake through post-delivery review. The score shown is the one stored at
 * decision time, so a past decision can be reviewed against the evidence it
 * rested on rather than against today's weights.
 */
export default async function FeasibilityPage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Feasibility" />
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "project.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Feasibility" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin project.read."
        />
      </div>
    );
  }

  const assessments = await listFeasibilityAssessments();
  const canDecide = can(context, "project.update").allowed;

  const columns: readonly Column<FeasibilityRow>[] = [
    { id: "title", header: "Kasus", cell: (a) => a.title },
    {
      id: "customer",
      header: "Pelanggan",
      cell: (a) => a.customerName ?? "—",
      hideOnMobile: true,
    },
    {
      id: "score",
      header: "Skor",
      align: "end",
      cell: (a) =>
        a.totalScore === null ? (
          <span className="text-slate-400">belum dinilai</span>
        ) : (
          <span className="tabular-nums">
            {a.totalScore}
            {a.scoreCoverage !== null && a.scoreCoverage < MIN_FEASIBILITY_COVERAGE * 100 ? (
              <span className="ml-1 text-xs text-amber-700">
                (cakupan {a.scoreCoverage}%)
              </span>
            ) : null}
          </span>
        ),
    },
    {
      id: "stage",
      header: "Tahap",
      align: "end",
      cell: (a) => (
        <StatusBadge tone={STAGE_TONE[a.stage] ?? "neutral"}>{a.stageLabel}</StatusBadge>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Feasibility"
        description="Intake, penilaian skor, cek sumber daya, business case, keputusan, delivery, dan tinjauan pasca-delivery."
      />

      <SectionCard
        title="Pipeline"
        description="Kasus dapat ditolak di tahap mana pun sebelum keputusan. Menghentikan pekerjaan lebih awal selalu diperbolehkan."
      >
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {FEASIBILITY_STAGES.filter((s) => s !== "rejected").map((stage, index, all) => (
            <li key={stage} className="flex items-center gap-2">
              <span className="rounded-[var(--radius-control)] border border-slate-200 px-2.5 py-1 text-xs text-slate-700">
                {FEASIBILITY_STAGE_LABEL[stage]}
              </span>
              {index < all.length - 1 ? (
                <span aria-hidden="true" className="text-slate-300">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard
        title="Kasus"
        description={
          canDecide
            ? "Anda memiliki izin project.update dan dapat memutuskan kasus dalam organisasi Anda."
            : "Anda tidak memiliki izin project.update. Kasus dapat dilihat, tetapi tidak dapat Anda putuskan."
        }
      >
        <DataTable
          caption="Kasus Feasibility"
          columns={columns}
          data={assessments}
          getRowId={(a) => a.id}
          emptyTitle="Belum ada kasus Feasibility"
          emptyDescription="Belum ada kasus dalam cakupan yang Anda berwenang."
        />
      </SectionCard>

      <SectionCard title="Cara penilaian skor" headingLevel={3}>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            Kriteria dan bobot <strong className="text-slate-800">dapat dikonfigurasi</strong>,
            dengan ambang persetujuan dan tinjauan per profil. Skor business
            case menentukan apakah pekerjaan dijalankan, sehingga modelnya tidak
            di-hard-code.
          </li>
          <li>
            Kriteria bertipe risiko dibalik, sehingga skor risiko tinggi
            menurunkan total, bukan menaikkannya.
          </li>
          <li>
            Kriteria yang belum dinilai <strong className="text-slate-800">dikecualikan</strong>,
            tidak dihitung sebagai nol — dan di bawah cakupan {MIN_FEASIBILITY_COVERAGE * 100}%
            tidak ada rekomendasi sama sekali.
          </li>
          <li>
            Skor adalah <strong className="text-slate-800">rekomendasi</strong>.
            Menyetujui atau menolak kasus adalah tindakan manusia, dan setiap
            keputusan dicatat ke log audit oleh trigger database.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
