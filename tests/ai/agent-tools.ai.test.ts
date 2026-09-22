import { describe, expect, it } from "vitest";

import { executeToolCall } from "@/agents/core/pipeline";
import { ToolRegistry } from "@/agents/core/tool-registry";
import { InMemoryIdempotencyStore } from "@/agents/core/idempotency";
import { embedQuery } from "@/lib/rag/embedding";
import type {
  AgentAuthContext,
  JsonSchema,
  ToolDefinition,
} from "@/agents/core/types";

/**
 * Tool authorization and execution through the governed pipeline.
 *
 * Covers the agent behaviours a review asks about: a valid call, an invalid
 * call, a high-risk approval, a failed tool, a timeout, and a duplicate
 * request.
 */

const UUID = "123e4567-e89b-12d3-a456-426614174000";

const SCHEMA: JsonSchema = {
  type: "object",
  properties: { talentId: { type: "string", format: "uuid" } },
  required: ["talentId"],
  additionalProperties: false,
};

function tool(
  over: Partial<ToolDefinition<never, unknown>> = {},
): ToolDefinition<never, unknown> {
  return {
    name: "read_thing",
    description: "Reads a thing for an authorized person.",
    inputSchema: SCHEMA,
    outputSchema: { type: "object", properties: {}, additionalProperties: false },
    riskLevel: "LOW",
    requiredPermissions: ["talent.read"],
    requiresConfirmation: false,
    reversible: true,
    allowedForAiService: true,
    handler: async () => ({ ok: true, result: { ok: true } }),
    ...over,
  };
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

const workingAudit = async () => ({ ok: true as const, eventId: "1" });

function options(registry: ToolRegistry, over: Record<string, unknown> = {}) {
  return {
    registry,
    auth: auth(),
    allowedTools: ["read_thing"],
    signal: new AbortController().signal,
    log: () => undefined,
    timeoutMs: 1_000,
    audit: workingAudit,
    ...over,
  } as Parameters<typeof executeToolCall>[1];
}

function registryWith(definition: ToolDefinition<never, unknown>): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(definition);
  return registry;
}

describe("Agents: valid tool call", () => {
  it("executes and returns the handler's own result", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registryWith(tool())),
    );
    expect(record.status).toBe("completed");
    expect(record.result).toEqual({ ok: true });
    expect(record.audited).toBe(true);
    expect(record.replayed).toBe(false);
  });
});

describe("Agents: invalid tool call", () => {
  it("denies an unregistered tool, never attempting it", async () => {
    let ran = false;
    const registry = registryWith(
      tool({
        handler: async () => {
          ran = true;
          return { ok: true, result: {} };
        },
      }),
    );
    const record = await executeToolCall(
      { toolName: "delete_everything", arguments: {} },
      options(registry, { allowedTools: ["delete_everything"] }),
    );
    expect(record.status).toBe("denied");
    expect(ran).toBe(false);
  });

  it("denies malformed arguments before the handler runs", async () => {
    let ran = false;
    const registry = registryWith(
      tool({
        handler: async () => {
          ran = true;
          return { ok: true, result: {} };
        },
      }),
    );
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: "not-a-uuid" } },
      options(registry),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/must be a UUID/);
    expect(ran).toBe(false);
  });

  it("denies an unknown argument rather than ignoring it", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID, admin: true } },
      options(registryWith(tool())),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Unknown argument: admin/);
  });

  it("denies a call the caller lacks permission for", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registryWith(tool()), { auth: auth({ permissions: ["ai.use"] }) }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/Missing permission/);
  });

  it("denies an AI identity a tool not marked for it", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registryWith(tool({ allowedForAiService: false })), {
        auth: auth({ isAiService: true }),
      }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/AI service identity/);
  });
});

describe("Agents: high-risk approval", () => {
  const highRisk = () =>
    tool({
      riskLevel: "HIGH",
      requiresConfirmation: true,
      allowedForAiService: false,
    });

  it("stops a high-risk tool for a human and never asks the model", async () => {
    let ran = false;
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(
        registryWith({
          ...highRisk(),
          handler: async () => {
            ran = true;
            return { ok: true, result: {} };
          },
        }),
      ),
    );
    expect(record.status).toBe("denied");
    expect(record.awaitingConfirmation).toBe(true);
    expect(ran).toBe(false);
  });

  it("runs it once a human has confirmed", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registryWith(highRisk()), {
        confirmations: new Set(["read_thing"]),
      }),
    );
    expect(record.status).toBe("completed");
  });

  // CLAUDE.md §16 rule 10.
  it("refuses a confirmed high-risk tool that cannot be audited", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registryWith(highRisk()), {
        confirmations: new Set(["read_thing"]),
        audit: async () => ({ ok: false, error: "log unreachable" }),
      }),
    );
    expect(record.status).toBe("denied");
    expect(record.errorDetail).toMatch(/cannot run unaudited/);
  });

  it("refuses to register a high-risk tool that does not require confirmation", () => {
    expect(() =>
      registryWith(tool({ riskLevel: "HIGH", requiresConfirmation: false })),
    ).toThrow(/requiresConfirmation/);
  });

  it("refuses to expose a non-LOW tool to an AI identity", () => {
    expect(() =>
      registryWith(
        tool({ riskLevel: "MEDIUM", requiresConfirmation: false, allowedForAiService: true }),
      ),
    ).toThrow(/allowedForAiService/);
  });
});

describe("Agents: failed tool", () => {
  it("reports a handler failure as failed, never as success", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(
        registryWith(
          tool({ handler: async () => ({ ok: false, error: "database unreachable" }) }),
        ),
      ),
    );
    expect(record.status).toBe("failed");
    expect(record.result).toBeNull();
    expect(record.errorDetail).toBe("database unreachable");
  });

  it("reports a thrown handler as failed", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(
        registryWith(
          tool({
            handler: async () => {
              throw new Error("boom");
            },
          }),
        ),
      ),
    );
    expect(record.status).toBe("failed");
    expect(record.result).toBeNull();
  });

  it("reports a malformed outcome as failed rather than passing it on", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(
        registryWith(
          tool({ handler: async () => ({ nonsense: true }) as never }),
        ),
      ),
    );
    expect(record.status).toBe("failed");
    expect(record.errorDetail).toMatch(/malformed/i);
  });
});

describe("Agents: timeout", () => {
  it("fails a handler that outlives the deadline", async () => {
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(
        registryWith(tool({ handler: () => new Promise(() => undefined) })),
        { timeoutMs: 25 },
      ),
    );
    expect(record.status).toBe("failed");
    expect(record.errorDetail).toMatch(/deadline/i);
    // Never a plausible result for work that did not finish.
    expect(record.result).toBeNull();
  });

  it("fails when the caller's deadline is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const record = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registryWith(tool()), { signal: controller.signal }),
    );
    expect(record.status).toBe("failed");
  });
});

describe("Agents: duplicate request", () => {
  const consequential = (onCall: () => void) =>
    tool({
      riskLevel: "MEDIUM",
      requiresConfirmation: false,
      allowedForAiService: false,
      handler: async () => {
        onCall();
        return { ok: true, result: { created: "assignment-1" } };
      },
    });

  it("executes a consequential tool once and replays the retry", async () => {
    let calls = 0;
    const registry = registryWith(consequential(() => (calls += 1)));
    const idempotency = new InMemoryIdempotencyStore();

    const first = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency }),
    );
    const second = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency }),
    );

    expect(calls, "a retry must not create a second record").toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);
  });

  it("treats different arguments as different operations", async () => {
    let calls = 0;
    const registry = registryWith(consequential(() => (calls += 1)));
    const idempotency = new InMemoryIdempotencyStore();
    const other = "223e4567-e89b-12d3-a456-426614174000";

    await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency }),
    );
    await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: other } },
      options(registry, { idempotency }),
    );
    expect(calls).toBe(2);
  });

  // Re-running a read is not a duplicate side effect, and caching it would
  // serve stale data while looking like a safety feature.
  it("does not deduplicate reads", async () => {
    let calls = 0;
    const registry = registryWith(
      tool({
        handler: async () => {
          calls += 1;
          return { ok: true, result: { n: calls } };
        },
      }),
    );
    const idempotency = new InMemoryIdempotencyStore();

    await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency }),
    );
    await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency }),
    );
    expect(calls).toBe(2);
  });

  // A failure may legitimately be retried.
  it("does not replay a failure", async () => {
    let calls = 0;
    const registry = registryWith(
      tool({
        riskLevel: "MEDIUM",
        allowedForAiService: false,
        handler: async () => {
          calls += 1;
          return calls === 1
            ? { ok: false as const, error: "transient" }
            : { ok: true as const, result: { created: "assignment-1" } };
        },
      }),
    );
    const idempotency = new InMemoryIdempotencyStore();

    const first = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency }),
    );
    const second = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency }),
    );

    expect(first.status).toBe("failed");
    expect(second.status).toBe("completed");
    expect(calls).toBe(2);
  });

  // Permissions change; replaying a stored denial would keep refusing someone
  // after they were granted access.
  it("re-evaluates rather than replaying a denial", async () => {
    let calls = 0;
    const registry = registryWith(consequential(() => (calls += 1)));
    const idempotency = new InMemoryIdempotencyStore();

    const denied = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency, auth: auth({ permissions: ["ai.use"] }) }),
    );
    const allowed = await executeToolCall(
      { toolName: "read_thing", arguments: { talentId: UUID } },
      options(registry, { idempotency }),
    );

    expect(denied.status).toBe("denied");
    expect(allowed.status).toBe("completed");
    expect(allowed.replayed).toBe(false);
    expect(calls).toBe(1);
  });
});

// ===========================================================================
// Unauthorized retrieval
// ===========================================================================
describe("AI: unauthorized retrieval", () => {
  it("refuses to fabricate an embedding when no provider exists", async () => {
    const result = await embedQuery("why is delivery falling");
    // Not a zero vector: that would retrieve the nearest chunks to an
    // arbitrary point and present them as relevant.
    expect(result.state).toBe("not-integrated");
    if (result.state !== "not-integrated") return;
    expect(result.system).toMatch(/embedding/i);
  });

  it("treats an empty query as empty rather than searching for nothing", async () => {
    const result = await embedQuery("   ");
    expect(result.state).toBe("empty");
  });
});
