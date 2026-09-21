import { SCALE } from "@/lib/scale";

/**
 * SCALE identity banner — CLAUDE.md §20.
 *
 * Part of the Chapter DPS transformation narrative, carried into the
 * dashboard as the mockups do. Presentational only: it is a <div> with an
 * aria-label rather than a list of headings, so it does not pollute the
 * page's heading outline.
 */
export function ScaleBanner() {
  return (
    <div
      aria-label="SCALE: Synergize, Customer and Culture, Automate, Lead, Expand"
      className="rounded-[var(--radius-card)] border border-slate-200 bg-[var(--color-telkom-navy)] px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold tracking-[0.3em] text-white">
            SCALE
          </p>
          <p className="mt-0.5 text-xs tracking-wide text-slate-300">
            Stronger People · Smarter Ways · Bigger Impact
          </p>
        </div>
        <ul aria-hidden="true" className="flex flex-wrap gap-x-5 gap-y-1">
          {SCALE.map((pillar) => (
            <li key={pillar.letter} className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-[var(--color-telkom-red)]">
                {pillar.letter}
              </span>
              <span className="text-xs text-slate-300">{pillar.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
