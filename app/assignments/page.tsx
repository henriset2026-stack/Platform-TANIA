import Link from "next/link";
import type { Metadata } from "next";

import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import { listAssignments, type AssignmentRow } from "@/lib/workload/queries";

export const metadata: Metadata = { title: "Assignments · TANIA" };

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  proposed: "warning",
  active: "success",
  completed: "neutral",
  cancelled: "neutral",
};

/**
 * Assignments (PRD §33).
 *
 * An assignment is a consequential action (PRD §58). Proposed assignments are
 * shown with their approval state so an unapproved proposal is never mistaken
 * for committed work. Nothing on this page reassigns anyone.
 */
export default async function AssignmentsPage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Assignments" />
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "assignment.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Assignments" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold assignment.read."
        />
      </div>
    );
  }

  const assignments = await listAssignments();
  const canApprove = can(context, "assignment.approve").allowed;

  const columns: readonly Column<AssignmentRow>[] = [
    {
      id: "project",
      header: "Project",
      cell: (a) => (
        <Link href={`/projects/${a.projectId}`} className="hover:underline">
          {a.projectName}
        </Link>
      ),
    },
    { id: "person", header: "Person", cell: (a) => a.profileName },
    { id: "role", header: "Role", cell: (a) => a.roleName ?? "—", hideOnMobile: true },
    {
      id: "allocation",
      header: "Allocation",
      align: "end",
      cell: (a) => <span className="tabular-nums">{Math.round(a.allocationPct)}%</span>,
    },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: (a) => (
        <StatusBadge tone={STATUS_TONE[a.status] ?? "neutral"}>{a.status}</StatusBadge>
      ),
    },
    {
      id: "approval",
      header: "Approval",
      align: "end",
      cell: (a) =>
        a.approved ? (
          <StatusBadge tone="success">Approved</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Awaiting approval</StatusBadge>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Assignments"
        description="Creating or approving an assignment is a consequential action requiring a human decision."
      />

      <SectionCard
        title="Assignments"
        description={
          canApprove
            ? "You hold assignment.approve within your authorized scope."
            : "You do not hold assignment.approve. Proposals are visible but cannot be approved by you."
        }
      >
        <DataTable
          caption="Assignments"
          columns={columns}
          data={assignments}
          getRowId={(a) => a.id}
          emptyTitle="No assignments"
          emptyDescription="No assignment exists within your authorized scope."
        />
      </SectionCard>
    </div>
  );
}
