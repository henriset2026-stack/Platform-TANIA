import "server-only";

/**
 * Audit viewer reads.
 *
 * Gated twice, on purpose. `requireAuditAccess` is the early gate: it turns
 * "you may not see this" into a clear refusal instead of an empty page, which
 * a reader would otherwise interpret as "nothing happened". RLS is the
 * enforcement: the policies on audit_logs, agent_runs, agent_tool_calls and
 * rag_retrievals independently restrict every row, so a mistake here narrows
 * a message and never widens a result.
 *
 * `admin.audit` sees everything. `ai.view_audit` sees its own activity —
 * enough to review what the assistant did on your behalf, not enough to read
 * the chapter's. That asymmetry is in the RLS policies; it is repeated here
 * so the UI can say which view the reader is getting rather than leaving them
 * to guess why the list is short.
 */

import { requireAuthContext, hasPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { notConnected } from "@/types/data";
import type { DataPoint, Failed } from "@/types/data";
import type { RunRecord, ToolCallRecord } from "@/lib/observability/metrics";

const NOT_PROVISIONED_PHASE = 2;
const PAGE_SIZE = 100;

export type AuditAudience =
  | { readonly kind: "full"; readonly detail: string }
  | { readonly kind: "own"; readonly detail: string };

export type AuditAccess =
  | { readonly allowed: true; readonly audience: AuditAudience; readonly userId: string }
  | { readonly allowed: false; readonly reason: string };

/**
 * Deny by default. Neither permission means no view at all — not a filtered
 * one, since a filtered audit log still discloses that activity occurred.
 */
export async function requireAuditAccess(): Promise<AuditAccess> {
  const context = await requireAuthContext().catch(() => null);
  if (!context) {
    return { allowed: false, reason: "Anda belum masuk." };
  }

  if (hasPermission(context, "admin.audit")) {
    return {
      allowed: true,
      userId: context.userId,
      audience: {
        kind: "full",
        detail: "Menampilkan seluruh aktivitas yang tercatat (admin.audit).",
      },
    };
  }

  if (hasPermission(context, "ai.view_audit")) {
    return {
      allowed: true,
      userId: context.userId,
      audience: {
        kind: "own",
        detail:
          "Menampilkan aktivitas AI Anda sendiri (ai.view_audit). Audit seluruh chapter memerlukan admin.audit.",
      },
    };
  }

  return {
    allowed: false,
    reason:
      "Melihat jejak audit memerlukan admin.audit, atau ai.view_audit untuk aktivitas Anda sendiri.",
  };
}

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function failed(reason: string): Failed {
  return { state: "failed", reason };
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

function provenance(source: string) {
  return { source, asOf: new Date().toISOString(), validated: true };
}

export interface AuditLogRow {
  readonly id: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly userId: string | null;
  readonly requestId: string | null;
  readonly createdAt: string;
}

export async function listAuditEvents(options: { limit?: number } = {}): Promise<
  DataPoint<readonly AuditLogRow[]>
> {
  const access = await requireAuditAccess();
  if (!access.allowed) return { state: "restricted", reason: access.reason };

  return guarded("audit_logs", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, resource_type, resource_id, user_id, request_id, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(options.limit ?? PAGE_SIZE, PAGE_SIZE));

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((row) => ({
        id: String(row.id),
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        userId: row.user_id,
        requestId: row.request_id,
        createdAt: row.created_at,
      })),
      provenance: provenance("supabase:audit_logs"),
    };
  });
}

export async function listAgentRuns(options: { limit?: number } = {}): Promise<
  DataPoint<readonly (RunRecord & { id: string; correlationId: string | null; startedAt: string })[]>
> {
  const access = await requireAuditAccess();
  if (!access.allowed) return { state: "restricted", reason: access.reason };

  return guarded("agent_runs", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("agent_runs")
      .select(
        "id, agent_name, status, latency_ms, human_approval_required, human_approved, correlation_id, started_at",
      )
      .order("started_at", { ascending: false })
      .limit(Math.min(options.limit ?? PAGE_SIZE, PAGE_SIZE));

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((row) => ({
        id: row.id,
        agentName: row.agent_name,
        status: row.status as RunRecord["status"],
        latencyMs: row.latency_ms,
        humanApprovalRequired: row.human_approval_required,
        humanApproved: row.human_approved,
        correlationId: row.correlation_id,
        startedAt: row.started_at,
      })),
      provenance: provenance("supabase:agent_runs"),
    };
  });
}

export async function listToolCalls(options: { limit?: number } = {}): Promise<
  DataPoint<readonly (ToolCallRecord & { id: string; correlationId: string | null; denialReason: string | null })[]>
> {
  const access = await requireAuditAccess();
  if (!access.allowed) return { state: "restricted", reason: access.reason };

  return guarded("agent_tool_calls", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("agent_tool_calls")
      .select(
        "id, tool_name, status, authorization_decision, risk_level, duration_ms, audited, denial_reason, correlation_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(options.limit ?? PAGE_SIZE, PAGE_SIZE));

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((row) => ({
        id: row.id,
        toolName: row.tool_name,
        status: row.status as ToolCallRecord["status"],
        authorizationDecision: row.authorization_decision,
        riskLevel: row.risk_level as ToolCallRecord["riskLevel"],
        durationMs: row.duration_ms,
        audited: row.audited,
        denialReason: row.denial_reason,
        correlationId: row.correlation_id,
        createdAt: row.created_at,
      })),
      provenance: provenance("supabase:agent_tool_calls"),
    };
  });
}

export interface RagRetrievalRow {
  readonly id: string;
  readonly correlationId: string | null;
  readonly queryHash: string;
  readonly queryLength: number;
  readonly returnedChunkCount: number;
  readonly injectionSignalCount: number;
  readonly latencyMs: number | null;
  readonly createdAt: string;
}

export async function listRagRetrievals(options: { limit?: number } = {}): Promise<
  DataPoint<readonly RagRetrievalRow[]>
> {
  const access = await requireAuditAccess();
  if (!access.allowed) return { state: "restricted", reason: access.reason };

  return guarded("rag_retrievals", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rag_retrievals")
      .select(
        "id, correlation_id, query_hash, query_length, returned_chunk_count, injection_signal_count, latency_ms, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(options.limit ?? PAGE_SIZE, PAGE_SIZE));

    if (error) return failed(error.message);
    if (!data || data.length === 0) return { state: "empty" };

    return {
      state: "live",
      value: data.map((row) => ({
        id: row.id,
        correlationId: row.correlation_id,
        queryHash: row.query_hash,
        queryLength: row.query_length,
        returnedChunkCount: row.returned_chunk_count,
        injectionSignalCount: row.injection_signal_count,
        latencyMs: row.latency_ms,
        createdAt: row.created_at,
      })),
      provenance: provenance("supabase:rag_retrievals"),
    };
  });
}
