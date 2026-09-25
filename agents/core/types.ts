/**
 * Agent and tool contracts — AGENTS.md §7, TANIA_PRD_v2.0.md §56–§57.
 *
 * The shapes here are the security boundary for everything agentic in TANIA.
 * They are written so that the dangerous thing is not merely discouraged but
 * unrepresentable:
 *
 *  - A tool handler receives a ToolExecutionContext. That context exposes NO
 *    database client, NO fetch, NO credentials. A handler that wanted to run
 *    arbitrary SQL would have nothing to run it with.
 *  - A tool must declare required permissions and a risk level. There is no
 *    default, so an unclassified tool cannot be registered.
 *  - Arguments reach a handler only after schema validation, so a handler
 *    never parses raw model output.
 */

import type { AuthContext } from "@/lib/auth/session";

// ===========================================================================
// Risk — AGENTS.md §8
// ===========================================================================

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_DESCRIPTION: Record<RiskLevel, string> = {
  LOW: "Reads authorized data, retrieves, summarizes or calculates.",
  MEDIUM: "Creates a draft or recommendation, or updates a non-critical record.",
  HIGH: "Approves, changes an assignment, modifies sensitive data, exports, or causes an external side effect.",
};

// ===========================================================================
// Authorization context for an agent run
// ===========================================================================

/**
 * The authorization context an agent operates under.
 *
 * Derived server-side from the requesting user's session (TANIA_RBAC_RLS_MATRIX.md §8).
 * It is `readonly` throughout and is never constructed from request input: a
 * model cannot widen it, and nothing in the pipeline accepts a caller-supplied
 * substitute.
 */
export interface AgentAuthContext {
  readonly userId: string;
  readonly email: string;
  readonly organizationIds: readonly string[];
  readonly squadIds: readonly string[];
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  /** Ties every interaction, run, tool call and audit row together. */
  readonly correlationId: string;
  readonly sessionId: string;
  /** True when the caller is itself an AI service identity. */
  readonly isAiService: boolean;
}

export function toAgentAuthContext(
  context: AuthContext,
  options: { correlationId: string; sessionId: string; isAiService: boolean },
): AgentAuthContext {
  return {
    userId: context.userId,
    email: context.email,
    organizationIds: context.organizationIds,
    squadIds: context.squadIds,
    roles: context.roles,
    permissions: context.permissions,
    correlationId: options.correlationId,
    sessionId: options.sessionId,
    isAiService: options.isAiService,
  };
}

// ===========================================================================
// Tools
// ===========================================================================

/** Minimal JSON Schema subset. Enough to validate, small enough to audit. */
export interface JsonSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required?: readonly string[];
  /** Always false in practice: unknown keys are rejected, never ignored. */
  readonly additionalProperties?: false;
}

export interface JsonSchemaProperty {
  readonly type: "string" | "number" | "boolean" | "integer" | "array" | "object";
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
  readonly format?: "uuid" | "date" | "date-time";
  /** Also accept null. Absent means null is an error. */
  readonly nullable?: boolean;
  /** array: the schema every element must match. */
  readonly items?: JsonSchemaProperty;
  readonly maxItems?: number;
  /** object: its fields. Unknown keys are rejected at every depth. */
  readonly properties?: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required?: readonly string[];
}

/**
 * What a tool handler is given.
 *
 * Deliberately minimal. There is no `supabase`, no `fetch`, no `env`, no
 * `adminClient`. A tool that needs data receives it through a narrow,
 * purpose-built reader supplied at registration time by trusted code — never
 * by the model, and never a general query interface.
 *
 * `signal` carries the gateway's timeout so a handler cannot outlive the
 * request that authorized it.
 */
export interface ToolExecutionContext {
  readonly auth: AgentAuthContext;
  readonly correlationId: string;
  /** Aborts when the gateway deadline passes. */
  readonly signal: AbortSignal;
  /** Structured logging bound to the correlation id. */
  readonly log: (event: string, detail?: Record<string, unknown>) => void;
}

export type ToolOutcome<TResult> =
  | { readonly ok: true; readonly result: TResult }
  | { readonly ok: false; readonly error: string };

/**
 * A tool contract.
 *
 * Every field except `reversible` is required, so a tool cannot be registered
 * without stating its risk, its permissions and its schemas. `handler` is the
 * only thing that may produce a result: the gateway never synthesises one.
 */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
  readonly riskLevel: RiskLevel;
  /** ALL of these must be held. An empty array means the tool is unguarded. */
  readonly requiredPermissions: readonly string[];
  /** HIGH-risk tools must set this; enforced at registration. */
  readonly requiresConfirmation: boolean;
  readonly reversible?: boolean;
  /**
   * Whether an AI service identity may invoke this at all. Defaults to false:
   * a tool is unavailable to agents unless someone deliberately allows it.
   */
  readonly allowedForAiService?: boolean;
  readonly handler: (
    args: TArgs,
    context: ToolExecutionContext,
  ) => Promise<ToolOutcome<TResult>>;
}

// ===========================================================================
// Agents
// ===========================================================================

export interface AgentDefinition {
  readonly name: string;
  readonly description: string;
  /** Bounded responsibility. No agent may declare "*". */
  readonly tools: readonly string[];
  readonly systemPrompt: string;
  /** Permissions a caller must hold to invoke this agent at all. */
  readonly requiredPermissions: readonly string[];
  readonly maxToolCalls: number;
  readonly timeoutMs: number;
}

// ===========================================================================
// Execution records — PRD §57
// ===========================================================================

export const AGENT_RUN_STATUSES = [
  "started",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const TOOL_CALL_STATUSES = [
  "proposed",
  "authorized",
  "denied",
  "completed",
  "failed",
] as const;

export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

/**
 * A single tool call.
 *
 * `denied` is a first-class outcome, not an absence. A refused call must stay
 * visible: a run where the model repeatedly attempted an unauthorized action
 * looks identical to a clean run if denials are discarded.
 */
export interface AgentToolCall {
  readonly id: string;
  readonly agentRunId: string;
  readonly toolName: string;
  readonly arguments: unknown;
  readonly result: unknown;
  readonly status: ToolCallStatus;
  /** Why a call was denied or how it failed. */
  readonly errorDetail: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
}

export interface AgentRun {
  readonly id: string;
  readonly correlationId: string;
  readonly userId: string | null;
  readonly agentName: string;
  readonly taskType: string;
  readonly status: AgentRunStatus;
  readonly input: unknown;
  readonly output: unknown;
  readonly confidence: number | null;
  readonly humanApprovalRequired: boolean;
  readonly humanApproved: boolean;
  readonly toolCalls: readonly AgentToolCall[];
  readonly errorDetail: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

// ===========================================================================
// Structured response — PRD §41
// ===========================================================================

export interface Citation {
  readonly source: string;
  readonly reference: string;
  readonly kind: "record" | "document" | "calculation";
}

/**
 * The gateway's response contract.
 *
 * `requiresApproval` and `toolsUsed` are not optional: a response that
 * performed work must say what it did, and one that stopped short of a
 * consequential action must say so rather than reading as complete.
 */
export interface AiResponse {
  readonly answer: string;
  readonly intent: string | null;
  readonly confidence: number | null;
  readonly evidence: readonly string[];
  readonly citations: readonly Citation[];
  readonly toolsUsed: readonly string[];
  readonly dataFreshness: string | null;
  readonly scope: string;
  readonly requiresApproval: boolean;
  readonly correlationId: string;
}
