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

export const metadata: Metadata = { title: "Detail kinerja · TANIA" };

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
      header: "Tanggal",
      cell: (e) =>
        e.occurredAt ? (
          <time dateTime={e.occurredAt} className="tabular-nums">
            {e.occurredAt.slice(0, 10)}
          </time>
        ) : (
          "—"
        ),
    },
    { id: "dimension", header: "Dimensi", cell: (e) => e.dimension },
    {
      id: "value",
      header: "Nilai",
      align: "end",
      cell: (e) =>
        e.value === null ? "—" : `${e.value}${e.unit ? ` ${e.unit}` : ""}`,
    },
    {
      id: "source",
      header: "Sumber",
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
      header: "Tingkat keyakinan",
      align: "end",
      cell: (e) => (e.confidence === null ? "—" : `${e.confidence}%`),
      hideOnMobile: true,
    },
    {
      id: "kind",
      header: "Klaim",
      align: "end",
      cell: (e) => <ClaimBadge kind={e.claimKind} />,
    },
    {
      id: "validation",
      header: "Validasi",
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
        title="Kinerja"
        description="Bukti dan tren. Rating akhir tidak ditampilkan di sini — rating memerlukan model pembobotan yang disetujui dan persetujuan manusia."
      />

      <SectionCard
        title="Tren"
        description="Rata-rata skor metrik yang tercatat per periode. Ini data terukur, bukan indeks kinerja berbobot."
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
                  {trend.value.change} dalam {trend.value.points.length} periode
                </span>
              ) : (
                <span>Periode belum cukup untuk menentukan tren</span>
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
        title="Linimasa bukti"
        description="Setiap entri memuat nilai, periode, sumber, status validasi, dan tingkat keyakinan."
      >
        <DataTable
          caption="Linimasa bukti kinerja"
          columns={columns}
          data={timeline}
          getRowId={(e) => e.id}
          emptyTitle="Belum ada bukti kinerja"
          emptyDescription="Belum ada data yang tercatat untuk talent ini dalam cakupan akses Anda."
        />
      </SectionCard>

      <SectionCard title="Cara klaim diklasifikasikan" headingLevel={3}>
        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>
            <ClaimBadge kind="FACT" /> — terukur dan divalidasi manusia.
          </li>
          <li>
            <ClaimBadge kind="ANALYSIS" /> — dihitung secara deterministik dari
            fakta; dapat direproduksi.
          </li>
          <li>
            <ClaimBadge kind="INFERENCE" /> — dibuat AI, atau belum
            tervalidasi. Tidak pernah dihitung dalam rating.
          </li>
          <li>
            <ClaimBadge kind="RECOMMENDATION" /> — usulan tindakan yang menunggu
            keputusan manusia.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
