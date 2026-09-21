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
        <EmptyState title="Not signed in" description="Sign in to view talent." />
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
          title="Not authorized"
          description="Your account does not hold talent.read."
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
      header: "Name",
      cell: (row) =>
        view.allowsIndividualDrilldown ? (
          <Link
            href={`/talent/${row.id}`}
            className="hover:underline"
            aria-label={`Open passport for ${row.fullName}`}
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
      header: "Employee ID",
      cell: (row) => row.employeeId ?? "—",
      hideOnMobile: true,
    },
    {
      id: "department",
      header: "Department",
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
            ? "People within your authorized scope."
            : "Aggregated view. Individual passports are not available at executive scope."
        }
      />

      <TalentFilters squads={isLive(squads) ? squads.value : []} />

      <DataTable
        caption="Talent directory"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        emptyTitle="No talent found"
        emptyDescription="No records match these filters within your authorized scope."
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
