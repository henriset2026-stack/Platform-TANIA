import { describe, expect, it } from "vitest";

import { executeToolCall } from "@/agents/core/pipeline";
import { ToolRegistry } from "@/agents/core/tool-registry";
import type { AgentAuthContext, ToolDefinition } from "@/agents/core/types";

/**
 * Tool results are checked against the declared outputSchema before they can
 * reach a model or a person. A handler returning an undeclared field — here a
 * private note smuggled into each row — fails the call, and the result is
 * dropped rather than passed on.
 */

const AUTH: AgentAuthContext = {
  userId: "u1",
  email: "u1@example.test",
  organizationIds: [],
  squadIds: [],
  roles: ["TALENT"],
  permissions: ["talent.read"],
  correlationId: "c1",
  sessionId: "s1",
  isAiService: false,
};

function tool(result: unknown): ToolDefinition<Record<string, never>, unknown> {
  return {
    name: "list_people",
    description: "Lists people in scope.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        people: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, level: { type: "integer", nullable: true } },
            required: ["id"],
          },
        },
      },
      required: ["people"],
      additionalProperties: false,
    },
    riskLevel: "LOW",
    requiredPermissions: ["talent.read"],
    requiresConfirmation: false,
    handler: async () => ({ ok: true, result }),
  };
}

async function run(result: unknown) {
  const registry = new ToolRegistry();
  registry.register(tool(result));
  return executeToolCall(
    { toolName: "list_people", arguments: {} },
    { registry, auth: AUTH, allowedTools: ["list_people"], signal: new AbortController().signal, log: () => {}, timeoutMs: 1000 },
  );
}

describe("tool output schema enforcement", () => {
  it("passes a result that matches the declared shape, including nulls", async () => {
    const record = await run({ people: [{ id: "a", level: 3 }, { id: "b", level: null }] });
    expect(record.status).toBe("completed");
  });

  it("fails a result carrying an undeclared field, and drops it", async () => {
    const record = await run({ people: [{ id: "a", level: 3, privateNote: "manager comment" }] });
    expect(record.status).toBe("failed");
    expect(record.result).toBeNull();
    expect(record.errorDetail).toMatch(/people\[0\]\.privateNote/);
  });

  it("fails a result with the wrong type or a missing required field", async () => {
    expect((await run({ people: [{ id: 7 }] })).status).toBe("failed");
    expect((await run({ people: [{ level: 1 }] })).status).toBe("failed");
    expect((await run({})).status).toBe("failed");
  });
});
