#!/usr/bin/env node
/**
 * Demo database runner — `npm run db:seed` and `npm run db:reset`.
 *
 * The SQL files already refuse to run without an explicit flag, and refuse a
 * database holding non-demo organizations. This adds the checks SQL cannot
 * make, because they are about WHERE it is pointed rather than what it finds:
 *
 *   1. NODE_ENV or TANIA_ENV of "production" refuses outright.
 *   2. A connection string that looks like production refuses unless the
 *      operator overrides it deliberately and in writing.
 *   3. The reset states what it will remove and requires --yes, since the one
 *      thing worse than no demo data is a reset aimed at the wrong database.
 *
 * None of these is sufficient alone. Together they mean seeding a production
 * database takes several deliberate acts rather than one mistyped variable.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIR = join(ROOT, "supabase", "seed");

const SEED_FILES = ["01_reference.sql", "03_demo_dataset.sql"];
const RESET_FILES = ["99_reset_demo.sql"];

/** Substrings in a connection string that suggest a real environment. */
const PRODUCTION_HINTS = ["prod", "production", "live", "prd"];

function fail(message) {
  process.stderr.write(`\n  REFUSED: ${message}\n\n`);
  process.exit(1);
}

function info(message) {
  process.stdout.write(`  ${message}\n`);
}

function redact(url) {
  // Never print the password, even in an error the operator asked for.
  return url.replace(/\/\/([^:/@]+):([^@]*)@/, "//$1:***@");
}

function checkEnvironment(url) {
  const env = (process.env.TANIA_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  if (env === "production") {
    fail(
      'TANIA_ENV/NODE_ENV is "production". Demo data must never reach a production database.',
    );
  }

  const haystack = url.toLowerCase();
  const hint = PRODUCTION_HINTS.find((needle) => haystack.includes(needle));
  if (hint && process.env.TANIA_DEMO_I_UNDERSTAND !== "yes") {
    fail(
      `the connection string contains "${hint}", which looks like a production database.\n` +
        `  Target: ${redact(url)}\n` +
        "  If this really is a disposable environment, set TANIA_DEMO_I_UNDERSTAND=yes.",
    );
  }
}

function requirePsql() {
  const probe = spawnSync("psql", ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    fail(
      "psql was not found on PATH. Install the PostgreSQL client tools, or run the files in supabase/seed/ by hand.",
    );
  }
  return probe.stdout.trim();
}

function run(url, file) {
  const path = join(SEED_DIR, file);
  if (!existsSync(path)) fail(`missing seed file: ${file}`);

  info(`-> ${file}`);
  const result = spawnSync(
    "psql",
    [
      url,
      "--no-psqlrc",
      "--quiet",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "tania_allow_sample_data=1",
      "-f",
      path,
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    fail(`${file} did not complete. Nothing further was run.`);
  }
}

function main() {
  const [, , command, ...flags] = process.argv;

  if (command !== "seed" && command !== "reset") {
    process.stderr.write("usage: node scripts/db.mjs <seed|reset> [--yes]\n");
    process.exit(2);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    fail(
      "DATABASE_URL is not set. Point it at a disposable development database.\n" +
        "  export DATABASE_URL='postgresql://postgres:postgres@localhost:54322/postgres'",
    );
  }

  checkEnvironment(url);

  // Intent is confirmed BEFORE tooling is checked. Asking "do you have psql?"
  // first means someone testing the confirmation on a machine without it gets
  // a message about their PATH instead of the warning about what is going to
  // be removed.
  if (command === "reset" && !flags.includes("--yes")) {
    process.stdout.write(
      "\n  This removes every row whose primary key begins `decafbad` —\n" +
        "  the demo dataset, and nothing else.\n\n" +
        `  Target: ${redact(url)}\n\n` +
        "  Re-run with --yes to proceed:  npm run db:reset -- --yes\n\n",
    );
    process.exit(1);
  }

  const version = requirePsql();
  info(version);
  info(`Target: ${redact(url)}`);

  if (command === "reset") {
    info("Removing the demo dataset...");
    for (const file of RESET_FILES) run(url, file);
    info("Done. The demo dataset has been removed.");
    return;
  }

  info("Loading reference data and the demo dataset...");
  for (const file of SEED_FILES) run(url, file);
  info("Done. Every demo row carries a `decafbad` key and a DEMO- code.");
  info("Remove it with: npm run db:reset -- --yes");
}

main();
