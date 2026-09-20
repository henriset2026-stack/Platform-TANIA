import type { LucideIcon } from "lucide-react";

export interface NavItem {
  /** Stable key. */
  readonly id: string;
  /** Label shown in navigation. */
  readonly label: string;
  /** Route. Only navigable when `implementedInPhase` is already complete. */
  readonly href: string;
  readonly icon: LucideIcon;
  /** Implementation phase that delivers this destination. */
  readonly implementedInPhase: number;
  /** Permission required to see this destination (CLAUDE.md §9). */
  readonly permission: string;
}
