import { StatusBadge } from "@/components/dashboard";
import { CLAIM_KIND_DESCRIPTION, CLAIM_KIND_LABEL } from "@/types/claim";
import type { ClaimKind } from "@/types/claim";
import type { Tone as StatusTone } from "@/types/status";

const KIND_TONE: Record<ClaimKind, StatusTone> = {
  FACT: "success",
  ANALYSIS: "info",
  INFERENCE: "warning",
  RECOMMENDATION: "neutral",
};

/**
 * Marks what kind of claim a value is.
 *
 * Rendered next to every performance figure so a reader can tell a measured
 * fact from a model's interpretation without having to know where the number
 * came from. INFERENCE is deliberately amber: it is not an error, but it is
 * not evidence either.
 */
export function ClaimBadge({ kind }: { kind: ClaimKind }) {
  return (
    <StatusBadge tone={KIND_TONE[kind]} showDot={false}>
      <span title={CLAIM_KIND_DESCRIPTION[kind]}>{CLAIM_KIND_LABEL[kind]}</span>
    </StatusBadge>
  );
}
