import { CircleAlert, Database, Lock, PlugZap } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataPoint } from "@/types/data";

/**
 * Renders the non-live states of a DataPoint.
 *
 * Every state here is visually distinct from a real value: hatched background,
 * muted italic type, and an explicit reason. A viewer cannot mistake any of
 * these for measured data.
 */
export function DataStateNotice({
  point,
  className,
}: {
  point: Exclude<DataPoint<unknown>, { state: "live" }>;
  className?: string;
}) {
  const content = describe(point);

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2",
        "bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(15,23,42,0.035)_6px,rgba(15,23,42,0.035)_12px)]",
        className,
      )}
    >
      <content.Icon
        aria-hidden="true"
        className="size-4 shrink-0 text-slate-400"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-600">{content.title}</p>
        <p className="truncate text-xs text-slate-500 italic">
          {content.detail}
        </p>
      </div>
    </div>
  );
}

function describe(point: Exclude<DataPoint<unknown>, { state: "live" }>): {
  Icon: typeof Database;
  title: string;
  detail: string;
} {
  switch (point.state) {
    case "not-connected":
      return {
        Icon: Database,
        title: "Belum ada sumber data",
        detail: `Fase ${point.requiredPhase} — memerlukan ${point.requires}`,
      };
    case "not-integrated":
      // Distinct from "no data source": this value can only ever come from
      // another system, so the remedy is integration, not provisioning.
      return {
        Icon: PlugZap,
        title: `${point.system} belum terintegrasi`,
        detail: `${point.system} mengelola ${point.owns}. Tidak ada nilai yang ditampilkan karena nilai ini tidak dapat diturunkan di sini.`,
      };
    case "restricted":
      return {
        Icon: Lock,
        title: "Tidak berwenang",
        detail: point.reason,
      };
    case "empty":
      return {
        Icon: Database,
        title: "Belum ada data",
        detail: "Kueri tidak menghasilkan data",
      };
    case "failed":
      return {
        Icon: CircleAlert,
        title: "Tidak tersedia",
        detail: point.reason,
      };
  }
}
