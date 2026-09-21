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

export const metadata: Metadata = { title: "Performance · TANIA" };

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
        <PageHeader title="Performance" />
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "performance.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Performance" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold performance.read."
        />
      </div>
    );
  }

  const [periods, profiles] = await Promise.all([
    listPerformancePeriods(),
    listWeightProfiles(),
  ]);

  const periodColumns: readonly Column<PeriodRow>[] = [
    { id: "name", header: "Period", cell: (p) => p.name },
    { id: "type", header: "Type", cell: (p) => p.periodType, hideOnMobile: true },
    {
      id: "dates",
      header: "Dates",
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
      header: "Dimensions",
      align: "end",
      cell: (p) => <span className="tabular-nums">{p.weights.length}</span>,
      hideOnMobile: true,
    },
    {
      id: "valid",
      header: "Validity",
      align: "end",
      cell: (p) => {
        const problems = validateWeightProfile(p);
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
      cell: (p) =>
        p.approved ? (
          <StatusBadge tone="success">Approved</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Not approved</StatusBadge>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Performance"
        description="Evidence-based performance. Weights are configuration, not universal policy (PRD §6.1)."
      />

      <SectionCard
        title="Dimensions"
        description="The vocabulary from PRD §6.1. Weighting is defined per model below, never here."
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
        title="Weighting models"
        description="A model must be selected explicitly. There is no implicit default."
      >
        <DataTable
          caption="Performance weighting models"
          columns={profileColumns}
          data={profiles}
          getRowId={(p) => p.id}
          emptyTitle="No weighting model configured"
          emptyDescription="PRD §6.1 lists example weights but states they are configuration, not policy. An administrator must define and approve a model before any performance index can be computed."
        />
      </SectionCard>

      <SectionCard title="Performance periods">
        <DataTable
          caption="Performance periods"
          columns={periodColumns}
          data={periods}
          getRowId={(p) => p.id}
          emptyTitle="No performance periods"
        />
      </SectionCard>

      {isLive(profiles) && profiles.value.length === 0 ? (
        <EmptyState
          title="No performance index can be computed"
          description="No weighting model is configured."
        />
      ) : null}
    </div>
  );
}
