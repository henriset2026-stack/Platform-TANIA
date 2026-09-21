import { describe, expect, it } from "vitest";

import {
  DASHBOARD_SECTIONS,
  SECTION_PERMISSION,
  isSectionVisible,
  resolveDashboardView,
  resolveScope,
} from "@/lib/dashboard/views";
import type { AuthContext } from "@/lib/auth/session";
import type { Role } from "@/types/authorization";

/**
 * Role-aware dashboard composition.
 *
 * These verify what each role SEES. They do not verify access — RLS does
 * that, and tests/rls/ has never run. A section rendered in error would show
 * an empty state, not another chapter's data.
 */

const CHAPTER = "org-dps";
const SQUAD = "squad-a";

function context(
  roles: Role[],
  permissions: string[] = [],
  extra: Partial<AuthContext> = {},
): AuthContext {
  return {
    userId: "u-1",
    email: "u1@telkom.test",
    organizationIds: [CHAPTER],
    squadIds: [SQUAD],
    roles,
    permissions,
    ...extra,
  };
}

const ALL_READS = Object.values(SECTION_PERMISSION);

describe("dashboard scope", () => {
  it("maps each role to its scope", () => {
    expect(resolveScope(context(["SUPER_ADMIN"]))).toBe("platform");
    expect(resolveScope(context(["EXECUTIVE"]))).toBe("aggregate");
    expect(resolveScope(context(["CHAPTER_LEAD"]))).toBe("chapter");
    expect(resolveScope(context(["HR"]))).toBe("chapter");
    expect(resolveScope(context(["MANAGER"]))).toBe("squad");
    expect(resolveScope(context(["PROJECT_MANAGER"]))).toBe("squad");
    expect(resolveScope(context(["TALENT"]))).toBe("self");
  });

  it("gives an unscoped account no scope rather than defaulting open", () => {
    expect(resolveScope(context([]))).toBe("none");
  });

  it("takes the highest scope when a person holds several roles", () => {
    expect(resolveScope(context(["TALENT", "CHAPTER_LEAD"]))).toBe("chapter");
    expect(resolveScope(context(["MANAGER", "EXECUTIVE"]))).toBe("aggregate");
  });
});

describe("section visibility", () => {
  it("shows a section only when the viewer holds its permission", () => {
    const view = resolveDashboardView(context(["CHAPTER_LEAD"], ["talent.read"]));
    expect(isSectionVisible(view, "talent_health")).toBe(true);
    expect(isSectionVisible(view, "business_impact")).toBe(false);
    expect(isSectionVisible(view, "performance")).toBe(false);
  });

  it("shows nothing to an account with no read permissions", () => {
    const view = resolveDashboardView(context(["TALENT"], []));
    expect(view.sections).toEqual([]);
  });

  it("never infers a section from a role alone", () => {
    // CLAUDE.md §9: holding CHAPTER_LEAD must not imply read access.
    const view = resolveDashboardView(context(["CHAPTER_LEAD"], []));
    expect(view.sections).toEqual([]);
  });

  it("covers every declared section with a permission", () => {
    for (const section of DASHBOARD_SECTIONS) {
      expect(SECTION_PERMISSION[section]).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});

describe("individual drill-down", () => {
  // TANIA_RBAC_RLS_MATRIX.md §5: executive access defaults to aggregated
  // intelligence; individual records require explicit authorization.
  it("denies drill-down to EXECUTIVE", () => {
    const view = resolveDashboardView(context(["EXECUTIVE"], ALL_READS));
    expect(view.scope).toBe("aggregate");
    expect(view.allowsIndividualDrilldown).toBe(false);
  });

  it("allows drill-down for chapter and squad scopes", () => {
    expect(
      resolveDashboardView(context(["CHAPTER_LEAD"], ALL_READS))
        .allowsIndividualDrilldown,
    ).toBe(true);
    expect(
      resolveDashboardView(context(["MANAGER"], ALL_READS))
        .allowsIndividualDrilldown,
    ).toBe(true);
  });

  it("denies drill-down at self scope — there is nobody else to open", () => {
    expect(
      resolveDashboardView(context(["TALENT"], ALL_READS))
        .allowsIndividualDrilldown,
    ).toBe(false);
  });

  it("denies drill-down to an unscoped account", () => {
    expect(
      resolveDashboardView(context([], ALL_READS)).allowsIndividualDrilldown,
    ).toBe(false);
  });
});

describe("view copy", () => {
  it("tells an executive that individual records are excluded", () => {
    const view = resolveDashboardView(context(["EXECUTIVE"], ALL_READS));
    expect(view.subtitle.toLowerCase()).toContain("individual");
  });

  it("gives every scope a distinct title", () => {
    const titles = (
      [
        ["SUPER_ADMIN"],
        ["EXECUTIVE"],
        ["CHAPTER_LEAD"],
        ["MANAGER"],
        ["TALENT"],
      ] as Role[][]
    ).map((roles) => resolveDashboardView(context(roles, ALL_READS)).title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
