/**
 * Tool registry.
 *
 * A CLOSED registry. A tool name the model produces that is not registered is
 * denied, never attempted and never forwarded anywhere. There is no dynamic
 * lookup, no name-to-function mapping derived from model output, and no
 * "execute arbitrary" escape hatch — the absence of one is the point
 * (CLAUDE.md §32, AGENTS.md §7).
 *
 * Registration validates the contract, so a tool cannot enter the system
 * unclassified. These checks run at startup rather than at call time: a
 * misconfigured tool should fail to load, not fail during someone's request.
 */

import type { ToolDefinition } from "@/agents/core/types";

export class ToolRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRegistrationError";
  }
}

const NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;

/** Names a tool may never take, to stop a registry entry shadowing a control. */
const RESERVED_NAMES = new Set([
  "execute",
  "eval",
  "sql",
  "query",
  "fetch",
  "shell",
  "exec",
  "admin",
  "raw",
]);

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<never, unknown>>();

  register<TArgs, TResult>(tool: ToolDefinition<TArgs, TResult>): void {
    if (!NAME_RE.test(tool.name)) {
      throw new ToolRegistrationError(
        `Invalid tool name "${tool.name}": must be lower_snake_case, 3-64 chars.`,
      );
    }
    if (RESERVED_NAMES.has(tool.name)) {
      throw new ToolRegistrationError(
        `Tool name "${tool.name}" is reserved. A tool must describe a bounded capability, not a general execution primitive.`,
      );
    }
    if (this.tools.has(tool.name)) {
      throw new ToolRegistrationError(`Tool "${tool.name}" is already registered.`);
    }
    if (tool.description.trim().length < 10) {
      throw new ToolRegistrationError(
        `Tool "${tool.name}" needs a description: the model selects tools by description, so a vague one causes misuse.`,
      );
    }
    if (tool.inputSchema.additionalProperties !== false) {
      throw new ToolRegistrationError(
        `Tool "${tool.name}" must set additionalProperties: false. Unknown arguments must be rejected, not ignored.`,
      );
    }
    // A HIGH-risk tool that does not require confirmation would let an agent
    // take a consequential action unattended (PRD §58).
    if (tool.riskLevel === "HIGH" && !tool.requiresConfirmation) {
      throw new ToolRegistrationError(
        `Tool "${tool.name}" is HIGH risk and must set requiresConfirmation: true.`,
      );
    }
    // An unguarded mutating tool is a privilege escalation waiting to happen.
    if (tool.riskLevel !== "LOW" && tool.requiredPermissions.length === 0) {
      throw new ToolRegistrationError(
        `Tool "${tool.name}" is ${tool.riskLevel} risk and must declare at least one required permission.`,
      );
    }
    if (tool.allowedForAiService && tool.riskLevel !== "LOW") {
      throw new ToolRegistrationError(
        `Tool "${tool.name}" cannot be allowedForAiService above LOW risk. An AI identity may read and analyse only (AGENTS.md §9).`,
      );
    }

    this.tools.set(tool.name, tool as unknown as ToolDefinition<never, unknown>);
  }

  /** Returns undefined for an unknown name. Callers must treat that as a denial. */
  get(name: string): ToolDefinition<never, unknown> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Tools an agent may use, intersected with what it declared. */
  forAgent(toolNames: readonly string[]): readonly ToolDefinition<never, unknown>[] {
    return toolNames
      .map((name) => this.tools.get(name))
      .filter((tool): tool is ToolDefinition<never, unknown> => tool !== undefined);
  }

  list(): readonly ToolDefinition<never, unknown>[] {
    return [...this.tools.values()];
  }

  get size(): number {
    return this.tools.size;
  }
}

/**
 * The process-wide registry.
 *
 * Deliberately EMPTY in Phase 13. No domain tools exist yet, so no tool can
 * be invoked — the gateway is built and governed before anything can act
 * through it.
 */
export const toolRegistry = new ToolRegistry();
