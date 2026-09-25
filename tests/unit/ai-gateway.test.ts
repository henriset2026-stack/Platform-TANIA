import { describe, expect, it } from "vitest";

import { validateArguments } from "@/agents/core/schema";
import { ToolRegistry, ToolRegistrationError, toolRegistry } from "@/agents/core/tool-registry";
import { confirmationToken, executeToolCall, requiresApproval } from "@/agents/core/pipeline";
import type { AgentAuditEvent, AuditSink } from "@/agents/core/audit";
import { RISK_LEVELS, type AgentAuthContext, type JsonSchema, type ToolDefinition } from "@/agents/core/types";
import { UnconfiguredProvider, resolveProvider } from "@/lib/ai/provider";
import { AI_LIMITS } from "@/lib/ai/config";

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    talentId: { type: "string", format: "uuid" },
    limit: { type: "integer", minimum: 1, maximum: 50 },
  },
  required: ["talentId"],
  additionalProperties: false,
};

function tool(over: Partial<ToolDefinition<never, unknown>> = {}): ToolDefinition<never, unknown> {
  return {
    name: "read_talent_summary",
    description: "Reads an authorized talent summary for the given profile.",
    inputSchema: SCHEMA,
    outputSchema: { type: "object", properties: { summary: { type: "string" } }, additionalProperties: false },
    riskLevel: "LOW",
    requiredPermissions: ["talent.read"],
    requiresConfirmation: false,
    handler: async () => ({ ok: true, result: { summary: "ok" } }),
    ...over,
  } as ToolDefinition<never, unknown>;
}

function auth(over: Partial<AgentAuthContext> = {}): AgentAuthContext {
  return {
    userId: "u1",
    email: "u1@telkom.test",
    organizationIds: ["org-1"],
    squadIds: [],
    roles: ["CHAPTER_LEAD"],
    permissions: ["talent.read", "ai.use"],
    correlationId: "corr-1",
    sessionId: "sess-1",
    isAiService: false,
    ...over,
  };
}

/** A working audit sink that keeps what it was given, for assertions. */
function recordingSink() {
  const events: AgentAuditEvent[] = [];
  const sink: AuditSink = async (event) => {
    events.push(event);
    return { ok: true, eventId: String(events.length) };
  };
  return { events, sink };
}

function options(registry: ToolRegistry, over: Record<string, unknown> = {}) {
  return {
    registry,
    auth: auth(),
    allowedTools: ["read_talent_summary"],
    signal: new AbortController().signal,
    log: () => undefined,
    timeoutMs: 1_000,
    ...over,
  } as Parameters<typeof executeToolCall>[1];
}

// ===========================================================================
// Schema validation — model output is untrusted input
// ===========================================================================
describe("argument validation", () => {
  const ok = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts conforming arguments", () => {
    const result = validateArguments(SCHEMA, { talentId: ok, limit: 10 });
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown argument rather than ignoring it", () => {
    const result = validateArguments(SCHEMA, { talentId: ok, drop_table: "x" });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.join()).toMatch(/Unknown argument: drop_table/);
  });

  it("rejects a missing required argument", () => {
    const result = validateArguments(SCHEMA, { limit: 5 });
    expect(result.valid).toBe(false);
  });

  it("enforces formats and bounds", () => {
    expect(validateArguments(SCHEMA, { talentId: "not-a-uuid" }).valid).toBe(false);
    expect(validateArguments(SCHEMA, { talentId: ok, limit: 0 }).valid).toBe(false);
    expect(validateArguments(SCHEMA, { talentId: ok, limit: 999 }).valid).toBe(false);
    expect(validateArguments(SCHEMA, { talentId: ok, limit: 1.5 }).valid).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateArguments(SCHEMA, "talentId=1").valid).toBe(false);
    expect(validateArguments(SCHEMA, null).valid).toBe(false);
    expect(validateArguments(SCHEMA, [1, 2]).valid).toBe(false);
  });
});

// ===========================================================================
// Registry — a tool cannot enter the system unclassified
// ===========================================================================
describe("tool registry", () => {
  it("registers a well-formed tool", () => {
    const registry = new ToolRegistry();
    registry.register(tool());
    expect(registry.has("read_talent_summary")).toBe(true);
  });

  it("rejects reserved names that imply general execution", () => {
    const registry = new ToolRegistry();
    for (const name of ["sql", "shell", "eval", "fetch", "admin"]) {
      expect(() => registry.register(tool({ name })), name).toThrow(ToolRegistrationError);
    }
  });

  it("rejects a HIGH-risk tool that does not require confirmation", () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register(tool({ riskLevel: "HIGH", requiresConfirmation: false })),
    ).toThrow(/requiresConfirmation/);
  });

  it("rejects a mutating tool with no required permission", () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register(tool({ riskLevel: "MEDIUM", requiredPermissions: [] })),
    ).toThrow(/required permission/);
  });

  it("rejects a schema that would ignore unknown arguments", () => {
    const registry = new ToolRegistry();
    const loose = { ...SCHEMA, additionalProperties: undefined } as unknown as JsonSchema;
    expect(() => registry.register(tool({ inputSchema: loose }))).toThrow(
      /additionalProperties/,
    );
  });

  // An AI identity may read and analyse only (AGENTS.md §9).
  it("refuses to expose a non-LOW tool to an AI service identity", () => {
    const registry = new ToolRegistry();
    expect(() =>
      registry.register(
        tool({ riskLevel: "MEDIUM", allowedForAiService: true, requiredPermissions: ["talent.update"] }),
      ),
    ).toThrow(/allowedForAiService/);
  });

  it("rejects duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(tool());
    expect(() => registry.register(tool())).toThrow(/already registered/);
  });

  // Phase 13 builds the gateway before anything can act through it.
  it("ships with an empty global registry", () => {
    expect(toolRegistry.size).toBe(0);
  });
});

// ===========================================================================
// Pipeline — every stage can only deny
// ===========================================================================
describe("tool execution pipeline", () => {
  const validArgs = { talentId: "123e4567-e89b-12d3-a456-426614174000" };

  it("executes an authorized LOW-risk call", async () => {
    const registry = new ToolRegistry();
    registry.register(tool());
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry),
    );
    expect(record.status).toBe("completed");
    expect(record.result).toEqual({ summary: "ok" });
  });

  it("denies an unregistered tool instead of attempting it", async () => {
    const registry = new ToolRegistry();
    const record = await executeToolCall(
      { toolName: "run_arbitrary_sql", arguments: {} },
      options(registry, { allowedTools: ["run_arbitrary_sql"] }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown tool/);
  });

  it("denies a registered tool the agent did not declare", async () => {
    const registry = new ToolRegistry();
    registry.register(tool());
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry, { allowedTools: [] }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/not available to this agent/);
  });

  it("denies when a required permission is missing", async () => {
    const registry = new ToolRegistry();
    registry.register(tool());
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry, { auth: auth({ permissions: ["ai.use"] }) }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Missing permission/);
  });

  it("denies an AI identity a tool not marked allowedForAiService", async () => {
    const registry = new ToolRegistry();
    registry.register(tool());
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry, { auth: auth({ isAiService: true }) }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/AI service identity/);
  });

  it("denies malformed arguments before the handler runs", async () => {
    let called = false;
    const registry = new ToolRegistry();
    registry.register(
      tool({
        handler: async () => {
          called = true;
          return { ok: true, result: {} };
        },
      }),
    );
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: { talentId: "nope" } },
      options(registry),
    );
    expect(record.status).toBe("denied");
    expect(called, "handler must not run on invalid arguments").toBe(false);
  });

  // Confirmation is never delegated to the model.
  it("stops a confirmation-required tool and flags it for a human", async () => {
    const registry = new ToolRegistry();
    registry.register(
      tool({ riskLevel: "HIGH", requiresConfirmation: true, requiredPermissions: ["talent.read"] }),
    );
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry),
    );
    expect(record.status).toBe("denied");
    expect(record.awaitingConfirmation).toBe(true);
    expect(requiresApproval([record])).toBe(true);
  });

  it("runs a confirmation-required tool once a human has confirmed it", async () => {
    const registry = new ToolRegistry();
    registry.register(
      tool({ riskLevel: "HIGH", requiresConfirmation: true, requiredPermissions: ["talent.read"] }),
    );
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry, {
        confirmations: new Set([confirmationToken("read_talent_summary", validArgs, "u1")]),
        audit: recordingSink().sink,
      }),
    );
    expect(record.status).toBe("completed");
    expect(record.audited).toBe(true);
  });

  // CLAUDE.md §16 rule 10. "The audit log was down" is not a defence for an
  // unrecorded consequential action, so the action does not happen.
  it("refuses a confirmed consequential tool when it cannot be audited", async () => {
    const registry = new ToolRegistry();
    let ran = false;
    registry.register(
      tool({
        riskLevel: "HIGH",
        requiresConfirmation: true,
        requiredPermissions: ["talent.read"],
        handler: async () => {
          ran = true;
          return { ok: true, result: {} };
        },
      }),
    );
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry, { confirmations: new Set([confirmationToken("read_talent_summary", validArgs, "u1")]) }),
    );

    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/cannot run unaudited/);
    expect(ran, "a consequential tool must not run off the record").toBe(false);
  });

  // A LOW-risk read is not worth taking the assistant offline for, but the
  // gap must be visible rather than assumed away.
  it("lets a read proceed unaudited, and says so on the record", async () => {
    const registry = new ToolRegistry();
    registry.register(tool({ riskLevel: "LOW", requiresConfirmation: false }));
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry),
    );

    expect(record.status).toBe("completed");
    expect(record.audited).toBe(false);
    expect(record.auditFailure).toMatch(/No audit sink is configured/);
  });

  // A denied call is the most interesting row in the log: a run where the
  // model kept trying an unauthorized action looks clean once denials are
  // discarded.
  it("audits denials as well as successes", async () => {
    const registry = new ToolRegistry();
    registry.register(tool({ requiredPermissions: ["talent.export"] }));
    const { events, sink } = recordingSink();

    await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry, { audit: sink, agentName: "test_agent" }),
    );

    expect(events.map((e) => e.action)).toEqual(["agent.tool.denied"]);
    expect(events[0]?.agentName).toBe("test_agent");
    expect(events[0]?.errorDetail).toMatch(/Missing permission/);
  });

  it("audits an unknown tool, so a refused attempt leaves a trace", async () => {
    const { events, sink } = recordingSink();
    await executeToolCall(
      { toolName: "delete_everything", arguments: {} },
      options(new ToolRegistry(), { audit: sink, allowedTools: ["delete_everything"] }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.toolName).toBe("delete_everything");
    expect(events[0]?.status).toBe("denied");
  });

  it("does not let a throwing audit sink become a tool failure", async () => {
    const registry = new ToolRegistry();
    registry.register(tool());
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry, {
        audit: () => {
          throw new Error("audit exploded");
        },
      }),
    );
    expect(record.status).toBe("completed");
    expect(record.audited).toBe(false);
    expect(record.auditFailure).toBe("audit exploded");
  });

  // No fabricated execution.
  it("reports a thrown handler as failed, never as success", async () => {
    const registry = new ToolRegistry();
    registry.register(
      tool({
        handler: async () => {
          throw new Error("database unreachable");
        },
      }),
    );
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry),
    );
    expect(record.status).toBe("failed");
    expect(record.result).toBeNull();
  });

  it("reports a malformed handler outcome as failed", async () => {
    const registry = new ToolRegistry();
    registry.register(
      tool({ handler: async () => "done" as unknown as { ok: true; result: unknown } }),
    );
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry),
    );
    expect(record.status).toBe("failed");
  });

  it("times out a handler that outlives its deadline", async () => {
    const registry = new ToolRegistry();
    registry.register(
      tool({
        handler: () => new Promise(() => undefined),
      }),
    );
    const record = await executeToolCall(
      { toolName: "read_talent_summary", arguments: validArgs },
      options(registry, { timeoutMs: 20 }),
    );
    expect(record.status).toBe("failed");
    expect(record.errorDetail).toMatch(/deadline/);
  });

  it("records a denial rather than discarding it", async () => {
    const registry = new ToolRegistry();
    const record = await executeToolCall(
      { toolName: "unknown_tool", arguments: {} },
      options(registry, { allowedTools: ["unknown_tool"] }),
    );
    // A run that attempted an unauthorized action must not look clean.
    expect(record.toolName).toBe("unknown_tool");
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toBeTruthy();
  });
});

// ===========================================================================
// Provider
// ===========================================================================
describe("provider abstraction", () => {
  it("falls back to a provider that refuses when none is configured", async () => {
    const provider = resolveProvider(null);
    expect(provider.configured).toBe(false);

    const result = await provider.complete({
      model: "none",
      messages: [],
      tools: [],
      maxOutputTokens: 100,
      temperature: 0,
      signal: new AbortController().signal,
      correlationId: "c1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("NOT_CONFIGURED");
  });

  it("does not answer in prose when unconfigured", async () => {
    const result = await new UnconfiguredProvider().complete({
      model: "none",
      messages: [],
      tools: [],
      maxOutputTokens: 100,
      temperature: 0,
      signal: new AbortController().signal,
      correlationId: "c1",
    });
    // A gateway that replied conversationally while no model existed would be
    // fabricating exactly what it governs.
    expect(result.ok).toBe(false);
  });

  it("ignores an unknown provider name rather than trusting it", () => {
    expect(resolveProvider("attacker-supplied").configured).toBe(false);
  });
});

describe("limits", () => {
  it("bounds tool time below request time", () => {
    // One tool must not be able to consume the whole request budget.
    expect(AI_LIMITS.toolTimeoutMs).toBeLessThan(AI_LIMITS.requestTimeoutMs);
  });

  it("caps tool calls per run", () => {
    expect(AI_LIMITS.maxToolCallsPerRun).toBeGreaterThan(0);
    expect(AI_LIMITS.maxToolCallsPerRun).toBeLessThanOrEqual(10);
  });

  it("declares three risk levels", () => {
    expect([...RISK_LEVELS]).toEqual(["LOW", "MEDIUM", "HIGH"]);
  });
});
