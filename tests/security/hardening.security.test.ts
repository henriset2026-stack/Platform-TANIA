import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TokenBucketLimiter, AI_RATE_LIMIT } from "@/lib/ai/rate-limit";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

const ROOT = join(import.meta.dirname, "..", "..");
const config = readFileSync(join(ROOT, "next.config.mjs"), "utf8");
const gateway = readFileSync(join(ROOT, "lib/ai/gateway.ts"), "utf8");
const route = readFileSync(join(ROOT, "app/api/ai/chat/route.ts"), "utf8");

// ===========================================================================
// Response headers
// ===========================================================================
describe("hardening: security response headers", () => {
  it("sets the headers that cannot break rendering", () => {
    for (const header of [
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]) {
      expect(config, header).toContain(header);
    }
  });

  it("denies framing outright", () => {
    expect(config).toMatch(/"X-Frame-Options", value: "DENY"/);
  });

  it("does not advertise the framework version", () => {
    expect(config).toMatch(/poweredByHeader:\s*false/);
  });

  // Voice is PRD §86 and is not built. Whoever builds it must open the
  // microphone deliberately rather than find it already open.
  it("keeps camera, microphone and geolocation closed", () => {
    expect(config).toMatch(/camera=\(\), microphone=\(\), geolocation=\(\)/);
  });

  it("applies them to every route", () => {
    expect(config).toMatch(/source:\s*"\/:path\*"/);
  });
});

// ===========================================================================
// Per-user request budget
// ===========================================================================
// Security Gate #1 H-1, closed in Gate #3. Browser-verified 2026-09-25 against
// `next start`: an injected inline handler was blocked (script-src-attr) and
// the login form still hydrated.
describe("hardening: Content-Security-Policy", () => {
  const nonce = "dGVzdC1ub25jZQ==";
  const prod = buildContentSecurityPolicy({ nonce, dev: false });
  const directive = (policy: string, name: string) =>
    policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("allows scripts only by nonce, never inline or eval, in production", () => {
    const scripts = directive(prod, "script-src");
    expect(scripts).toContain(`'nonce-${nonce}'`);
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("adds 'unsafe-eval' in development only", () => {
    expect(directive(buildContentSecurityPolicy({ nonce, dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("blocks framing, plugins, base-tag hijack, foreign form targets and foreign connections", () => {
    expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(prod, "object-src")).toBe("object-src 'none'");
    expect(directive(prod, "base-uri")).toBe("base-uri 'self'");
    expect(directive(prod, "form-action")).toBe("form-action 'self'");
    expect(directive(prod, "connect-src")).toBe("connect-src 'self'");
  });

  it("issues an unpredictable nonce per call", () => {
    const seen = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(seen.size).toBe(50);
    for (const value of seen) expect(atob(value)).toHaveLength(16);
  });

  it("is set by the middleware on the request and the response, for every route", () => {
    const middleware = readFileSync(join(ROOT, "lib/supabase/middleware.ts"), "utf8");
    expect(middleware).toContain('requestHeaders.set("Content-Security-Policy", csp)');
    expect(middleware).toContain('next.headers.set("Content-Security-Policy", csp)');
    // Nonces need per-request rendering; a prerendered page would be blocked.
    expect(readFileSync(join(ROOT, "app/layout.tsx"), "utf8")).toContain("await connection()");
  });
});

// Gate #3 step 9: @supabase/ssr defaults to httpOnly: false.
describe("hardening: session cookies", () => {
  it("are HttpOnly, SameSite=Lax, and Secure in production", () => {
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const source = readFileSync(join(ROOT, "lib/supabase/cookie-options.ts"), "utf8");
    expect(source).toContain('secure: process.env.NODE_ENV === "production"');
  });

  it("are applied by every server-side Supabase client", () => {
    for (const file of ["lib/supabase/server.ts", "lib/supabase/middleware.ts"]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain("cookieOptions: SESSION_COOKIE_OPTIONS");
    }
  });
});

describe("hardening: AI request budget", () => {
  function limiter() {
    return new TokenBucketLimiter({
      capacity: 3,
      refillPerSecond: 1,
      maxTrackedSubjects: 10,
    });
  }

  it("allows a burst up to capacity, then refuses", () => {
    const rl = limiter();
    const t = 1_000_000;
    expect(rl.consume("u1", t).allowed).toBe(true);
    expect(rl.consume("u1", t).allowed).toBe(true);
    expect(rl.consume("u1", t).allowed).toBe(true);

    const refused = rl.consume("u1", t);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("refills continuously rather than in windows", () => {
    const rl = limiter();
    const t = 1_000_000;
    for (let i = 0; i < 3; i += 1) rl.consume("u1", t);
    expect(rl.consume("u1", t).allowed).toBe(false);
    // One second later, one token is back — not the whole allowance.
    expect(rl.consume("u1", t + 1_000).allowed).toBe(true);
    expect(rl.consume("u1", t + 1_000).allowed).toBe(false);
  });

  it("never refills above capacity, however long the gap", () => {
    const rl = limiter();
    const t = 1_000_000;
    rl.consume("u1", t);
    // A day later: still only a burst of 3, not 86,400.
    for (let i = 0; i < 3; i += 1) {
      expect(rl.consume("u1", t + 86_400_000).allowed, `call ${i}`).toBe(true);
    }
    expect(rl.consume("u1", t + 86_400_000).allowed).toBe(false);
  });

  it("budgets each user separately", () => {
    const rl = limiter();
    const t = 1_000_000;
    for (let i = 0; i < 3; i += 1) rl.consume("u1", t);
    expect(rl.consume("u1", t).allowed).toBe(false);
    expect(rl.consume("u2", t).allowed).toBe(true);
  });

  // An endpoint that leaks memory under load trades one availability problem
  // for another.
  it("bounds how many subjects it tracks", () => {
    const rl = limiter();
    for (let i = 0; i < 50; i += 1) rl.consume(`user-${i}`, 1_000_000);
    expect(rl.size).toBeLessThanOrEqual(10);
  });

  it("ships a default that is well above use and well below a loop", () => {
    expect(AI_RATE_LIMIT.capacity).toBeGreaterThanOrEqual(5);
    expect(AI_RATE_LIMIT.capacity).toBeLessThanOrEqual(60);
    expect(AI_RATE_LIMIT.refillPerSecond).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Where the budget is enforced
// ===========================================================================
describe("hardening: the budget is applied after authentication", () => {
  it("consumes a token only once the user is known", () => {
    const authAt = gateway.indexOf("const authContext = await getAuthContext()");
    const limitAt = gateway.indexOf("aiRateLimiter.consume");
    expect(authAt).toBeGreaterThan(-1);
    expect(limitAt).toBeGreaterThan(authAt);
  });

  // Budgeting before authorization would let an unauthenticated flood consume
  // real users' allowances.
  it("budgets per user rather than per connection", () => {
    expect(gateway).toMatch(/aiRateLimiter\.consume\(authContext\.userId\)/);
  });

  it("surfaces the refusal as 429", () => {
    expect(route).toMatch(/RATE_LIMITED:\s*429/);
  });
});
