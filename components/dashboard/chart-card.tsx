import { SectionCard } from "@/components/dashboard/section";
import { DataStateNotice } from "@/components/data/data-state";
import { isLive } from "@/types/data";
import type { DataPoint } from "@/types/data";

/**
 * Chart container.
 *
 * Phase 5 deliberately ships no charting library. Picking one is a
 * dependency decision that belongs with the first real chart (Phase 6), and
 * an unused library would be weight without benefit.
 *
 * What this does provide is the frame every chart needs: heading, optional
 * period control, the non-live states, and — importantly — a slot for a
 * tabular equivalent. A chart that exists only as pixels is unreadable to a
 * screen reader, so `dataTable` is a first-class prop rather than an
 * afterthought.
 */
export function ChartCard<T>({
  title,
  description,
  action,
  point,
  children,
  dataTable,
  height = 260,
}: {
  title: string;
  description?: string | undefined;
  action?: React.ReactNode | undefined;
  point: DataPoint<T>;
  /** Rendered only when `point` is live. Receives the live value. */
  children?: (value: T) => React.ReactNode;
  /** Accessible tabular equivalent of the chart. */
  dataTable?: React.ReactNode | undefined;
  height?: number | undefined;
}) {
  return (
    <SectionCard title={title} {...(description ? { description } : {})} {...(action ? { action } : {})}>
      {isLive(point) ? (
        <>
          <div style={{ minHeight: height }}>{children?.(point.value)}</div>
          {dataTable ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                Lihat sebagai tabel
              </summary>
              <div className="mt-2">{dataTable}</div>
            </details>
          ) : null}
        </>
      ) : (
        <div
          style={{ minHeight: height }}
          className="flex items-center justify-center"
        >
          <DataStateNotice point={point} />
        </div>
      )}
    </SectionCard>
  );
}
