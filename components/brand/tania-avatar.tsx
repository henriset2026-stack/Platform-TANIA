import { cn } from "@/lib/utils";

/**
 * TANIA presence states — TANIA_PRD_v2.0_working.md §80.3.
 */
export const TANIA_STATES = [
  "idle",
  "greeting",
  "listening",
  "thinking",
  "answering",
  "expanded",
] as const;

export type TaniaState = (typeof TANIA_STATES)[number];

const STATE_LABEL: Record<TaniaState, string> = {
  idle: "TANIA is available",
  greeting: "TANIA is greeting you",
  listening: "TANIA is listening",
  thinking: "TANIA is thinking",
  answering: "TANIA is answering",
  expanded: "TANIA assistant is open",
};

const STATE_DOT: Record<TaniaState, string> = {
  idle: "bg-emerald-500",
  greeting: "bg-emerald-500",
  listening: "bg-[var(--color-telkom-blue-600)]",
  thinking: "bg-amber-500",
  answering: "bg-[var(--color-telkom-blue-600)]",
  expanded: "bg-emerald-500",
};

const SIZES = {
  sm: { box: "size-8", dot: "size-2", mark: "text-[10px]" },
  md: { box: "size-10", dot: "size-2.5", mark: "text-xs" },
  lg: { box: "size-14", dot: "size-3", mark: "text-base" },
  xl: { box: "size-20", dot: "size-3.5", mark: "text-xl" },
} as const;

/**
 * TANIA's visual identity as the DPS AI employee.
 *
 * The mockups present TANIA as a photorealistic professional in Telkom
 * uniform. That portrait is a brand asset and is NOT generated here — pass it
 * via `portraitSrc` when it is available. Until then the fallback is a
 * restrained monogram on Telkom navy: enterprise, not a cartoon mascot or a
 * game character.
 *
 * Motion is limited to a single pulse ring on `listening`/`thinking`, and the
 * reduced-motion rule in styles/globals.css disables it. The state is also
 * announced in text, so presence never depends on noticing an animation.
 */
export function TaniaAvatar({
  state = "idle",
  size = "md",
  portraitSrc,
  showPresence = true,
  className,
}: {
  state?: TaniaState;
  size?: keyof typeof SIZES;
  /** Official TANIA portrait. Falls back to the monogram mark when absent. */
  portraitSrc?: string;
  showPresence?: boolean;
  className?: string;
}) {
  const dims = SIZES[size];
  const animated = state === "listening" || state === "thinking";

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      data-state={state}
    >
      {animated ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 animate-ping rounded-full opacity-40",
            state === "listening"
              ? "bg-[var(--color-telkom-blue-600)]"
              : "bg-amber-400",
          )}
        />
      ) : null}

      <span
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full",
          "bg-[var(--color-telkom-navy)] ring-2 ring-white",
          dims.box,
        )}
      >
        {portraitSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portraitSrc}
            alt=""
            className="size-full object-cover object-top"
          />
        ) : (
          <span
            aria-hidden="true"
            className={cn("font-semibold tracking-tight text-white", dims.mark)}
          >
            TA
          </span>
        )}
      </span>

      {showPresence ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-0 bottom-0 rounded-full ring-2 ring-white",
            dims.dot,
            STATE_DOT[state],
          )}
        />
      ) : null}

      <span className="sr-only">{STATE_LABEL[state]}</span>
    </span>
  );
}

/** Text presence indicator, as in the mockup footer ("TANIA is online"). */
export function TaniaPresence({
  state = "idle",
  className,
}: {
  state?: TaniaState;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-2 text-xs text-slate-600", className)}>
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", STATE_DOT[state])}
      />
      {STATE_LABEL[state]}
    </p>
  );
}
