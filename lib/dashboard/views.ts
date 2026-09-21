/**
 * Role-aware dashboard composition — TANIA_RBAC_RLS_MATRIX.md §5.
 *
 * Pure: given an AuthContext, decide which sections appear and at what scope.
 * No I/O, so all four role behaviours are testable without a database.
 *
 * This decides what to *render*. It is not a security control — hiding a
 * section is a convenience, and the data behind it is still gated by
 * lib/auth/policy.ts at the boundary and by RLS in the database
 * (CLAUDE.md §4.1). A section shown to someone with no rows simply renders an
 * empty state; it never leaks.
 */

import { hasRole } from "@/lib/auth/policy";
import type { AuthContext } from "@/lib/auth/session";

/**
 * Breadth of the data a viewer sees.
 *
 * `aggregate` is deliberately distinct from `chapter`: the matrix says
 * EXECUTIVE defaults to aggregated intelligence and that individual sensitive
 * records need explicit authorization. An executive dashboard therefore shows
 * roll-ups and must not offer per-person drill-down.
 */
export const DASHBOARD_SCOPES = [
  "platform",
  "aggregate",
  "chapter",
  "squad",
  "self",
  "none",
] as const;

export type DashboardScope = (typeof DASHBOARD_SCOPES)[number];

export const DASHBOARD_SECTIONS = [
  "talent_health",
  "performance",
  "capability",
  "workload",
  "ai_augmentation",
  "business_impact",
  "critical_insights",
  "alerts",
  "project_intelligence",
] as const;

export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

/** Permission that gates each section. Read permissions only — this is a view. */
export const SECTION_PERMISSION: Record<DashboardSection, string> = {
  talent_health: "talent.read",
  performance: "performance.read",
  capability: "capability.read",
  workload: "assignment.read",
  ai_augmentation: "ai.use",
  business_impact: "business_impact.read",
  critical_insights: "capability.read",
  alerts: "talent.read",
  project_intelligence: "project.read",
};

export const SECTION_TITLE: Record<DashboardSection, string> = {
  talent_health: "Talent Health",
  performance: "Performance",
  capability: "Capability",
  workload: "Workload",
  ai_augmentation: "AI Augmentation",
  business_impact: "Business Impact",
  critical_insights: "Critical Insights",
  alerts: "Alerts",
  project_intelligence: "Project Intelligence",
};

export interface DashboardView {
  readonly scope: DashboardScope;
  /** Heading shown to this viewer. */
  readonly title: string;
  readonly subtitle: string;
  readonly sections: readonly DashboardSection[];
  /**
   * Whether the viewer may open an individual person's record from here.
   * False for EXECUTIVE by design, and for anyone at `self` scope.
   */
  readonly allowsIndividualDrilldown: boolean;
}

/**
 * Highest-privilege scope wins, so someone holding several roles is not
 * narrowed by the least of them.
 */
export function resolveScope(context: AuthContext): DashboardScope {
  if (hasRole(context, "SUPER_ADMIN")) return "platform";
  if (hasRole(context, "EXECUTIVE")) return "aggregate";
  if (hasRole(context, "CHAPTER_LEAD") || hasRole(context, "HR")) return "chapter";
  if (hasRole(context, "MANAGER") || hasRole(context, "PROJECT_MANAGER")) {
    return "squad";
  }
  if (hasRole(context, "TALENT")) return "self";
  return "none";
}

const SCOPE_COPY: Record<DashboardScope, { title: string; subtitle: string }> = {
  platform: {
    title: "Platform Overview",
    subtitle: "All organizations — platform administration scope",
  },
  aggregate: {
    title: "Executive Dashboard",
    subtitle: "Aggregated chapter intelligence. Individual records are not shown at this scope.",
  },
  chapter: {
    title: "Chapter Dashboard",
    subtitle: "Chapter Digital Product & Solution · Telkom Indonesia",
  },
  squad: {
    title: "Squad Dashboard",
    subtitle: "Your squad and the work assigned to it",
  },
  self: {
    title: "My Dashboard",
    subtitle: "Your capability, performance, development and assigned work",
  },
  none: {
    title: "Dashboard",
    subtitle: "No organizational scope is assigned to your account",
  },
};

/**
 * Builds the view for a viewer.
 *
 * A section appears only if the viewer holds its permission. That mirrors
 * rather than replaces enforcement: CLAUDE.md §9 forbids inferring access
 * from a role, so the check is against the permission set the database
 * produced for this user.
 */
export function resolveDashboardView(context: AuthContext): DashboardView {
  const scope = resolveScope(context);
  const copy = SCOPE_COPY[scope];

  const sections = DASHBOARD_SECTIONS.filter((section) =>
    context.permissions.includes(SECTION_PERMISSION[section]),
  );

  return {
    scope,
    title: copy.title,
    subtitle: copy.subtitle,
    sections,
    // EXECUTIVE sees roll-ups only; `self` scope has nobody else to open.
    allowsIndividualDrilldown:
      scope === "platform" || scope === "chapter" || scope === "squad",
  };
}

export function isSectionVisible(
  view: DashboardView,
  section: DashboardSection,
): boolean {
  return view.sections.includes(section);
}
