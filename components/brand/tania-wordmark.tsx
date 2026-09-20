import { cn } from "@/lib/utils";

export function TaniaWordmark({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="text-lg font-semibold tracking-tight text-[var(--color-telkom-navy)]">
        TANIA
      </span>
      {showTagline ? (
        <span className="mt-0.5 text-[10px] tracking-wide text-slate-500 uppercase">
          Chapter DPS
        </span>
      ) : null}
    </span>
  );
}
