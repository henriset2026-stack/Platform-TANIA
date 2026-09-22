/**
 * Agent audit — AGENTS.md §7, CLAUDE.md §16 rule 10.
 *
 * Every tool call produces an audit event, including the ones that were
 * refused. A denied call is the most interesting row in the log: a run where
 * the model repeatedly tried an unauthorized action looks identical to a
 * clean run once denials are discarded.
 *
 * THE PART THAT MATTERS
 * Audit can fail — the database is unreachable, the session expired. What
 * happens then is a security decision, and it is not the same decision for
 * every tool:
 *
 *  - A consequential tool (above LOW risk, or one requiring confirmation)
 *    FAILS CLOSED. It is not executed at all, because an unaudited
 *    consequential action is precisely what rule 10 forbids, and "the log was
 *    down" is not a defence six months later.
 *  - A LOW-risk read continues, because taking the assistant offline whenever
 *    the audit table is unreachable trades a real outage for a theoretical
 *    one. It is marked `audited: false` and carries the reason, so nothing
 *    downstream can mistake it for an audited call.
 *
 * The default sink returns a FAILURE rather than success. An agent wired up
 * without audit is unaudited, and should say so; silently returning ok would
 * make the absence of audit indistinguishable from working audit.
 */

import type { RiskLevel, ToolDefinition } from "@/agents/core/types";

export interface AgentAuditEvent {
  /** e.g. "agent.tool.completed". Dotted, past tense, never a sentence. */
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly correlationId: string;
  readonly agentName: string;
  readonly toolName: string;
  readonly status: string;
  /**
   * Tool arguments as accepted after schema validation.
   *
   * Validated rather than raw: raw model output is untrusted and may be huge,
   * and the validated object is what actually ran.
   */
  readonly arguments: unknown;
  readonly errorDetail: string | null;
  readonly durationMs: number | null;
}

export type AuditOutcome =
  | { readonly ok: true; readonly eventId: string | null }
  | { readonly ok: false; readonly error: string };

export type AuditSink = (event: AgentAuditEvent) => Promise<AuditOutcome>;

/**
 * The sink used when none is configured.
 *
 * Deliberately reports failure. See the note above: silence about missing
 * audit is worse than a visible gap in it.
 */
export const unconfiguredAuditSink: AuditSink = async () => ({
  ok: false,
  error:
    "No audit sink is configured, so this call was not recorded. Consequential tools are refused in this state.",
});

/**
 * Whether a tool's execution must be audited before it may run.
 *
 * LOW risk and no confirmation means a read. Anything else changes something,
 * or is gated on a human, and neither may happen off the record.
 */
export function requiresAuditBeforeExecution(
  tool: Pick<ToolDefinition, "riskLevel" | "requiresConfirmation">,
): boolean {
  return tool.riskLevel !== "LOW" || tool.requiresConfirmation;
}

export function isConsequentialRisk(risk: RiskLevel): boolean {
  return risk !== "LOW";
}
