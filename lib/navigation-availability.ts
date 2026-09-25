import "server-only";

import { PRIMARY_NAV } from "@/lib/navigation";
import { PHASES } from "@/lib/status";
import type { NavItem } from "@/types/navigation";

/**
 * Navigation availability, computed on the server.
 *
 * lib/status.ts carries internal engineering notes — including descriptions
 * of security defects and their fixes. Importing it from the client sidebar
 * shipped all of it to every browser (Security Gate #1, SG-08). The client
 * now receives only the ids of available destinations.
 */

/** A destination is reachable only once its phase reports completion. */
export function isNavItemAvailable(item: NavItem): boolean {
  const phase = PHASES.find((p) => p.id === item.implementedInPhase);
  return phase?.status === "IMPLEMENTED";
}

export function availableNavItemIds(): readonly string[] {
  return PRIMARY_NAV.filter(isNavItemAvailable).map((item) => item.id);
}
