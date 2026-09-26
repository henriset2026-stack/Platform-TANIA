import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/dashboard";
import { CAPABILITY_LEVELS } from "@/lib/calculations/capability";
import { can } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import { getCapability } from "@/lib/capability/queries";
import { isLive } from "@/types/data";

export const metadata: Metadata = { title: "Detail capability · TANIA" };

/**
 * Capability detail.
 *
 * Capability definitions are INTERNAL (TANIA_RBAC_RLS_MATRIX.md §6), so any
 * authenticated holder of capability.read may view one. Who holds the
 * capability, and at what level, is CONFIDENTIAL and belongs on the person's
 * passport rather than here.
 */
export default async function CapabilityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!context) notFound();
  if (!can(context, "capability.read").allowed) notFound();

  const capability = await getCapability(id);
  if (capability.state === "empty" || capability.state === "restricted") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={isLive(capability) ? capability.value.name : "Capability"}
        description={isLive(capability) ? capability.value.domainName : undefined}
      />

      <SectionCard title="Definisi">
        {!isLive(capability) ? (
          <EmptyState title="Capability tidak tersedia" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="neutral">{capability.value.code}</StatusBadge>
              <StatusBadge
                tone={
                  capability.value.criticality === "critical"
                    ? "danger"
                    : capability.value.criticality === "high"
                      ? "warning"
                      : "neutral"
                }
              >
                Kritikalitas {capability.value.criticality}
              </StatusBadge>
            </div>
            <p className="text-sm text-slate-600">
              {capability.value.description ?? "Belum ada deskripsi yang tercatat."}
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Definisi level"
        description="Klaim di atas L2 memerlukan bukti penerapan, bukan sertifikasi (PRD §7.1)."
      >
        <ol className="space-y-2">
          {CAPABILITY_LEVELS.map((level) => (
            <li key={level.level} className="flex gap-3">
              <span className="w-8 shrink-0 text-sm font-semibold text-[var(--color-telkom-blue-600)]">
                {level.code}
              </span>
              <span className="text-sm text-slate-700">{level.name}</span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  );
}
