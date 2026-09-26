import { CAPABILITY_STATUS_LABELS } from "@/types/status";
import type { CapabilityStatus } from "@/types/status";
import { cn } from "@/lib/utils";

const CELL_TONE: Record<CapabilityStatus, string> = {
  strong: "bg-[var(--color-status-strong-bg)] text-emerald-900",
  on_track: "bg-[var(--color-status-ontrack-bg)] text-blue-900",
  needs_attention: "bg-[var(--color-status-attention-bg)] text-amber-900",
  critical_gap: "bg-[var(--color-status-critical-bg)] text-red-900",
};

export interface HeatmapCell {
  readonly rowId: string;
  readonly columnId: string;
  readonly status: CapabilityStatus;
  readonly magnitude: number;
}

/**
 * Capability heatmap.
 *
 * Rendered as a real <table> with row and column headers, because a grid of
 * coloured divs is unreadable to a screen reader. Each cell states its status
 * in text via the accessible name and shows the gap magnitude, so the colour
 * is reinforcement rather than the only channel.
 */
export function GapHeatmap({
  rows,
  columns,
  cells,
  caption,
}: {
  rows: readonly { id: string; label: string }[];
  columns: readonly { id: string; label: string }[];
  cells: readonly HeatmapCell[];
  caption: string;
}) {
  const index = new Map(cells.map((c) => [`${c.rowId}/${c.columnId}`, c]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-40 text-left text-xs font-medium text-slate-500">
              <span className="sr-only">Kelompok</span>
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="px-2 pb-1 text-center text-xs font-medium text-slate-600"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className="pr-2 text-left text-xs font-medium whitespace-nowrap text-slate-700"
              >
                {row.label}
              </th>
              {columns.map((column) => {
                const cell = index.get(`${row.id}/${column.id}`);
                if (!cell) {
                  return (
                    <td key={column.id} className="px-1">
                      <span
                        className="flex h-8 items-center justify-center rounded border border-dashed border-slate-200 text-xs text-slate-300"
                        aria-label={`${row.label}, ${column.label}: tidak ada kebutuhan`}
                      >
                        —
                      </span>
                    </td>
                  );
                }
                return (
                  <td key={column.id} className="px-1">
                    <span
                      className={cn(
                        "flex h-8 items-center justify-center rounded text-xs font-medium tabular-nums",
                        CELL_TONE[cell.status],
                      )}
                      aria-label={`${row.label}, ${column.label}: ${CAPABILITY_STATUS_LABELS[cell.status]}, gap ${cell.magnitude}`}
                    >
                      {cell.magnitude > 0 ? `−${cell.magnitude}` : "✓"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(CELL_TONE) as CapabilityStatus[]).map((status) => (
          <li key={status} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span aria-hidden="true" className={cn("size-3 rounded", CELL_TONE[status])} />
            {CAPABILITY_STATUS_LABELS[status]}
          </li>
        ))}
      </ul>
    </div>
  );
}
