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

export const metadata: Metadata = { title: "Development · TANIA" };

const LOOP_LABEL: Record<string, string> = {
  capability_gap: "Capability Gap",
  development_plan: "Development Plan",
  learn: "Learn",
  practice: "Practice",
  ai_coaching: "AI Coaching",
  project_assignment: "Project Assignment",
  evidence: "Evidence",
  assessment: "Assessment",
  capability_update: "Capability Update",
  business_impact: "Business Impact",
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
        <PageHeader title="Development" />
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "development.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Development" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold development.read."
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
      header: "Hours",
      align: "end",
      cell: (t) => <span className="tabular-nums">{t.totalHours}</span>,
    },
    {
      id: "phases",
      header: "Phases",
      cell: (t) => (
        <span className="text-xs text-slate-600">
          {hoursByPhase(t)
            .map((p) => `${SPRINT_PHASE_LABEL[p.phase]} ${p.hours}h`)
            .join(" · ")}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      id: "valid",
      header: "Validity",
      align: "end",
      cell: (t) => {
        const problems = validateTemplate(t);
        return problems.length === 0 ? (
          <StatusBadge tone="success">Valid</StatusBadge>
        ) : (
          <StatusBadge tone="danger">{problems.length} problem(s)</StatusBadge>
        );
      },
    },
    {
      id: "approved",
      header: "Approved",
      align: "end",
      cell: (t) =>
        t.approved ? (
          <StatusBadge tone="success">Approved</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Not approved</StatusBadge>
        ),
    },
  ];

  const proposalColumns: readonly Column<UpgradeProposalRow>[] = [
    {
      id: "change",
      header: "Proposed change",
      cell: (p) => (
        <span className="tabular-nums">
          L{p.fromLevel} → L{p.toLevel}
        </span>
      ),
    },
    {
      id: "origin",
      header: "Proposed by",
      cell: (p) => (
        <StatusBadge tone={p.proposedByAgent ? "warning" : "neutral"}>
          {p.proposedByAgent ? `${p.proposedByAgent} (AI)` : "Human"}
        </StatusBadge>
      ),
      hideOnMobile: true,
    },
    {
      id: "rationale",
      header: "Rationale",
      cell: (p) => p.rationale ?? "—",
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: () => <StatusBadge tone="warning">Awaiting human decision</StatusBadge>,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Development"
        description="Don't train people to know. Train people to do."
      />

      <SectionCard
        title="Development loop"
        description="PRD §8.1. Evidence and assessment come before any capability update — never the other way round."
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
        title="Capability sprint framework"
        description="PRD §8.2. The framework is fixed; the activity breakdown is per template."
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
        title="Development templates"
        description="Configurable curricula. A template with no applied activity can never raise a capability."
      >
        <DataTable
          caption="Development templates"
          columns={templateColumns}
          data={templates}
          getRowId={(t) => t.id}
          emptyTitle="No development template configured"
          emptyDescription="PRD §8.2 gives a 20-hour breakdown for one role as an example. It is not seeded as universal policy — an administrator must define and approve a template."
        />
      </SectionCard>

      <SectionCard
        title="Capability upgrade proposals"
        description="A completed plan proposes an upgrade; it never performs one. Each proposal must cite evidence and await a human decision."
      >
        <DataTable
          caption="Capability upgrade proposals awaiting decision"
          columns={proposalColumns}
          data={proposals}
          getRowId={(p) => p.id}
          emptyTitle="No proposals awaiting decision"
        />
      </SectionCard>
    </div>
  );
}
