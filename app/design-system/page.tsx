import {
  Database,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { TaniaAvatar, TaniaPresence, TANIA_STATES } from "@/components/brand/tania-avatar";
import {
  CapabilityStatusBadge,
  DataTable,
  EmptyState,
  ErrorState,
  EvidenceCard,
  InsightCard,
  LoadingState,
  MetricCard,
  PageHeader,
  ProgressMeter,
  SectionCard,
  StatusBadge,
  UserIdentity,
  WorkStatusBadge,
  type Column,
} from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OverlaysDemo } from "@/app/design-system/overlays-demo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notConnected } from "@/types/data";
import type { DataPoint } from "@/types/data";
import { CAPABILITY_STATUSES, TONES, WORK_STATUSES } from "@/types/status";

export const metadata: Metadata = { title: "Design system · TANIA" };

/**
 * Design system reference.
 *
 * Shows every component in its real states so regressions are visible and
 * accessibility can be checked with a keyboard and a screen reader.
 *
 * Data-bearing components are shown in NON-LIVE states only. Filling them
 * with invented figures would contradict the provenance contract the same
 * components exist to enforce (CLAUDE.md §2a). Pure presentation components —
 * badges, progress, buttons — show their variants directly, because a
 * progress bar at 60% is a UI state, not a claim about anyone.
 */

interface DemoRow {
  id: string;
  project: string;
  progress: number;
  status: (typeof WORK_STATUSES)[number];
}

const DEMO_COLUMNS: readonly Column<DemoRow>[] = [
  { id: "project", header: "Project", cell: (r) => r.project },
  {
    id: "progress",
    header: "Progress",
    cell: (r) => <ProgressMeter value={r.progress} label={`${r.project} progress`} />,
    width: "40%",
    hideOnMobile: true,
  },
  {
    id: "status",
    header: "Status",
    align: "end",
    cell: (r) => <WorkStatusBadge status={r.status} />,
  },
];

const NO_ROWS: DataPoint<readonly DemoRow[]> = notConnected(12, "projects table");

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader
        title="Design system"
        description="TANIA component reference — Telkom enterprise visual language, accessibility states, and the provenance contract."
        action={<Badge variant="outline">Phase 5</Badge>}
      />

      <div className="space-y-8">
        <SectionCard
          title="TANIA avatar"
          description="The DPS AI employee. Presence states from PRD §80.3. The official portrait is a brand asset supplied via portraitSrc; the monogram is the fallback."
        >
          <div className="flex flex-wrap items-end gap-6">
            {TANIA_STATES.map((state) => (
              <div key={state} className="flex flex-col items-center gap-2">
                <TaniaAvatar state={state} size="lg" />
                <span className="text-xs text-slate-500">{state}</span>
              </div>
            ))}
          </div>
          <TaniaPresence state="idle" className="mt-6" />
        </SectionCard>

        <SectionCard
          title="Status"
          description="Colour is never the only signal — every badge carries a text label and a non-colour dot."
        >
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Capability</p>
              <div className="flex flex-wrap gap-2">
                {CAPABILITY_STATUSES.map((s) => (
                  <CapabilityStatusBadge key={s} status={s} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Work</p>
              <div className="flex flex-wrap gap-2">
                {WORK_STATUSES.map((s) => (
                  <WorkStatusBadge key={s} status={s} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Tones</p>
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => (
                  <StatusBadge key={tone} tone={tone}>
                    {tone}
                  </StatusBadge>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Metrics"
          description="All six render as not-connected: no database exists, and a layout demo is not a reason to invent numbers."
          bodyClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <MetricCard label="Total Talent" icon={Users} tone="info" point={notConnected(7, "profiles")} />
          <MetricCard label="Performance Index" icon={TrendingUp} tone="success" point={notConnected(9, "performance_metrics")} />
          <MetricCard label="Capability Coverage" icon={Layers} tone="info" point={notConnected(8, "talent_capabilities")} />
          <MetricCard label="AI Adoption" icon={Sparkles} tone="info" point={notConnected(13, "ai_usage")} />
          <MetricCard label="Development Progress" icon={GraduationCap} tone="warning" point={notConnected(10, "development_plans")} />
          <MetricCard label="Critical Gaps" icon={Target} tone="danger" point={notConnected(8, "capability_requirements")} />
        </SectionCard>

        <SectionCard title="Tabs" description="Segmented control, keyboard navigable with arrow keys.">
          <Tabs defaultValue="individual">
            <TabsList>
              <TabsTrigger value="individual">Individual</TabsTrigger>
              <TabsTrigger value="squad">Squad</TabsTrigger>
              <TabsTrigger value="chapter">Chapter DPS</TabsTrigger>
            </TabsList>
            <TabsContent value="individual" className="pt-4 text-sm text-slate-600">
              Individual scope.
            </TabsContent>
            <TabsContent value="squad" className="pt-4 text-sm text-slate-600">
              Squad scope — a manager sees only squads they manage.
            </TabsContent>
            <TabsContent value="chapter" className="pt-4 text-sm text-slate-600">
              Chapter scope.
            </TabsContent>
          </Tabs>
        </SectionCard>

        <SectionCard
          title="Data table"
          description="Bound to DataPoint, so it cannot render an empty body when the truth is 'not connected'."
        >
          <DataTable
            caption="Active projects"
            columns={DEMO_COLUMNS}
            data={NO_ROWS}
            getRowId={(row) => row.id}
          />
        </SectionCard>

        <SectionCard
          title="Insights"
          description="Every insight names what produced it. An AI claim without provenance is not a fact."
          bodyClassName="divide-y divide-slate-100"
        >
          <InsightCard
            icon={Target}
            tone="danger"
            title="Critical capability gaps detected"
            detail="Requires capability_requirements and talent_capabilities"
            source="Capability Agent"
            confidence={0}
          />
          <InsightCard
            icon={Sparkles}
            tone="info"
            title="AI adoption analysis"
            detail="Requires ai_usage"
            source="AI Augmentation Agent"
          />
        </SectionCard>

        <SectionCard
          title="Evidence"
          description="Source, date, validation status and origin are always shown."
          bodyClassName="grid gap-3 md:grid-cols-2"
        >
          <EvidenceCard
            title="Capability evidence (validated)"
            description="Illustrates the validated state."
            sourceType="project_deliverable"
            sourceReference="SAMPLE-PRJ-1"
            occurredAt="2026-08-14T00:00:00.000Z"
            validationStatus="validated"
            validatedBy="Chapter Lead"
          />
          <EvidenceCard
            title="Performance evidence (AI-generated, pending)"
            description="AI-generated claims are marked and stay pending until a human validates them."
            sourceType="agent_analysis"
            occurredAt="2026-09-02T00:00:00.000Z"
            validationStatus="pending"
            origin="ai_generated"
          />
        </SectionCard>

        <SectionCard
          title="States"
          description="Every data surface must handle all three."
          bodyClassName="grid gap-4 md:grid-cols-3"
        >
          <EmptyState title="No records" description="The query returned no rows." />
          <LoadingState label="Loading example" rows={3} />
          <ErrorState detail="req_00000000" />
        </SectionCard>

        <SectionCard title="Progress and identity">
          <div className="max-w-sm space-y-4">
            <ProgressMeter value={76} label="Example completion" />
            <ProgressMeter value={30} label="Example completion, lower" />
            <UserIdentity name="Chapter Lead" role="Chapter DPS" />
          </div>
        </SectionCard>

        <SectionCard
          title="Overlays"
          description="Modal, drawer and dropdown. All three trap focus, close on Escape, and return focus to their trigger."
        >
          <OverlaysDemo />
        </SectionCard>

        <SectionCard title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>
              <Database aria-hidden="true" className="size-4" />
              Disabled
            </Button>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
