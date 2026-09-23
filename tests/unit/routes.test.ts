import { describe, expect, it } from "vitest";

import { isApiRoute, isPublicRoute, loginRedirectPath, PUBLIC_ROUTES } from "@/lib/auth/routes";

describe("route protection", () => {
  it("protects application routes by default", () => {
    for (const path of [
      "/dashboard",
      "/talent",
      "/performance",
      "/capabilities",
      "/settings",
      "/some/route/added/later",
    ]) {
      expect(isPublicRoute(path), `${path} must be protected`).toBe(false);
    }
  });

  it("allows only the declared public routes", () => {
    for (const path of PUBLIC_ROUTES) {
      expect(isPublicRoute(path)).toBe(true);
    }
  });

  it("does not treat a lookalike path as public", () => {
    expect(isPublicRoute("/login-as-admin")).toBe(false);
    expect(isPublicRoute("/dashboard/login")).toBe(false);
  });

  it("preserves the destination when redirecting to login", () => {
    expect(loginRedirectPath("/dashboard")).toContain(
      `next=${encodeURIComponent("/dashboard")}`,
    );
  });

  // Open redirect: //evil.test is protocol-relative and would leave the site.
  it("refuses a protocol-relative redirect target", () => {
    expect(loginRedirectPath("//evil.test")).toContain(
      `next=${encodeURIComponent("/dashboard")}`,
    );
    expect(loginRedirectPath("//evil.test")).not.toContain("evil.test");
  });
});

describe("API routes answer 401, not a redirect", () => {
  it("recognises API paths", () => {
    expect(isApiRoute("/api")).toBe(true);
    expect(isApiRoute("/api/ai/chat")).toBe(true);
  });

  it("does not mistake a page for an API path", () => {
    expect(isApiRoute("/apis")).toBe(false);
    expect(isApiRoute("/dashboard")).toBe(false);
    expect(isApiRoute("/talent/api")).toBe(false);
  });

  it("keeps every API path private", () => {
    expect(isPublicRoute("/api/ai/chat")).toBe(false);
  });
});
