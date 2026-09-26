import Link from "next/link";
import type { Metadata } from "next";

import { Pagination } from "@/app/talent/_components/pagination";
import { TalentFilters } from "@/app/talent/_components/talent-filters";
import {
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
  UserIdentity,
  type Column,
} from "@/components/dashboard";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/policy";
import { resolveDashboardView } from "@/lib/dashboard/views";
import { parseTalentQuery } from "@/lib/talent/filters";
import { listFilterableSquads, listTalent, type TalentListRow } from "@/lib/talent/queries";
import { isLive } from "@/types/data";

export const metadata: Metadata = { title: "Talent · TANIA" };

/**
 * S03 — Talent Directory (TANIA_PRD_v2.0.md §27).
 *
 * Search, filtering, sorting and paging all execute in PostgreSQL under the
 * caller's RLS context. The server never materialises a row the viewer is not
 * entitled to, so there is no way for an unauthorized record to reach the
 * response — including through a crafted query string, since every parameter
 * is validated and clamped in lib/talent/filters.ts.
 */
export default async function TalentDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Talent" />
        <EmptyState title="Belum masuk" description="Masuk untuk melihat talent." />
      </div>
    );
  }

  // Boundary gate. RLS would return nothing anyway, but an explicit denial is
  // clearer than an empty table that looks like "no people exist".
  const decision = can(context, "talent.read");
  if (!decision.allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Talent" />
        <EmptyState
          title="Tidak berwenang"
          description="Akun Anda tidak memiliki izin talent.read."
        />
      </div>
    );
  }

  const params = await searchParams;
  const query = parseTalentQuery(params);
  const view = resolveDashboardView(context);

  const [result, squads] = await Promise.all([
    listTalent(query),
    listFilterableSquads(),
  ]);

  const columns: readonly Column<TalentListRow>[] = [
    {
      id: "person",
      header: "Nama",
      cell: (row) =>
        view.allowsIndividualDrilldown ? (
          <Link
            href={`/talent/${row.id}`}
            className="hover:underline"
            aria-label={`Buka paspor ${row.fullName}`}
          >
            <UserIdentity
              name={row.fullName}
              role={row.jobTitle ?? undefined}
              avatarUrl={row.avatarUrl ?? undefined}
              size="sm"
            />
          </Link>
        ) : (
          // EXECUTIVE scope is aggregate; individual records are not opened.
          <UserIdentity name={row.fullName} role={row.jobTitle ?? undefined} size="sm" />
        ),
    },
    {
      id: "employeeId",
      header: "ID karyawan",
      cell: (row) => row.employeeId ?? "—",
      hideOnMobile: true,
    },
    {
      id: "department",
      header: "Departemen",
      cell: (row) => row.department ?? "—",
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "Status",
      align: "end",
      cell: (row) => (
        <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>
          {row.status.replace(/_/g, " ")}
        </StatusBadge>
      ),
    },
  ];

  const rows = isLive(result)
    ? ({ state: "live", value: result.value.rows, provenance: result.provenance } as const)
    : result;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Talent"
        description={
          view.allowsIndividualDrilldown
            ? "Talent dalam cakupan akses Anda."
            : "Tampilan agregat. Paspor individu tidak tersedia pada cakupan eksekutif."
        }
      />

      <TalentFilters squads={isLive(squads) ? squads.value : []} />

      <DataTable
        caption="Direktori talent"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        emptyTitle="Talent tidak ditemukan"
        emptyDescription="Tidak ada data yang cocok dengan filter ini dalam cakupan akses Anda."
      />

      {isLive(result) ? (
        <Pagination
          page={result.value.page}
          pageCount={result.value.pageCount}
          total={result.value.total}
          basePath="/talent"
          searchParams={params}
        />
      ) : null}
    </div>
  );
}
