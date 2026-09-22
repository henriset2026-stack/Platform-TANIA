import { describe, expect, it } from "vitest";

import {
  can,
  canAccessChapter,
  canAccessProject,
  canAccessSquad,
  canAccessTalent,
  hasRole,
  isAiService,
} from "@/lib/auth/policy";
import type { AuthContext } from "@/lib/auth/session";
import type { Role } from "@/types/authorization";

/**
 * TANIA_RBAC_RLS_MATRIX.md §9, against the policy gate.
 *
 * This proves the gate decides correctly. It does NOT prove PostgreSQL
 * agrees — RLS is the enforcement and tests/rls/ has never run. Both are
 * necessary: a correct gate in front of a table with no policy is an open
 * table.
 */

const DPS = "org-dps";
const OTHER_CHAPTER = "org-other";
const SQUAD_A = "squad-a";
const SQUAD_B = "squad-b";

function context(over: Partial<AuthContext> & { roles: Role[] }): AuthContext {
  return {
    userId: "user-self",
    email: "user@telkom.test",
    organizationIds: [DPS],
    squadIds: [],
    permissions: [],
    ...over,
  };
}

function squad(over: Partial<{ squadId: string; organizationId: string; managerId: string | null }> = {}) {
  return { squadId: SQUAD_A, organizationId: DPS, managerId: null, ...over };
}

function project(over: Partial<{ projectId: string; organizationId: string; createdBy: string | null; memberIds: readonly string[] }> = {}) {
  return {
    projectId: "p-1",
    organizationId: DPS,
    createdBy: "someone-else",
    memberIds: [] as readonly string[],
    ...over,
  };
}

function talent(over: Partial<{ profileId: string; chapterId: string | null; squadId: string | null }> = {}) {
  return {
    profileId: "talent-1",
    chapterId: DPS,
    squadId: SQUAD_A,
    ...over,
  };
}

// ===========================================================================
// Role resolution
// ===========================================================================
describe("AUTH: role resolution", () => {
  it("resolves a role from the context, never from a parameter", () => {
    const lead = context({ roles: ["CHAPTER_LEAD"] });
    expect(hasRole(lead, "CHAPTER_LEAD")).toBe(true);
    expect(hasRole(lead, "SUPER_ADMIN")).toBe(false);
  });

  it("identifies an AI service identity", () => {
    expect(isAiService(context({ roles: ["AI_SERVICE"] }))).toBe(true);
    expect(isAiService(context({ roles: ["MANAGER"] }))).toBe(false);
  });

  it("grants nothing from a role alone, without the permission", () => {
    const lead = context({ roles: ["CHAPTER_LEAD"], permissions: [] });
    expect(can(lead, "talent.read").allowed).toBe(false);
  });

  // Read and write are separate permissions everywhere (CLAUDE.md §6).
  it("never infers write from read", () => {
    const reader = context({ roles: ["MANAGER"], permissions: ["talent.read"] });
    expect(can(reader, "talent.read").allowed).toBe(true);
    expect(can(reader, "talent.update").allowed).toBe(false);
    expect(can(reader, "talent.export").allowed).toBe(false);
    expect(can(reader, "performance.approve_review").allowed).toBe(false);
  });
});

// ===========================================================================
// RBAC — allowed role / denied role
// ===========================================================================
describe("RBAC: allowed and denied roles", () => {
  it("allows a chapter lead into their own chapter", () => {
    const lead = context({ roles: ["CHAPTER_LEAD"], organizationIds: [DPS] });
    expect(canAccessChapter(lead, DPS).allowed).toBe(true);
  });

  it("denies a chapter lead outside their chapter", () => {
    const lead = context({ roles: ["CHAPTER_LEAD"], organizationIds: [DPS] });
    const decision = canAccessChapter(lead, OTHER_CHAPTER);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBeTruthy();
  });

  it("allows a manager into their managed squad", () => {
    const manager = context({ roles: ["MANAGER"], squadIds: [SQUAD_A] });
    expect(canAccessSquad(manager, squad({ squadId: SQUAD_A })).allowed).toBe(true);
  });

  // The rule the PRD calls out by name: never every squad.
  it("denies a manager another manager's squad", () => {
    const manager = context({ roles: ["MANAGER"], squadIds: [SQUAD_A] });
    expect(canAccessSquad(manager, squad({ squadId: SQUAD_B })).allowed).toBe(false);
  });

  it("denies a talent another talent's record", () => {
    const talentUser = context({ roles: ["TALENT"], userId: "talent-2" });
    expect(canAccessTalent(talentUser, talent({ profileId: "talent-1" })).allowed).toBe(
      false,
    );
  });

  it("allows a talent their own record", () => {
    const talentUser = context({ roles: ["TALENT"], userId: "talent-1" });
    expect(canAccessTalent(talentUser, talent({ profileId: "talent-1" })).allowed).toBe(
      true,
    );
  });
});

// ===========================================================================
// RBAC — wrong chapter / wrong squad
// ===========================================================================
describe("RBAC: scope boundaries", () => {
  it("denies a chapter lead a person in another chapter", () => {
    const lead = context({ roles: ["CHAPTER_LEAD"], organizationIds: [DPS] });
    expect(
      canAccessTalent(lead, talent({ chapterId: OTHER_CHAPTER, squadId: null })).allowed,
    ).toBe(false);
  });

  it("denies a manager a person in another squad", () => {
    const manager = context({ roles: ["MANAGER"], squadIds: [SQUAD_A], organizationIds: [DPS] });
    expect(
      canAccessTalent(manager, talent({ squadId: SQUAD_B })).allowed,
    ).toBe(false);
  });

  it("denies a project manager an unrelated project", () => {
    const pm = context({ roles: ["PROJECT_MANAGER"], organizationIds: [DPS] });
    const unrelated = project({ projectId: "p-2", organizationId: OTHER_CHAPTER });
    expect(canAccessProject(pm, unrelated).allowed).toBe(false);
  });

  it("allows a project manager an assigned project", () => {
    const pm = context({ roles: ["PROJECT_MANAGER"], userId: "pm-1", organizationIds: [DPS] });
    const assigned = project({ memberIds: ["pm-1"] });
    expect(canAccessProject(pm, assigned).allowed).toBe(true);
  });
});

// ===========================================================================
// RBAC — sensitive data
// ===========================================================================
describe("RBAC: data sensitivity", () => {
  // Private HR data and private AI conversations are owner-only, including
  // from managers.
  it("denies RESTRICTED records to everyone but the owner", () => {
    for (const role of ["CHAPTER_LEAD", "MANAGER", "HR", "EXECUTIVE"] as Role[]) {
      const actor = context({
        roles: [role],
        organizationIds: [DPS],
        squadIds: [SQUAD_A],
      });
      const decision = canAccessTalent(actor, talent(), "RESTRICTED");
      expect(decision.allowed, role).toBe(false);
    }
  });

  it("allows the owner their own RESTRICTED records", () => {
    const owner = context({ roles: ["TALENT"], userId: "talent-1" });
    expect(canAccessTalent(owner, talent({ profileId: "talent-1" }), "RESTRICTED").allowed).toBe(
      true,
    );
  });

  // The known gap: the matrix says EXECUTIVE reaches individual sensitive
  // records with "explicit authorization" and specifies no mechanism, so the
  // policy denies rather than inventing one.
  it("denies an executive an individual sensitive record", () => {
    const executive = context({ roles: ["EXECUTIVE"], organizationIds: [DPS] });
    const decision = canAccessTalent(executive, talent(), "SENSITIVE");
    expect(decision.allowed).toBe(false);
  });

  it("denies an AI identity a sensitive individual record", () => {
    const ai = context({
      roles: ["AI_SERVICE"],
      organizationIds: [DPS],
      squadIds: [SQUAD_A],
      permissions: ["talent.read", "capability.read", "ai.analyze"],
    });
    const decision = canAccessTalent(ai, talent(), "SENSITIVE");
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe("AI_SERVICE_FORBIDDEN");
  });

  it("denies an AI identity every consequential permission", () => {
    const ai = context({
      roles: ["AI_SERVICE"],
      permissions: [
        "talent.read",
        "performance.approve_review",
        "assignment.approve",
        "development.approve",
        "business_impact.validate",
        "talent.export",
        "admin.users",
      ],
    });
    // Even with the permission configured, the policy refuses: AI identities
    // are blocked in the policy layer AND by RESTRICTIVE database policies.
    for (const permission of [
      "performance.approve_review",
      "assignment.approve",
      "development.approve",
      "business_impact.validate",
      "talent.export",
      "admin.users",
    ]) {
      expect(can(ai, permission).allowed, permission).toBe(false);
    }
  });
});

// ===========================================================================
// Anonymous
// ===========================================================================
describe("RBAC: anonymous", () => {
  it("grants a context with no roles and no permissions nothing", () => {
    const anonymous = context({ roles: [], permissions: [], organizationIds: [] });
    expect(can(anonymous, "talent.read").allowed).toBe(false);
    expect(canAccessChapter(anonymous, DPS).allowed).toBe(false);
    expect(canAccessSquad(anonymous, squad()).allowed).toBe(false);
    expect(canAccessTalent(anonymous, talent()).allowed).toBe(false);
  });
});
