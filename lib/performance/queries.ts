import "server-only";

/**
 * Performance data access.
 *
 * Reads run under the caller's RLS context. Performance data is SENSITIVE
 * (TANIA_RBAC_RLS_MATRIX.md §6), so person-scoped reads go through
 * canAccessTalent with that class rather than the CONFIDENTIAL default used
 * for identity.
 *
 * Arithmetic belongs to lib/calculations/performance.ts. Nothing here
 * computes an index.
 */

import { canAccessTalent } from "@/lib/auth/authorize";
import {
  calculateTrend,
  type TrendPoint,
  type TrendResult,
  type WeightProfile,
} from "@/lib/calculations/performance";
import { createClient } from "@/lib/supabase/server";
import { notConnected } from "@/types/data";
import type { DataPoint, Failed } from "@/types/data";
import type { ClaimKind } from "@/types/claim";

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

/** Person-scoped reads use SENSITIVE, not CONFIDENTIAL. */
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
// Periods and weight profiles
// ===========================================================================

export interface PeriodRow {
  readonly id: string;
  readonly name: string;
  readonly periodType: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: string;
}

export async function listPerformancePeriods(): Promise<
  DataPoint<readonly PeriodRow[]>
> {
  return guarded("performance_periods", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("performance_periods")
      .select("id, name, period_type, start_date, end_date, status")
      .order("end_date", { ascending: false })
      .limit(24);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((p) => ({
        id: p.id,
        name: p.name,
        periodType: p.period_type,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
      })),
      provenance: provenance("supabase:performance_periods"),
    };
  });
}

/**
 * Weight profiles available to the viewer.
 *
 * Returns `empty` when none is configured. The UI must then say that no
 * weighting model exists rather than falling back to the PRD example, which
 * would make an illustration into policy.
 */
export async function listWeightProfiles(): Promise<
  DataPoint<readonly WeightProfile[]>
> {
  return guarded("performance_weight_profiles", async () => {
    const supabase = await createClient();

    // Two queries rather than a nested select: types/database.ts is
    // hand-written and declares no Relationships, so PostgREST embedding
    // cannot be type-inferred. Replace with a nested select once types are
    // generated from a real database.
    const [profiles, dimensions] = await Promise.all([
      supabase
        .from("performance_weight_profiles")
        .select("id, code, name, approved_by")
        .eq("active", true)
        .order("name"),
      supabase
        .from("performance_weight_profile_dimensions")
        .select("profile_id, dimension_id, weight"),
    ]);

    if (profiles.error) return failed(profiles.error.message);
    if (dimensions.error) return failed(dimensions.error.message);
    if (!profiles.data || profiles.data.length === 0) return { state: "empty" };

    const { data: dimensionRows, error: dimensionError } = await supabase
      .from("performance_dimensions")
      .select("id, code");
    if (dimensionError) return failed(dimensionError.message);

    const codeById = new Map(
      (dimensionRows ?? []).map((d) => [d.id, d.code] as const),
    );

    const byProfile = new Map<string, { dimensionCode: string; weight: number }[]>();
    for (const row of dimensions.data ?? []) {
      const list = byProfile.get(row.profile_id) ?? [];
      list.push({
        dimensionCode: codeById.get(row.dimension_id) ?? "unknown",
        weight: Number(row.weight),
      });
      byProfile.set(row.profile_id, list);
    }

    return {
      state: "live",
      value: profiles.data.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        approved: row.approved_by !== null,
        weights: byProfile.get(row.id) ?? [],
      })),
      provenance: provenance("supabase:performance_weight_profiles"),
    };
  });
}

// ===========================================================================
// Evidence timeline
// ===========================================================================

export interface EvidenceTimelineRow {
  readonly id: string;
  readonly dimension: string;
  readonly metric: string | null;
  readonly value: number | null;
  readonly unit: string | null;
  readonly sourceType: string;
  readonly sourceReference: string | null;
  readonly occurredAt: string | null;
  readonly validationStatus: string;
  readonly validatedBy: string | null;
  readonly confidence: number | null;
  readonly periodName: string | null;
  /** FACT when human-asserted and validated; INFERENCE when AI-generated. */
  readonly claimKind: ClaimKind;
}

/**
 * Evidence timeline for one person.
 *
 * `claimKind` is derived from the row's own `origin` column rather than
 * assumed: AI-generated evidence is surfaced as INFERENCE so it can never be
 * read as a measured fact (CLAUDE.md §16). Unvalidated human evidence is also
 * INFERENCE until someone validates it — an unverified assertion is not a fact.
 */
export async function getEvidenceTimeline(
  talentId: string,
  options: { periodId?: string } = {},
): Promise<DataPoint<readonly EvidenceTimelineRow[]>> {
  return gatedSensitive(talentId, "performance_evidence", async () => {
    const supabase = await createClient();
    let q = supabase
      .from("performance_evidence")
      .select(
        "id, dimension, metric, value, unit, source_type, source_reference, occurred_at, validation_status, validated_by, confidence, origin, performance_periods(name)",
      )
      .eq("profile_id", talentId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(100);

    if (options.periodId) q = q.eq("period_id", options.periodId);

    const { data, error } = await q;
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
        sourceReference: e.source_reference,
        occurredAt: e.occurred_at,
        validationStatus: e.validation_status,
        validatedBy: e.validated_by,
        confidence: e.confidence,
        periodName:
          (e as { performance_periods?: { name?: string } }).performance_periods?.name ??
          null,
        claimKind: classifyEvidence(e.origin, e.validation_status),
      })),
      provenance: provenance("supabase:performance_evidence"),
    };
  });
}

/**
 * Classifies an evidence row.
 *
 * Only validated, human- or system-measured evidence counts as FACT. Anything
 * AI-generated is INFERENCE regardless of validation status, because
 * validating a model's output confirms a human agreed with it — it does not
 * make the model the measuring instrument.
 */
export function classifyEvidence(
  origin: string,
  validationStatus: string,
): ClaimKind {
  if (origin === "ai_generated") return "INFERENCE";
  if (validationStatus === "validated") return "FACT";
  return "INFERENCE";
}

// ===========================================================================
// Trend
// ===========================================================================

export async function getPerformanceTrend(
  talentId: string,
): Promise<DataPoint<TrendResult>> {
  return gatedSensitive(talentId, "performance_metrics", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("performance_metrics")
      .select("period_id, score, performance_periods(name, end_date)")
      .eq("profile_id", talentId);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    // Mean of recorded metric scores per period. This is a raw trend of
    // measured scores, NOT the weighted performance index — computing that
    // requires a weight profile the caller must choose explicitly.
    const byPeriod = new Map<string, { name: string; end: string; sum: number; n: number }>();
    for (const row of data) {
      const period = (row as { performance_periods?: { name?: string; end_date?: string } })
        .performance_periods;
      if (!period?.end_date || row.score === null) continue;
      const existing = byPeriod.get(row.period_id);
      byPeriod.set(row.period_id, {
        name: period.name ?? "Period",
        end: period.end_date,
        sum: (existing?.sum ?? 0) + Number(row.score),
        n: (existing?.n ?? 0) + 1,
      });
    }

    if (byPeriod.size === 0) return { state: "empty" };

    const points: TrendPoint[] = [...byPeriod.entries()].map(([periodId, v]) => ({
      periodId,
      periodName: v.name,
      periodEnd: v.end,
      index: Math.round((v.sum / v.n) * 10) / 10,
    }));

    return {
      state: "live",
      value: calculateTrend(points),
      provenance: provenance("supabase:performance_metrics"),
    };
  });
}

// ===========================================================================
// Reviews
// ===========================================================================

export interface ReviewRow {
  readonly id: string;
  readonly profileId: string;
  readonly subjectName: string;
  readonly reviewerId: string;
  readonly reviewerName: string;
  readonly periodName: string;
  readonly status: string;
  readonly overallScore: number | null;
  readonly submittedAt: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
}

export async function listReviews(options: { status?: string } = {}): Promise<
  DataPoint<readonly ReviewRow[]>
> {
  return guarded("performance_reviews", async () => {
    const supabase = await createClient();
    let q = supabase
      .from("performance_reviews")
      .select(
        "id, profile_id, reviewer_id, status, overall_score, submitted_at, approved_by, approved_at, performance_periods(name), profiles!performance_reviews_profile_id_fkey(full_name)",
      )
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (options.status) q = q.eq("status", options.status);

    const { data, error } = await q;
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((r) => ({
        id: r.id,
        profileId: r.profile_id,
        subjectName:
          (r as { profiles?: { full_name?: string } }).profiles?.full_name ?? "Unknown",
        reviewerId: r.reviewer_id,
        reviewerName: "—",
        periodName:
          (r as { performance_periods?: { name?: string } }).performance_periods?.name ??
          "—",
        status: r.status,
        overallScore: r.overall_score,
        submittedAt: r.submitted_at,
        approvedBy: r.approved_by,
        approvedAt: r.approved_at,
      })),
      provenance: provenance("supabase:performance_reviews"),
    };
  });
}
