import Link from "next/link";
import type { Metadata } from "next";

import {
  DataTable,
  EmptyState,
  PageHeader,
  ProgressMeter,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { CapabilityStatusBadge } from "@/components/dashboard/status-badge";
import { CAPABILITY_LEVELS } from "@/lib/calculations/capability";
import type { CriticalGap } from "@/lib/calculations/capability";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import {
  getCriticalGaps,
  listCapabilities,
  listCapabilityDomains,
  type CapabilityCatalogRow,
} from "@/lib/capability/queries";

export const metadata: Metadata = { title: "Capability · TANIA" };

/**
 * S06/S07 — Capability Matrix and Capability Gap (PRD §30, §31).
 *
 * Every figure shown here is produced by lib/calculations/capability.ts.
 * Nothing is inferred by a model: a gap drives development spend and staffing,
 * so it must be reproducible from the same inputs.
 */
export default async function CapabilityPage() {
  const context = await getAuthContext();
  if (!context) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Capability" />
        <EmptyState title="Not signed in" />
      </div>
    );
  }

  if (!can(context, "capability.read").allowed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Capability" />
        <EmptyState
          title="Not authorized"
          description="Your account does not hold capability.read."
        />
      </div>
    );
  }

  const [catalog, domains, gaps] = await Promise.all([
    listCapabilities(),
    listCapabilityDomains(),
    getCriticalGaps(),
  ]);

  const catalogColumns: readonly Column<CapabilityCatalogRow>[] = [
    {
      id: "name",
      header: "Capability",
      cell: (c) => (
        <Link href={`/capability/${c.id}`} className="hover:underline">
          {c.name}
        </Link>
      ),
    },
    { id: "domain", header: "Domain", cell: (c) => c.domainName, hideOnMobile: true },
    { id: "code", header: "Code", cell: (c) => c.code, hideOnMobile: true },
    {
      id: "criticality",
      header: "Criticality",
      align: "end",
      cell: (c) => (
        <StatusBadge
          tone={
            c.criticality === "critical"
              ? "danger"
              : c.criticality === "high"
                ? "warning"
                : "neutral"
          }
        >
          {c.criticality}
        </StatusBadge>
      ),
    },
  ];

  const gapColumns: readonly Column<CriticalGap>[] = [
    { id: "capability", header: "Capability", cell: (g) => g.capabilityName },
    {
      id: "levels",
      header: "Current → Required",
      cell: (g) => (
        <span className="tabular-nums">
          L{g.currentLevel} → L{g.requiredLevel}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      id: "status",
      header: "Status",
      cell: (g) => <CapabilityStatusBadge status={g.status} />,
    },
    {
      id: "priority",
      header: "Priority",
      align: "end",
      cell: (g) => (
        <ProgressMeter
          value={g.priorityIndex}
          label={`${g.capabilityName} gap priority`}
        />
      ),
      width: "22%",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Capability"
        description="Required capability minus current proven capability. Certification is evidence, not capability."
      />

      <SectionCard
        title="Capability levels"
        description="The L1–L5 scale (PRD §7.1). A level above L2 requires evidence of application."
      >
        <ol className="grid gap-2 sm:grid-cols-5">
          {CAPABILITY_LEVELS.map((level) => (
            <li
              key={level.level}
              className="rounded-[var(--radius-control)] border border-slate-200 px-3 py-2"
            >
              <p className="text-xs font-semibold text-[var(--color-telkom-blue-600)]">
                {level.code}
              </p>
              <p className="text-sm text-slate-700">{level.name}</p>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard
        title="Critical capability gaps"
        description="Ranked by business criticality × gap magnitude × time urgency (PRD §7.3)."
      >
        <DataTable
          caption="Critical capability gaps"
          columns={gapColumns}
          data={gaps}
          getRowId={(g) => g.capabilityId}
          emptyTitle="No capability gaps"
          emptyDescription="Every defined requirement is met at or above its target level."
        />
      </SectionCard>

      <SectionCard
        title="Capability catalog"
        description={`${domains.state === "live" ? domains.value.length : 0} domains`}
      >
        <DataTable
          caption="Capability catalog"
          columns={catalogColumns}
          data={catalog}
          getRowId={(c) => c.id}
          emptyTitle="No capabilities defined"
          emptyDescription="The DPS capability catalogue is organizational content and must be supplied by Chapter DPS."
        />
      </SectionCard>
    </div>
  );
}
