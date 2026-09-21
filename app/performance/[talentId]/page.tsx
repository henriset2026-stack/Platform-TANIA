import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ClaimBadge } from "@/app/performance/_components/claim-badge";
import {
  DataTable,
  PageHeader,
  SectionCard,
  StatusBadge,
  type Column,
} from "@/components/dashboard";
import { DataStateNotice } from "@/components/data/data-state";
import { getAuthContext } from "@/lib/auth/session";
import {
  getEvidenceTimeline,
  getPerformanceTrend,
  type EvidenceTimelineRow,
} from "@/lib/performance/queries";
import { isLive } from "@/types/data";

export const metadata: Metadata = { title: "Performance detail · TANIA" };

/**
 * Per-person performance.
 *
 * Performance data is SENSITIVE, so the queries gate on that class rather
 * than the CONFIDENTIAL default. A viewer who may see someone's profile does
 * not automatically see their performance evidence.
 *
 * No final rating is shown. A rating comes from an approved weighting model
 * applied to validated evidence and confirmed by a human through the review
 * workflow — this page reports the inputs, not a verdict.
 */
export default async function PerformanceDetailPage({
  params,
}: {
  params: Promise<{ talentId: string }>;
}) {
  const { talentId } = await params;
  const context = await getAuthContext();
  if (!context) notFound();

  const [timeline, trend] = await Promise.all([
    getEvidenceTimeline(talentId),
    getPerformanceTrend(talentId),
  ]);

  // Restricted is rendered as not-found so the response does not confirm that
  // this person has performance records.
  if (timeline.state === "restricted" && trend.state === "restricted") {
    notFound();
  }

  const columns: readonly Column<EvidenceTimelineRow>[] = [
    {
      id: "occurred",
      header: "Date",
      cell: (e) =>
        e.occurredAt ? (
          <time dateTime={e.occurredAt} className="tabular-nums">
            {e.occurredAt.slice(0, 10)}
          </time>
        ) : (
          "—"
        ),
    },
    { id: "dimension", header: "Dimension", cell: (e) => e.dimension },
    {
      id: "value",
      header: "Value",
      align: "end",
      cell: (e) =>
        e.value === null ? "—" : `${e.value}${e.unit ? ` ${e.unit}` : ""}`,
    },
    {
      id: "source",
      header: "Source",
      cell: (e) => (
        <span className="text-slate-600">
          {e.sourceType}
          {e.sourceReference ? ` · ${e.sourceReference}` : ""}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      id: "confidence",
      header: "Confidence",
      align: "end",
      cell: (e) => (e.confidence === null ? "—" : `${e.confidence}%`),
      hideOnMobile: true,
    },
    {
      id: "kind",
      header: "Claim",
      align: "end",
      cell: (e) => <ClaimBadge kind={e.claimKind} />,
    },
    {
      id: "validation",
      header: "Validation",
      align: "end",
      cell: (e) => (
        <StatusBadge tone={e.validationStatus === "validated" ? "success" : "warning"}>
          {e.validationStatus}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Performance"
        description="Evidence and trend. No final rating is shown here — that requires an approved weighting model and human sign-off."
      />

      <SectionCard
        title="Trend"
        description="Mean of recorded metric scores per period. This is measured data, not the weighted performance index."
      >
        {!isLive(trend) ? (
          <DataStateNotice point={trend} />
        ) : (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <StatusBadge
                tone={
                  trend.value.direction === "improving"
                    ? "success"
                    : trend.value.direction === "declining"
                      ? "danger"
                      : "neutral"
                }
              >
                {trend.value.direction}
              </StatusBadge>
              {trend.value.change !== null ? (
                <span className="tabular-nums">
                  {trend.value.change > 0 ? "+" : ""}
                  {trend.value.change} across {trend.value.points.length} periods
                </span>
              ) : (
                <span>Not enough periods to establish a trend</span>
              )}
            </p>
            <ol className="space-y-1">
              {trend.value.points.map((point) => (
                <li
                  key={point.periodId}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="text-slate-600">{point.periodName}</span>
                  <span className="tabular-nums text-slate-900">{point.index}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Evidence timeline"
        description="Every entry carries its value, period, source, validation status and confidence."
      >
        <DataTable
          caption="Performance evidence timeline"
          columns={columns}
          data={timeline}
          getRowId={(e) => e.id}
          emptyTitle="No performance evidence"
          emptyDescription="Nothing has been recorded for this person within your authorized scope."
        />
      </SectionCard>

      <SectionCard title="How claims are classified" headingLevel={3}>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            <ClaimBadge kind="FACT" /> — measured and human-validated.
          </li>
          <li>
            <ClaimBadge kind="ANALYSIS" /> — computed deterministically from
            facts; reproducible.
          </li>
          <li>
            <ClaimBadge kind="INFERENCE" /> — AI-generated, or not yet
            validated. Never counted towards a rating.
          </li>
          <li>
            <ClaimBadge kind="RECOMMENDATION" /> — a proposed action awaiting a
            human decision.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
