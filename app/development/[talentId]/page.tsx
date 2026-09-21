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

export const metadata: Metadata = { title: "Development plan · TANIA" };

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
        title="Development"
        description="Capability gap → plan → learn → practice → apply → assess → evidence → capability update."
      />

      {!isLive(plans) ? (
        <SectionCard title="Development plans">
          <DataStateNotice point={plans} />
        </SectionCard>
      ) : (
        plans.value.map((plan) => (
          <SectionCard
            key={plan.id}
            title={plan.title}
            description={`${plan.progress.completedCount} of ${plan.progress.totalCount} activities · ${plan.progress.completedHours}/${plan.progress.totalHours} hours`}
            action={
              plan.approved ? (
                <StatusBadge tone="success">Approved</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Awaiting approval</StatusBadge>
              )
            }
          >
            <div className="space-y-4">
              <ProgressMeter
                value={plan.progress.percent}
                label={`${plan.title} progress`}
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
                      ? `Capability upgrade to L${plan.upgrade.proposedLevel} may be proposed`
                      : "Capability upgrade cannot be proposed yet"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {/* Stated on every plan, eligible or not. */}
                    A capability increase always requires a human decision and
                    supporting evidence. Completing a plan never raises a level
                    by itself.
                  </p>
                  {plan.upgrade.blockers.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                      {describeBlockers(plan.upgrade.blockers).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-900">
                      Supported by {plan.upgrade.supportingEvidenceIds.length}{" "}
                      validated evidence record(s).
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
                        {activity.estimatedHours}h
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
