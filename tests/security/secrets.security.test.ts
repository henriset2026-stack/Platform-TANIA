import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { isPublicRoute, loginRedirectPath, PUBLIC_ROUTES } from "@/lib/auth/routes";

const ROOT = join(import.meta.dirname, "..", "..");

function walk(dir: string, extensions: readonly string[]): readonly string[] {
  const full = join(ROOT, dir);
  const out: string[] = [];
  for (const entry of readdirSync(full)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(full, entry);
    if (statSync(path).isDirectory()) {
      out.push(...walk(join(dir, entry), extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(relative(ROOT, path));
    }
  }
  return out;
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/**
 * Source with comments removed.
 *
 * The scan below is for what the code DOES, not what it mentions. Discussing
 * SUPABASE_SERVICE_ROLE_KEY in a comment — which lib/observability/redact.ts
 * does, explaining a bug where the name escaped a word-boundary pattern — is
 * not a secret read, and a test that cannot tell the difference gets
 * allowlisted into uselessness.
 */
function readCode(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/**
 * Source-level security invariants.
 *
 * These read the tree rather than running it. `npm run build` is the real
 * enforcement for the server-only boundary — a client component importing a
 * server module fails the bundler — but a test that names the rule fails
 * faster and says why.
 */

// ===========================================================================
// Secrets stay server-side
// ===========================================================================
describe("secrets: server-only boundary", () => {
  const SERVER_SECRET_READERS = ["lib/supabase/admin.ts", "lib/env.server.ts"];

  /**
   * A module touches the service role if it reads the variable OR imports the
   * accessor. Only checking the former would miss the real shape of this
   * codebase: lib/env.server.ts reads it, and lib/supabase/admin.ts consumes
   * it through serviceRoleKey(), so a third module importing that accessor
   * would be invisible to an env-only scan.
   */
  function touchesServiceRole(path: string): boolean {
    const code = readCode(path);
    return (
      /process\.env\s*(\.\s*(SUPABASE_SERVICE_ROLE_KEY|ENTRA_CLIENT_SECRET)\b|\[\s*["'`](SUPABASE_SERVICE_ROLE_KEY|ENTRA_CLIENT_SECRET)["'`]\s*\])/.test(
        code,
      ) ||
      /\bserviceRoleKey\b|from\s+["']@\/lib\/supabase\/admin["']/.test(code)
    );
  }

  // Guards the guard: if the detector stopped matching, every assertion below
  // would pass by finding nothing.
  it("detects the modules that really do touch the service role", () => {
    expect(touchesServiceRole("lib/env.server.ts"), "env.server.ts reads it").toBe(true);
    expect(touchesServiceRole("lib/supabase/admin.ts"), "admin.ts consumes it").toBe(true);
    expect(touchesServiceRole("lib/auth/policy.ts"), "policy.ts must not").toBe(false);
  });

  it("touches the service role in exactly the two allowlisted modules", () => {
    const offenders = walk("lib", [".ts"])
      .concat(walk("app", [".ts", ".tsx"]))
      .concat(walk("components", [".tsx"]))
      .concat(walk("agents", [".ts"]))
      .filter((path) => !SERVER_SECRET_READERS.includes(path))
      .filter(touchesServiceRole);

    expect(offenders, `unexpected secret readers: ${offenders.join(", ")}`).toEqual([]);
  });

  it("guards each allowlisted module with server-only", () => {
    for (const path of SERVER_SECRET_READERS) {
      expect(read(path), path).toMatch(/import "server-only"/);
    }
  });

  // Never pass the admin client to agent or tool code (CLAUDE.md §2b).
  it("keeps the admin client out of every agent module", () => {
    const offenders = walk("agents", [".ts"]).filter((path) =>
      /supabase\/admin|createAdminClient|serviceRole/i.test(readCode(path)),
    );
    expect(offenders, `agents importing the admin client: ${offenders.join(", ")}`).toEqual([]);
  });

  it("keeps the admin client out of client components", () => {
    const offenders = walk("components", [".tsx"])
      .concat(walk("app", [".tsx"]))
      .filter((path) => {
        const source = readCode(path);
        return source.includes('"use client"') && /supabase\/admin|supabase\/server/.test(source);
      });
    expect(offenders, `client components importing server modules: ${offenders.join(", ")}`).toEqual([]);
  });
});

// ===========================================================================
// No secret is committed
// ===========================================================================
describe("secrets: nothing committed", () => {
  it("ships an .env.example with placeholders and no values", () => {
    const example = read(".env.example");
    // Every assignment is empty or an obvious placeholder.
    for (const line of example.split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!match) continue;
      const value = (match[2] ?? "").trim();
      const placeholder =
        value === "" ||
        /^["']?(<.*>|your[-_ ]|replace|changeme|example|placeholder|\.\.\.)/i.test(value);
      expect(placeholder, `${match[1]} looks like a real value`).toBe(true);
    }
  });

  it("carries no credential shape anywhere in the tracked source", () => {
    const sources = walk("lib", [".ts"])
      .concat(walk("app", [".ts", ".tsx"]))
      .concat(walk("agents", [".ts"]))
      .concat(walk("components", [".tsx"]));

    const patterns: readonly [string, RegExp][] = [
      ["jwt", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./],
      ["openai key", /\bsk-[A-Za-z0-9]{32,}/],
      ["aws key", /\bAKIA[0-9A-Z]{16}\b/],
      ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ];

    for (const path of sources) {
      const source = readCode(path);
      for (const [name, pattern] of patterns) {
        expect(pattern.test(source), `${name} in ${path}`).toBe(false);
      }
    }
  });
});

// ===========================================================================
// Deny by default
// ===========================================================================
describe("route guard: deny by default", () => {
  it("treats an unlisted path as private", () => {
    for (const path of [
      "/dashboard",
      "/talent",
      "/talent/123",
      "/audit",
      "/capability",
      "/performance",
      "/development",
      "/a-route-nobody-has-written-yet",
    ]) {
      expect(isPublicRoute(path), path).toBe(false);
    }
  });

  it("lets only the explicitly listed paths through", () => {
    for (const path of PUBLIC_ROUTES) {
      expect(isPublicRoute(path), path).toBe(true);
    }
  });

  // A new page is private until someone opts it out, so every route directory
  // under app/ is either public by declaration or guarded.
  it("guards every routable directory under app/", () => {
    const routeDirs = readdirSync(join(ROOT, "app"))
      .filter((entry) => statSync(join(ROOT, "app", entry)).isDirectory())
      .filter((entry) => !entry.startsWith("(") && !entry.startsWith("_") && entry !== "api");

    for (const dir of routeDirs) {
      const path = `/${dir}`;
      const declaredPublic = PUBLIC_ROUTES.some(
        (route) => route === path || path.startsWith(`${route}/`),
      );
      expect(isPublicRoute(path), `${path} must be private unless declared public`).toBe(
        declaredPublic,
      );
    }
  });

  it("preserves the destination when redirecting to login", () => {
    const redirect = loginRedirectPath("/talent/123");
    expect(redirect).toContain("/login");
    expect(redirect).toContain("talent");
  });
});
