import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { DataStateNotice } from "@/components/data/data-state";
import { cn } from "@/lib/utils";
import { isLive } from "@/types/data";
import type { DataPoint } from "@/types/data";
import type { Tone } from "@/types/status";

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-[var(--color-telkom-blue-100)] text-[var(--color-telkom-blue-600)]",
  success: "bg-[var(--color-status-strong-bg)] text-emerald-700",
  warning: "bg-[var(--color-status-attention-bg)] text-amber-700",
  danger: "bg-[var(--color-status-critical-bg)] text-red-700",
};

/**
 * KPI tile — the tinted icon square, label, value and delta from the
 * dashboard mockup.
 *
 * A value can only render when the DataPoint is `live`, which by construction
 * carries provenance. Any other state renders DataStateNotice instead, so the
 * tile is layout-complete without inventing a number (CLAUDE.md §2a).
 */
export function MetricCard({
  label,
  point,
  icon: Icon,
  tone = "info",
  format = (v) => String(v),
  delta,
  description,
  className,
}: {
  label: string;
  point: DataPoint<number>;
  icon?: LucideIcon | undefined;
  tone?: Tone;
  format?: (value: number) => string;
  /** Period-over-period change, in percent. Only shown alongside a live value. */
  delta?: number | undefined;
  description?: string | undefined;
  className?: string | undefined;
}) {
  const live = isLive(point);

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-slate-200 bg-white p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)]",
              ICON_TONE[tone],
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-600">{label}</p>

          {live ? (
            <>
              <p className="mt-0.5 text-[length:var(--text-metric)] leading-[var(--text-metric--line-height)] font-semibold tabular-nums text-[var(--color-telkom-navy)]">
                {format(point.value)}
              </p>
              {typeof delta === "number" ? <DeltaIndicator delta={delta} /> : null}
              <p className="mt-1 text-xs text-slate-500">
                {point.provenance.source} · per{" "}
                {point.provenance.asOf.slice(0, 10)}
                {point.provenance.validated ? " · tervalidasi" : " · belum tervalidasi"}
              </p>
            </>
          ) : (
            <DataStateNotice point={point} className="mt-2" />
          )}
        </div>
      </div>

      {description ? (
        <p className="mt-3 text-xs text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

/**
 * Change indicator.
 *
 * Direction is conveyed by an arrow and by the sign in the text, not by
 * colour alone. Note the wording is neutral: whether a rise is good depends
 * on the metric, and the component cannot know.
 */
function DeltaIndicator({ delta }: { delta: number }) {
  const rising = delta >= 0;
  const Icon = rising ? TrendingUp : TrendingDown;

  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-xs font-medium",
        rising ? "text-emerald-700" : "text-red-700",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span>
        {rising ? "+" : ""}
        {delta}%
      </span>
      <span className="sr-only">
        {rising ? "naik" : "turun"} dibandingkan periode sebelumnya
      </span>
    </p>
  );
}
