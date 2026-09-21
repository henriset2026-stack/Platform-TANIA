import { CircleCheck, CircleSlash, Clock, ExternalLink, type LucideIcon } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { cn } from "@/lib/utils";
import type { Tone } from "@/types/status";

export type ValidationStatus = "pending" | "validated" | "rejected" | "withdrawn";

const VALIDATION: Record<
  ValidationStatus,
  { label: string; tone: Tone; icon: LucideIcon }
> = {
  pending: { label: "Pending validation", tone: "warning", icon: Clock },
  validated: { label: "Validated", tone: "success", icon: CircleCheck },
  rejected: { label: "Rejected", tone: "danger", icon: CircleSlash },
  withdrawn: { label: "Withdrawn", tone: "neutral", icon: CircleSlash },
};

/**
 * A single piece of evidence.
 *
 * Evidence is the spine of the product: capability and performance claims are
 * only as good as what supports them (CLAUDE.md §16, §17). This component
 * therefore always shows source, when it occurred, validation status and who
 * validated it — none of those are optional props, because evidence without
 * provenance is an assertion.
 *
 * `origin` distinguishes a human assertion from an AI-generated claim,
 * mirroring performance_evidence.origin. An AI claim displayed identically to
 * a human one would erase exactly the distinction the schema preserves.
 */
export function EvidenceCard({
  title,
  description,
  sourceType,
  sourceReference,
  occurredAt,
  validationStatus,
  validatedBy,
  origin = "human",
  evidenceUrl,
  className,
}: {
  title: string;
  description?: string | undefined;
  sourceType: string;
  sourceReference?: string | undefined;
  /** ISO date. */
  occurredAt?: string | undefined;
  validationStatus: ValidationStatus;
  validatedBy?: string | undefined;
  origin?: "human" | "system" | "ai_generated";
  evidenceUrl?: string | undefined;
  className?: string | undefined;
}) {
  const validation = VALIDATION[validationStatus];
  const Icon = validation.icon;

  return (
    <article
      className={cn(
        "rounded-[var(--radius-card)] border border-slate-200 bg-white p-4",
        validationStatus === "withdrawn" && "opacity-60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-900">{title}</h3>
        <StatusBadge tone={validation.tone} showDot={false}>
          <Icon aria-hidden="true" className="size-3" />
          {validation.label}
        </StatusBadge>
      </div>

      {description ? (
        <p className="mt-1.5 text-sm text-slate-600">{description}</p>
      ) : null}

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <div className="flex gap-1">
          <dt className="font-medium">Source</dt>
          <dd>
            {sourceType}
            {sourceReference ? ` · ${sourceReference}` : null}
          </dd>
        </div>
        {occurredAt ? (
          <div className="flex gap-1">
            <dt className="font-medium">Occurred</dt>
            <dd>
              <time dateTime={occurredAt}>{occurredAt.slice(0, 10)}</time>
            </dd>
          </div>
        ) : null}
        {validatedBy ? (
          <div className="flex gap-1">
            <dt className="font-medium">Validated by</dt>
            <dd>{validatedBy}</dd>
          </div>
        ) : null}
        {origin !== "human" ? (
          <div className="flex gap-1">
            <dt className="font-medium">Origin</dt>
            <dd className="text-amber-700">
              {origin === "ai_generated" ? "AI-generated" : "System"}
            </dd>
          </div>
        ) : null}
      </dl>

      {evidenceUrl ? (
        <a
          href={evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-telkom-blue-600)] hover:underline"
        >
          View evidence
          <ExternalLink aria-hidden="true" className="size-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
    </article>
  );
}
