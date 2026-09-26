/**
 * Assistant quick actions — TANIA_PRD_v2.0_working.md §81.
 *
 * A quick action is a PROMPT, not a capability. Selecting one sends the same
 * authorized request as typing the question, so the buttons carry no
 * authority of their own and the UI cannot become a way around the gateway.
 *
 * Actions are hidden when the viewer lacks the relevant read permission.
 * That is a convenience — offering a button that always fails is poor design,
 * not a security measure — and the server authorizes regardless of what the
 * UI chose to render (CLAUDE.md §4.1).
 */

export interface QuickAction {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  /** Permission the resulting request will need. Used only to hide the button. */
  readonly permission: string;
  readonly icon:
    | "sparkles"
    | "target"
    | "users"
    | "trending"
    | "graduation"
    | "folder";
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: "ask",
    label: "Tanya TANIA",
    prompt: "",
    permission: "ai.use",
    icon: "sparkles",
  },
  {
    id: "critical_gaps",
    label: "Gap Kritis",
    prompt: "Apa saja capability gap kritis kita?",
    permission: "capability.read",
    icon: "target",
  },
  {
    id: "find_talent",
    label: "Cari Talent",
    prompt: "Carikan talent dengan capability yang saya butuhkan.",
    permission: "talent.read",
    icon: "users",
  },
  {
    id: "performance",
    label: "Kinerja",
    prompt: "Tampilkan kinerja chapter saya.",
    permission: "performance.read",
    icon: "trending",
  },
  {
    id: "development",
    label: "Pengembangan",
    prompt: "Pengembangan apa yang sebaiknya kita prioritaskan?",
    permission: "development.read",
    icon: "graduation",
  },
  {
    id: "project_matching",
    label: "Pencocokan Proyek",
    prompt: "Siapa yang cocok untuk proyek ini?",
    permission: "assignment.read",
    icon: "folder",
  },
];

export function visibleQuickActions(
  permissions: readonly string[],
): readonly QuickAction[] {
  return QUICK_ACTIONS.filter((action) => permissions.includes(action.permission));
}
