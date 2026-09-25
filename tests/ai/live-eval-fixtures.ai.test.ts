import { describe, expect, it } from "vitest";

import { registerCapabilityTools } from "@/agents/capability/tools";
import { validateOutput } from "@/agents/core/schema";
import { ToolRegistry } from "@/agents/core/tool-registry";
import { registerDevelopmentTools } from "@/agents/development/tools";
import { registerPerformanceTools } from "@/agents/performance/tools";
import { WIRED_TOOLS } from "@/lib/ai/gateway";

import { CANNED, SAMPLE_ARGUMENTS, TALENT_OTHER, withCannedHandlers } from "../ai-live/canned";

/**
 * The live evaluation (tests/ai-live) scores a real model against canned tool
 * data. That suite only runs with a provider key, so its fixtures are checked
 * here, hermetically: if a tool's output schema changes, the canned data
 * fails now instead of producing a failed tool call inside a paid run.
 */

const registry = new ToolRegistry();
const wrapped = withCannedHandlers(registry);
registerCapabilityTools(wrapped);
registerPerformanceTools(wrapped);
registerDevelopmentTools(wrapped);

describe("live evaluation fixtures", () => {
  it("covers exactly the wired tools", () => {
    expect(Object.keys(CANNED).sort()).toEqual([...WIRED_TOOLS].sort());
    expect(registry.list().map((t) => t.name).sort()).toEqual([...WIRED_TOOLS].sort());
  });

  it.each([...WIRED_TOOLS])("%s: every canned result matches the declared output schema", async (name) => {
    const tool = registry.get(name)!;
    let succeeded = 0;
    for (const args of SAMPLE_ARGUMENTS) {
      const outcome = await tool.handler(args as never, {} as never);
      if (!outcome.ok) continue;
      succeeded += 1;
      const shape = validateOutput(tool.outputSchema, outcome.result);
      expect(shape.valid ? [] : shape.errors, `${name} ${JSON.stringify(args)}`).toEqual([]);
    }
    expect(succeeded).toBeGreaterThan(0);
  });

  it("refuses an out-of-scope profile the way canAccessTalent does", async () => {
    for (const name of WIRED_TOOLS) {
      const tool = registry.get(name)!;
      const required = tool.inputSchema.required ?? [];
      if (!required.includes("talentId")) continue;
      const outcome = await tool.handler({ talentId: TALENT_OTHER, capabilityId: TALENT_OTHER } as never, {} as never);
      expect(outcome.ok, name).toBe(false);
    }
  });
});
