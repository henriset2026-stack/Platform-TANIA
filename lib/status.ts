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
  {
    id: 7,
    name: "Talent",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "app/talent (directory with server-side search, filters, pagination) and app/talent/[id] (Digital Talent Passport, 11 sections each sensitivity-gated), lib/talent/{filters,queries}.ts, 15 adversarial filter tests; outstanding: no database so every section resolves to not-connected, and the per-section authorization is unverified against real RLS",
  },
  {
    id: 8,
    name: "Capability",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "lib/calculations/capability.ts (deterministic gap, proven-level, priority and coverage engine, 401 lines), lib/capability/queries.ts, /capability, /capability/[id], /talent/[id]/capabilities, gap heatmap, 29 unit tests; outstanding: no database so every view resolves to not-connected, and the gap-priority ordinal weights are designed rather than PRD-specified",
  },
  {
    id: 9,
    name: "Performance",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "migration 20260921110001 (configurable weight profiles with a deferred sum-to-one constraint trigger), lib/calculations/performance.ts, types/claim.ts (FACT/ANALYSIS/INFERENCE/RECOMMENDATION), lib/performance/queries.ts, /performance, /performance/[talentId], /performance/reviews, 30 unit tests; outstanding: no database so no weighting model exists and no index can be computed, and the review server actions are not wired (the transition rules are pure and tested but no mutation path exists yet)",
  },
  {
    id: 10,
    name: "Development",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "migration 20260921120001 (configurable development_templates with a deferred hours trigger, plus capability_upgrade_proposals whose CHECK forbids an evidence-free proposal), lib/calculations/development.ts, lib/development/queries.ts, /development, /development/[talentId], 24 unit tests; outstanding: no database so no template exists, the proposal decision path has no server action, and getDevelopmentPlans uses placeholder current/target levels until the capability join is wired",
  },
  {
    id: 11,
    name: "Workload + Assignment",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "lib/calculations/workload.ts (utilization bands, capacity FTE, committed forecast), lib/calculations/matching.ts (10-dimension matcher producing match/evidence/gap/confidence/action), lib/workload/queries.ts, /workload, /assignments, /projects/[id], 26 unit tests; outstanding: no database so no population exists to match against, the candidate shortlist is not rendered on the project page, and assignment approval has no server action",
  },
  {
    id: 12,
    name: "Project + Feasibility + Budget",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "migration 20260921130001 (feasibility criteria/weights/assessments/scores/reviews, project_budgets with a provenance CHECK, thresholds, reallocations, and audit_decision_change triggers that finally wire the audit log), lib/calculations/{feasibility,budget}.ts, types/integration.ts, /projects, /feasibility, /budget, 29 unit tests; outstanding: no database and no SAP integration so every financial figure is unavailable by design, and the decision/reallocation paths have no server actions",
  },
  {
    id: 13,
    name: "AI Gateway",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "agents/core/{types,schema,tool-registry,pipeline}.ts, lib/ai/{provider,config,gateway}.ts, app/api/ai/chat, 31 security tests covering registry refusal, schema rejection, permission and AI-identity denial, confirmation gating, timeout and no-fabricated-execution; outstanding: no LLM provider is configured so the gateway refuses every request, the tool registry is deliberately empty, and agent runs are not yet persisted to agent_runs/agent_tool_calls",
  },
  {
    id: 14,
    name: "RAG",
    status: "PARTIALLY_IMPLEMENTED",
    evidence:
      "migration 20260921140001 (knowledge_chunks with denormalized ACL kept in step by trigger, and match_knowledge_chunks as SECURITY INVOKER so RLS filters during the index scan), lib/rag/{chunking,sanitize,retrieval,citations,queries}.ts, /knowledge, /knowledge/[id], 29 RAG tests; outstanding: no embedding model is selected so nothing can be embedded or searched, no HNSW index is created (it needs real volume and a chosen model), and there is no ingestion pipeline",
  },
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
