import "server-only";

/**
 * Supabase-backed audit sink.
 *
 * Appends through record_audit_event(), never by inserting into audit_logs.
 * The function is SECURITY DEFINER and stamps the actor from auth.uid(), so
 * the actor cannot be supplied by the caller — direct INSERT is revoked
 * precisely so a forged row is impossible (migration 20260920120004).
 *
 * This sink writes through the caller's RLS-scoped client. It never uses the
 * admin client: an audit trail written with a credential that bypasses RLS
 * would record "the service" as the actor for actions a person took.
 */

import { createClient } from "@/lib/supabase/server";
import type { AgentAuditEvent, AuditOutcome, AuditSink } from "@/agents/core/audit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Arguments are recorded, but only after being reduced to keys and scalars.
 *
 * A tool's validated arguments are small and already schema-checked, so this
 * is cheap insurance rather than a real constraint: it keeps an unexpectedly
 * large or nested payload from being copied into an append-only table that
 * nobody can later prune.
 */
function summarizeArguments(
  args: unknown,
): Record<string, string | number | boolean> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return { _shape: typeof args };
  }
  const summary: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    summary[key] =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : `[${typeof value}]`;
  }
  return summary;
}

export function createAuditSink(): AuditSink {
  return async (event: AgentAuditEvent): Promise<AuditOutcome> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      // Reported as a failure, not quietly accepted: an unreachable audit log
      // must be visible to the pipeline, which then refuses consequential
      // tools rather than running them off the record.
      return {
        ok: false,
        error: "Audit log unavailable: no Supabase project is configured.",
      };
    }

    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("record_audit_event", {
        p_action: event.action,
        p_resource_type: event.resourceType,
        // Absent parameters take the SQL default (null).
        ...(event.resourceId ? { p_resource_id: event.resourceId } : {}),
        p_before_data: null,
        p_after_data: {
          agent: event.agentName,
          tool: event.toolName,
          status: event.status,
          arguments: summarizeArguments(event.arguments),
          error: event.errorDetail,
          durationMs: event.durationMs,
        },
        // The column is uuid; a non-uuid correlation id is dropped rather
        // than failing the whole write, since losing the audit row is worse
        // than losing the correlation.
        ...(UUID_RE.test(event.correlationId) ? { p_request_id: event.correlationId } : {}),
      });

      if (error) return { ok: false, error: error.message };
      return { ok: true, eventId: data === null ? null : String(data) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Audit write failed.",
      };
    }
  };
}
