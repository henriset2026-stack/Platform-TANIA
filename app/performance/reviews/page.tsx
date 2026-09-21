import type { Metadata } from "next";

import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { evaluateReviewTransition } from "@/lib/calculations/performance";
import { can, isAiService } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import { listReviews, type ReviewRow } from "@/lib/performance/queries";

export const metadata: Metadata = { title: "Performance reviews · TANIA" };

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
};

/**
 * Manager review workflow.
 *
 * Approval is a consequential action (PRD §58). What a viewer may do to each
 * review is decided by evaluateReviewTransition, the same pure function the
 * server action will call — so the UI cannot offer a control that the
 * boundary would refuse, and cannot hide one it would allow.
 *
 * The transition rules are enforced regardless of what this page renders:
 * an AI identity is refused unconditionally, a reviewer cannot approve their
 * own submission, and nobody reviews themselves.
 */
export default async function PerformanceReviewsPage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Performance reviews" />
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "performance.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Performance reviews" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold performance.read."
        />
      </div>
    );
  }

  const reviews = await listReviews();

  const columns: readonly Column<ReviewRow>[] = [
    { id: "subject", header: "Person", cell: (r) => r.subjectName },
    { id: "period", header: "Period", cell: (r) => r.periodName, hideOnMobile: true },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusBadge>
      ),
    },
    {
      id: "approval",
      header: "Approval",
      align: "end",
      cell: (r) =>
        r.approvedBy ? (
          <span className="text-xs text-slate-600">
            Approved{r.approvedAt ? ` ${r.approvedAt.slice(0, 10)}` : ""}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Awaiting human approval</span>
        ),
      hideOnMobile: true,
    },
    {
      id: "actions",
      header: "Available action",
      align: "end",
      cell: (r) => {
        const decision = evaluateReviewTransition(
          { status: r.status as "draft" | "submitted" | "approved" | "rejected", reviewerId: r.reviewerId, subjectId: r.profileId },
          "approve",
          {
            userId: context.userId,
            permissions: context.permissions,
            isAiService: isAiService(context),
          },
        );
        return decision.allowed ? (
          <StatusBadge tone="info">Approve available</StatusBadge>
        ) : (
          <span className="text-xs text-slate-400" title={decision.reason}>
            —
          </span>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Performance reviews"
        description="A final rating requires a human decision. AI may analyse and draft; it may not approve."
      />

      {isAiService(context) ? (
        <EmptyState
          title="AI identities cannot act on reviews"
          description="A final performance rating is a consequential human decision (PRD §58, AGENTS.md §9)."
        />
      ) : null}

      <SectionCard
        title="Reviews"
        description="Separation of duties: the reviewer who submits a review may not approve it."
      >
        <DataTable
          caption="Performance reviews"
          columns={columns}
          data={reviews}
          getRowId={(r) => r.id}
          emptyTitle="No reviews"
          emptyDescription="No performance review exists within your authorized scope."
        />
      </SectionCard>
    </div>
  );
}
