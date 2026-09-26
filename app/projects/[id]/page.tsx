import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  DataTable,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { DataStateNotice } from "@/components/data/data-state";
import {
  MATCH_DIMENSIONS,
  MATCH_DIMENSION_LABEL,
  RECOMMENDED_ACTION_LABEL,
} from "@/lib/calculations/matching";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import {
  getProject,
  listAssignments,
  type AssignmentRow,
} from "@/lib/workload/queries";
import { isLive } from "@/types/data";

export const metadata: Metadata = { title: "Proyek · TANIA" };

/**
 * S10 — Project detail (PRD §34).
 *
 * Shows staffing and the matching contract. Candidate matching itself needs
 * capability, availability and workload data for a real population; with no
 * database the shortlist is not fabricated — the page states what matching
 * will produce and what it will never do.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) notFound();
  if (!can(context, "project.read").allowed) notFound();

  const [project, assignments] = await Promise.all([
    getProject(id),
    listAssignments({ projectId: id }),
  ]);

  // Restricted and missing are indistinguishable, so the response does not
  // confirm the project exists.
  if (project.state === "empty" || project.state === "restricted") notFound();

  const columns: readonly Column<AssignmentRow>[] = [
    { id: "person", header: "Talent", cell: (a) => a.profileName },
    { id: "role", header: "Peran", cell: (a) => a.roleName ?? "—", hideOnMobile: true },
    {
      id: "allocation",
      header: "Alokasi",
      align: "end",
      cell: (a) => <span className="tabular-nums">{Math.round(a.allocationPct)}%</span>,
    },
    {
      id: "approval",
      header: "Persetujuan",
      align: "end",
      cell: (a) =>
        a.approved ? (
          <StatusBadge tone="success">Disetujui</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Menunggu persetujuan</StatusBadge>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={isLive(project) ? project.value.name : "Proyek"}
        description={isLive(project) ? project.value.code : undefined}
      />

      <SectionCard title="Proyek">
        {!isLive(project) ? (
          <DataStateNotice point={project} />
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="Status" value={project.value.status} />
            <Field label="Pelanggan" value={project.value.customerName} />
            <Field label="Mulai" value={project.value.startDate} />
            <Field label="Selesai" value={project.value.endDate} />
          </dl>
        )}
      </SectionCard>

      <SectionCard
        title="Penempatan talent"
        description="Penugasan pada proyek ini beserta status persetujuannya."
      >
        <DataTable
          caption="Penempatan talent proyek"
          columns={columns}
          data={assignments}
          getRowId={(a) => a.id}
          emptyTitle="Belum ada yang ditugaskan"
          emptyDescription="Belum ada penugasan untuk proyek ini dalam cakupan yang Anda berwenang."
        />
      </SectionCard>

      <SectionCard
        title="Pencocokan Talent"
        description="Apa yang dihasilkan pencocokan, dan apa yang tidak akan pernah dilakukannya."
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              Dimensi yang dinilai
            </p>
            <ul className="flex flex-wrap gap-2">
              {MATCH_DIMENSIONS.map((dimension) => (
                <li
                  key={dimension}
                  className="rounded-[var(--radius-control)] border border-slate-200 px-2.5 py-1 text-xs text-slate-700"
                >
                  {MATCH_DIMENSION_LABEL[dimension]}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              Setiap kecocokan menghasilkan
            </p>
            <ul className="space-y-1 text-sm text-slate-600">
              <li>
                <strong className="text-slate-800">Kecocokan</strong> — skor
                berbobot atas dimensi yang memiliki data.
              </li>
              <li>
                <strong className="text-slate-800">Bukti</strong> — apa yang
                mendukung skor.
              </li>
              <li>
                <strong className="text-slate-800">Gap</strong> — apa yang
                kurang atau tidak sesuai.
              </li>
              <li>
                <strong className="text-slate-800">Tingkat keyakinan</strong> — ditentukan
                oleh cakupan data, bukan oleh seberapa cocok kelihatannya. Skor
                tinggi dengan data minim menghasilkan tingkat keyakinan rendah.
              </li>
              <li>
                <strong className="text-slate-800">Tindakan yang direkomendasikan</strong> —
                salah satu dari:{" "}
                {Object.values(RECOMMENDED_ACTION_LABEL).join(", ").toLowerCase()}.
              </li>
            </ul>
          </div>

          <p className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Pencocokan tidak pernah menugaskan atau memindahkan siapa pun. Hasil
            terkuatnya adalah usulan yang dievaluasi oleh manusia dengan izin
            assignment.approve (PRD §58).
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value ?? "—"}</dd>
    </div>
  );
}
