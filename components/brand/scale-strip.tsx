import { SCALE } from "@/lib/scale";
import { cn } from "@/lib/utils";

/**
 * SCALE identity strip for the dashboard shell (CLAUDE.md §20).
 */
export function ScaleStrip({ className }: { className?: string }) {
  return (
    <div className={cn("border-t border-slate-200 px-4 py-3", className)}>
      <p className="mb-2 text-[10px] font-medium tracking-widest text-slate-400 uppercase">
        SCALE
      </p>
      <ul className="space-y-1">
        {SCALE.map((pillar) => (
          <li key={pillar.letter} className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className="w-3 shrink-0 text-xs font-semibold text-[var(--color-telkom-red)]"
            >
              {pillar.letter}
            </span>
            <span className="text-xs text-slate-600">{pillar.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
