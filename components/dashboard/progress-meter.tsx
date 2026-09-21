import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Labelled progress, as used in the project rows of the mockup.
 *
 * The numeric value is always rendered as text beside the bar. A bar alone
 * communicates nothing to a screen reader beyond its ARIA value, and nothing
 * at all in a printed or low-vision context.
 */
export function ProgressMeter({
  value,
  label,
  showValue = true,
  className,
}: {
  /** 0-100. */
  value: number;
  /** Accessible name. Required — an unlabelled progress bar is meaningless. */
  label: string;
  showValue?: boolean | undefined;
  className?: string | undefined;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Progress
        value={clamped}
        aria-label={label}
        className="h-2 flex-1"
      />
      {showValue ? (
        <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-slate-600">
          {Math.round(clamped)}%
        </span>
      ) : null}
    </div>
  );
}
