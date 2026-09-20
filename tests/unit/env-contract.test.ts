import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");

function parseEnvKeys(file: string): string[] {
  return readFileSync(join(ROOT, file), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => l.split("=")[0] ?? "")
    .filter((k) => k.length > 0);
}

/** TANIA_PRD_v2.0.md §73. */
const PRD_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENTRA_CLIENT_ID",
  "ENTRA_CLIENT_SECRET",
  "ENTRA_TENANT_ID",
  "AI_GATEWAY_URL",
  "AI_GATEWAY_KEY",
  "EMBEDDING_MODEL",
  "LLM_MODEL",
  "JARVIS_API_URL",
  "JARVIS_API_KEY",
];

/** The only variables permitted to reach browser code. */
const PUBLIC_ALLOWLIST = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

describe("environment contract", () => {
  const keys = parseEnvKeys(".env.example");

  it("declares exactly the variable set specified by the PRD", () => {
    expect([...keys].sort()).toEqual([...PRD_ENV_KEYS].sort());
  });

  it("commits no values", () => {
    const lines = readFileSync(join(ROOT, ".env.example"), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"));
    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      expect(
        rest.join("=").trim(),
        `${key?.trim()} must have an empty value in .env.example`,
      ).toBe("");
    }
  });

  // Project rule 7: never expose service-role credentials.
  it("exposes no secret through a NEXT_PUBLIC_ prefix", () => {
    const publicKeys = keys.filter((k) => k.startsWith("NEXT_PUBLIC_"));
    for (const key of publicKeys) {
      expect(
        PUBLIC_ALLOWLIST.has(key),
        `${key} is browser-visible but is not on the public allowlist`,
      ).toBe(true);
    }
  });

  it("keeps the service-role key server-only", () => {
    expect(keys).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(keys).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });
});
