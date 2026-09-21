import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static assertions over the migration chain.
 *
 * These are not a substitute for running the migrations — no database exists
 * yet — but they do catch the specific regressions that
 * TANIA_IMPLEMENTATION_BASELINE.md recorded as critical, so the escalation
 * path cannot silently reappear.
 */
const DIR = join(import.meta.dirname, "..", "..", "supabase", "migrations");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const ALL = FILES.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");

/**
 * Migration text with `--` comments removed.
 *
 * Required for "must not contain" assertions: the migrations quote the unsafe
 * statements they replace, so a naive match would fire on the commentary
 * rather than on executable SQL.
 */
const SQL = ALL.split("\n")
  .map((line) => {
    const i = line.indexOf("--");
    return i === -1 ? line : line.slice(0, i);
  })
  .join("\n");

/** Tables created by the Phase 2 chain. */
const PHASE2_TABLES = [
  "organizations",
  "profiles",
  "squads",
  "roles",
  "permissions",
  "role_permissions",
  "organization_memberships",
  "audit_logs",
];

describe("migration chain", () => {
  it("is ordered and uniquely versioned", () => {
    expect(FILES.length).toBeGreaterThan(0);
    const versions = FILES.map((f) => f.split("_")[0] ?? "");
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort());
  });

  it("enables row level security on every Phase 2 table", () => {
    for (const table of PHASE2_TABLES) {
      expect(
        ALL,
        `${table} has no ENABLE ROW LEVEL SECURITY`,
      ).toContain(`alter table public.${table} enable row level security`);
    }
  });

  // TANIA_IMPLEMENTATION_BASELINE.md §7.1 — the privilege escalation path.
  it("restricts organization_memberships writes to SUPER_ADMIN / admin.users", () => {
    for (const command of ["insert", "update", "delete"]) {
      const policy = new RegExp(
        `create policy organization_memberships_${command}[\\s\\S]*?;`,
        "i",
      );
      const match = ALL.match(policy);
      expect(match, `no ${command} policy on organization_memberships`).toBeTruthy();
      const body = match?.[0] ?? "";
      expect(body).toMatch(/has_role\('SUPER_ADMIN'\)/);
      expect(body).toMatch(/has_permission\('admin\.users'\)/);
    }
  });

  // §7.4 — the blanket grant must not reappear.
  it("never grants write access on all tables to authenticated", () => {
    expect(SQL).not.toMatch(
      /grant\s+[^;]*\b(insert|update|delete)\b[^;]*on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+authenticated/i,
    );
  });

  // §7.3 — the audit trail must stay append-only.
  it("creates no UPDATE or DELETE policy on audit_logs", () => {
    expect(SQL).not.toMatch(/create policy\s+\S+\s+on public\.audit_logs\s+for update/i);
    expect(SQL).not.toMatch(/create policy\s+\S+\s+on public\.audit_logs\s+for delete/i);
    expect(SQL).toMatch(/revoke insert, update, delete on public\.audit_logs from authenticated/i);
  });

  it("pins search_path on every SECURITY DEFINER function", () => {
    const definers = ALL.split(/create or replace function/i).slice(1)
      .filter((body) => /security definer/i.test(body));
    expect(definers.length).toBeGreaterThan(0);
    for (const body of definers) {
      const head = body.slice(0, body.indexOf("$$"));
      expect(head, `SECURITY DEFINER without pinned search_path: ${head.slice(0, 80)}`)
        .toMatch(/set search_path\s*=\s*''/);
    }
  });

  // No helper may take a caller-supplied identity (CLAUDE.md §10).
  it("derives every authorization helper from auth.uid()", () => {
    for (const fn of [
      "has_role",
      "has_permission",
      "user_org_ids",
      "user_squad_ids",
      "current_user_roles",
      "current_user_permissions",
    ]) {
      const match = ALL.match(
        new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$`, "i"),
      );
      expect(match, `${fn} not found`).toBeTruthy();
      expect(match?.[0], `${fn} does not scope to auth.uid()`).toContain("auth.uid()");
    }
  });

  it("indexes the columns the policy helpers read", () => {
    for (const idx of [
      "organization_memberships (user_id)",
      "role_permissions (role_id)",
      "profiles (chapter_id)",
      "profiles (squad_id)",
      "squads (manager_id)",
    ]) {
      expect(ALL, `missing index on ${idx}`).toContain(`on public.${idx}`);
    }
  });
  // Phase 3 — AI identities must be unable to write at the database level,
  // not merely refused by lib/auth/policy.ts.
  it("denies AI_SERVICE writes with RESTRICTIVE policies on every Phase 2 table", () => {
    expect(SQL).toContain("create or replace function public.is_ai_service()");
    for (const command of ["insert", "update", "delete"]) {
      expect(
        SQL,
        `no restrictive ${command} guard for AI_SERVICE`,
      ).toMatch(
        new RegExp(`as restrictive for ${command}[\\s\\S]{0,160}is_ai_service`, "i"),
      );
    }
  });

  // Separation of duties: a privilege change always needs a second person.
  it("forbids granting a membership to oneself", () => {
    expect(SQL).toMatch(/memberships_no_self_grant_insert/);
    expect(SQL).toMatch(/user_id <> auth\.uid\(\)/);
  });
});
