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

/** Every table the migration chain creates. */
const PHASE4_TABLES = [
  "talent_profiles", "projects", "assignments", "deliverables",
  "capability_domains", "capabilities", "capability_levels",
  "capability_requirements", "talent_capabilities", "capability_evidence",
  "performance_periods", "performance_metrics", "performance_evidence",
  "performance_reviews",
  "development_plans", "learning_paths", "learning_activities", "learning_evidence",
  "ai_usage", "ai_assessments", "ai_augmentation", "ai_interactions",
  "agent_runs", "agent_tool_calls", "recommendations",
  "business_impacts", "knowledge_documents",
];

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

  // A reviewer once approved their own submission and forged approved_by
  // (tests/rls/matrix-extended.rls.test.ts). Only a trigger sees OLD and NEW.
  it("guards performance review decisions with a trigger", () => {
    expect(SQL).toMatch(
      /create trigger performance_reviews_guard_decision\s+before insert or update on public\.performance_reviews/i,
    );
    expect(SQL).toMatch(/has_permission\('performance\.approve_review'\)/);
    expect(SQL).toMatch(/new\.approved_by is distinct from auth\.uid\(\)/);
  });

  it("guards development plan and assignment approvals the same way", () => {
    expect(SQL).toMatch(
      /create trigger development_plans_guard_approval\s+before insert or update on public\.development_plans/i,
    );
    expect(SQL).toMatch(/has_permission\('development\.approve'\)/);
    expect(SQL).toMatch(
      /create trigger assignments_guard_approval\s+before insert or update on public\.assignments/i,
    );
    expect(SQL).toMatch(/has_permission\('assignment\.approve'\)/);
  });

  // SECURITY GATE #1 (migration 20260924100004). Each was an attack that
  // succeeded against the live database before the fix.
  it("keeps the Security Gate #1 controls in place", () => {
    expect(SQL).toMatch(/revoke truncate, references, trigger on public\.%I from anon, authenticated/);
    expect(SQL).toMatch(/memberships_grant_ceiling_insert[\s\S]{0,200}user_admin_org_ids\(\)[\s\S]{0,120}is_protected_role/);
    expect(SQL).toMatch(/'SUPER_ADMIN', 'EXECUTIVE', 'AI_SERVICE'/);
    expect(SQL).toMatch(/create trigger profiles_guard_scope_fields\s+before insert or update on public\.profiles/);
    for (const table of ["performance_evidence", "capability_evidence", "business_impacts", "ai_assessments"]) {
      expect(SQL).toMatch(new RegExp(`create trigger ${table}_guard_validation\\s+before insert or update on public\\.${table}`));
    }
    expect(SQL).toMatch(/create trigger talent_capabilities_guard_assessment/);
    expect(SQL).toMatch(/create trigger learning_evidence_guard_evaluation/);
    for (const table of ["organization_memberships", "role_permissions", "roles", "permissions"]) {
      expect(SQL).toMatch(new RegExp(`create trigger ${table}_audit\\s+after insert or update or delete on public\\.${table}`));
    }
    // SG-09: nobody writes their own AI augmentation scores.
    expect(SQL).toMatch(/ai_augmentation_no_self_insert[\s\S]{0,120}profile_id <> auth\.uid\(\)/);
  });

  // Executive aggregates: no caller-supplied scope, AI excluded, and nothing
  // below five people (TANIA_RBAC_RLS_MATRIX.md §9 "Executive → aggregate").
  it("exposes chapter aggregates without parameters, AI access, or small groups", () => {
    for (const fn of ["chapter_summary", "chapter_capability_summary"]) {
      const body = ALL.match(
        new RegExp(`create or replace function public\\.${fn}\\(\\)[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$`, "i"),
      )?.[0];
      expect(body, `${fn} must exist and take no parameters`).toBeTruthy();
      expect(body).toMatch(/not public\.is_ai_service\(\)/);
      expect(body).toMatch(/has_permission\('report\.read'\)/);
      expect(body).toMatch(/< 5 then null/);
    }
  });
  // ---------------------------------------------------------------------
  // Phase 4
  // ---------------------------------------------------------------------
  it("enables row level security on every Phase 4 table", () => {
    for (const table of PHASE4_TABLES) {
      expect(SQL, `${table} has no ENABLE ROW LEVEL SECURITY`).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("creates every Phase 4 table exactly once", () => {
    for (const table of PHASE4_TABLES) {
      const matches = SQL.match(
        new RegExp(`create table if not exists public\\.${table}\\b`, "g"),
      );
      expect(matches?.length, `${table} created ${matches?.length ?? 0} times`).toBe(1);
    }
  });

  // Identity and audit tables belong to Phase 2 and must not be redefined.
  it("does not redefine Phase 2 tables in Phase 4", () => {
    for (const table of PHASE2_TABLES) {
      const matches = SQL.match(
        new RegExp(`create table if not exists public\\.${table}\\b`, "g"),
      );
      expect(matches?.length, `${table} duplicated`).toBe(1);
    }
  });

  // TANIA_IMPLEMENTATION_BASELINE.md §7.2 — the RAG corpus must be protected.
  it("protects knowledge_documents with RLS and restricts ingestion", () => {
    expect(SQL).toContain("alter table public.knowledge_documents enable row level security");
    const write = SQL.match(
      /create policy knowledge_documents_write[\s\S]*?;/i,
    )?.[0] ?? "";
    expect(write).toMatch(/admin\.integrations/);
  });

  // §7.6 — capability_levels must be administrable, not read-only.
  it("gives capability_levels a write policy", () => {
    expect(SQL).toMatch(/capability_levels.*_admin|_admin.*capability_levels/s);
    expect(SQL).toMatch(/admin\.capabilities/);
  });

  it("extends the AI write ban to Phase 4 tables", () => {
    for (const table of [
      "performance_evidence",
      "talent_capabilities",
      "business_impacts",
      "knowledge_documents",
    ]) {
      expect(SQL, `${table} not in the AI write-ban list`).toContain(`'${table}'`);
    }
    expect(SQL).toMatch(/ai_no_insert_/);
    expect(SQL).toMatch(/ai_no_approval_performance_reviews/);
  });

  // Evidence must be withdrawable, never erasable (rule 11).
  it("soft-deletes evidence tables and revokes hard delete", () => {
    for (const table of [
      "capability_evidence",
      "performance_evidence",
      "learning_evidence",
      "business_impacts",
    ]) {
      expect(SQL, `${table} has no deleted_at`).toMatch(
        new RegExp(`create table if not exists public\\.${table}[\\s\\S]*?deleted_at timestamptz`),
      );
      expect(SQL, `${table} still allows hard delete`).toContain(
        `revoke delete on public.${table} from authenticated`,
      );
    }
  });

  it("indexes every Phase 4 foreign key used by a policy", () => {
    for (const idx of [
      "assignments (project_id, profile_id)",
      "talent_capabilities (profile_id)",
      "performance_evidence (profile_id)",
      "development_plans (profile_id)",
      "agent_tool_calls (agent_run_id)",
    ]) {
      expect(SQL, `missing index on ${idx}`).toContain(`on public.${idx}`);
    }
  });

  // PRD §6.1 / CLAUDE.md §16: weights are configuration, not policy.
  it("seeds no performance dimension weights", () => {
    const seed = readFileSync(
      join(import.meta.dirname, "..", "..", "supabase", "seed", "01_reference.sql"),
      "utf8",
    );
    expect(seed).not.toMatch(/insert into public\.performance_metrics/i);
    expect(seed).not.toMatch(/\b0\.25\b|\b25%\b/);
  });

  // Sample data must be unable to reach a real database.
  it("guards the development sample seed", () => {
    const sample = readFileSync(
      join(import.meta.dirname, "..", "..", "supabase", "seed", "02_dev_sample.sql"),
      "utf8",
    );
    expect(sample).toMatch(/tania_allow_sample_data/);
    expect(sample).toMatch(/REFUSED/);
    expect(sample).not.toMatch(/insert into public\.profiles/i);
  });
});
