import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  DataTable,
  EvidenceCard,
  PageHeader,
  ProgressMeter,
  SectionCard,
  StatusBadge,
  UserIdentity,
  WorkStatusBadge,
  type Column,
} from "@/components/dashboard";
import { DataStateNotice } from "@/components/data/data-state";
import { getAuthContext } from "@/lib/auth/session";
import {
  getAiAugmentation,
  getAssignmentHistory,
  getBusinessImpact,
  getCapabilityEvidence,
  getDevelopmentPlans,
  getPerformanceEvidence,
  getTalentCapabilities,
  getTalentIdentity,
  type AssignmentRow,
  type CapabilityRow,
  type DevelopmentPlanRow,
  type PerformanceEvidenceRow,
} from "@/lib/talent/queries";
import { isLive, mapLive } from "@/types/data";
import type { WorkStatus } from "@/types/status";

export const metadata: Metadata = { title: "Paspor talent · TANIA" };

/**
 * S04 — Digital Talent Passport (TANIA_PRD_v2.0.md §28).
 *
 * Eleven sections, each fetched through its own sensitivity gate. A manager
 * may read a squad member's identity and capabilities (CONFIDENTIAL) but not
 * their performance evidence or development plan (SENSITIVE) unless scope
 * allows — so sections render independently, and a blocked one shows an
 * explicit "not authorized" panel rather than silently vanishing.
 *
 * If the viewer cannot read the person at all, the route returns notFound().
 * A 403 would confirm the record exists; concealment is the correct response
 * for a directory (CLAUDE.md §22).
 *
 * Private AI conversations (ai_interactions, RESTRICTED) are deliberately
 * absent: they are owner-only and have no place on someone else's passport.
 */
export default async function TalentPassportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) notFound();

  const identity = await getTalentIdentity(id);

  // Restricted or missing are both rendered as "not found", so the response
  // does not reveal whether this person exists.
  if (identity.state === "restricted" || identity.state === "empty") {
    notFound();
  }

  const [
    capabilities,
    certifications,
    evidence,
    performance,
    assignments,
    development,
    augmentation,
    impact,
  ] = await Promise.all([
    getTalentCapabilities(id),
    getCapabilityEvidence(id, { certificationsOnly: true }),
    getCapabilityEvidence(id),
    getPerformanceEvidence(id),
    getAssignmentHistory(id),
    getDevelopmentPlans(id),
    getAiAugmentation(id),
    getBusinessImpact(id),
  ]);

  const person = isLive(identity) ? identity.value : null;

  const capabilityColumns: readonly Column<CapabilityRow>[] = [
    { id: "name", header: "Capability", cell: (c) => c.name },
    { id: "domain", header: "Domain", cell: (c) => c.domain, hideOnMobile: true },
    {
      id: "level",
      header: "Level",
      align: "end",
      cell: (c) => (
        <span className="tabular-nums">
          L{c.currentLevel}
          {c.targetLevel ? ` → L${c.targetLevel}` : ""}
        </span>
      ),
    },
    {
      id: "status",
      header: "Asesmen",
      align: "end",
      cell: (c) => (
        // Provisional is the default: a level is a claim until evidence
        // validates it (PRD §7.1).
        <StatusBadge
          tone={c.assessmentStatus === "evidence_validated" ? "success" : "warning"}
        >
          {c.assessmentStatus.replace(/_/g, " ")}
        </StatusBadge>
      ),
    },
  ];

  const assignmentColumns: readonly Column<AssignmentRow>[] = [
    { id: "project", header: "Proyek", cell: (a) => a.projectName },
    { id: "role", header: "Peran", cell: (a) => a.roleName ?? "—", hideOnMobile: true },
    {
      id: "allocation",
      header: "Alokasi",
      align: "end",
      cell: (a) => `${Math.round(a.allocationPct)}%`,
    },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: (a) => <WorkStatusBadge status={normalizeAssignment(a.status)} />,
    },
  ];

  const performanceColumns: readonly Column<PerformanceEvidenceRow>[] = [
    { id: "dimension", header: "Dimensi", cell: (p) => p.dimension },
    { id: "metric", header: "Metrik", cell: (p) => p.metric ?? "—", hideOnMobile: true },
    {
      id: "value",
      header: "Nilai",
      align: "end",
      cell: (p) => (p.value === null ? "—" : `${p.value}${p.unit ? ` ${p.unit}` : ""}`),
    },
    {
      id: "origin",
      header: "Asal",
      align: "end",
      cell: (p) => (
        // An AI-generated claim must never be indistinguishable from a human
        // assertion (CLAUDE.md §16).
        <StatusBadge tone={p.origin === "ai_generated" ? "warning" : "neutral"}>
          {p.origin === "ai_generated" ? "Dibuat AI" : p.origin}
        </StatusBadge>
      ),
    },
    {
      id: "validation",
      header: "Validasi",
      align: "end",
      cell: (p) => (
        <StatusBadge tone={p.validationStatus === "validated" ? "success" : "warning"}>
          {p.validationStatus}
        </StatusBadge>
      ),
    },
  ];

  const developmentColumns: readonly Column<DevelopmentPlanRow>[] = [
    { id: "title", header: "Rencana", cell: (d) => d.title },
    {
      id: "progress",
      header: "Progres",
      cell: (d) => <ProgressMeter value={d.completionPct} label={`Progres ${d.title}`} />,
      width: "35%",
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: (d) => <StatusBadge tone="info">{d.status.replace(/_/g, " ")}</StatusBadge>,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={person?.fullName ?? "Paspor talent"}
        description="Paspor Talent Digital"
      />

      {/* Identity · Role · Organization · Experience */}
      <SectionCard title="Identitas">
        {!isLive(identity) ? (
          <DataStateNotice point={identity} />
        ) : (
          <div className="space-y-4">
            <UserIdentity
              name={person!.fullName}
              role={person!.jobTitle ?? undefined}
              avatarUrl={person!.avatarUrl ?? undefined}
            />
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="ID karyawan" value={person!.employeeId} />
              <Field label="Email" value={person!.email} />
              <Field label="Grade" value={person!.grade} />
              <Field label="Departemen" value={person!.department} />
              <Field label="Level karier" value={person!.careerLevel} />
              <Field
                label="Pengalaman"
                value={
                  person!.yearsExperience === null
                    ? null
                    : `${person!.yearsExperience} tahun`
                }
              />
            </dl>
            {person!.summary ? (
              <p className="text-sm text-slate-600">{person!.summary}</p>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Capability" description="Level terbukti saat ini terhadap target.">
        <DataTable
          caption="Profil capability"
          columns={capabilityColumns}
          data={capabilities}
          getRowId={(c) => c.id}
          emptyTitle="Belum ada capability yang diases"
        />
      </SectionCard>

      <SectionCard
        title="Sertifikasi"
        description="Sertifikasi adalah bukti, bukan capability (PRD §7.1). Masing-masing memiliki status validasi sendiri."
      >
        {!isLive(certifications) ? (
          <DataStateNotice point={certifications} />
        ) : certifications.value.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada sertifikasi yang tercatat.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {certifications.value.map((c) => (
              <EvidenceCard
                key={c.id}
                title={c.title}
                description={c.description ?? undefined}
                sourceType={c.sourceType}
                sourceReference={c.sourceReference ?? undefined}
                occurredAt={c.occurredAt ?? undefined}
                validationStatus={c.validationStatus as "pending" | "validated" | "rejected" | "withdrawn"}
                evidenceUrl={c.evidenceUrl ?? undefined}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Bukti" description="Bukti penerapan capability.">
        {!isLive(evidence) ? (
          <DataStateNotice point={evidence} />
        ) : evidence.value.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada bukti capability yang tercatat.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {evidence.value.slice(0, 6).map((e) => (
              <EvidenceCard
                key={e.id}
                title={e.title}
                description={e.description ?? undefined}
                sourceType={e.sourceType}
                sourceReference={e.sourceReference ?? undefined}
                occurredAt={e.occurredAt ?? undefined}
                validationStatus={e.validationStatus as "pending" | "validated" | "rejected" | "withdrawn"}
                evidenceUrl={e.evidenceUrl ?? undefined}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Kinerja"
        description="Sensitif. Hanya terlihat dalam cakupan ketat."
      >
        <DataTable
          caption="Bukti kinerja"
          columns={performanceColumns}
          data={performance}
          getRowId={(p) => p.id}
          emptyTitle="Belum ada bukti kinerja"
        />
      </SectionCard>

      <SectionCard title="Proyek dan penugasan">
        <DataTable
          caption="Riwayat penugasan"
          columns={assignmentColumns}
          data={assignments}
          getRowId={(a) => a.id}
          emptyTitle="Belum ada penugasan"
        />
      </SectionCard>

      <SectionCard
        title="Pengembangan"
        description="Sensitif. Rencana pengembangan termasuk cakupan ketat."
      >
        <DataTable
          caption="Rencana pengembangan"
          columns={developmentColumns}
          data={development}
          getRowId={(d) => d.id}
          emptyTitle="Belum ada rencana pengembangan"
        />
      </SectionCard>

      <SectionCard title="Augmentasi AI" description="Pemanfaatan AI yang terukur.">
        {!isLive(augmentation) ? (
          <DataStateNotice point={augmentation} />
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field
              label="Skor keseluruhan"
              value={
                augmentation.value.overallScore === null
                  ? null
                  : String(augmentation.value.overallScore)
              }
            />
            <Field
              label="Jumlah bukti"
              value={String(augmentation.value.evidenceCount)}
            />
          </dl>
        )}
      </SectionCard>

      <SectionCard
        title="Dampak bisnis"
        description="Hanya dampak yang divalidasi manusia yang dihitung (PRD §35)."
      >
        <DataTable
          caption="Dampak bisnis"
          columns={[
            { id: "metric", header: "Metrik", cell: (b) => b.metricName },
            { id: "type", header: "Jenis", cell: (b) => b.impactType, hideOnMobile: true },
            {
              id: "actual",
              header: "Aktual",
              align: "end",
              cell: (b) => (b.actual === null ? "—" : `${b.actual}${b.unit ? ` ${b.unit}` : ""}`),
            },
            {
              id: "validation",
              header: "Validasi",
              align: "end",
              cell: (b) => (
                <StatusBadge tone={b.validationStatus === "validated" ? "success" : "warning"}>
                  {b.validationStatus}
                </StatusBadge>
              ),
            },
          ]}
          data={mapLive(impact, (rows) => rows)}
          getRowId={(b) => b.id}
          emptyTitle="Belum ada dampak bisnis yang tercatat"
        />
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

function normalizeAssignment(status: string): WorkStatus {
  switch (status) {
    case "active":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "proposed":
      return "on_track";
    default:
      return "on_track";
  }
}
