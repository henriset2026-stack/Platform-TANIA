import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SEED_DIR = join(ROOT, "supabase", "seed");
const MIGRATION_DIR = join(ROOT, "supabase", "migrations");

const demo = readFileSync(join(SEED_DIR, "03_demo_dataset.sql"), "utf8");
const reset = readFileSync(join(SEED_DIR, "99_reset_demo.sql"), "utf8");
const runner = readFileSync(join(ROOT, "scripts", "db.mjs"), "utf8");

const migrations = readdirSync(MIGRATION_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATION_DIR, f), "utf8"))
  .join("\n");

/** SQL with `--` comments removed, so prose never satisfies an assertion. */
function code(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const demoCode = code(demo);
const resetCode = code(reset);

/**
 * Columns each table actually has, read from the migrations.
 *
 * No database exists, so the seed cannot be executed and a mistyped column
 * would sit undiscovered until someone provisioned a project. Checking the
 * seed against the migration text is the strongest verification available
 * without a server, and it catches the class of error that matters most
 * here: a column that is not there.
 */
function columnsByTable(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  const createRe = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
  for (const match of migrations.matchAll(createRe)) {
    const [, table, body] = match;
    if (!table || !body) continue;
    const columns = new Set<string>();
    for (const line of code(body).split("\n")) {
      const column =
        /^\s{2}([a-z_]+)\s+(uuid|text|integer|bigint|boolean|numeric|jsonb|date|timestamptz)/.exec(
          line,
        );
      if (column?.[1]) columns.add(column[1]);
    }
    tables.set(table, columns);
  }

  for (const match of migrations.matchAll(/alter table public\.(\w+)([\s\S]*?);/g)) {
    const [, table, body] = match;
    if (!table || !body) continue;
    const existing = tables.get(table);
    if (!existing) continue;
    for (const added of body.matchAll(/add column if not exists (\w+)/g)) {
      if (added[1]) existing.add(added[1]);
    }
  }

  return tables;
}

/** Every `insert into public.X (a, b, c)` in a seed file. */
function seedInserts(
  sql: string,
): readonly { table: string; columns: readonly string[] }[] {
  const out: { table: string; columns: string[] }[] = [];
  const re = /insert into public\.(\w+)\s*\(([\s\S]*?)\)\s*(?:values|select)/g;
  for (const match of code(sql).matchAll(re)) {
    const [, table, columnBlock] = match;
    if (!table || !columnBlock) continue;
    out.push({
      table,
      columns: columnBlock
        .split(",")
        .map((c) => c.trim())
        .filter((c) => /^[a-z_]+$/.test(c)),
    });
  }
  return out;
}

// ===========================================================================
// The seed agrees with the schema
// ===========================================================================
describe("demo seed: agrees with the migrations", () => {
  const schema = columnsByTable();
  const inserts = seedInserts(demo);

  // Guards the guard: if either parser broke, every check below would pass by
  // iterating nothing.
  it("reads a schema and a set of inserts at all", () => {
    expect(schema.size).toBeGreaterThan(20);
    expect(inserts.length).toBeGreaterThanOrEqual(12);
  });

  it("inserts only into tables the migrations create", () => {
    for (const { table } of inserts) {
      expect(schema.has(table), `unknown table: ${table}`).toBe(true);
    }
  });

  it("names only columns those tables have", () => {
    for (const { table, columns } of inserts) {
      const known = schema.get(table);
      if (!known) continue;
      for (const column of columns) {
        expect(known.has(column), `${table}.${column} does not exist`).toBe(true);
      }
    }
  });

  it("covers every domain the dataset promises", () => {
    const tables = new Set(inserts.map((i) => i.table));
    for (const required of [
      "organizations",
      "squads",
      "profiles",
      "talent_profiles",
      "capabilities",
      "capability_requirements",
      "talent_capabilities",
      "capability_evidence",
      "projects",
      "assignments",
      "performance_periods",
      "performance_metrics",
      "performance_evidence",
      "performance_reviews",
      "development_plans",
      "learning_paths",
      "learning_activities",
      "learning_evidence",
      "ai_usage",
      "business_impacts",
    ]) {
      expect(tables.has(required), `no demo data for ${required}`).toBe(true);
    }
  });

  // Capability LEVELS are PRD framework data, not demo content.
  it("leaves capability levels to the reference seed", () => {
    expect(demoCode).not.toMatch(/insert into public\.capability_levels/);
    const reference = readFileSync(join(SEED_DIR, "01_reference.sql"), "utf8");
    expect(reference).toMatch(/insert into public\.capability_levels/);
  });
});

// ===========================================================================
// Deterministic
// ===========================================================================
describe("demo seed: deterministic", () => {
  it("uses no non-deterministic function", () => {
    for (const forbidden of [
      /gen_random_uuid\s*\(/i,
      /\brandom\s*\(/i,
      /\bnow\s*\(\)/i,
      /current_timestamp/i,
      /current_date/i,
      /clock_timestamp/i,
    ]) {
      expect(demoCode, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("hard-codes every primary key under one recognisable prefix", () => {
    const uuids =
      demoCode.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) ?? [];
    expect(uuids.length).toBeGreaterThan(5);
    for (const uuid of uuids) {
      // The one exception is GoTrue's zero instance_id.
      const ok =
        uuid.startsWith("'decafbad-") ||
        uuid === "'00000000-0000-0000-0000-000000000000'";
      expect(ok, `${uuid} is neither a demo key nor the null instance id`).toBe(true);
    }
  });

  it("builds generated keys from the same prefix", () => {
    const built = demoCode.match(/'decafbad-[0-9a-f]{4}-4000-8000-' \|\| lpad/g) ?? [];
    expect(built.length).toBeGreaterThan(8);
  });
});

// ===========================================================================
// Synthetic and marked
// ===========================================================================
describe("demo seed: synthetic and clearly marked", () => {
  // Addresses are built by concatenation, so the domain appears on its own:
  // '@demo.invalid' with nothing before the @. Matching the domain rather
  // than a whole address is what actually checks the property.
  it("uses only the reserved .invalid domain for addresses", () => {
    const domains = demoCode.match(/@[A-Za-z0-9.-]+/g) ?? [];
    expect(domains.length).toBeGreaterThan(0);
    for (const domain of domains) {
      expect(domain, `${domain} is not a reserved address`).toBe("@demo.invalid");
    }
  });

  it("contains no real corporate or consumer domain", () => {
    for (const domain of [
      /telkom\.co\.id/i,
      /telkom\.com/i,
      /@gmail\./i,
      /@outlook\./i,
      /@yahoo\./i,
    ]) {
      expect(demo, String(domain)).not.toMatch(domain);
    }
  });

  it("prefixes every code it inserts with DEMO-", () => {
    const codes = demoCode.match(/'(DEMO|SAMPLE)-[A-Z0-9-]+'/g) ?? [];
    expect(codes.length).toBeGreaterThan(10);
    for (const value of codes) {
      expect(value.startsWith("'DEMO-"), `${value} is not DEMO-prefixed`).toBe(true);
    }
  });

  it("labels the organization and the people as demo", () => {
    expect(demoCode).toMatch(/DEMO Chapter/);
    expect(demoCode).toMatch(/'Demo ' \|\|/);
  });
});

// ===========================================================================
// The demo identities cannot authenticate
// ===========================================================================
describe("demo seed: demo accounts cannot log in", () => {
  it("bans every demo identity outright", () => {
    expect(demoCode).toMatch(/banned_until/);
    expect(demoCode).toMatch(/'infinity'/);
  });

  it("stores no usable password hash", () => {
    expect(demoCode).toMatch(/DEMO-ACCOUNT-NO-PASSWORD-LOGIN-DISABLED/);
    // A bcrypt hash begins $2a$/$2b$/$2y$; none may appear.
    expect(demoCode).not.toMatch(/\$2[aby]\$/);
  });

  it("leaves every demo identity unconfirmed", () => {
    const insert = /insert into auth\.users \(([\s\S]*?)\)\s*values/.exec(demoCode);
    expect(insert, "the auth.users insert should be findable").not.toBeNull();
    const columns = insert?.[1] ?? "";
    expect(columns).toMatch(/email_confirmed_at/);
    // The value supplied for it is null: unconfirmed accounts cannot sign in.
    const values = demoCode.slice(demoCode.indexOf("values", insert?.index ?? 0));
    expect(values.slice(0, 600)).toMatch(/\bnull,/);
  });

  it("skips the identities rather than failing when auth is absent", () => {
    expect(demoCode).toMatch(/to_regclass\('auth\.users'\) is null/);
  });
});

// ===========================================================================
// Production guards
// ===========================================================================
describe("demo seed: refuses production", () => {
  it("requires the explicit flag in both scripts", () => {
    for (const [name, sql] of [
      ["03_demo_dataset.sql", demo],
      ["99_reset_demo.sql", reset],
    ] as const) {
      expect(sql, name).toMatch(/\\if :\{\?tania_allow_sample_data\}/);
      expect(sql, name).toMatch(/REFUSED/);
    }
  });

  it("refuses a database holding non-demo organizations", () => {
    expect(demoCode).toMatch(/code not like 'DEMO-%'/);
    expect(demoCode).toMatch(/raise exception 'REFUSED/);
  });

  it("refuses a production environment in the runner", () => {
    expect(runner).toMatch(/TANIA_ENV/);
    expect(runner).toMatch(/NODE_ENV/);
    expect(runner).toMatch(/PRODUCTION_HINTS/);
    expect(runner).toMatch(/TANIA_DEMO_I_UNDERSTAND/);
  });

  it("never prints a password, even in its own error output", () => {
    expect(runner).toMatch(/function redact/);
    expect(runner).not.toMatch(/console\.log\(url\)/);
  });

  it("requires an explicit --yes before removing anything", () => {
    expect(runner).toMatch(/flags\.includes\("--yes"\)/);
  });
});

// ===========================================================================
// Resettable
// ===========================================================================
describe("demo reset: removes exactly the demo dataset", () => {
  const inserted = new Set(seedInserts(demo).map((i) => i.table));
  const deleted = new Set(
    [...resetCode.matchAll(/delete from public\.(\w+)/g)].map((m) => m[1] as string),
  );

  it("clears every table the seed writes to", () => {
    for (const table of inserted) {
      expect(deleted.has(table), `reset does not clear ${table}`).toBe(true);
    }
  });

  it("scopes every statement to the demo prefix", () => {
    const statements = resetCode.match(/delete from public\.\w+[\s\S]*?;/g) ?? [];
    expect(statements.length).toBeGreaterThan(10);
    for (const statement of statements) {
      expect(statement, statement.slice(0, 60)).toMatch(/decafbad-%/);
    }
  });

  // An unscoped statement here is one keystroke from clearing a real table.
  it("contains no unscoped removal or truncate", () => {
    expect(resetCode).not.toMatch(/truncate/i);
    expect(resetCode).not.toMatch(/delete from public\.\w+\s*;/);
  });

  it("clears the squad manager link before removing either side", () => {
    const managerAt = resetCode.indexOf("set manager_id = null");
    const profilesAt = resetCode.indexOf("delete from public.profiles");
    const squadsAt = resetCode.indexOf("delete from public.squads");
    expect(managerAt).toBeGreaterThan(-1);
    expect(managerAt).toBeLessThan(profilesAt);
    expect(managerAt).toBeLessThan(squadsAt);
  });

  // profiles cascades from auth.users, so removing identities first would
  // empty the tables above and make every later statement look successful.
  it("removes the auth identities last", () => {
    const authAt = resetCode.indexOf("delete from auth.users");
    const orgsAt = resetCode.indexOf("delete from public.organizations");
    expect(authAt).toBeGreaterThan(orgsAt);
  });

  it("verifies the reset rather than assuming it", () => {
    expect(resetCode).toMatch(/RESET INCOMPLETE/);
  });
});
