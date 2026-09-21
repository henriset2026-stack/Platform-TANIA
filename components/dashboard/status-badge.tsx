import { cn } from "@/lib/utils";
import {
  CAPABILITY_STATUS_LABELS,
  CAPABILITY_STATUS_TONE,
  WORK_STATUS_LABELS,
  WORK_STATUS_TONE,
} from "@/types/status";
import type { CapabilityStatus, Tone, WorkStatus } from "@/types/status";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-[var(--color-status-neutral-bg)] text-slate-700",
  info: "bg-[var(--color-status-ontrack-bg)] text-blue-900",
  success: "bg-[var(--color-status-strong-bg)] text-emerald-900",
  warning: "bg-[var(--color-status-attention-bg)] text-amber-900",
  danger: "bg-[var(--color-status-critical-bg)] text-red-900",
};

/**
 * Status pill.
 *
 * Always renders a text label. Colour reinforces the status; it never carries
 * it alone, so the component remains readable without colour perception.
 * A dot is added as a third, non-colour cue.
 */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
  showDot = true,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string | undefined;
  showDot?: boolean | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
        />
      ) : null}
      {children}
    </span>
  );
}

export function CapabilityStatusBadge({
  status,
  className,
}: {
  status: CapabilityStatus;
  className?: string | undefined;
}) {
  return (
    <StatusBadge tone={CAPABILITY_STATUS_TONE[status]} className={className}>
      {CAPABILITY_STATUS_LABELS[status]}
    </StatusBadge>
  );
}

export function WorkStatusBadge({
  status,
  className,
}: {
  status: WorkStatus;
  className?: string | undefined;
}) {
  return (
    <StatusBadge tone={WORK_STATUS_TONE[status]} className={className}>
      {WORK_STATUS_LABELS[status]}
    </StatusBadge>
  );
}
