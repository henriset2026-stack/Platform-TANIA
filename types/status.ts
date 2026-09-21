/**
 * Status vocabulary.
 *
 * Two independent scales, deliberately not merged:
 *
 *  - CapabilityStatus mirrors the heatmap legend in the dashboard mockup
 *    (Strong / On Track / Need Attention / Critical Gap). It describes how
 *    well a capability is covered.
 *  - WorkStatus describes progress of work (projects, assignments,
 *    deliverables, plans).
 *
 * Colour is never the only signal: StatusBadge renders a label, and each
 * status has an accessible description. A red pill alone fails anyone who
 * cannot distinguish it from amber.
 */

export const CAPABILITY_STATUSES = [
  "strong",
  "on_track",
  "needs_attention",
  "critical_gap",
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export const WORK_STATUSES = [
  "on_track",
  "in_progress",
  "at_risk",
  "delayed",
  "completed",
  "cancelled",
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];

/** Generic severity, used by InsightCard and EmptyState. */
export const TONES = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
] as const;

export type Tone = (typeof TONES)[number];

export const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, string> = {
  strong: "Strong",
  on_track: "On Track",
  needs_attention: "Needs Attention",
  critical_gap: "Critical Gap",
};

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  on_track: "On Track",
  in_progress: "In Progress",
  at_risk: "At Risk",
  delayed: "Delayed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CAPABILITY_STATUS_TONE: Record<CapabilityStatus, Tone> = {
  strong: "success",
  on_track: "info",
  needs_attention: "warning",
  critical_gap: "danger",
};

export const WORK_STATUS_TONE: Record<WorkStatus, Tone> = {
  on_track: "success",
  in_progress: "info",
  at_risk: "warning",
  delayed: "danger",
  completed: "success",
  cancelled: "neutral",
};

/** Maps a capability level gap to a status. Gap = required - current. */
export function gapToStatus(gap: number): CapabilityStatus {
  if (gap <= 0) return "strong";
  if (gap <= 1) return "on_track";
  if (gap <= 2) return "needs_attention";
  return "critical_gap";
}
