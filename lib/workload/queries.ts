import "server-only";

/**
 * Workload and assignment data access.
 *
 * Reads run under the caller's RLS context. Arithmetic belongs to
 * lib/calculations/workload.ts and lib/calculations/matching.ts.
 */

import {
  calculateUtilization,
  summarizeCapacity,
  type AllocationInput,
  type CapacitySummary,
  type UtilizationResult,
} from "@/lib/calculations/workload";
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

export interface WorkloadRow extends UtilizationResult {
  readonly fullName: string;
}

export interface WorkloadView {
  readonly rows: readonly WorkloadRow[];
  readonly summary: CapacitySummary;
}

/**
 * Chapter workload.
 *
 * Only people RLS lets the viewer see appear here, so a manager's capacity
 * summary is computed over their own squad rather than the chapter — the
 * numbers are scoped by the same mechanism that scopes the rows.
 */
export async function getWorkload(): Promise<DataPoint<WorkloadView>> {
  return guarded("assignments + profiles", async () => {
    const supabase = await createClient();

    const [profiles, assignments] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("status", "active"),
      supabase
        .from("assignments")
        .select("id, project_id, profile_id, allocation_pct, start_date, end_date, status"),
    ]);

    if (profiles.error) return failed(profiles.error.message);
    if (assignments.error) return failed(assignments.error.message);
    if (!profiles.data || profiles.data.length === 0) return { state: "empty" };

    const { data: projects } = await supabase.from("projects").select("id, name");
    const projectName = new Map((projects ?? []).map((p) => [p.id, p.name] as const));

    const byProfile = new Map<string, AllocationInput[]>();
    for (const a of assignments.data ?? []) {
      const list = byProfile.get(a.profile_id) ?? [];
      list.push({
        assignmentId: a.id,
        projectId: a.project_id,
        projectName: projectName.get(a.project_id) ?? "Unknown project",
        allocationPct: Number(a.allocation_pct),
        startDate: a.start_date,
        endDate: a.end_date,
        status: a.status as AllocationInput["status"],
      });
      byProfile.set(a.profile_id, list);
    }

    const rows: WorkloadRow[] = profiles.data
      .map((p) => ({
        fullName: p.full_name,
        ...calculateUtilization(p.id, byProfile.get(p.id) ?? []),
      }))
      .sort((a, b) => b.utilizationPct - a.utilizationPct || a.fullName.localeCompare(b.fullName));

    return {
      state: "live",
      value: { rows, summary: summarizeCapacity(rows) },
      provenance: provenance("supabase:assignments"),
    };
  });
}

export interface AssignmentRow {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly profileId: string;
  readonly profileName: string;
  readonly roleName: string | null;
  readonly allocationPct: number;
  readonly status: string;
  readonly approved: boolean;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export async function listAssignments(options: { projectId?: string } = {}): Promise<
  DataPoint<readonly AssignmentRow[]>
> {
  return guarded("assignments + projects + profiles", async () => {
    const supabase = await createClient();

    let q = supabase
      .from("assignments")
      .select("id, project_id, profile_id, role_name, allocation_pct, status, approved_by, start_date, end_date")
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(100);

    if (options.projectId) q = q.eq("project_id", options.projectId);

    const { data, error } = await q;
    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    const [{ data: projects }, { data: profiles }] = await Promise.all([
      supabase.from("projects").select("id, name"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    const projectName = new Map((projects ?? []).map((p) => [p.id, p.name] as const));
    const profileName = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const));

    return {
      state: "live",
      value: data.map((a) => ({
        id: a.id,
        projectId: a.project_id,
        projectName: projectName.get(a.project_id) ?? "Unknown project",
        profileId: a.profile_id,
        profileName: profileName.get(a.profile_id) ?? "Unknown",
        roleName: a.role_name,
        allocationPct: Number(a.allocation_pct),
        status: a.status,
        approved: a.approved_by !== null,
        startDate: a.start_date,
        endDate: a.end_date,
      })),
      provenance: provenance("supabase:assignments"),
    };
  });
}

export interface ProjectDetail {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: string;
  readonly customerName: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export async function getProject(projectId: string): Promise<DataPoint<ProjectDetail>> {
  return guarded("projects", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .select("id, code, name, description, status, customer_name, start_date, end_date")
      .eq("id", projectId)
      .maybeSingle();

    if (error) return failed(error.message);
    if (!data) return { state: "empty" };

    return {
      state: "live",
      value: {
        id: data.id,
        code: data.code,
        name: data.name,
        description: data.description,
        status: data.status,
        customerName: data.customer_name,
        startDate: data.start_date,
        endDate: data.end_date,
      },
      provenance: provenance("supabase:projects"),
    };
  });
}
