import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SECURITY GATE #1 — static guards on the HTTP surface
 * (docs/security/SECURITY_TEST_MATRIX.md). The database-level attacks live
 * in tests/rls/security-gate.rls.test.ts; these keep the application layer
 * from growing the surfaces the gate verified are absent.
 */

const ROOT = join(import.meta.dirname, "..", "..");

function walk(dir: string, match: (file: string) => boolean): string[] {
  const full = join(ROOT, dir);
  const out: string[] = [];
  for (const entry of readdirSync(full)) {
    const path = join(full, entry);
    if (statSync(path).isDirectory()) out.push(...walk(relative(ROOT, path), match));
    else if (match(entry)) out.push(relative(ROOT, path));
  }
  return out;
}

const routeHandlers = walk("app", (f) => f === "route.ts");
const serverActions = [...walk("app", (f) => f.endsWith(".ts") || f.endsWith(".tsx")), ...walk("lib", (f) => f.endsWith(".ts"))]
  .filter((file) => /^["']use server["'];?/m.test(readFileSync(join(ROOT, file), "utf8")));
const entryPoints = [...routeHandlers, ...serverActions];

describe("SECURITY GATE #1: HTTP surface", () => {
  it("has the entry points the gate reviewed, and no others", () => {
    // A new route or action must be reviewed and added here deliberately.
    expect(entryPoints.sort()).toEqual(
      [
        "app/(auth)/login/actions.ts",
        "app/api/ai/chat/route.ts",
        "app/auth/callback/route.ts",
        "app/auth/signout/route.ts",
      ].sort(),
    );
  });

  // API-003: report.export / talent.export / performance.export exist in the
  // catalog but nothing implements them. An export surface must arrive with
  // its own authorization and audit, not appear unreviewed.
  it("API-003 exposes no export endpoint", () => {
    for (const file of entryPoints) {
      expect(file.toLowerCase(), file).not.toMatch(/export|download|csv/);
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/text\/csv|content-disposition/i);
    }
  });

  // Rule 8: identity and scope come from the verified session, never the request.
  it("no entry point reads identity, role or scope from the request", () => {
    const forbidden =
      /(body|params|searchParams|formData|query)\s*(\.|\?\.|\.get\(\s*["'])\s*(user_?id|userId|role|roles|permissions?|organization_?id|chapter_?id|squad_?id)\b/i;
    for (const file of entryPoints) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(forbidden);
    }
  });

  // SG-08: lib/status.ts holds internal engineering notes, including security
  // defect descriptions. A client import shipped them to every browser.
  it("no client component imports internal status notes", () => {
    const clientFiles = [...walk("app", (f) => f.endsWith(".tsx")), ...walk("components", (f) => f.endsWith(".tsx"))]
      .filter((file) => /^["']use client["'];?/m.test(readFileSync(join(ROOT, file), "utf8")));
    for (const file of clientFiles) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/from\s+["'][^"']*lib\/(status|navigation-availability)["']/);
    }
  });

  it("no entry point imports the service-role client", () => {
    for (const file of entryPoints) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/supabase\/admin|serviceRoleKey/);
    }
  });
});
