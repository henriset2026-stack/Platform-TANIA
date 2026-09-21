import "server-only";

/**
 * Talent data access.
 *
 * Every query runs through the caller's RLS-scoped client. Rows the viewer is
 * not entitled to are removed by PostgreSQL before this code sees them, which
 * is what makes "do not expose unauthorized records" a property of the system
 * rather than a promise about this file.
 *
 * The passport applies a SECOND check per section via lib/auth/authorize.ts,
 * because sections differ in sensitivity: a manager may read a squad member's
 * profile (CONFIDENTIAL) but not their private HR records (RESTRICTED). RLS
 * enforces; the section check produces an honest "restricted" state instead of
 * a silently missing panel.
 */

import { canAccessTalent } from "@/lib/auth/authorize";
import type { AuthContext } from "@/lib/auth/session";
import { pageCount, pageRange, type Page, type TalentQuery } from "@/lib/talent/filters";
import { createClient } from "@/lib/supabase/server";
import { notConnected } from "@/types/data";
import type { DataPoint, Failed } from "@/types/data";
import type { Sensitivity } from "@/types/authorization";

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
  if (!supabaseConfigured()) {
    return notConnected(NOT_PROVISIONED_PHASE, requires);
  }
  try {
    return await run();
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Unknown error");
  }
}

/**
 * Runs a section query only if the viewer may read that sensitivity class for
 * this person. Returns `restricted` with the policy's own reason otherwise.
 */
async function gated<T>(
  talentId: string,
  sensitivity: Sensitivity,
  requires: string,
  run: () => Promise<DataPoint<T>>,
): Promise<DataPoint<T>> {
  const decision = await canAccessTalent(talentId, sensitivity);
  if (!decision.allowed) {
    return { state: "restricted", reason: decision.detail };
  }
  return guarded(requires, run);
}

// ===========================================================================
// Directory
// ===========================================================================

export interface TalentListRow {
  readonly id: string;
  readonly fullName: string;
  readonly employeeId: string | null;
  readonly jobTitle: string | null;
  readonly department: string | null;
  readonly status: string;
  readonly avatarUrl: string | null;
}

/**
 * Paginated directory.
 *
 * Filtering, sorting and paging all happen in PostgreSQL. Fetching everything
 * and filtering in the application would both scale badly and mean the server
 * had briefly materialised rows the viewer may not keep.
 */
export async function listTalent(
  query: TalentQuery,
): Promise<DataPoint<Page<TalentListRow>>> {
  return guarded("profiles table + RLS", async () => {
    const supabase = await createClient();
    const { from, to } = pageRange(query);

    let q = supabase
      .from("profiles")
      .select("id, full_name, employee_id, job_title, department, status, avatar_url", {
        count: "exact",
      });

    if (query.search) {
      // Parameterised by PostgREST; the term is sanitised in filters.ts so it
      // cannot introduce wildcards or split the expression.
      q = q.or(
        `full_name.ilike.%${query.search}%,employee_id.ilike.%${query.search}%,job_title.ilike.%${query.search}%`,
      );
    }
    if (query.status !== "all") q = q.eq("status", query.status);
    if (query.squadId !== "all") q = q.eq("squad_id", query.squadId);
    if (query.chapterId !== "all") q = q.eq("chapter_id", query.chapterId);

    q = query.sort === "recent"
      ? q.order("updated_at", { ascending: false })
      : q.order("full_name", { ascending: true });

    const { data, error, count } = await q.range(from, to);
    if (error) return failed(error.message);

    const total = count ?? 0;
    if (!data || data.length === 0) {
      return total === 0
        ? { state: "empty" }
        : {
            state: "live",
            value: {
              rows: [],
              total,
              page: query.page,
              pageSize: query.pageSize,
              pageCount: pageCount(total, query.pageSize),
            },
            provenance: provenance("supabase:profiles"),
          };
    }

    return {
      state: "live",
      value: {
        rows: data.map((p) => ({
          id: p.id,
          fullName: p.full_name,
          employeeId: p.employee_id,
          jobTitle: p.job_title,
          department: p.department,
          status: p.status,
          avatarUrl: p.avatar_url,
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
        pageCount: pageCount(total, query.pageSize),
      },
      provenance: provenance("supabase:profiles"),
    };
  });
}

/** Squads the viewer may filter by. RLS decides which are visible. */
export async function listFilterableSquads(): Promise<
  DataPoint<readonly { id: string; name: string }[]>
> {
  return guarded("squads table + RLS", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("squads")
      .select("id, name")
      .order("name");
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };
    return {
      state: "live",
      value: data.map((s) => ({ id: s.id, name: s.name })),
      provenance: provenance("supabase:squads"),
    };
  });
}

// ===========================================================================
// Digital Talent Passport
// ===========================================================================

export interface TalentIdentity {
  readonly id: string;
  readonly fullName: string;
  readonly employeeId: string | null;
  readonly email: string;
  readonly jobTitle: string | null;
  readonly grade: string | null;
  readonly department: string | null;
  readonly status: string;
  readonly avatarUrl: string | null;
  readonly chapterId: string | null;
  readonly squadId: string | null;
  readonly yearsExperience: number | null;
  readonly careerLevel: string | null;
  readonly summary: string | null;
}

/**
 * Identity section.
 *
 * Returns `restricted` rather than throwing when the viewer is not entitled,
 * so the caller can decide between a denial page and a 404. The route uses
 * notFound(), which conceals whether the person exists at all (CLAUDE.md §22).
 */
export async function getTalentIdentity(
  talentId: string,
): Promise<DataPoint<TalentIdentity>> {
  return gated(talentId, "CONFIDENTIAL", "profiles + talent_profiles", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, employee_id, email, job_title, grade, department, status, avatar_url, chapter_id, squad_id, talent_profiles(years_experience, career_level, summary)",
      )
      .eq("id", talentId)
      .maybeSingle();

    if (error) return failed(error.message);
    if (!data) return { state: "empty" };

    const extension = (
      data as { talent_profiles?: { years_experience?: number; career_level?: string; summary?: string } | null }
    ).talent_profiles;

    return {
      state: "live",
      value: {
        id: data.id,
        fullName: data.full_name,
        employeeId: data.employee_id,
        email: data.email,
        jobTitle: data.job_title,
        grade: data.grade,
        department: data.department,
        status: data.status,
        avatarUrl: data.avatar_url,
        chapterId: data.chapter_id,
        squadId: data.squad_id,
        yearsExperience: extension?.years_experience ?? null,
        careerLevel: extension?.career_level ?? null,
        summary: extension?.summary ?? null,
      },
      provenance: provenance("supabase:profiles"),
    };
  });
}

export interface CapabilityRow {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly currentLevel: number;
  readonly targetLevel: number | null;
  readonly assessmentStatus: string;
}

export async function getTalentCapabilities(
  talentId: string,
): Promise<DataPoint<readonly CapabilityRow[]>> {
  return gated(talentId, "CONFIDENTIAL", "talent_capabilities + capabilities", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("talent_capabilities")
      .select(
        "id, current_level, target_level, assessment_status, capabilities(name, capability_domains(name))",
      )
      .eq("profile_id", talentId);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((row) => {
        const cap = (row as { capabilities?: { name?: string; capability_domains?: { name?: string } } }).capabilities;
        return {
          id: row.id,
          name: cap?.name ?? "Unknown capability",
          domain: cap?.capability_domains?.name ?? "—",
          currentLevel: row.current_level,
          targetLevel: row.target_level,
          assessmentStatus: row.assessment_status,
        };
      }),
      provenance: provenance("supabase:talent_capabilities"),
    };
  });
}

export interface EvidenceRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly sourceType: string;
  readonly sourceReference: string | null;
  readonly occurredAt: string | null;
  readonly validationStatus: string;
  readonly evidenceUrl: string | null;
}

/**
 * Capability evidence, optionally narrowed to certifications.
 *
 * There is no certifications table by design: PRD §7.1 holds that
 * certification is not capability. A certificate is evidence with
 * source_type = 'certification', carrying the same validation status as any
 * other evidence.
 */
export async function getCapabilityEvidence(
  talentId: string,
  options: { certificationsOnly?: boolean } = {},
): Promise<DataPoint<readonly EvidenceRow[]>> {
  return gated(talentId, "CONFIDENTIAL", "capability_evidence", async () => {
    const supabase = await createClient();
    let q = supabase
      .from("capability_evidence")
      .select(
        "id, title, description, source_type, source_reference, occurred_at, validation_status, evidence_url, talent_capabilities!inner(profile_id)",
      )
      .eq("talent_capabilities.profile_id", talentId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (options.certificationsOnly) q = q.eq("source_type", "certification");

    const { data, error } = await q;
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        sourceType: e.source_type,
        sourceReference: e.source_reference,
        occurredAt: e.occurred_at,
        validationStatus: e.validation_status,
        evidenceUrl: e.evidence_url,
      })),
      provenance: provenance("supabase:capability_evidence"),
    };
  });
}

export interface PerformanceEvidenceRow {
  readonly id: string;
  readonly dimension: string;
  readonly metric: string | null;
  readonly value: number | null;
  readonly unit: string | null;
  readonly sourceType: string;
  readonly occurredAt: string | null;
  readonly validationStatus: string;
  readonly origin: string;
}

/** SENSITIVE — strict scope (TANIA_RBAC_RLS_MATRIX.md §6). */
export async function getPerformanceEvidence(
  talentId: string,
): Promise<DataPoint<readonly PerformanceEvidenceRow[]>> {
  return gated(talentId, "SENSITIVE", "performance_evidence", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("performance_evidence")
      .select("id, dimension, metric, value, unit, source_type, occurred_at, validation_status, origin")
      .eq("profile_id", talentId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((e) => ({
        id: e.id,
        dimension: e.dimension,
        metric: e.metric,
        value: e.value,
        unit: e.unit,
        sourceType: e.source_type,
        occurredAt: e.occurred_at,
        validationStatus: e.validation_status,
        origin: e.origin,
      })),
      provenance: provenance("supabase:performance_evidence"),
    };
  });
}

export interface AssignmentRow {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly roleName: string | null;
  readonly allocationPct: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: string;
}

/** Project and assignment history. */
export async function getAssignmentHistory(
  talentId: string,
): Promise<DataPoint<readonly AssignmentRow[]>> {
  return gated(talentId, "CONFIDENTIAL", "assignments + projects", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("assignments")
      .select("id, project_id, role_name, allocation_pct, start_date, end_date, status, projects(name)")
      .eq("profile_id", talentId)
      .order("start_date", { ascending: false })
      .limit(50);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((a) => ({
        id: a.id,
        projectId: a.project_id,
        projectName:
          (a as { projects?: { name?: string } }).projects?.name ?? "Unknown project",
        roleName: a.role_name,
        allocationPct: Number(a.allocation_pct),
        startDate: a.start_date,
        endDate: a.end_date,
        status: a.status,
      })),
      provenance: provenance("supabase:assignments"),
    };
  });
}

export interface DevelopmentPlanRow {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly completionPct: number;
  readonly targetDate: string | null;
}

/** SENSITIVE — development data is strict scope. */
export async function getDevelopmentPlans(
  talentId: string,
): Promise<DataPoint<readonly DevelopmentPlanRow[]>> {
  return gated(talentId, "SENSITIVE", "development_plans", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("development_plans")
      .select("id, title, status, completion_pct, target_date")
      .eq("profile_id", talentId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        completionPct: Number(d.completion_pct),
        targetDate: d.target_date,
      })),
      provenance: provenance("supabase:development_plans"),
    };
  });
}

export interface AiAugmentationRow {
  readonly overallScore: number | null;
  readonly evidenceCount: number;
}

export async function getAiAugmentation(
  talentId: string,
): Promise<DataPoint<AiAugmentationRow>> {
  return gated(talentId, "SENSITIVE", "ai_augmentation", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ai_augmentation")
      .select("overall_score, evidence_count")
      .eq("profile_id", talentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return failed(error.message);
    if (!data) return { state: "empty" };

    return {
      state: "live",
      value: {
        overallScore: data.overall_score,
        evidenceCount: data.evidence_count,
      },
      provenance: provenance("supabase:ai_augmentation"),
    };
  });
}

export interface BusinessImpactRow {
  readonly id: string;
  readonly impactType: string;
  readonly metricName: string;
  readonly actual: number | null;
  readonly unit: string | null;
  readonly monetaryValue: number | null;
  readonly validationStatus: string;
}

export async function getBusinessImpact(
  talentId: string,
): Promise<DataPoint<readonly BusinessImpactRow[]>> {
  return gated(talentId, "CONFIDENTIAL", "business_impacts", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("business_impacts")
      .select("id, impact_type, metric_name, actual, unit, monetary_value, validation_status")
      .eq("profile_id", talentId)
      .is("deleted_at", null)
      .limit(20);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((b) => ({
        id: b.id,
        impactType: b.impact_type,
        metricName: b.metric_name,
        actual: b.actual,
        unit: b.unit,
        monetaryValue: b.monetary_value,
        validationStatus: b.validation_status,
      })),
      provenance: provenance("supabase:business_impacts"),
    };
  });
}

/** True when the viewer may open this person's passport at all. */
export async function canOpenPassport(
  talentId: string,
  _context: AuthContext,
): Promise<boolean> {
  const decision = await canAccessTalent(talentId, "CONFIDENTIAL");
  return decision.allowed;
}
