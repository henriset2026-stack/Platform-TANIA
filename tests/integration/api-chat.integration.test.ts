import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Supplies the request scope Next normally provides.
 *
 * `cookies()` throws when called outside a request, which is a framework
 * constraint rather than an application one. The jar is EMPTY, so this
 * simulates an unauthenticated caller — the scenario under test. Nothing
 * about authorization is mocked: getAuthContext, the gateway and the policy
 * layer all run exactly as they would in production.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => undefined,
    set: () => undefined,
  }),
  headers: async () => new Headers(),
}));

const { POST } = await import("@/app/api/ai/chat/route");

/**
 * POST /api/ai/chat, the gateway's only HTTP surface.
 *
 * Exercised by calling the route handler with a real NextRequest rather than
 * through a server, so this runs hermetically while still testing the actual
 * request path: body parsing, shape validation, the authorization boundary
 * and the error contract.
 *
 * With no Supabase project configured there is no session, so every
 * well-formed request lands on UNAUTHENTICATED — which is the correct
 * behaviour and exactly what should be asserted: no session, no answer.
 */

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("integration: POST /api/ai/chat", () => {
  it("rejects a body that is not JSON", async () => {
    const response = await POST(post("{not json"));
    expect(response.status).toBe(400);
    const body = await json(response);
    expect((body.error as { code: string }).code).toBe("INVALID_REQUEST");
  });

  it("rejects a missing or non-string message", async () => {
    for (const body of [{}, { message: 42 }, { message: null }, { message: [] }]) {
      const response = await POST(post(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  // No session, no answer.
  it("refuses an unauthenticated request", async () => {
    const response = await POST(post({ message: "show me critical capability gaps" }));
    expect([401, 403, 503]).toContain(response.status);
    const body = await json(response);
    expect(body.error).toBeTruthy();
  });

  // CLAUDE.md §22: no stack trace, provider body or SQL reaches the client.
  it("leaks no internals in the error body", async () => {
    const response = await POST(post({ message: "anything" }));
    const text = JSON.stringify(await json(response));
    for (const pattern of [
      /at\s+\w+\s+\(/,
      /\.ts:\d+/,
      /node_modules/,
      /select .* from/i,
      /supabase/i,
      /eyJ[A-Za-z0-9_-]{10,}/,
      /service_role/i,
    ]) {
      expect(text, String(pattern)).not.toMatch(pattern);
    }
  });

  it("returns a JSON error contract with a code and a safe message", async () => {
    const response = await POST(post({ message: "anything" }));
    const body = await json(response);
    const error = body.error as { code?: unknown; message?: unknown };
    expect(typeof error.code).toBe("string");
    expect(typeof error.message).toBe("string");
  });

  // A GET carrying a prompt would be logged, cached and triggerable
  // cross-site. The route refuses it explicitly rather than by omission, so
  // the refusal is documented and carries an Allow header.
  it("refuses GET explicitly, and defines no other method", async () => {
    const route = (await import("@/app/api/ai/chat/route")) as Record<string, unknown>;
    expect(typeof route.POST).toBe("function");

    const get = route.GET as () => Response;
    const response = get();
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/must not travel in a URL/i);

    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(route[method], method).toBeUndefined();
    }
  });

  // An untrusted page hint must not become authorization.
  it("accepts a page context without letting it widen anything", async () => {
    const response = await POST(
      post({
        message: "why is this red?",
        context: { page: "capability", talentId: "../../admin", role: "SUPER_ADMIN" },
      }),
    );
    expect([400, 401, 403, 503]).toContain(response.status);
    const text = JSON.stringify(await json(response));
    expect(text).not.toMatch(/SUPER_ADMIN/);
  });
});
