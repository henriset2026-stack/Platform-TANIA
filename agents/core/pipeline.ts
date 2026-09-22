/**
 * Governed tool execution — AGENTS.md §7.
 *
 *   propose → validate schema → validate authorization → validate scope
 *   → validate risk → confirm if required → execute → validate result
 *   → audit → return
 *
 * Each stage can only DENY. None can widen what a later stage would allow,
 * and the order is fixed: authorization is checked before anything runs, and
 * the result is validated before it is returned to the model.
 *
 * NO FABRICATED EXECUTION (CLAUDE.md §4.4). The only value that can become a
 * result is what the handler returned. If the handler throws, times out or
 * returns a malformed shape, the outcome is a failure — never a plausible
 * success.
 */

import { validateArguments } from "@/agents/core/schema";
import {
  requiresAuditBeforeExecution,
  unconfiguredAuditSink,
  type AgentAuditEvent,
  type AuditSink,
} from "@/agents/core/audit";
import type { ToolRegistry } from "@/agents/core/tool-registry";
import type {
  AgentAuthContext,
  ToolCallStatus,
  ToolDefinition,
  ToolExecutionContext,
} from "@/agents/core/types";

export interface ToolCallProposal {
  readonly toolName: string;
  readonly arguments: unknown;
}

export interface ToolCallRecord {
  readonly toolName: string;
  readonly arguments: unknown;
  readonly status: ToolCallStatus;
  readonly result: unknown;
  readonly errorDetail: string | null;
  readonly durationMs: number;
  /** Set when the call stopped because a human must confirm it. */
  readonly awaitingConfirmation: boolean;
  /**
   * Whether this call reached the audit log.
   *
   * Present on every record so an unaudited call can never be mistaken for an
   * audited one. A consequential tool never completes with this false — it is
   * refused instead (agents/core/audit.ts).
   */
  readonly audited: boolean;
  /** Why the audit write failed, when it did. */
  readonly auditFailure: string | null;
}

export interface PipelineOptions {
  readonly registry: ToolRegistry;
  readonly auth: AgentAuthContext;
  /** Tools the invoking agent declared. A call outside this set is denied. */
  readonly allowedTools: readonly string[];
  readonly signal: AbortSignal;
  readonly log: (event: string, detail?: Record<string, unknown>) => void;
  /**
   * Confirmations already granted by a human, by tool name. Absent means not
   * confirmed — the safe default.
   */
  readonly confirmations?: ReadonlySet<string>;
  readonly timeoutMs: number;
  /**
   * Where audit events go. Omitting it leaves the call unaudited and refuses
   * every consequential tool, which is the safe reading of "no audit here".
   */
  readonly audit?: AuditSink;
  /** Recorded on each event so a run can be reconstructed from the log. */
  readonly agentName?: string;
}

/**
 * Writes one audit event, and never throws.
 *
 * A sink that throws must not become a tool failure by accident: the caller
 * decides what an audit failure means for this tool, and that decision is
 * made at the call site rather than by an exception escaping from here.
 */
async function recordAudit(
  sink: AuditSink,
  event: AgentAuditEvent,
): Promise<{ audited: boolean; auditFailure: string | null }> {
  try {
    const outcome = await sink(event);
    return outcome.ok
      ? { audited: true, auditFailure: null }
      : { audited: false, auditFailure: outcome.error };
  } catch (error) {
    return {
      audited: false,
      auditFailure: error instanceof Error ? error.message : "Audit sink threw.",
    };
  }
}

/**
 * Runs one proposed tool call through the gate.
 *
 * Always returns a record, including for denials. A refused call must remain
 * visible in the run: discarding denials makes a run where the model
 * repeatedly attempted an unauthorized action look identical to a clean one.
 */
export async function executeToolCall(
  proposal: ToolCallProposal,
  options: PipelineOptions,
): Promise<ToolCallRecord> {
  const startedAt = Date.now();
  const { registry, auth, log } = options;
  const sink = options.audit ?? unconfiguredAuditSink;
  const agentName = options.agentName ?? "unknown_agent";

  /**
   * Builds the record and audits it in one step.
   *
   * Every exit from this function goes through here, so a new early return
   * cannot quietly skip the log. The audit result is reported on the record
   * rather than swallowed.
   */
  async function finish(
    partial: Omit<ToolCallRecord, "durationMs" | "audited" | "auditFailure">,
  ): Promise<ToolCallRecord> {
    const durationMs = Date.now() - startedAt;
    const { audited, auditFailure } = await recordAudit(sink, {
      action: `agent.tool.${partial.status}`,
      resourceType: "agent_tool_call",
      resourceId: partial.toolName,
      correlationId: auth.correlationId,
      agentName,
      toolName: partial.toolName,
      status: partial.status,
      arguments: partial.arguments,
      errorDetail: partial.errorDetail,
      durationMs,
    });

    if (!audited) {
      log("tool.audit_failed", { tool: partial.toolName, reason: auditFailure });
    }

    return { ...partial, durationMs, audited, auditFailure };
  }

  const refuse = (toolName: string, args: unknown, reason: string) =>
    finish({
      toolName,
      arguments: args,
      status: "denied",
      result: null,
      errorDetail: reason,
      awaitingConfirmation: false,
    });

  // --- 1. The tool must exist in the closed registry --------------------
  const tool = registry.get(proposal.toolName);
  if (!tool) {
    log("tool.denied.unknown", { tool: proposal.toolName });
    return refuse(
      proposal.toolName,
      proposal.arguments,
      `Unknown tool "${proposal.toolName}". Only registered tools can be executed.`,
    );
  }

  // --- 2. And be one this agent declared --------------------------------
  if (!options.allowedTools.includes(tool.name)) {
    log("tool.denied.out_of_scope", { tool: tool.name });
    return refuse(
      tool.name,
      proposal.arguments,
      `Tool "${tool.name}" is not available to this agent.`,
    );
  }

  // --- 3. AI identities are restricted regardless of permissions --------
  if (auth.isAiService && !tool.allowedForAiService) {
    log("tool.denied.ai_service", { tool: tool.name });
    return refuse(
      tool.name,
      proposal.arguments,
      `Tool "${tool.name}" may not be invoked by an AI service identity.`,
    );
  }

  // --- 4. Schema ---------------------------------------------------------
  const validation = validateArguments(tool.inputSchema, proposal.arguments);
  if (!validation.valid) {
    log("tool.denied.schema", { tool: tool.name, errors: validation.errors });
    return refuse(
      tool.name,
      proposal.arguments,
      `Invalid arguments: ${validation.errors.join("; ")}`,
    );
  }

  // --- 5. Authorization: ALL declared permissions -----------------------
  const missing = tool.requiredPermissions.filter(
    (permission) => !auth.permissions.includes(permission),
  );
  if (missing.length > 0) {
    log("tool.denied.permission", { tool: tool.name, missing });
    return refuse(
      tool.name,
      validation.value,
      `Missing permission(s): ${missing.join(", ")}`,
    );
  }

  // --- 6. Risk and confirmation -----------------------------------------
  // A tool requiring confirmation stops here unless a human already granted
  // it. The pipeline never asks the model whether to proceed.
  if (tool.requiresConfirmation && !options.confirmations?.has(tool.name)) {
    log("tool.awaiting_confirmation", { tool: tool.name, risk: tool.riskLevel });
    return finish({
      toolName: tool.name,
      arguments: validation.value,
      status: "denied",
      result: null,
      errorDetail: `Tool "${tool.name}" is ${tool.riskLevel} risk and requires explicit human confirmation before it runs.`,
      awaitingConfirmation: true,
    });
  }

  // --- 7. A consequential tool may not run off the record ----------------
  // Fail closed. "The audit log was unreachable" is not a defence for an
  // unrecorded consequential action (CLAUDE.md §16 rule 10). A LOW-risk read
  // is allowed through and marked unaudited instead, because taking the
  // assistant down whenever the log is unreachable is a worse trade.
  if (requiresAuditBeforeExecution(tool)) {
    const pre = await recordAudit(sink, {
      action: "agent.tool.authorized",
      resourceType: "agent_tool_call",
      resourceId: tool.name,
      correlationId: auth.correlationId,
      agentName,
      toolName: tool.name,
      status: "authorized",
      arguments: validation.value,
      errorDetail: null,
      durationMs: null,
    });

    if (!pre.audited) {
      log("tool.denied.unauditable", { tool: tool.name, reason: pre.auditFailure });
      return refuse(
        tool.name,
        validation.value,
        `Tool "${tool.name}" is ${tool.riskLevel} risk and cannot run unaudited: ${pre.auditFailure}`,
      );
    }
  }

  // --- 8. Execute --------------------------------------------------------
  const context: ToolExecutionContext = {
    auth,
    correlationId: auth.correlationId,
    signal: options.signal,
    log,
  };

  log("tool.authorized", { tool: tool.name, risk: tool.riskLevel });

  try {
    const outcome = await withTimeout(
      tool.handler(validation.value as never, context),
      options.timeoutMs,
      options.signal,
    );

    // --- 9. Validate the result ----------------------------------------
    // A handler that returns a malformed outcome is a failure, not a success
    // with odd data.
    if (!outcome || typeof outcome !== "object" || !("ok" in outcome)) {
      log("tool.failed.malformed", { tool: tool.name });
      return finish({
        toolName: tool.name,
        arguments: validation.value,
        status: "failed",
        result: null,
        errorDetail: "Tool returned a malformed outcome.",
        awaitingConfirmation: false,
      });
    }

    if (!outcome.ok) {
      log("tool.failed", { tool: tool.name });
      return finish({
        toolName: tool.name,
        arguments: validation.value,
        status: "failed",
        result: null,
        errorDetail: outcome.error,
        awaitingConfirmation: false,
      });
    }

    log("tool.completed", { tool: tool.name, durationMs: Date.now() - startedAt });
    return finish({
      toolName: tool.name,
      arguments: validation.value,
      status: "completed",
      result: outcome.result,
      errorDetail: null,
      awaitingConfirmation: false,
    });
  } catch (error) {
    // A thrown handler is a failure. It is never reported as success, and the
    // message is kept internal-safe for the caller (CLAUDE.md §22).
    const message = error instanceof Error ? error.message : "Tool execution failed";
    log("tool.failed.threw", { tool: tool.name });
    return finish({
      toolName: tool.name,
      arguments: validation.value,
      status: "failed",
      result: null,
      errorDetail: message,
      awaitingConfirmation: false,
    });
  }
}

/**
 * Bounds a handler by the gateway deadline.
 *
 * A tool cannot outlive the request that authorized it: an authorization
 * decision is made against a session, and work continuing past the response
 * is work nobody is watching.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool exceeded ${timeoutMs}ms deadline`));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Tool execution aborted"));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    promise
      .then((value) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

/** True when any call stopped pending human confirmation. */
export function requiresApproval(records: readonly ToolCallRecord[]): boolean {
  return records.some((record) => record.awaitingConfirmation);
}
