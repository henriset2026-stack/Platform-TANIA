import "server-only";

/**
 * Project and feasibility data access.
 *
 * Reads run under the caller's RLS context. Financial figures are returned
 * exactly as stored — never defaulted, never derived from a sibling figure.
 */

import {
  FEASIBILITY_STAGE_LABEL,
  type FeasibilityStage,
} from "@/lib/calculations/feasibility";
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

function provenance(source: string) {
  return { source, asOf: new Date().toISOString(), validated: false };
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

export interface ProjectListRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly customerName: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export async function listProjects(): Promise<DataPoint<readonly ProjectListRow[]>> {
  return guarded("projects table + RLS", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .select("id, code, name, status, customer_name, start_date, end_date")
      .order("name")
      .limit(200);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        customerName: p.customer_name,
        startDate: p.start_date,
        endDate: p.end_date,
      })),
      provenance: provenance("supabase:projects"),
    };
  });
}

export interface FeasibilityRow {
  readonly id: string;
  readonly title: string;
  readonly stage: FeasibilityStage;
  readonly stageLabel: string;
  readonly customerName: string | null;
  readonly totalScore: number | null;
  readonly scoreCoverage: number | null;
  readonly decidedAt: string | null;
}

/**
 * Feasibility pipeline.
 *
 * `totalScore` is whatever was stored at decision time, returned as-is and
 * deliberately not recomputed: a past decision must be reviewable against the
 * score it was actually made on, not against today's weights.
 */
export async function listFeasibilityAssessments(): Promise<
  DataPoint<readonly FeasibilityRow[]>
> {
  return guarded("feasibility_assessments", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("feasibility_assessments")
      .select("id, title, stage, customer_name, total_score, score_coverage, decided_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((a) => ({
        id: a.id,
        title: a.title,
        stage: a.stage as FeasibilityStage,
        stageLabel: FEASIBILITY_STAGE_LABEL[a.stage as FeasibilityStage] ?? a.stage,
        customerName: a.customer_name,
        totalScore: a.total_score,
        scoreCoverage: a.score_coverage,
        decidedAt: a.decided_at,
      })),
      provenance: provenance("supabase:feasibility_assessments"),
    };
  });
}
