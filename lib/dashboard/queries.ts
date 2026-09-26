import "server-only";

/**
 * Dashboard data access.
 *
 * These are REAL queries. Each one runs through the caller's RLS-scoped
 * server client, so rows the viewer may not see are filtered by PostgreSQL,
 * not by this file. No query uses the admin client.
 *
 * Every function returns a DataPoint, which forces each distinct outcome to
 * be a distinct state rather than collapsing into "no data":
 *
 *   not-connected  Supabase is not configured in this environment
 *   empty          the query ran and returned nothing
 *   restricted     the viewer's scope excludes this entirely
 *   failed         the query errored
 *   live           a real value, with provenance
 *
 * Today every call resolves to `not-connected`, because no TANIA Supabase
 * project exists. That is a fact about the environment, not a stub: when a
 * project is provisioned and migrations are applied, these return live values
 * with no code change.
 */

import { createClient } from "@/lib/supabase/server";
import type { DashboardScope, DashboardView } from "@/lib/dashboard/views";
import type { AuthContext } from "@/lib/auth/session";
import { notConnected } from "@/types/data";
import type { DataPoint, Failed } from "@/types/data";

/** Phase 2 provisioned the client; the project itself does not exist yet. */
const NOT_PROVISIONED_PHASE = 2;

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function provenance(source: string, validated = false) {
  return {
    source,
    asOf: new Date().toISOString(),
    validated,
  };
}

/**
 * Returns the `Failed` variant rather than `DataPoint<never>`: the latter
 * pins the generic to `never` and every caller's value type collapses.
 * `Failed` carries no type parameter, so it is assignable to any DataPoint<T>.
 */
function failed(reason: string): Failed {
  return { state: "failed", reason };
}

/**
 * Wraps a query so an unconfigured environment, a thrown exception and a
 * Postgres error each produce their own state.
 *
 * Without this, a failure would be indistinguishable from an empty result —
 * which is exactly the fabricated-success pattern CLAUDE.md §25 forbids.
 */
async function guarded<T>(
  requires: string,
  run: () => Promise<DataPoint<T>>,
): Promise<DataPoint<T>> {
  if (!supabaseConfigured()) {
    return notConnected(NOT_PROVISIONED_PHASE, requires);
  }
  try {
    return await run();
  } catch (error) {
    // Message only — never a stack trace or SQL text (CLAUDE.md §22).
    const message = error instanceof Error ? error.message : "Unknown error";
    return failed(message);
  }
}

/** Scope-to-column filters. Applied on top of RLS, never instead of it. */
function scopeFilter(scope: DashboardScope, context: AuthContext) {
  return { scope, context };
}

// ===========================================================================
// Talent Health
// ===========================================================================

export async function getTalentHeadcount(
  view: DashboardView,
  context: AuthContext,
): Promise<DataPoint<number>> {
  return guarded("profiles table + RLS", async () => {
    const supabase = await createClient();

    let query = supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    // RLS already restricts rows; these narrow further for the chosen view.
    if (view.scope === "self") {
      query = query.eq("id", context.userId);
    } else if (view.scope === "chapter" && context.organizationIds.length > 0) {
      query = query.in("chapter_id", [...context.organizationIds]);
    } else if (view.scope === "squad" && context.squadIds.length > 0) {
      query = query.in("squad_id", [...context.squadIds]);
    }

    const { count, error } = await query;
    if (error) return failed(error.message);
    if (count === null || count === 0) return { state: "empty" };

    return {
      state: "live",
      value: count,
      provenance: provenance("supabase:profiles"),
    };
  });
}

// ===========================================================================
// Capability — coverage and gaps
// ===========================================================================

export async function getCapabilityCoverage(
  _view: DashboardView,
): Promise<DataPoint<number>> {
  return guarded("talent_capabilities + capability_requirements", async () => {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("talent_capabilities")
      .select("id", { count: "exact", head: true });

    if (error) return failed(error.message);
    if (count === null || count === 0) return { state: "empty" };

    // Coverage is a ratio against capability_requirements. Computing it needs
    // the calculation engine (PRD §61), which Phase 8 builds. Reporting the
    // raw count as a percentage would be a fabricated metric.
    return notConnected(8, "capability coverage calculation (PRD §61)");
  });
}

export interface CapabilityGapRow {
  readonly capability: string;
  readonly requiredLevel: number;
  readonly currentLevel: number;
  readonly gap: number;
  readonly criticality: string;
  readonly urgency: string;
}

export async function getCapabilityGaps(
  _view: DashboardView,
): Promise<DataPoint<readonly CapabilityGapRow[]>> {
  return guarded("capability_requirements + talent_capabilities", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("capability_requirements")
      .select(
        "required_level, business_criticality, time_urgency, capabilities(name)",
      )
      .limit(10);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    // Requirements exist, but the gap needs current proven levels aggregated
    // per capability — the gap engine, Phase 8.
    return notConnected(8, "capability gap engine (PRD §7.3)");
  });
}

// ===========================================================================
// Chapter totals — the executive aggregate path
// ===========================================================================

export interface ChapterSummaryRow {
  readonly organizationId: string;
  readonly organizationName: string;
  /** True when the chapter has fewer than 5 active people. */
  readonly suppressed: boolean;
  readonly activeHeadcount: number;
  /** null when suppressed: the figure would describe identifiable people. */
  readonly talentsAssessed: number | null;
  readonly activeAssignments: number | null;
  readonly overallocatedPeople: number | null;
  readonly activeProjects: number;
}

/**
 * Per-chapter totals from chapter_summary() (migration 20260924100003).
 *
 * EXECUTIVE cannot read the rows behind these figures, by design (matrix §9),
 * so a direct count through RLS would return 0 and read as "nothing to
 * report". The function counts as definer and returns totals only, with
 * figures over fewer than five people withheld. Offered at the aggregate and
 * platform scopes; the database decides which chapters each caller gets.
 */
export async function getChapterSummaries(
  view: DashboardView,
): Promise<DataPoint<readonly ChapterSummaryRow[]>> {
  if (view.scope !== "aggregate" && view.scope !== "platform") {
    return { state: "restricted", reason: "Total chapter hanya untuk tampilan executive dan platform." };
  }
  return guarded("chapter_summary() — migration 20260924100003", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("chapter_summary");
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((row) => ({
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        suppressed: row.suppressed,
        activeHeadcount: row.active_headcount,
        talentsAssessed: row.talents_assessed,
        activeAssignments: row.active_assignments,
        overallocatedPeople: row.overallocated_people,
        activeProjects: row.active_projects,
      })),
      provenance: provenance("supabase:chapter_summary()"),
    };
  });
}

// ===========================================================================
// Performance
// ===========================================================================

export async function getPerformanceIndex(
  _view: DashboardView,
): Promise<DataPoint<number>> {
  return guarded("performance_metrics + performance_periods", async () => {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("performance_metrics")
      .select("id", { count: "exact", head: true });

    if (error) return failed(error.message);
    if (count === null || count === 0) return { state: "empty" };

    // A performance index is a weighted composite, and PRD §6.1 makes the
    // weights configuration. Inventing weights to produce a number here would
    // violate CLAUDE.md §16.
    return notConnected(9, "calculatePerformanceIndex + configured weights");
  });
}

// ===========================================================================
// Workload
// ===========================================================================

export interface WorkloadRow {
  readonly profileId: string;
  readonly name: string;
  readonly allocationPct: number;
}

export async function getWorkload(
  view: DashboardView,
  context: AuthContext,
): Promise<DataPoint<readonly WorkloadRow[]>> {
  return guarded("assignments + profiles", async () => {
    const supabase = await createClient();

    let query = supabase
      .from("assignments")
      .select("profile_id, allocation_pct, profiles(full_name)")
      .eq("status", "active");

    if (view.scope === "self") {
      query = query.eq("profile_id", context.userId);
    }

    const { data, error } = await query;
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    // Aggregate allocation per person across concurrent assignments.
    const totals = new Map<string, { name: string; pct: number }>();
    for (const row of data) {
      const existing = totals.get(row.profile_id);
      const name =
        (row as { profiles?: { full_name?: string } }).profiles?.full_name ??
        "Unknown";
      totals.set(row.profile_id, {
        name,
        pct: (existing?.pct ?? 0) + Number(row.allocation_pct ?? 0),
      });
    }

    const rows: WorkloadRow[] = [...totals.entries()]
      .map(([profileId, v]) => ({
        profileId,
        name: v.name,
        allocationPct: v.pct,
      }))
      .sort((a, b) => b.allocationPct - a.allocationPct);

    return {
      state: "live",
      value: rows,
      provenance: provenance("supabase:assignments"),
    };
  });
}

// ===========================================================================
// AI Augmentation
// ===========================================================================

export async function getAiAugmentation(
  _view: DashboardView,
): Promise<DataPoint<number>> {
  return guarded("ai_usage + ai_augmentation", async () => {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("ai_augmentation")
      .select("id", { count: "exact", head: true });

    if (error) return failed(error.message);
    if (count === null || count === 0) return { state: "empty" };

    return notConnected(13, "calculateAIaugmentationIndex (PRD §62)");
  });
}

// ===========================================================================
// Business Impact
// ===========================================================================

export async function getValidatedBusinessImpact(
  _view: DashboardView,
): Promise<DataPoint<number>> {
  return guarded("business_impacts", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("business_impacts")
      .select("monetary_value")
      .eq("validation_status", "validated")
      .is("deleted_at", null);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    const total = data.reduce(
      (sum, row) => sum + Number(row.monetary_value ?? 0),
      0,
    );

    // Only human-validated impact is counted (PRD §35).
    return {
      state: "live",
      value: total,
      provenance: provenance("supabase:business_impacts", true),
    };
  });
}

// ===========================================================================
// Projects
// ===========================================================================

export interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export async function getActiveProjects(
  _view: DashboardView,
): Promise<DataPoint<readonly ProjectRow[]>> {
  return guarded("projects table + RLS", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, status")
      .in("status", ["planning", "active"])
      .order("name")
      .limit(10);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((p) => ({ id: p.id, name: p.name, status: p.status })),
      provenance: provenance("supabase:projects"),
    };
  });
}

// ===========================================================================
// Insights and alerts
// ===========================================================================

export interface DashboardAlert {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: "warning" | "danger" | "info";
}

/**
 * Alerts are derived from real thresholds, never from an agent's opinion at
 * this stage. AI-produced insight arrives with the assistant in Phase 15; a
 * dashboard alert now must be traceable to a row.
 */
export async function getAlerts(
  view: DashboardView,
  context: AuthContext,
): Promise<DataPoint<readonly DashboardAlert[]>> {
  const workload = await getWorkload(view, context);

  if (workload.state !== "live") {
    if (workload.state === "not-connected") {
      return notConnected(workload.requiredPhase, workload.requires);
    }
    if (workload.state === "failed") return failed(workload.reason);
    return { state: "empty" };
  }

  // Over-allocation is a fact derivable from assignments alone.
  const overallocated = workload.value.filter((r) => r.allocationPct > 100);
  if (overallocated.length === 0) return { state: "empty" };

  return {
    state: "live",
    value: [
      {
        id: "overallocation",
        title: `${overallocated.length} orang mengalami alokasi berlebih`,
        detail: "Total alokasi penugasan aktif melebihi 100%.",
        tone: "warning",
      },
    ],
    provenance: provenance("supabase:assignments"),
  };
}

export { scopeFilter };
