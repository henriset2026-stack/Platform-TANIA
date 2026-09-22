import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * Screen contracts.
 *
 * These read each page's source rather than rendering it. There is no jsdom
 * in this project and adding a renderer is a larger change than this phase
 * should make, so what is asserted here is what source analysis can honestly
 * establish: that each screen exists, reads through the authorized query
 * layer, and hands DataPoints to components that know how to render a
 * non-live state.
 *
 * What this canNOT establish is that the rendered output is correct or
 * accessible. That needs a browser, and tests/e2e/README.md records the gap
 * rather than letting a green run here imply otherwise.
 */

const SCREENS = [
  { name: "dashboard", path: "app/dashboard/page.tsx" },
  { name: "talent", path: "app/talent/page.tsx" },
  { name: "capability", path: "app/capability/page.tsx" },
  { name: "performance", path: "app/performance/page.tsx" },
  { name: "development", path: "app/development/page.tsx" },
  { name: "audit", path: "app/audit/page.tsx" },
] as const;

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("UI: every screen exists", () => {
  for (const screen of SCREENS) {
    it(`${screen.name} has a page`, () => {
      expect(existsSync(join(ROOT, screen.path)), screen.path).toBe(true);
    });
  }

  // PRD §80: the assistant is persistent, so it belongs in the shell every
  // authenticated screen renders inside, not on individual pages.
  it("renders the assistant from the application shell", () => {
    const shell = read("components/layout/app-shell.tsx");
    expect(shell).toContain("<AssistantMount />");
    expect(shell).toMatch(
      /import\s+\{\s*AssistantMount\s*\}\s+from\s+["']@\/components\/assistant\/assistant-mount["']/,
    );
    expect(existsSync(join(ROOT, "components/assistant/assistant-mount.tsx"))).toBe(true);
  });
});

describe("UI: screens read through the authorized layer", () => {
  for (const screen of SCREENS) {
    it(`${screen.name} imports no Supabase client directly`, () => {
      const source = read(screen.path);
      // Pages compose; lib/*/queries.ts reads. A page building its own client
      // would bypass the place authorization checks live.
      expect(source, screen.path).not.toMatch(/from\s+["']@\/lib\/supabase\/(server|admin|client)["']/);
    });
  }

  it("keeps the admin client out of every page", () => {
    for (const screen of SCREENS) {
      expect(read(screen.path), screen.path).not.toMatch(/supabase\/admin/);
    }
  });
});

describe("UI: screens handle non-live data", () => {
  // A component that takes a DataPoint cannot silently render an empty body
  // when the truth is "not connected", "not authorized" or "failed".
  it("passes DataPoints to data-bearing components rather than arrays", () => {
    for (const screen of SCREENS) {
      const source = read(screen.path);
      if (!source.includes("<DataTable")) continue;
      // data={...} must be a DataPoint-producing expression, never a literal.
      expect(source, screen.path).not.toMatch(/data=\{\s*\[/);
    }
  });

  it("renders no hard-coded metric number", () => {
    for (const screen of SCREENS) {
      const source = read(screen.path);
      // A MetricCard takes a DataPoint; a literal would be a fabricated figure.
      expect(source, screen.path).not.toMatch(/point=\{\s*\{\s*state:\s*"live"/);
    }
  });
});

describe("UI: accessibility contracts the type system enforces", () => {
  it("gives every DataTable a caption", () => {
    for (const screen of SCREENS) {
      const source = read(screen.path);
      const tables = source.match(/<DataTable/g)?.length ?? 0;
      if (tables === 0) continue;
      const captions = source.match(/caption=/g)?.length ?? 0;
      expect(captions, `${screen.path}: ${tables} tables, ${captions} captions`).toBeGreaterThanOrEqual(
        tables,
      );
    }
  });
});
