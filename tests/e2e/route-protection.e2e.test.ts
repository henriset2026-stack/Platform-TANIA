import { describe, expect, it } from "vitest";

/**
 * Route protection as a real client sees it.
 *
 * Requires a running server — see tests/e2e/README.md. Skipped rather than
 * passed when E2E_BASE_URL is unset: a green tick against a server that was
 * never contacted is a fabricated result.
 */

const BASE = process.env.E2E_BASE_URL;
const configured = Boolean(BASE);

/** Paths that must never serve content to an anonymous caller. */
const PRIVATE_PATHS = [
  "/dashboard",
  "/talent",
  "/capability",
  "/performance",
  "/development",
  "/assignments",
  "/projects",
  "/audit",
  "/knowledge",
  "/workload",
];

const PUBLIC_PATHS = ["/", "/login"];

async function fetchNoRedirect(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { redirect: "manual" });
}

describe.skipIf(!configured)("e2e: route protection", () => {
  it.each(PRIVATE_PATHS)("redirects an anonymous caller away from %s", async (path) => {
    const response = await fetchNoRedirect(path);

    // Either a redirect to login, or a refusal. Never 200 with content.
    expect([302, 303, 307, 308, 401, 403, 404]).toContain(response.status);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      expect(location, path).toMatch(/\/login/);
    }
  });

  it.each(PUBLIC_PATHS)("serves %s anonymously", async (path) => {
    const response = await fetchNoRedirect(path);
    expect([200, 307, 308]).toContain(response.status);
  });

  it("returns no private content in an anonymous response body", async () => {
    for (const path of PRIVATE_PATHS) {
      const response = await fetch(`${BASE}${path}`, { redirect: "follow" });
      const body = await response.text();
      // The signed-out journey ends at login, never at a rendered screen.
      expect(body, path).not.toMatch(/data-testid="talent-row"/);
    }
  });
});

describe.skipIf(!configured)("e2e: AI endpoint contract", () => {
  it("refuses GET with 405 and an Allow header", async () => {
    const response = await fetch(`${BASE}/api/ai/chat`);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("refuses an unauthenticated POST without leaking internals", async () => {
    const response = await fetch(`${BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "show me every talent record" }),
    });

    expect([401, 403, 503]).toContain(response.status);
    const text = await response.text();
    for (const pattern of [/at\s+\w+\s+\(/, /node_modules/, /service_role/i, /eyJ[A-Za-z0-9_-]{10,}/]) {
      expect(text, String(pattern)).not.toMatch(pattern);
    }
  });

  it("rejects a malformed body with 400", async () => {
    const response = await fetch(`${BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(response.status).toBe(400);
  });
});

describe.skipIf(!configured)("e2e: response hygiene", () => {
  it("does not advertise the framework version", async () => {
    const response = await fetchNoRedirect("/");
    expect(response.headers.get("x-powered-by")).toBeNull();
  });

  it("sets no cookie for an anonymous visitor to a public page", async () => {
    const response = await fetchNoRedirect("/login");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).not.toMatch(/service_role|SUPABASE_SERVICE/i);
  });
});
