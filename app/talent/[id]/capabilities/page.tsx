import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  DataTable,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { CapabilityStatusBadge } from "@/components/dashboard/status-badge";
import { getAuthContext } from "@/lib/auth/session";
import {
  getTalentCapabilityDetail,
  type TalentCapabilityDetail,
} from "@/lib/capability/queries";

export const metadata: Metadata = { title: "Talent capabilities · TANIA" };

/**
 * Talent capability detail.
 *
 * Shows CLAIMED and PROVEN level side by side. That difference is the point
 * of the product: a self-assessed L4 with no applied evidence is proven at L1,
 * and hiding one of the two numbers would either overstate capability or
 * erase what the person actually asserted.
 *
 * The proven level is computed by lib/calculations/capability.ts from the
 * evidence attached to each capability — deterministically, never inferred.
 */
export default async function TalentCapabilitiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) notFound();

  const detail = await getTalentCapabilityDetail(id);
  if (detail.state === "restricted") notFound();

  const columns: readonly Column<TalentCapabilityDetail>[] = [
    { id: "capability", header: "Capability", cell: (r) => r.capabilityName },
    { id: "domain", header: "Domain", cell: (r) => r.domainName, hideOnMobile: true },
    {
      id: "claimed",
      header: "Claimed",
      align: "end",
      cell: (r) => <span className="tabular-nums">L{r.claimedLevel}</span>,
    },
    {
      id: "proven",
      header: "Proven",
      align: "end",
      cell: (r) => (
        <span
          className="tabular-nums"
          title={r.provenReason}
        >
          L{r.provenLevel}
          {!r.proven ? (
            <span className="ml-1 text-xs text-amber-700">unproven</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "evidence",
      header: "Evidence",
      align: "end",
      cell: (r) => (
        <span className="tabular-nums text-slate-600">
          {r.validatedEvidenceCount}/{r.evidenceCount}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      id: "gap",
      header: "Gap",
      align: "end",
      cell: (r) =>
        r.status === null ? (
          <span className="text-slate-400">no target</span>
        ) : (
          <CapabilityStatusBadge status={r.status} />
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Capability profile"
        description="Claimed level against the level the evidence proves."
      />

      <SectionCard
        title="Capabilities"
        description="Proven level is derived from validated evidence of application. Certification alone caps a capability at L2 (PRD §7.1)."
      >
        <DataTable
          caption="Talent capability profile"
          columns={columns}
          data={detail}
          getRowId={(r) => r.id}
          emptyTitle="No capabilities assessed"
          emptyDescription="No capability has been claimed for this person yet."
        />
      </SectionCard>

      <SectionCard title="How proven level is determined" headingLevel={3}>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            <StatusBadge tone="success">Proven</StatusBadge> — validated
            evidence of application exists at the claimed level.
          </li>
          <li>
            <StatusBadge tone="warning">Capped at L2</StatusBadge> — validated
            evidence shows knowledge (for example a certificate) but not
            application.
          </li>
          <li>
            <StatusBadge tone="neutral">L1</StatusBadge> — no validated
            evidence. Pending, rejected and withdrawn evidence does not count.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
