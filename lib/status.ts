/**
 * Implementation status registry.
 *
 * CLAUDE.md §34 and the project rules require that implemented, partially
 * implemented and planned functionality stay clearly separated, and that
 * planned functionality is never reported as implemented.
 *
 * This module is the single source of truth for that claim. A phase may only
 * be marked IMPLEMENTED or PARTIALLY_IMPLEMENTED if `evidence` cites something
 * that actually exists in the repository — enforced by tests/unit/status.test.ts.
 */

export const PHASE_STATUSES = [
  "IMPLEMENTED",
  "PARTIALLY_IMPLEMENTED",
  "PLANNED",
  "MISSING",
] as const;

export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export interface Phase {
  readonly id: number;
  readonly name: string;
  readonly status: PhaseStatus;
  /** Required when status is IMPLEMENTED or PARTIALLY_IMPLEMENTED. */
  readonly evidence?: string;
}

export const PHASES: readonly Phase[] = [
  {
    id: 0,
    name: "Repository reconnaissance",
    status: "IMPLEMENTED",
    evidence: "TANIA_IMPLEMENTATION_BASELINE.md",
  },
  {
    id: 1,
    name: "Application foundation",
    status: "IMPLEMENTED",
    evidence:
      "toolchain, app/ (App Router + error/loading boundaries), components/ (shadcn ui + layout shell), lib/, types/, hooks/, styles/",
  },
  {
    id: 2,
    name: "Supabase foundation",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "supabase/migrations/ (8 files), lib/supabase/{client,server,admin,middleware}.ts, lib/auth/session.ts, types/database.ts (hand-written); outstanding: no database exists, so migrations are unapplied, types are ungenerated and RLS is unverified",
  },
  {
    id: 3,
    name: "Authentication + RBAC + RLS",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "lib/auth/{policy,authorize,routes,session}.ts, app/(auth)/login + app/auth/{callback,signout}, middleware route protection, migration 20260921090001 (AI_SERVICE restrictive policies); 69 policy tests pass; outstanding: no database, so tests/rls/ has never run and RLS enforcement is unverified; Entra SSO unconfigured; EXECUTIVE explicit-authorization mechanism unspecified",
  },
  {
    id: 4,
    name: "Core domain model",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "supabase/migrations/2026092110000{1..10} (27 tables, 63 policies, 55 indexes), types/database.ts covering 33 tables, supabase/seed/; outstanding: no database exists, so migrations are unapplied, types are ungenerated and RLS is unverified; capability_requirements is designed from the ERD rather than a PRD specification",
  },
  {
    id: 5,
    name: "Design system",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "styles/globals.css design tokens, components/ui (16 primitives), components/dashboard (14 components + barrel), components/brand/tania-avatar.tsx, app/design-system reference page, accessibility and token tests; outstanding: ChartCard has no chart renderer (Phase 6 picks the library), no automated axe or visual-regression check, and the official TANIA portrait asset is not yet supplied",
  },
  {
    id: 6,
    name: "Executive dashboard",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "lib/dashboard/{views,queries}.ts (real RLS-scoped Supabase queries), app/dashboard/page.tsx role-aware composition, workload/alerts/SCALE panels, 13 role-view tests; outstanding: no database so every metric resolves to not-connected, and the composite indices (performance, capability coverage, AI augmentation) need the calculation engine from Phases 8-13",
  },
  { id: 7, name: "Talent", status: "PLANNED" },
  { id: 8, name: "Capability", status: "PLANNED" },
  { id: 9, name: "Performance", status: "PLANNED" },
  { id: 10, name: "Development", status: "PLANNED" },
  { id: 11, name: "Workload + Assignment", status: "PLANNED" },
  { id: 12, name: "Project + Feasibility + Budget", status: "PLANNED" },
  { id: 13, name: "AI Gateway", status: "PLANNED" },
  { id: 14, name: "RAG", status: "PLANNED" },
  { id: 15, name: "TANIA AI Assistant", status: "PLANNED" },
  { id: 16, name: "Specialized Agents", status: "PLANNED" },
  { id: 17, name: "JARVIS Integration", status: "PLANNED" },
  { id: 18, name: "Voice / Avatar", status: "PLANNED" },
  { id: 19, name: "Audit + Observability", status: "PLANNED" },
  { id: 20, name: "Testing", status: "PLANNED" },
  { id: 21, name: "Production Hardening", status: "PLANNED" },
  { id: 22, name: "Deployment", status: "PLANNED" },
];

export type StatusCounts = Record<PhaseStatus, number>;

export function statusCounts(phases: readonly Phase[] = PHASES): StatusCounts {
  const counts: StatusCounts = {
    IMPLEMENTED: 0,
    PARTIALLY_IMPLEMENTED: 0,
    PLANNED: 0,
    MISSING: 0,
  };
  for (const phase of phases) {
    counts[phase.status] += 1;
  }
  return counts;
}

/** Phases that claim to exist must cite evidence. */
export function phasesClaimingCompletion(
  phases: readonly Phase[] = PHASES,
): readonly Phase[] {
  return phases.filter(
    (p) => p.status === "IMPLEMENTED" || p.status === "PARTIALLY_IMPLEMENTED",
  );
}
