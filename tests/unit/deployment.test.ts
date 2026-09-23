import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveSiteUrl, safeNextPath } from "@/lib/auth/site-url";
import { formatLogLine, resolveLogLevel } from "@/lib/observability/logger";

const ROOT = join(import.meta.dirname, "..", "..");
const source = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("logger: level resolution", () => {
  it("defaults to info in production and debug elsewhere", () => {
    expect(resolveLogLevel(undefined, "production")).toBe("info");
    expect(resolveLogLevel(undefined, "development")).toBe("debug");
  });

  it("honours LOG_LEVEL, case-insensitively", () => {
    expect(resolveLogLevel("WARN", "production")).toBe("warn");
  });

  it("falls back rather than silencing logging on an unknown LOG_LEVEL", () => {
    expect(resolveLogLevel("verbose", "production")).toBe("info");
  });
});

describe("logger: line format", () => {
  const at = new Date("2026-09-24T00:00:00.000Z");

  it("emits one parseable JSON object with ts, level and event", () => {
    const line = formatLogLine("info", "api.ai.chat", { durationMs: 12 }, at);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      ts: "2026-09-24T00:00:00.000Z",
      level: "info",
      event: "api.ai.chat",
      durationMs: 12,
    });
  });

  it("redacts secrets by key and by value, and says so", () => {
    const parsed = JSON.parse(
      formatLogLine(
        "error",
        "auth.signin_failed",
        {
          access_token: "abc",
          message: "failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig",
        },
        at,
      ),
    ) as Record<string, unknown>;
    expect(JSON.stringify(parsed)).not.toContain("abc");
    expect(JSON.stringify(parsed)).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(parsed.redactions).toBeGreaterThanOrEqual(2);
  });

  it("never lets a caller overwrite ts, level or event", () => {
    const parsed = JSON.parse(
      formatLogLine("error", "real.event", { level: "debug", event: "forged", ts: "never" }, at),
    ) as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: "error", event: "real.event", ts: at.toISOString() });
  });
});

describe("OAuth redirect origin", () => {
  it("prefers SITE_URL, normalised to an origin", () => {
    expect(
      resolveSiteUrl({ siteUrl: "https://tania.example.com/some/path/", vercelUrl: "x.vercel.app" }),
    ).toBe("https://tania.example.com");
  });

  it("uses VERCEL_URL on previews", () => {
    expect(resolveSiteUrl({ vercelUrl: "tania-git-main-team.vercel.app" })).toBe(
      "https://tania-git-main-team.vercel.app",
    );
  });

  it("ignores a malformed or non-http SITE_URL", () => {
    expect(resolveSiteUrl({ siteUrl: "not a url", vercelUrl: "p.vercel.app" })).toBe(
      "https://p.vercel.app",
    );
    expect(resolveSiteUrl({ siteUrl: "javascript:alert(1)", host: "localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });

  it("falls back to the forwarded host locally", () => {
    expect(resolveSiteUrl({ forwardedHost: "a.test, b.test", forwardedProto: "https" })).toBe(
      "https://a.test",
    );
    expect(resolveSiteUrl({ host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(resolveSiteUrl({})).toBeNull();
  });

  it("keeps the post-login destination same-origin", () => {
    expect(safeNextPath("/talent/1")).toBe("/talent/1");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});

describe("deployment wiring", () => {
  it("captures unhandled server errors through instrumentation.ts", () => {
    const file = source("instrumentation.ts");
    expect(file).toMatch(/export const onRequestError/);
    expect(file).toMatch(/split\("\?"\)/);
  });

  it("the login button starts Entra sign-in instead of doing nothing", () => {
    expect(source("app/(auth)/login/page.tsx")).toMatch(/action=\{signInWithEntra\}/);
    const action = source("app/(auth)/login/actions.ts");
    expect(action).toMatch(/provider: "azure"/);
    expect(action).toMatch(/\/auth\/callback/);
  });

  it("the chat route logs outcomes, never the prompt", () => {
    const route = source("app/api/ai/chat/route.ts");
    const logCall = route.slice(route.indexOf('logger.info("api.ai.chat"'));
    const logBlock = logCall.slice(0, logCall.indexOf("});"));
    expect(logBlock).not.toMatch(/body\.message|outcome\.response/);
  });

  it("server code logs through the redacting logger, not bare console calls", () => {
    for (const file of [
      "app/auth/callback/route.ts",
      "app/api/ai/chat/route.ts",
      "app/(auth)/login/actions.ts",
      "lib/ai/gateway.ts",
    ]) {
      expect(source(file), file).not.toMatch(/console\.(log|info|warn|error)\(/);
    }
  });
});
