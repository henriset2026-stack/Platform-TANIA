import "server-only";

/**
 * The AI Gateway — TANIA_PRD_v2.0.md §39.
 *
 *   authorization → context → provider → tool execution → result validation
 *   → audit → structured response
 *
 * The gateway owns the ordering. Authorization happens before a prompt is
 * built, so an unauthorized request never reaches a model; tool execution is
 * governed by agents/core/pipeline.ts; and the response is assembled from
 * what actually happened, never from what the model claimed.
 */

import { executeToolCall, requiresApproval, type ToolCallRecord } from "@/agents/core/pipeline";
import { toolRegistry } from "@/agents/core/tool-registry";
import { toAgentAuthContext, type AgentAuthContext, type AgentDefinition, type AgentRunStatus, type AiResponse } from "@/agents/core/types";
import { isAiService } from "@/lib/auth/policy";
import { getAuthContext } from "@/lib/auth/session";
import { describeContext, type PageContext } from "@/lib/assistant/context";
import { AI_LIMITS, readAiConfig } from "@/lib/ai/config";
import { aiRateLimiter } from "@/lib/ai/rate-limit";
import { resolveProvider, type ProviderMessage } from "@/lib/ai/provider";

export interface GatewayRequest {
  readonly message: string;
  readonly intent?: string;
  readonly agent?: AgentDefinition;
  readonly sessionId?: string;
  /**
   * Validated page hint. Influences interpretation only: it carries no
   * authority, and any entity it names is re-authorized wherever it is used.
   */
  readonly pageContext?: PageContext;
  /** Tool names a human has explicitly confirmed for this request. */
  readonly confirmations?: readonly string[];
}

export type GatewayOutcome =
  | { readonly ok: true; readonly response: AiResponse; readonly run: GatewayRun }
  | { readonly ok: false; readonly code: GatewayErrorCode; readonly message: string; readonly correlationId: string };

export type GatewayErrorCode =
  | "RATE_LIMITED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_CONFIGURED"
  | "INVALID_REQUEST"
  | "PROVIDER_ERROR"
  | "TIMEOUT";

export interface GatewayRun {
  readonly correlationId: string;
  readonly agentName: string;
  readonly status: AgentRunStatus;
  readonly toolCalls: readonly ToolCallRecord[];
  readonly usage: {
    readonly promptTokens: number | null;
    readonly completionTokens: number | null;
    readonly totalTokens: number | null;
    readonly estimatedCost: number | null;
    readonly currency: string | null;
  } | null;
  readonly latencyMs: number;
  readonly model: string | null;
}

/**
 * A minimal built-in agent so the gateway is testable end to end.
 *
 * It declares NO tools. Domain agents are Phase 16, and the gateway is
 * deliberately complete and governed before anything can act through it.
 */
export const DEFAULT_AGENT: AgentDefinition = {
  name: "tania_assistant",
  description: "General TANIA assistant. Answers from authorized context only.",
  tools: [],
  systemPrompt: [
    "You are TANIA, the talent intelligence assistant for Chapter DPS at Telkom Indonesia.",
    "You answer only from information provided to you or returned by an authorized tool.",
    "You never assert a performance fact, capability level or financial figure that you were not given.",
    "If you do not have the information, say so plainly.",
    "You never claim an action succeeded. Only a tool result can establish that.",
  ].join(" "),
  requiredPermissions: ["ai.use"],
  maxToolCalls: AI_LIMITS.maxToolCallsPerRun,
  timeoutMs: AI_LIMITS.requestTimeoutMs,
};

function newCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Handles one gateway request.
 *
 * Note the order of refusals: authentication, then authorization, then
 * configuration. A caller without `ai.use` is told they are forbidden rather
 * than that the model is unconfigured — leaking which parts of the system are
 * set up is a small information disclosure, and answering the wrong question
 * wastes an operator's time.
 */
export async function handleGatewayRequest(
  request: GatewayRequest,
): Promise<GatewayOutcome> {
  const correlationId = newCorrelationId();
  const startedAt = Date.now();

  const message = request.message?.trim() ?? "";
  if (message.length === 0) {
    return { ok: false, code: "INVALID_REQUEST", message: "Message is required.", correlationId };
  }
  if (message.length > AI_LIMITS.maxPromptChars) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: `Message exceeds ${AI_LIMITS.maxPromptChars} characters.`,
      correlationId,
    };
  }

  // --- Authorization, before any prompt is constructed -------------------
  const authContext = await getAuthContext();
  if (!authContext) {
    return { ok: false, code: "UNAUTHENTICATED", message: "Sign in to use TANIA.", correlationId };
  }

  // Budgeted per authenticated user, here rather than in the route, because
  // this is the one place the identity is known and authorization already
  // happened. Anonymous callers never reach it — they were refused above.
  const budget = aiRateLimiter.consume(authContext.userId);
  if (!budget.allowed) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: `Too many requests. Try again in ${budget.retryAfterSeconds}s.`,
      correlationId,
    };
  }

  const agent = request.agent ?? DEFAULT_AGENT;
  const missing = agent.requiredPermissions.filter(
    (permission) => !authContext.permissions.includes(permission),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `Missing permission(s): ${missing.join(", ")}`,
      correlationId,
    };
  }

  const auth: AgentAuthContext = toAgentAuthContext(authContext, {
    correlationId,
    sessionId: request.sessionId ?? correlationId,
    isAiService: isAiService(authContext),
  });

  // --- Provider ----------------------------------------------------------
  const config = readAiConfig();
  const provider = resolveProvider(config.configured ? config.providerName : null);

  if (!provider.configured || !config.model) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "No LLM provider is configured. TANIA will not generate an answer without one.",
      correlationId,
    };
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), agent.timeoutMs);

  try {
    const messages: readonly ProviderMessage[] = [
      { role: "system", content: agent.systemPrompt },
      { role: "system", content: describeScope(auth) },
      ...(request.pageContext && describeContext(request.pageContext)
        ? [{ role: "system" as const, content: describeContext(request.pageContext) }]
        : []),
      { role: "user", content: message },
    ];

    // Tool SPECS only. The provider never receives a handler, so it cannot
    // invoke anything; it can only propose.
    const tools = toolRegistry.forAgent(agent.tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const result = await provider.complete({
      model: config.model,
      messages,
      tools,
      maxOutputTokens: config.maxOutputTokens,
      temperature: config.temperature,
      signal: controller.signal,
      correlationId,
    });

    if (!result.ok) {
      return {
        ok: false,
        code: result.code === "TIMEOUT" ? "TIMEOUT" : "PROVIDER_ERROR",
        message: result.error,
        correlationId,
      };
    }

    // --- Tool execution, capped and governed ---------------------------
    const confirmations = new Set(request.confirmations ?? []);
    const proposals = result.toolCalls.slice(0, agent.maxToolCalls);
    const records: ToolCallRecord[] = [];

    for (const proposal of proposals) {
      records.push(
        await executeToolCall(proposal, {
          registry: toolRegistry,
          auth,
          allowedTools: agent.tools,
          signal: controller.signal,
          log: (event, detail) => logEvent(correlationId, event, detail),
          confirmations,
          timeoutMs: AI_LIMITS.toolTimeoutMs,
        }),
      );
    }

    const approvalPending = requiresApproval(records);
    const status: AgentRunStatus = approvalPending ? "awaiting_approval" : "completed";

    const response: AiResponse = {
      // The model's text is returned as-is; it is not evidence, and the
      // fields below describe what actually happened.
      answer: result.text,
      intent: request.intent ?? null,
      confidence: null,
      evidence: records
        .filter((r) => r.status === "completed")
        .map((r) => `${r.toolName} returned a result`),
      citations: [],
      toolsUsed: records.filter((r) => r.status === "completed").map((r) => r.toolName),
      dataFreshness: null,
      scope: describeScope(auth),
      requiresApproval: approvalPending,
      correlationId,
    };

    return {
      ok: true,
      response,
      run: {
        correlationId,
        agentName: agent.name,
        status,
        toolCalls: records,
        usage: result.usage,
        latencyMs: Date.now() - startedAt,
        model: result.model,
      },
    };
  } catch (error) {
    const aborted = error instanceof Error && /abort/i.test(error.message);
    return {
      ok: false,
      code: aborted ? "TIMEOUT" : "PROVIDER_ERROR",
      message: aborted ? "The request exceeded its deadline." : "The request failed.",
      correlationId,
    };
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Describes the caller's scope for the system prompt.
 *
 * Names roles and organizational scope but NEVER includes the permission
 * list: telling the model exactly which permissions are absent invites it to
 * argue for them, and the list is not needed to answer well. Enforcement is
 * in the pipeline and in RLS regardless of what the prompt says.
 */
export function describeScope(auth: AgentAuthContext): string {
  const roles = auth.roles.length > 0 ? auth.roles.join(", ") : "no role";
  return [
    `The person you are helping holds: ${roles}.`,
    `They are scoped to ${auth.organizationIds.length} organization(s) and ${auth.squadIds.length} squad(s).`,
    "Answer only within that scope. You cannot widen it, and the database enforces it independently.",
  ].join(" ");
}

function logEvent(
  correlationId: string,
  event: string,
  detail?: Record<string, unknown>,
): void {
  // Structured and correlated (CLAUDE.md §24). Arguments are deliberately not
  // logged: they may carry personal data.
  console.warn(
    JSON.stringify({ correlationId, event, ...(detail ?? {}) }),
  );
}
