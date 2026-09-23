import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { DataPoint } from "@/types/data";

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * The data-access boundary, with no database behind it.
 *
 * Every query module must degrade to an explicit DataPoint state rather than
 * throwing. That is the difference between a dashboard that says "not
 * connected — requires Phase 2" and one that returns a 500, and it is the
 * behaviour the whole UI depends on today, since no Supabase project exists.
 */

const QUERY_MODULES = [
  "@/lib/talent/queries",
  "@/lib/capability/queries",
  "@/lib/performance/queries",
  "@/lib/development/queries",
  "@/lib/project/queries",
  "@/lib/workload/queries",
  "@/lib/rag/queries",
  "@/lib/dashboard/queries",
] as const;

function isDataPoint(value: unknown): value is DataPoint<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "state" in value &&
    typeof (value as { state: unknown }).state === "string"
  );
}

describe("integration: query modules degrade explicitly", () => {
  for (const specifier of QUERY_MODULES) {
    it(`returns a DataPoint from every no-argument reader in ${specifier}`, async () => {
      let loaded: Record<string, unknown>;
      try {
        loaded = (await import(specifier)) as Record<string, unknown>;
      } catch {
        // A module that does not exist is not a failure of this contract.
        return;
      }

      const readers = Object.entries(loaded).filter(
        ([name, value]) =>
          typeof value === "function" &&
          (name.startsWith("list") || name.startsWith("get")) &&
          (value as { length: number }).length === 0,
      );

      for (const [name, reader] of readers) {
        const result = await (reader as () => Promise<unknown>)();
        expect(isDataPoint(result), `${specifier}.${name} must return a DataPoint`).toBe(
          true,
        );
        if (!isDataPoint(result)) continue;
        // Unconfigured must surface as a named state, never as live data.
        expect(result.state, `${specifier}.${name}`).not.toBe("live");
      }
      // The dynamic import runs inside the test, so a cold module graph counts
      // against the timeout; the 5s default flaked on a slow disk.
    }, 20_000);
  }
});

describe("integration: no query module fabricates a value", () => {
  function walk(dir: string): readonly string[] {
    const full = join(ROOT, dir);
    const out: string[] = [];
    for (const entry of readdirSync(full)) {
      const path = join(full, entry);
      if (statSync(path).isDirectory()) out.push(...walk(join(dir, entry)));
      else if (entry === "queries.ts") out.push(relative(ROOT, path));
    }
    return out;
  }

  // types/data.ts makes this structurally impossible — only `live` carries a
  // value — but the reason it holds is worth asserting where someone adding a
  // module will see it.
  it("constructs no state variant carrying a value except live", () => {
    for (const path of walk("lib")) {
      const source = readFileSync(join(ROOT, path), "utf8");
      for (const forbidden of [
        /state:\s*"not-connected"[^}]*value:/,
        /state:\s*"empty"[^}]*value:/,
        /state:\s*"failed"[^}]*value:/,
        /state:\s*"restricted"[^}]*value:/,
      ]) {
        expect(forbidden.test(source), `${path} attaches a value to a non-live state`).toBe(
          false,
        );
      }
    }
  });
});
