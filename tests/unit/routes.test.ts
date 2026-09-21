import { describe, expect, it } from "vitest";

import { isPublicRoute, loginRedirectPath, PUBLIC_ROUTES } from "@/lib/auth/routes";

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
