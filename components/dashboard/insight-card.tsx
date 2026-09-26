import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { Tone } from "@/types/status";

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-[var(--color-telkom-blue-100)] text-[var(--color-telkom-blue-600)]",
  success: "bg-[var(--color-status-strong-bg)] text-emerald-700",
  warning: "bg-[var(--color-status-attention-bg)] text-amber-700",
  danger: "bg-[var(--color-status-critical-bg)] text-red-700",
};

/**
 * An AI-surfaced observation — the "Top Insights from TANIA" row in the
 * mockup.
 *
 * `source` is required and rendered. An insight is a claim produced by an
 * agent, and CLAUDE.md §16 does not let an AI-generated claim pass as fact
 * without provenance. The reader must be able to see what produced it.
 *
 * Renders as a link when `href` is given, otherwise as a plain article — not
 * a div with a click handler, which would be unreachable by keyboard.
 */
export function InsightCard({
  title,
  detail,
  icon: Icon,
  tone = "info",
  source,
  confidence,
  href,
  className,
}: {
  title: string;
  detail?: string | undefined;
  icon: LucideIcon;
  tone?: Tone;
  /** What produced this insight, e.g. "Capability Agent". */
  source: string;
  /** 0-100. Shown when the producing agent reported one. */
  confidence?: number | undefined;
  href?: string | undefined;
  className?: string | undefined;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)]",
          ICON_TONE[tone],
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">
          {title}
        </span>
        {detail ? (
          <span className="mt-0.5 block text-sm text-slate-600">{detail}</span>
        ) : null}
        <span className="mt-1 block text-xs text-slate-400">
          {source}
          {typeof confidence === "number"
            ? ` · tingkat keyakinan ${confidence}%`
            : null}
        </span>
      </span>

      {href ? (
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 self-center text-slate-300"
        />
      ) : null}
    </>
  );

  const shared = cn(
    "flex items-start gap-3 rounded-[var(--radius-control)] px-3 py-3",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(shared, "transition-colors hover:bg-slate-50")}>
        {body}
      </Link>
    );
  }

  return <article className={shared}>{body}</article>;
}
