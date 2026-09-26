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

export const metadata: Metadata = { title: "Penugasan · TANIA" };

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
        <PageHeader title="Penugasan" />
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "assignment.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Penugasan" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin assignment.read."
        />
      </div>
    );
  }

  const assignments = await listAssignments();
  const canApprove = can(context, "assignment.approve").allowed;

  const columns: readonly Column<AssignmentRow>[] = [
    {
      id: "project",
      header: "Proyek",
      cell: (a) => (
        <Link href={`/projects/${a.projectId}`} className="hover:underline">
          {a.projectName}
        </Link>
      ),
    },
    { id: "person", header: "Talent", cell: (a) => a.profileName },
    { id: "role", header: "Peran", cell: (a) => a.roleName ?? "—", hideOnMobile: true },
    {
      id: "allocation",
      header: "Alokasi",
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
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Penugasan"
        description="Membuat atau menyetujui penugasan adalah tindakan berdampak yang memerlukan keputusan manusia."
      />

      <SectionCard
        title="Penugasan"
        description={
          canApprove
            ? "Anda memiliki izin assignment.approve dalam cakupan yang Anda berwenang."
            : "Anda tidak memiliki izin assignment.approve. Usulan dapat dilihat, tetapi tidak dapat Anda setujui."
        }
      >
        <DataTable
          caption="Penugasan"
          columns={columns}
          data={assignments}
          getRowId={(a) => a.id}
          emptyTitle="Belum ada penugasan"
          emptyDescription="Belum ada penugasan dalam cakupan yang Anda berwenang."
        />
      </SectionCard>
    </div>
  );
}
