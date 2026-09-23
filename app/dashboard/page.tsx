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
          title="Not signed in"
          description="Sign in with your Telkom account to see your dashboard."
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
  const withheld = (value: number | null) => (value === null ? "Hidden (under 5)" : String(value));
  const chapterColumns: readonly Column<ChapterSummaryRow>[] = [
    { id: "chapter", header: "Chapter", cell: (r) => r.organizationName },
    { id: "headcount", header: "Active people", align: "end", cell: (r) => String(r.activeHeadcount) },
    { id: "assessed", header: "Capability-assessed", align: "end", cell: (r) => withheld(r.talentsAssessed) },
    { id: "assignments", header: "Active assignments", align: "end", cell: (r) => withheld(r.activeAssignments) },
    { id: "overallocated", header: "Over-allocated", align: "end", cell: (r) => withheld(r.overallocatedPeople) },
    { id: "projects", header: "Active projects", align: "end", cell: (r) => String(r.activeProjects) },
  ];

  const projectColumns: readonly Column<ProjectRow>[] = [
    { id: "name", header: "Project", cell: (p) => p.name },
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
          title="No dashboard sections available"
          description="Your account holds no read permissions for chapter intelligence. Contact an administrator if this is unexpected."
        />
      ) : null}

      {/* Trend cards — the six domains. */}
      <section aria-labelledby="chapter-intelligence">
        <h2
          id="chapter-intelligence"
          className="mb-3 text-sm font-medium tracking-wide text-slate-500 uppercase"
        >
          Chapter Intelligence
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isSectionVisible(view, "talent_health") ? (
            <MetricCard
              label="Talent Health"
              icon={Users}
              tone="info"
              point={headcount}
              description="Active people in scope."
            />
          ) : null}
          {isSectionVisible(view, "performance") ? (
            <MetricCard
              label="Performance"
              icon={TrendingUp}
              tone="success"
              point={performance}
              description="Weighted composite. Weights are configuration, not policy (PRD §6.1)."
            />
          ) : null}
          {isSectionVisible(view, "capability") ? (
            <MetricCard
              label="Capability Coverage"
              icon={Layers}
              tone="info"
              point={coverage}
              description="Share of required capabilities met at target level."
            />
          ) : null}
          {isSectionVisible(view, "workload") ? (
            <MetricCard
              label="Workload"
              icon={GraduationCap}
              tone="warning"
              point={mapLive(workload, (rows) => rows.length)}
              description="People with an active assignment."
            />
          ) : null}
          {isSectionVisible(view, "ai_augmentation") ? (
            <MetricCard
              label="AI Augmentation"
              icon={Sparkles}
              tone="info"
              point={augmentation}
              description="Measured AI leverage across the chapter."
            />
          ) : null}
          {isSectionVisible(view, "business_impact") ? (
            <MetricCard
              label="Business Impact"
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
              description="Human-validated impact only (PRD §35)."
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
            title="Capability Gaps"
            description="Required level minus current proven level, prioritised by criticality and urgency (PRD §7.3)."
          >
            <DataTable
              caption="Critical capability gaps"
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
              emptyTitle="No capability gaps recorded"
            />
          </SectionCard>
        ) : null}

        {showChapterTotals ? (
          <SectionCard
            title="Chapter Totals"
            description="Counts only, computed in the database. Figures describing fewer than five people are withheld."
            action={<Users aria-hidden="true" className="size-4 text-slate-400" />}
          >
            <DataTable
              caption="Totals per chapter"
              columns={chapterColumns}
              data={chapterTotals}
              getRowId={(r) => r.organizationId}
              emptyTitle="No chapters in scope"
            />
          </SectionCard>
        ) : null}

        {isSectionVisible(view, "project_intelligence") ? (
          <SectionCard
            title="Project Intelligence"
            description="Active and planned projects in scope."
            action={<FolderKanban aria-hidden="true" className="size-4 text-slate-400" />}
          >
            <DataTable
              caption="Active projects"
              columns={projectColumns}
              data={projects}
              getRowId={(p) => p.id}
              emptyTitle="No active projects"
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
