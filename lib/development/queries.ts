import "server-only";

/**
 * Development data access.
 *
 * Development records are SENSITIVE (TANIA_RBAC_RLS_MATRIX.md §6), so
 * person-scoped reads gate on that class. Arithmetic belongs to
 * lib/calculations/development.ts; nothing here computes progress or decides
 * an upgrade.
 */

import { canAccessTalent } from "@/lib/auth/authorize";
import {
  calculateDevelopmentProgress,
  evaluateCapabilityUpgrade,
  validateTemplate,
  type ActivityType,
  type DevelopmentTemplate,
  type PlanActivity,
  type ProgressResult,
  type SprintPhase,
  type UpgradeEvaluation,
} from "@/lib/calculations/development";
import { createClient } from "@/lib/supabase/server";
import { notConnected } from "@/types/data";
import type { DataPoint, Failed } from "@/types/data";

const NOT_PROVISIONED_PHASE = 2;

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function failed(reason: string): Failed {
  return { state: "failed", reason };
}

function provenance(source: string, validated = false) {
  return { source, asOf: new Date().toISOString(), validated };
}

async function guarded<T>(
  requires: string,
  run: () => Promise<DataPoint<T>>,
): Promise<DataPoint<T>> {
  if (!supabaseConfigured()) return notConnected(NOT_PROVISIONED_PHASE, requires);
  try {
    return await run();
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Unknown error");
  }
}

async function gatedSensitive<T>(
  talentId: string,
  requires: string,
  run: () => Promise<DataPoint<T>>,
): Promise<DataPoint<T>> {
  const decision = await canAccessTalent(talentId, "SENSITIVE");
  if (!decision.allowed) {
    return { state: "restricted", reason: decision.detail };
  }
  return guarded(requires, run);
}

// ===========================================================================
// Templates
// ===========================================================================

export async function listDevelopmentTemplates(): Promise<
  DataPoint<readonly DevelopmentTemplate[]>
> {
  return guarded("development_templates", async () => {
    const supabase = await createClient();

    // Separate queries: hand-written types declare no Relationships.
    const [templates, activities] = await Promise.all([
      supabase
        .from("development_templates")
        .select("id, code, name, methodology, total_hours, approved_by")
        .eq("active", true)
        .order("name"),
      supabase
        .from("development_template_activities")
        .select("template_id, sequence_no, phase, title, activity_type, estimated_hours, requires_evidence")
        .order("sequence_no"),
    ]);

    if (templates.error) return failed(templates.error.message);
    if (activities.error) return failed(activities.error.message);
    if (!templates.data || templates.data.length === 0) return { state: "empty" };

    const byTemplate = new Map<string, DevelopmentTemplate["activities"][number][]>();
    for (const row of activities.data ?? []) {
      const list = byTemplate.get(row.template_id) ?? [];
      list.push({
        sequenceNo: row.sequence_no,
        phase: row.phase as SprintPhase,
        title: row.title,
        activityType: row.activity_type as ActivityType,
        estimatedHours: Number(row.estimated_hours),
        requiresEvidence: row.requires_evidence,
      });
      byTemplate.set(row.template_id, list);
    }

    return {
      state: "live",
      value: templates.data.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        methodology: t.methodology,
        totalHours: Number(t.total_hours),
        approved: t.approved_by !== null,
        activities: byTemplate.get(t.id) ?? [],
      })),
      provenance: provenance("supabase:development_templates"),
    };
  });
}

export { validateTemplate };

// ===========================================================================
// Plans
// ===========================================================================

export interface PlanSummary {
  readonly id: string;
  readonly profileId: string;
  readonly title: string;
  readonly status: string;
  readonly approved: boolean;
  readonly targetDate: string | null;
  readonly capabilityId: string | null;
  readonly capabilityName: string | null;
  readonly progress: ProgressResult;
  readonly activities: readonly PlanActivity[];
  readonly validatedEvidenceIds: readonly string[];
  /** Whether a capability upgrade may be proposed. Never applied. */
  readonly upgrade: UpgradeEvaluation | null;
}

/**
 * Development plans for one person, with progress and upgrade eligibility.
 *
 * The upgrade evaluation is computed and returned, never acted upon. Even a
 * fully eligible plan yields only `eligibleToPropose`, because a capability
 * increase is a human decision backed by evidence (PRD §7.1, §8.1).
 */
export async function getDevelopmentPlans(
  talentId: string,
): Promise<DataPoint<readonly PlanSummary[]>> {
  return gatedSensitive(talentId, "development_plans + learning_activities", async () => {
    const supabase = await createClient();

    const { data: plans, error } = await supabase
      .from("development_plans")
      .select("id, profile_id, title, status, approved_by, target_date, capability_id, completion_pct")
      .eq("profile_id", talentId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) return failed(error.message);
    if (!plans || plans.length === 0) return { state: "empty" };

    const planIds = plans.map((p) => p.id);

    const { data: paths, error: pathError } = await supabase
      .from("learning_paths")
      .select("id, development_plan_id")
      .in("development_plan_id", planIds);
    if (pathError) return failed(pathError.message);

    const pathIds = (paths ?? []).map((p) => p.id);
    const planByPath = new Map((paths ?? []).map((p) => [p.id, p.development_plan_id]));

    const { data: activities, error: activityError } =
      pathIds.length === 0
        ? { data: [], error: null }
        : await supabase
            .from("learning_activities")
            .select("id, learning_path_id, activity_type, estimated_hours, status")
            .in("learning_path_id", pathIds);
    if (activityError) return failed(activityError.message);

    const activityIds = (activities ?? []).map((a) => a.id);
    const { data: evidence, error: evidenceError } =
      activityIds.length === 0
        ? { data: [], error: null }
        : await supabase
            .from("learning_evidence")
            .select("id, activity_id")
            .in("activity_id", activityIds)
            .not("evaluated_at", "is", null)
            .is("deleted_at", null);
    if (evidenceError) return failed(evidenceError.message);

    const evidenceByActivity = new Map<string, string[]>();
    for (const e of evidence ?? []) {
      const list = evidenceByActivity.get(e.activity_id) ?? [];
      list.push(e.id);
      evidenceByActivity.set(e.activity_id, list);
    }

    const activitiesByPlan = new Map<string, PlanActivity[]>();
    const evidenceByPlan = new Map<string, string[]>();
    for (const a of activities ?? []) {
      const planId = planByPath.get(a.learning_path_id);
      if (!planId) continue;
      const evidenceIds = evidenceByActivity.get(a.id) ?? [];

      const list = activitiesByPlan.get(planId) ?? [];
      list.push({
        id: a.id,
        activityType: a.activity_type as ActivityType,
        estimatedHours: Number(a.estimated_hours ?? 0),
        status: a.status as PlanActivity["status"],
        hasValidatedEvidence: evidenceIds.length > 0,
      });
      activitiesByPlan.set(planId, list);

      const planEvidence = evidenceByPlan.get(planId) ?? [];
      planEvidence.push(...evidenceIds);
      evidenceByPlan.set(planId, planEvidence);
    }

    return {
      state: "live",
      value: plans.map((plan) => {
        const planActivities = activitiesByPlan.get(plan.id) ?? [];
        const validatedEvidenceIds = evidenceByPlan.get(plan.id) ?? [];
        const progress = calculateDevelopmentProgress(planActivities);

        return {
          id: plan.id,
          profileId: plan.profile_id,
          title: plan.title,
          status: plan.status,
          approved: plan.approved_by !== null,
          targetDate: plan.target_date,
          capabilityId: plan.capability_id,
          capabilityName: null,
          progress,
          activities: planActivities,
          validatedEvidenceIds,
          upgrade:
            plan.capability_id === null
              ? null
              : evaluateCapabilityUpgrade({
                  planApproved: plan.approved_by !== null,
                  activities: planActivities,
                  currentLevel: 1,
                  targetLevel: 2,
                  validatedEvidenceIds,
                }),
        };
      }),
      provenance: provenance("supabase:development_plans"),
    };
  });
}

// ===========================================================================
// Upgrade proposals
// ===========================================================================

export interface UpgradeProposalRow {
  readonly id: string;
  readonly profileId: string;
  readonly capabilityId: string;
  readonly fromLevel: number;
  readonly toLevel: number;
  readonly status: string;
  readonly rationale: string | null;
  readonly proposedByAgent: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
}

/**
 * Pending capability upgrade proposals.
 *
 * These are the queue of decisions waiting on a human. A proposal sitting
 * here is the system working correctly, not a backlog to automate away.
 */
export async function listUpgradeProposals(options: { status?: string } = {}): Promise<
  DataPoint<readonly UpgradeProposalRow[]>
> {
  return guarded("capability_upgrade_proposals", async () => {
    const supabase = await createClient();
    let q = supabase
      .from("capability_upgrade_proposals")
      .select("id, profile_id, capability_id, from_level, to_level, status, rationale, proposed_by_agent, decided_by, decided_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (options.status) q = q.eq("status", options.status);

    const { data, error } = await q;
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((p) => ({
        id: p.id,
        profileId: p.profile_id,
        capabilityId: p.capability_id,
        fromLevel: p.from_level,
        toLevel: p.to_level,
        status: p.status,
        rationale: p.rationale,
        proposedByAgent: p.proposed_by_agent,
        decidedBy: p.decided_by,
        decidedAt: p.decided_at,
      })),
      provenance: provenance("supabase:capability_upgrade_proposals"),
    };
  });
}
