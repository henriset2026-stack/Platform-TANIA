import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  PageHeader,
  ProgressMeter,
  SectionCard,
  StatusBadge,
} from "@/components/dashboard";
import { DataStateNotice } from "@/components/data/data-state";
import { describeBlockers } from "@/lib/calculations/development";
import { getAuthContext } from "@/lib/auth/session";
import { getDevelopmentPlans } from "@/lib/development/queries";
import { isLive } from "@/types/data";

export const metadata: Metadata = { title: "Rencana pengembangan · TANIA" };

/**
 * Per-person development.
 *
 * For each plan, the upgrade panel states plainly whether a capability
 * increase may be PROPOSED and, when it may not, exactly what is missing.
 * Listing the blockers turns "nothing happened" into an actionable next step,
 * and makes the evidence requirement visible rather than implicit.
 */
export default async function DevelopmentDetailPage({
  params,
}: {
  params: Promise<{ talentId: string }>;
}) {
  const { talentId } = await params;
  const context = await getAuthContext();
  if (!context) notFound();

  const plans = await getDevelopmentPlans(talentId);
  if (plans.state === "restricted") notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Pengembangan"
        description="Gap capability → rencana → belajar → praktik → terapkan → asesmen → bukti → pembaruan capability."
      />

      {!isLive(plans) ? (
        <SectionCard title="Rencana pengembangan">
          <DataStateNotice point={plans} />
        </SectionCard>
      ) : (
        plans.value.map((plan) => (
          <SectionCard
            key={plan.id}
            title={plan.title}
            description={`${plan.progress.completedCount} dari ${plan.progress.totalCount} aktivitas · ${plan.progress.completedHours}/${plan.progress.totalHours} jam`}
            action={
              plan.approved ? (
                <StatusBadge tone="success">Disetujui</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Menunggu persetujuan</StatusBadge>
              )
            }
          >
            <div className="space-y-4">
              <ProgressMeter
                value={plan.progress.percent}
                label={`Progres ${plan.title}`}
              />

              {plan.upgrade ? (
                <div
                  className={
                    plan.upgrade.eligibleToPropose
                      ? "rounded-[var(--radius-control)] border border-emerald-200 bg-emerald-50 px-4 py-3"
                      : "rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-4 py-3"
                  }
                >
                  <p className="text-sm font-medium text-slate-900">
                    {plan.upgrade.eligibleToPropose
                      ? `Kenaikan capability ke L${plan.upgrade.proposedLevel} dapat diusulkan`
                      : "Kenaikan capability belum dapat diusulkan"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {/* Stated on every plan, eligible or not. */}
                    Kenaikan capability selalu memerlukan keputusan manusia dan
                    bukti pendukung. Menyelesaikan rencana tidak pernah menaikkan
                    level dengan sendirinya.
                  </p>
                  {plan.upgrade.blockers.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                      {describeBlockers(plan.upgrade.blockers).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-900">
                      Didukung oleh {plan.upgrade.supportingEvidenceIds.length}{" "}
                      catatan bukti tervalidasi.
                    </p>
                  )}
                </div>
              ) : null}

              <ul className="divide-y divide-slate-100">
                {plan.activities.map((activity) => (
                  <li
                    key={activity.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="text-slate-700">{activity.activityType}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-xs text-slate-500">
                        {activity.estimatedHours} jam
                      </span>
                      <StatusBadge
                        tone={
                          activity.status === "completed"
                            ? "success"
                            : activity.status === "in_progress"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {activity.status.replace(/_/g, " ")}
                      </StatusBadge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </SectionCard>
        ))
      )}
    </div>
  );
}
