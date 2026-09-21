import { CircleAlert, Inbox, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Empty, loading and error states.
 *
 * Every data surface in TANIA must handle all three (CLAUDE.md Definition of
 * Done). These exist so that obligation is a one-line import rather than
 * something each screen reinvents — or skips.
 */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon | undefined;
  title: string;
  description?: string | undefined;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)]",
        "border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-6 text-slate-400" />
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Loading state.
 *
 * role="status" + aria-busy so assistive technology announces the wait, and a
 * visually hidden label so it is not a silent region. Skeletons alone are
 * invisible to a screen reader.
 */
export function LoadingState({
  label = "Loading",
  rows = 3,
  className,
}: {
  label?: string | undefined;
  rows?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn("space-y-2", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/**
 * Error state.
 *
 * `detail` is for a correlation id or a short, safe message. Never pass a
 * stack trace, SQL text or provider error here — CLAUDE.md §22 forbids
 * leaking internals to clients.
 */
export function ErrorState({
  title = "This could not be loaded",
  description = "The request failed. Nothing was changed.",
  detail,
  onRetry,
  className,
}: {
  title?: string | undefined;
  description?: string | undefined;
  detail?: string | undefined;
  onRetry?: () => void;
  className?: string | undefined;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)]",
        "border border-red-200 bg-red-50/60 px-6 py-10 text-center",
        className,
      )}
    >
      <CircleAlert
        aria-hidden="true"
        className="size-6 text-[var(--color-telkom-red)]"
      />
      <p className="mt-3 text-sm font-medium text-red-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-red-800">{description}</p>
      {detail ? (
        <p className="mt-2 font-mono text-xs text-red-700/70">{detail}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
