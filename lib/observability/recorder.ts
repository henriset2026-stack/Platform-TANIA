import "server-only";

/**
 * Agent run and tool-call persistence.
 *
 * Six phases have shipped with the note "agent runs are still not persisted".
 * This closes it: a run is opened before an agent acts, every tool call is
 * written as it resolves, and the run is closed with its latency and outcome.
 *
 * Everything goes through the caller's RLS-scoped client. The admin client is
 * never used, which is not merely convention here — an audit row written with
 * a credential that bypasses RLS records "the service" as the actor for an
 * action a person took, and an audit trail that misattributes is worse than
 * one that is missing.
 *
 * Every payload passes through redact() at this boundary rather than at the
 * call sites. There are dozens of call sites; there is one sink.
 */

import { createClient } from "@/lib/supabase/server";
import { redact, stableHash } from "@/lib/observability/redact";
import type { AgentAuditEvent, AuditOutcome, AuditSink } from "@/agents/core/audit";
import type { ToolCallRecord } from "@/agents/core/pipeline";
import type { RiskLevel } from "@/agents/core/types";

function configured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export interface OpenRunInput {
  readonly userId: string;
  readonly agentName: string;
  readonly taskType: string;
  readonly correlationId: string;
  readonly sessionId: string;
  readonly input: unknown;
  readonly humanApprovalRequired: boolean;
}

export type RecordOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * Opens a run.
 *
 * Returns a failure rather than throwing, and the caller decides what that
 * means. For a read-only analysis, proceeding unrecorded is acceptable and
 * visible; for anything consequential, the agent should not start — which is
 * the same rule agents/core/audit.ts applies to a tool.
 */
export async function openAgentRun(
  input: OpenRunInput,
): Promise<RecordOutcome<string>> {
  if (!configured()) {
    return { ok: false, error: "No Supabase project is configured; the run was not recorded." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("agent_runs")
      .insert({
        user_id: input.userId,
        agent_name: input.agentName,
        task_type: input.taskType,
        status: "started",
        correlation_id: input.correlationId,
        session_id: input.sessionId,
        input: redact(input.input).value as never,
        human_approval_required: input.humanApprovalRequired,
        human_approved: false,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, value: data.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to open agent run.",
    };
  }
}

/**
 * Maps a pipeline denial message onto the authorization_decision enum.
 *
 * The status column already says the call was denied; this says which gate
 * denied it. "Denials are up" is a number; "denials are up and they are all
 * denied_permission on one tool" is an incident report.
 */
export function classifyDecision(record: ToolCallRecord): string {
  if (record.awaitingConfirmation) return "awaiting_confirmation";
  if (record.status !== "denied") return "allowed";

  const detail = record.errorDetail ?? "";
  if (/Unknown tool/i.test(detail)) return "denied_unknown_tool";
  if (/not available to this agent/i.test(detail)) return "denied_out_of_scope";
  if (/AI service identity/i.test(detail)) return "denied_ai_identity";
  if (/Invalid arguments/i.test(detail)) return "denied_schema";
  if (/Missing permission/i.test(detail)) return "denied_permission";
  if (/outside your scope/i.test(detail)) return "denied_argument_scope";
  if (/cannot run unaudited/i.test(detail)) return "denied_unauditable";
  return "denied_permission";
}

export interface RecordToolCallInput {
  readonly agentRunId: string | null;
  readonly userId: string;
  readonly agentName: string;
  readonly correlationId: string;
  readonly sessionId: string;
  readonly riskLevel: RiskLevel | null;
  readonly record: ToolCallRecord;
  readonly evidenceRefs?: readonly string[];
}

export async function recordToolCall(
  input: RecordToolCallInput,
): Promise<RecordOutcome<string>> {
  if (!configured()) {
    return { ok: false, error: "No Supabase project is configured; the call was not recorded." };
  }

  const { record } = input;
  const decision = classifyDecision(record);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("agent_tool_calls")
      .insert({
        agent_run_id: input.agentRunId,
        user_id: input.userId,
        agent_name: input.agentName,
        tool_name: record.toolName,
        correlation_id: input.correlationId,
        session_id: input.sessionId,
        risk_level: input.riskLevel,
        authorization_decision: decision,
        status: record.status,
        // The CHECK requires a reason on any denial, so a refusal cannot be
        // stored as a bare count.
        denial_reason: record.status === "denied" ? (record.errorDetail ?? "unspecified") : null,
        arguments: redact(record.arguments).value as never,
        result: redact(record.result).value as never,
        error_detail: record.errorDetail,
        duration_ms: record.durationMs,
        audited: record.audited,
        evidence_refs: (input.evidenceRefs ?? []) as never,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, value: data.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to record tool call.",
    };
  }
}

export interface CloseRunInput {
  readonly agentRunId: string;
  readonly status: "completed" | "failed" | "awaiting_approval";
  readonly output: unknown;
  readonly latencyMs: number;
  readonly errorDetail: string | null;
  readonly evidenceRefs?: readonly string[];
}

/**
 * Closes a run.
 *
 * `latencyMs` is required, not optional: the schema refuses a completed or
 * failed run without it, because latency that is optional on a finished run
 * is latency nobody records.
 */
export async function closeAgentRun(
  input: CloseRunInput,
): Promise<RecordOutcome<true>> {
  if (!configured()) {
    return { ok: false, error: "No Supabase project is configured; the run was not closed." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("agent_runs")
      .update({
        status: input.status,
        output: redact(input.output).value as never,
        latency_ms: Math.max(0, Math.round(input.latencyMs)),
        error_detail: input.errorDetail,
        evidence_refs: (input.evidenceRefs ?? []) as never,
        completed_at: new Date().toISOString(),
      })
      .eq("id", input.agentRunId);

    if (error) return { ok: false, error: error.message };
    return { ok: true, value: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to close agent run.",
    };
  }
}

export interface RagRetrievalInput {
  readonly userId: string;
  readonly correlationId: string;
  readonly sessionId: string;
  /** Hashed here and then discarded. The text never leaves this function. */
  readonly query: string;
  readonly requestedMatchCount: number;
  readonly returnedChunkCount: number;
  readonly minSimilarity: number | null;
  readonly topSimilarity: number | null;
  readonly documentIds: readonly string[];
  readonly injectionSignalCount: number;
  readonly latencyMs: number | null;
}

/**
 * Records a retrieval without recording what was asked.
 *
 * The query is hashed on the line below and never stored. A retrieval query
 * on this platform routinely contains a person's name and the concern being
 * raised about them; putting that in a telemetry table readable by anyone
 * with ai.view_audit would be a data leak dressed as observability.
 */
export async function recordRagRetrieval(
  input: RagRetrievalInput,
): Promise<RecordOutcome<true>> {
  if (!configured()) {
    return { ok: false, error: "No Supabase project is configured; the retrieval was not recorded." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("rag_retrievals").insert({
      user_id: input.userId,
      correlation_id: input.correlationId,
      session_id: input.sessionId,
      query_hash: stableHash(input.query),
      query_length: input.query.length,
      requested_match_count: input.requestedMatchCount,
      returned_chunk_count: input.returnedChunkCount,
      min_similarity: input.minSimilarity,
      top_similarity: input.topSimilarity,
      document_ids: [...input.documentIds] as never,
      injection_signal_count: input.injectionSignalCount,
      latency_ms: input.latencyMs === null ? null : Math.max(0, Math.round(input.latencyMs)),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, value: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to record retrieval.",
    };
  }
}

/**
 * An AuditSink that writes to audit_logs AND persists the tool call.
 *
 * Composed rather than replacing lib/audit/record.ts: audit_logs is the
 * append-only legal record, agent_tool_calls is the operational one, and they
 * answer different questions. The sink reports failure if EITHER fails, so
 * the pipeline's fail-closed rule for consequential tools still applies when
 * only one of the two writes succeeded.
 */
export function composeAuditSinks(
  ...sinks: readonly AuditSink[]
): AuditSink {
  return async (event: AgentAuditEvent): Promise<AuditOutcome> => {
    const failures: string[] = [];
    let eventId: string | null = null;

    for (const sink of sinks) {
      try {
        const outcome = await sink(event);
        if (outcome.ok) eventId = outcome.eventId ?? eventId;
        else failures.push(outcome.error);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Audit sink threw.");
      }
    }

    return failures.length === 0
      ? { ok: true, eventId }
      : { ok: false, error: failures.join("; ") };
  };
}
