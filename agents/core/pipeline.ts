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
}

function denied(
  proposal: ToolCallProposal,
  reason: string,
  startedAt: number,
): ToolCallRecord {
  return {
    toolName: proposal.toolName,
    arguments: proposal.arguments,
    status: "denied",
    result: null,
    errorDetail: reason,
    durationMs: Date.now() - startedAt,
    awaitingConfirmation: false,
  };
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

  // --- 1. The tool must exist in the closed registry --------------------
  const tool = registry.get(proposal.toolName);
  if (!tool) {
    log("tool.denied.unknown", { tool: proposal.toolName });
    return denied(
      proposal,
      `Unknown tool "${proposal.toolName}". Only registered tools can be executed.`,
      startedAt,
    );
  }

  // --- 2. And be one this agent declared --------------------------------
  if (!options.allowedTools.includes(tool.name)) {
    log("tool.denied.out_of_scope", { tool: tool.name });
    return denied(
      proposal,
      `Tool "${tool.name}" is not available to this agent.`,
      startedAt,
    );
  }

  // --- 3. AI identities are restricted regardless of permissions --------
  if (auth.isAiService && !tool.allowedForAiService) {
    log("tool.denied.ai_service", { tool: tool.name });
    return denied(
      proposal,
      `Tool "${tool.name}" may not be invoked by an AI service identity.`,
      startedAt,
    );
  }

  // --- 4. Schema ---------------------------------------------------------
  const validation = validateArguments(tool.inputSchema, proposal.arguments);
  if (!validation.valid) {
    log("tool.denied.schema", { tool: tool.name, errors: validation.errors });
    return denied(
      proposal,
      `Invalid arguments: ${validation.errors.join("; ")}`,
      startedAt,
    );
  }

  // --- 5. Authorization: ALL declared permissions -----------------------
  const missing = tool.requiredPermissions.filter(
    (permission) => !auth.permissions.includes(permission),
  );
  if (missing.length > 0) {
    log("tool.denied.permission", { tool: tool.name, missing });
    return denied(
      proposal,
      `Missing permission(s): ${missing.join(", ")}`,
      startedAt,
    );
  }

  // --- 6. Risk and confirmation -----------------------------------------
  // A tool requiring confirmation stops here unless a human already granted
  // it. The pipeline never asks the model whether to proceed.
  if (tool.requiresConfirmation && !options.confirmations?.has(tool.name)) {
    log("tool.awaiting_confirmation", { tool: tool.name, risk: tool.riskLevel });
    return {
      toolName: tool.name,
      arguments: validation.value,
      status: "denied",
      result: null,
      errorDetail: `Tool "${tool.name}" is ${tool.riskLevel} risk and requires explicit human confirmation before it runs.`,
      durationMs: Date.now() - startedAt,
      awaitingConfirmation: true,
    };
  }

  // --- 7. Execute --------------------------------------------------------
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

    // --- 8. Validate the result ----------------------------------------
    // A handler that returns a malformed outcome is a failure, not a success
    // with odd data.
    if (!outcome || typeof outcome !== "object" || !("ok" in outcome)) {
      log("tool.failed.malformed", { tool: tool.name });
      return {
        toolName: tool.name,
        arguments: validation.value,
        status: "failed",
        result: null,
        errorDetail: "Tool returned a malformed outcome.",
        durationMs: Date.now() - startedAt,
        awaitingConfirmation: false,
      };
    }

    if (!outcome.ok) {
      log("tool.failed", { tool: tool.name });
      return {
        toolName: tool.name,
        arguments: validation.value,
        status: "failed",
        result: null,
        errorDetail: outcome.error,
        durationMs: Date.now() - startedAt,
        awaitingConfirmation: false,
      };
    }

    log("tool.completed", { tool: tool.name, durationMs: Date.now() - startedAt });
    return {
      toolName: tool.name,
      arguments: validation.value,
      status: "completed",
      result: outcome.result,
      errorDetail: null,
      durationMs: Date.now() - startedAt,
      awaitingConfirmation: false,
    };
  } catch (error) {
    // A thrown handler is a failure. It is never reported as success, and the
    // message is kept internal-safe for the caller (CLAUDE.md §22).
    const message = error instanceof Error ? error.message : "Tool execution failed";
    log("tool.failed.threw", { tool: tool.name });
    return {
      toolName: tool.name,
      arguments: validation.value,
      status: "failed",
      result: null,
      errorDetail: message,
      durationMs: Date.now() - startedAt,
      awaitingConfirmation: false,
    };
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
