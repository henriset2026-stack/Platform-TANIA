import {
  FolderKanban,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { AlertsPanel } from "@/app/dashboard/_components/alerts-panel";
import { ScaleBanner } from "@/app/dashboard/_components/scale-banner";
import { WorkloadPanel } from "@/app/dashboard/_components/workload-panel";
import {
  DataTable,
  EmptyState,
  MetricCard,
  PageHeader,
  SectionCard,
  WorkStatusBadge,
  type Column,
} from "@/components/dashboard";
import { getAuthContext } from "@/lib/auth/session";
import {
  getActiveProjects,
  getAiAugmentation,
  getAlerts,
  getCapabilityCoverage,
  getCapabilityGaps,
  getChapterSummaries,
  getPerformanceIndex,
  getTalentHeadcount,
  getValidatedBusinessImpact,
  getWorkload,
  type ChapterSummaryRow,
  type ProjectRow,
} from "@/lib/dashboard/queries";
import { isSectionVisible, resolveDashboardView } from "@/lib/dashboard/views";
import { mapLive } from "@/types/data";
import type { WorkStatus } from "@/types/status";

export const metadata: Metadata = { title: "Dashboard · TANIA" };

/**
 * S02 — Executive Dashboard (TANIA_PRD_v2.0.md §26).
 *
 * Server component. Composition is role-aware: resolveDashboardView decides
 * which sections this viewer sees and at what breadth. That is a rendering
 * decision — the data behind each section is gated by RLS regardless, so a
 * section shown in error yields an empty state rather than a leak.
 *
 * Every figure comes from a real query in lib/dashboard/queries.ts. With no
 * Supabase project provisioned, those resolve to `not-connected` and the UI
 * says so explicitly. Nothing here is sample data.
 *
 * The AI assistant is Phase 15 and is deliberately absent.
 */
export default async function DashboardPage() {
  const context = await getAuthContext();

  // Unauthenticated callers are redirected by middleware. Reaching here
  // without a context means the session could not be resolved.
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Dashboard" />
        <EmptyState
          title="Belum masuk"
          description="Masuk dengan akun Telkom Anda untuk melihat dashboard Anda."
        />
      </div>
    );
  }

  const view = resolveDashboardView(context);

  const [
    headcount,
    performance,
    coverage,
    gaps,
    augmentation,
    impact,
    projects,
    alerts,
    workload,
    chapterTotals,
  ] = await Promise.all([
    getTalentHeadcount(view, context),
    getPerformanceIndex(view),
    getCapabilityCoverage(view),
    getCapabilityGaps(view),
    getAiAugmentation(view),
    getValidatedBusinessImpact(view),
    getActiveProjects(view),
    getAlerts(view, context),
    getWorkload(view, context),
    getChapterSummaries(view),
  ]);

  const showChapterTotals = view.scope === "aggregate" || view.scope === "platform";
  // A withheld figure says so; it never renders as 0 or a dash that reads as zero.
  const withheld = (value: number | null) => (value === null ? "Disembunyikan (di bawah 5)" : String(value));
  const chapterColumns: readonly Column<ChapterSummaryRow>[] = [
    { id: "chapter", header: "Chapter", cell: (r) => r.organizationName },
    { id: "headcount", header: "Talent aktif", align: "end", cell: (r) => String(r.activeHeadcount) },
    { id: "assessed", header: "Capability terasesmen", align: "end", cell: (r) => withheld(r.talentsAssessed) },
    { id: "assignments", header: "Penugasan aktif", align: "end", cell: (r) => withheld(r.activeAssignments) },
    { id: "overallocated", header: "Alokasi berlebih", align: "end", cell: (r) => withheld(r.overallocatedPeople) },
    { id: "projects", header: "Proyek aktif", align: "end", cell: (r) => String(r.activeProjects) },
  ];

  const projectColumns: readonly Column<ProjectRow>[] = [
    { id: "name", header: "Proyek", cell: (p) => p.name },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: (p) => <WorkStatusBadge status={normalizeStatus(p.status)} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={view.title} description={view.subtitle} />

      <ScaleBanner />

      {view.sections.length === 0 ? (
        <EmptyState
          title="Tidak ada bagian dashboard yang tersedia"
          description="Akun Anda tidak memiliki izin baca untuk intelijen chapter. Hubungi administrator jika ini tidak semestinya."
        />
      ) : null}

      {/* Trend cards — the six domains. */}
      <section aria-labelledby="chapter-intelligence">
        <h2
          id="chapter-intelligence"
          className="mb-3 text-sm font-medium tracking-wide text-slate-500 uppercase"
        >
          Intelijen Chapter
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isSectionVisible(view, "talent_health") ? (
            <MetricCard
              label="Kesehatan Talent"
              icon={Users}
              tone="info"
              point={headcount}
              description="Talent aktif dalam cakupan."
            />
          ) : null}
          {isSectionVisible(view, "performance") ? (
            <MetricCard
              label="Kinerja"
              icon={TrendingUp}
              tone="success"
              point={performance}
              description="Komposit berbobot. Bobot adalah konfigurasi, bukan kebijakan (PRD §6.1)."
            />
          ) : null}
          {isSectionVisible(view, "capability") ? (
            <MetricCard
              label="Cakupan Capability"
              icon={Layers}
              tone="info"
              point={coverage}
              description="Porsi capability yang dibutuhkan yang terpenuhi pada level target."
            />
          ) : null}
          {isSectionVisible(view, "workload") ? (
            <MetricCard
              label="Workload"
              icon={GraduationCap}
              tone="warning"
              point={mapLive(workload, (rows) => rows.length)}
              description="Talent dengan penugasan aktif."
            />
          ) : null}
          {isSectionVisible(view, "ai_augmentation") ? (
            <MetricCard
              label="Augmentasi AI"
              icon={Sparkles}
              tone="info"
              point={augmentation}
              description="Pemanfaatan AI yang terukur di seluruh chapter."
            />
          ) : null}
          {isSectionVisible(view, "business_impact") ? (
            <MetricCard
              label="Dampak Bisnis"
              icon={Target}
              tone="success"
              point={impact}
              format={(v) =>
                new Intl.NumberFormat("id-ID", {
                  style: "currency",
                  currency: "IDR",
                  maximumFractionDigits: 0,
                }).format(v)
              }
              description="Hanya dampak yang divalidasi manusia (PRD §35)."
            />
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {isSectionVisible(view, "workload") ? (
          <WorkloadPanel
            data={workload}
            allowsDrilldown={view.allowsIndividualDrilldown}
          />
        ) : null}

        {isSectionVisible(view, "alerts") ? <AlertsPanel data={alerts} /> : null}

        {isSectionVisible(view, "critical_insights") ? (
          <SectionCard
            title="Gap Capability"
            description="Level yang dibutuhkan dikurangi level terbukti saat ini, diprioritaskan menurut tingkat kritis dan urgensi (PRD §7.3)."
          >
            <DataTable
              caption="Gap capability kritis"
              columns={[
                { id: "capability", header: "Capability", cell: (r) => r.capability },
                {
                  id: "gap",
                  header: "Gap",
                  align: "end",
                  cell: (r) => `${r.currentLevel} → ${r.requiredLevel}`,
                },
              ]}
              data={gaps}
              getRowId={(r) => r.capability}
              emptyTitle="Belum ada gap capability yang tercatat"
            />
          </SectionCard>
        ) : null}

        {showChapterTotals ? (
          <SectionCard
            title="Total per Chapter"
            description="Hanya jumlah, dihitung di database. Angka yang menggambarkan kurang dari lima orang disembunyikan."
            action={<Users aria-hidden="true" className="size-4 text-slate-400" />}
          >
            <DataTable
              caption="Total per chapter"
              columns={chapterColumns}
              data={chapterTotals}
              getRowId={(r) => r.organizationId}
              emptyTitle="Tidak ada chapter dalam cakupan"
            />
          </SectionCard>
        ) : null}

        {isSectionVisible(view, "project_intelligence") ? (
          <SectionCard
            title="Intelijen Proyek"
            description="Proyek aktif dan terencana dalam cakupan."
            action={<FolderKanban aria-hidden="true" className="size-4 text-slate-400" />}
          >
            <DataTable
              caption="Proyek aktif"
              columns={projectColumns}
              data={projects}
              getRowId={(p) => p.id}
              emptyTitle="Tidak ada proyek aktif"
            />
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

/** Maps a database status string onto the WorkStatus vocabulary. */
function normalizeStatus(status: string): WorkStatus {
  switch (status) {
    case "active":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "on_hold":
      return "at_risk";
    default:
      return "on_track";
  }
}
