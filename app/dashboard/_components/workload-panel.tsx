import { ProgressMeter, SectionCard, StatusBadge } from "@/components/dashboard";
import { DataStateNotice } from "@/components/data/data-state";
import { isLive } from "@/types/data";
import type { DataPoint } from "@/types/data";
import type { WorkloadRow } from "@/lib/dashboard/queries";

/**
 * Workload distribution.
 *
 * Allocation can legitimately exceed 100% — that is the signal worth seeing,
 * not something to clamp away. The bar is capped for layout while the numeric
 * value shows the real figure, and anything over 100% is flagged.
 */
export function WorkloadPanel({
  data,
  allowsDrilldown,
}: {
  data: DataPoint<readonly WorkloadRow[]>;
  allowsDrilldown: boolean;
}) {
  return (
    <SectionCard
      title="Workload"
      description={
        allowsDrilldown
          ? "Active assignment allocation per person"
          : "Aggregated allocation. Individual records are not shown at this scope."
      }
    >
      {!isLive(data) ? (
        <DataStateNotice point={data} />
      ) : data.value.length === 0 ? (
        <p className="text-sm text-slate-500">No active assignments.</p>
      ) : (
        <ul className="space-y-3">
          {data.value.slice(0, 8).map((row) => {
            const over = row.allocationPct > 100;
            return (
              <li key={row.profileId} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-slate-700">
                  {allowsDrilldown ? row.name : "Team member"}
                </span>
                <ProgressMeter
                  value={Math.min(row.allocationPct, 100)}
                  label={`${allowsDrilldown ? row.name : "Team member"} allocation`}
                  showValue={false}
                  className="flex-1"
                />
                <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-slate-600">
                  {Math.round(row.allocationPct)}%
                </span>
                {over ? (
                  <StatusBadge tone="warning">Over</StatusBadge>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
