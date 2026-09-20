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
    evidence: "package.json, tsconfig.json, eslint.config.mjs, vitest.config.ts, app/",
  },
  { id: 2, name: "Supabase foundation", status: "PLANNED" },
  { id: 3, name: "Authentication + RBAC + RLS", status: "PLANNED" },
  { id: 4, name: "Core domain model", status: "PLANNED" },
  { id: 5, name: "Design system", status: "PLANNED" },
  { id: 6, name: "Executive dashboard", status: "PLANNED" },
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
