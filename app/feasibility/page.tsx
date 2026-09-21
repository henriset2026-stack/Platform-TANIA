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
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "project.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Feasibility" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold project.read."
        />
      </div>
    );
  }

  const assessments = await listFeasibilityAssessments();
  const canDecide = can(context, "project.update").allowed;

  const columns: readonly Column<FeasibilityRow>[] = [
    { id: "title", header: "Case", cell: (a) => a.title },
    {
      id: "customer",
      header: "Customer",
      cell: (a) => a.customerName ?? "—",
      hideOnMobile: true,
    },
    {
      id: "score",
      header: "Score",
      align: "end",
      cell: (a) =>
        a.totalScore === null ? (
          <span className="text-slate-400">not scored</span>
        ) : (
          <span className="tabular-nums">
            {a.totalScore}
            {a.scoreCoverage !== null && a.scoreCoverage < MIN_FEASIBILITY_COVERAGE * 100 ? (
              <span className="ml-1 text-xs text-amber-700">
                ({a.scoreCoverage}% covered)
              </span>
            ) : null}
          </span>
        ),
    },
    {
      id: "stage",
      header: "Stage",
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
        description="Intake, scoring, resource check, business case, decision, delivery and post-delivery review."
      />

      <SectionCard
        title="Pipeline"
        description="A case may be rejected at any stage before decision. Stopping work early is always permitted."
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
        title="Cases"
        description={
          canDecide
            ? "You hold project.update and may decide cases within your organization."
            : "You do not hold project.update. Cases are visible but cannot be decided by you."
        }
      >
        <DataTable
          caption="Feasibility cases"
          columns={columns}
          data={assessments}
          getRowId={(a) => a.id}
          emptyTitle="No feasibility cases"
          emptyDescription="No case exists within your authorized scope."
        />
      </SectionCard>

      <SectionCard title="How scoring works" headingLevel={3}>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            Criteria and weights are <strong className="text-slate-800">configurable</strong>,
            with approve and review thresholds set per profile. Scoring a
            business case decides whether work happens, so the model is not
            hard-coded.
          </li>
          <li>
            Risk-style criteria are inverted, so a high risk score lowers the
            total rather than raising it.
          </li>
          <li>
            An unscored criterion is <strong className="text-slate-800">excluded</strong>,
            not counted as zero — and below {MIN_FEASIBILITY_COVERAGE * 100}%
            coverage no recommendation is made at all.
          </li>
          <li>
            A score is a <strong className="text-slate-800">recommendation</strong>.
            Approving or rejecting a case is a human action, and every decision
            is written to the audit log by a database trigger.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
