import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { registerBusinessCaseTools } from "@/agents/business-case/tools";
import { registerCapabilityTools } from "@/agents/capability/tools";
import { toolRegistry, ToolRegistry } from "@/agents/core/tool-registry";
import { registerDevelopmentTools } from "@/agents/development/tools";
import { registerPerformanceTools } from "@/agents/performance/tools";
import { registerProductTools } from "@/agents/product/tools";
import { registerSolutionTools } from "@/agents/solution/tools";
import { DEFAULT_AGENT, WIRED_TOOLS } from "@/lib/ai/gateway";

/**
 * AI Gate #2, step 29: no undocumented production tool.
 *
 * Registers every agent's tools into a fresh registry and compares them with
 * docs/ai/AI_TOOL_REGISTRY.md in both directions.
 */

const DOC = readFileSync(join(import.meta.dirname, "..", "..", "docs", "ai", "AI_TOOL_REGISTRY.md"), "utf8");
const documented = new Set([...DOC.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]!));

function everyTool(): ToolRegistry {
  const registry = new ToolRegistry();
  registerBusinessCaseTools(registry);
  registerCapabilityTools(registry);
  registerDevelopmentTools(registry);
  registerPerformanceTools(registry);
  registerProductTools(registry);
  registerSolutionTools(registry);
  return registry;
}

describe("AI tool registry is documented", () => {
  const registered = everyTool().list();

  it("documents every registered tool", () => {
    expect(registered.map((t) => t.name).filter((name) => !documented.has(name))).toEqual([]);
  });

  it("documents no tool that does not exist", () => {
    const names = new Set(registered.map((t) => t.name));
    expect([...documented].filter((name) => !names.has(name))).toEqual([]);
  });

  it("matches the documented risk and permissions of every tool", () => {
    for (const tool of registered) {
      const row = DOC.split("\n").find((line) => line.startsWith(`| \`${tool.name}\` |`))!;
      const cells = row.split("|").map((cell) => cell.trim());
      expect(cells[4], tool.name).toBe(tool.requiredPermissions.join(", "));
      expect(cells[6], tool.name).toBe(tool.riskLevel);
    }
  });

  it("contains no write, approval or confirmation-requiring tool today", () => {
    expect(registered.filter((t) => t.riskLevel !== "LOW" || t.requiresConfirmation).map((t) => t.name)).toEqual([]);
  });

  it("gives every tool at least one required permission", () => {
    expect(registered.filter((t) => t.requiredPermissions.length === 0).map((t) => t.name)).toEqual([]);
  });

  // The gateway's assistant may reach exactly the tools the document marks
  // "Wired", and nothing else is in its registry for a model to name.
  it("wires exactly the documented tools into the assistant", () => {
    const wiredInDoc = DOC.split("\n")
      .filter((line) => /^\| `[a-z_]+` \|/.test(line) && line.trim().endsWith("| Yes |"))
      .map((line) => line.match(/`([a-z_]+)`/)![1]!);
    expect([...WIRED_TOOLS].sort()).toEqual(wiredInDoc.sort());
    expect([...DEFAULT_AGENT.tools].sort()).toEqual([...WIRED_TOOLS].sort());
    expect(toolRegistry.list().map((t) => t.name).sort()).toEqual([...WIRED_TOOLS].sort());
    for (const name of WIRED_TOOLS) expect(toolRegistry.get(name)?.riskLevel).toBe("LOW");
  });
});
