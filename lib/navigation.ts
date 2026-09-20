import {
  ClipboardList,
  FolderKanban,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { PHASES } from "@/lib/status";
import type { NavItem } from "@/types/navigation";

/**
 * Primary navigation — TANIA_PRD_v2.0.md §24.
 *
 * Each destination declares the phase that implements it and the permission
 * that will gate it. Navigation visibility is a convenience, never an
 * authorization control: CLAUDE.md §4.1 requires enforcement at the server
 * boundary and in PostgreSQL RLS.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  {
    id: "dashboard",
    label: "Executive Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    implementedInPhase: 6,
    permission: "report.read",
  },
  {
    id: "talent",
    label: "Talent",
    href: "/talent",
    icon: Users,
    implementedInPhase: 7,
    permission: "talent.read",
  },
  {
    id: "performance",
    label: "Performance",
    href: "/performance",
    icon: TrendingUp,
    implementedInPhase: 9,
    permission: "performance.read",
  },
  {
    id: "capability",
    label: "Capability",
    href: "/capabilities",
    icon: Layers,
    implementedInPhase: 8,
    permission: "capability.read",
  },
  {
    id: "development",
    label: "Development",
    href: "/development",
    icon: GraduationCap,
    implementedInPhase: 10,
    permission: "development.read",
  },
  {
    id: "assignments",
    label: "Work & Assignment",
    href: "/assignments",
    icon: ClipboardList,
    implementedInPhase: 11,
    permission: "assignment.read",
  },
  {
    id: "projects",
    label: "Projects",
    href: "/projects",
    icon: FolderKanban,
    implementedInPhase: 12,
    permission: "project.read",
  },
  {
    id: "business-impact",
    label: "Business Impact",
    href: "/business-impact",
    icon: Target,
    implementedInPhase: 12,
    permission: "business_impact.read",
  },
  {
    id: "ai",
    label: "AI Assistant",
    href: "/ai",
    icon: Sparkles,
    implementedInPhase: 15,
    permission: "ai.use",
  },
  {
    id: "settings",
    label: "Administration",
    href: "/settings",
    icon: Settings,
    implementedInPhase: 21,
    permission: "admin.users",
  },
];

/** A destination is reachable only once its phase reports completion. */
export function isNavItemAvailable(item: NavItem): boolean {
  const phase = PHASES.find((p) => p.id === item.implementedInPhase);
  return phase?.status === "IMPLEMENTED";
}
