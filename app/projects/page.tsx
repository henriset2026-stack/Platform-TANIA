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
import { listProjects, type ProjectListRow } from "@/lib/project/queries";

export const metadata: Metadata = { title: "Proyek · TANIA" };

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  planning: "info",
  active: "success",
  on_hold: "warning",
  completed: "neutral",
  cancelled: "neutral",
};

/** S10 — Projects (PRD §34). */
export default async function ProjectsPage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Proyek" />
        <EmptyState title="Belum masuk" />
      </div>
    );
  }

  if (!can(context, "project.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Proyek" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin project.read."
        />
      </div>
    );
  }

  const projects = await listProjects();

  const columns: readonly Column<ProjectListRow>[] = [
    {
      id: "name",
      header: "Proyek",
      cell: (p) => (
        <Link href={`/projects/${p.id}`} className="hover:underline">
          {p.name}
        </Link>
      ),
    },
    { id: "code", header: "Kode", cell: (p) => p.code, hideOnMobile: true },
    {
      id: "customer",
      header: "Pelanggan",
      cell: (p) => p.customerName ?? "—",
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: (p) => (
        <StatusBadge tone={STATUS_TONE[p.status] ?? "neutral"}>
          {p.status.replace(/_/g, " ")}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Proyek"
        description="Proyek dalam cakupan yang Anda berwenang."
      />
      <SectionCard title="Proyek">
        <DataTable
          caption="Proyek"
          columns={columns}
          data={projects}
          getRowId={(p) => p.id}
          emptyTitle="Belum ada proyek"
          emptyDescription="Belum ada proyek dalam cakupan yang Anda berwenang."
        />
      </SectionCard>
    </div>
  );
}
