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

export const metadata: Metadata = { title: "Penilaian kinerja · TANIA" };

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
        <PageHeader title="Penilaian kinerja" />
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "performance.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Penilaian kinerja" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin performance.read."
        />
      </div>
    );
  }

  const reviews = await listReviews();

  const columns: readonly Column<ReviewRow>[] = [
    { id: "subject", header: "Talent", cell: (r) => r.subjectName },
    { id: "period", header: "Periode", cell: (r) => r.periodName, hideOnMobile: true },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusBadge>
      ),
    },
    {
      id: "approval",
      header: "Persetujuan",
      align: "end",
      cell: (r) =>
        r.approvedBy ? (
          <span className="text-xs text-slate-600">
            Disetujui{r.approvedAt ? ` ${r.approvedAt.slice(0, 10)}` : ""}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Menunggu persetujuan manusia</span>
        ),
      hideOnMobile: true,
    },
    {
      id: "actions",
      header: "Tindakan tersedia",
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
          <StatusBadge tone="info">Dapat disetujui</StatusBadge>
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
        title="Penilaian kinerja"
        description="Rating akhir memerlukan keputusan manusia. AI boleh menganalisis dan menyusun draf, tetapi tidak boleh menyetujui."
      />

      {isAiService(context) ? (
        <EmptyState
          title="Identitas AI tidak dapat bertindak atas penilaian"
          description="Rating kinerja akhir adalah keputusan manusia yang berdampak besar (PRD §58, AGENTS.md §9)."
        />
      ) : null}

      <SectionCard
        title="Penilaian"
        description="Pemisahan tugas: peninjau yang mengajukan penilaian tidak boleh menyetujuinya."
      >
        <DataTable
          caption="Penilaian kinerja"
          columns={columns}
          data={reviews}
          getRowId={(r) => r.id}
          emptyTitle="Belum ada penilaian"
          emptyDescription="Tidak ada penilaian kinerja dalam cakupan akses Anda."
        />
      </SectionCard>
    </div>
  );
}
