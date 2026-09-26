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

export const metadata: Metadata = { title: "Capability talent · TANIA" };

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
      header: "Diklaim",
      align: "end",
      cell: (r) => <span className="tabular-nums">L{r.claimedLevel}</span>,
    },
    {
      id: "proven",
      header: "Terbukti",
      align: "end",
      cell: (r) => (
        <span
          className="tabular-nums"
          title={r.provenReason}
        >
          L{r.provenLevel}
          {!r.proven ? (
            <span className="ml-1 text-xs text-amber-700">belum terbukti</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "evidence",
      header: "Bukti",
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
          <span className="text-slate-400">tanpa target</span>
        ) : (
          <CapabilityStatusBadge status={r.status} />
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Profil capability"
        description="Level yang diklaim terhadap level yang dibuktikan oleh bukti."
      />

      <SectionCard
        title="Capability"
        description="Level terbukti diturunkan dari bukti penerapan yang tervalidasi. Sertifikasi saja membatasi capability pada L2 (PRD §7.1)."
      >
        <DataTable
          caption="Profil capability talent"
          columns={columns}
          data={detail}
          getRowId={(r) => r.id}
          emptyTitle="Belum ada capability yang diases"
          emptyDescription="Belum ada capability yang diklaim untuk talent ini."
        />
      </SectionCard>

      <SectionCard title="Cara level terbukti ditentukan" headingLevel={3}>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            <StatusBadge tone="success">Terbukti</StatusBadge> — terdapat bukti
            penerapan tervalidasi pada level yang diklaim.
          </li>
          <li>
            <StatusBadge tone="warning">Dibatasi di L2</StatusBadge> — bukti
            tervalidasi menunjukkan pengetahuan (misalnya sertifikat), tetapi
            belum penerapan.
          </li>
          <li>
            <StatusBadge tone="neutral">L1</StatusBadge> — tidak ada bukti
            tervalidasi. Bukti yang menunggu, ditolak, atau ditarik tidak dihitung.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
