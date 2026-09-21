import { describe, expect, it } from "vitest";

import {
  can,
  canAccessChapter,
  canAccessProject,
  canAccessSquad,
  canAccessTalent,
  isAiService,
} from "@/lib/auth/policy";
import type { AuthContext } from "@/lib/auth/session";
import type { Role, Sensitivity } from "@/types/authorization";

/**
 * Authorization matrix tests — TANIA_RBAC_RLS_MATRIX.md §9.
 *
 * These exercise the pure policy layer. They prove the decision logic, NOT
 * that PostgreSQL enforces the same thing: RLS is verified separately in
 * tests/rls/, which has never run because no database exists. A green run
 * here is necessary, not sufficient.
 */

const CHAPTER_DPS = "org-dps";
const CHAPTER_OTHER = "org-other";
const SQUAD_A = "squad-a";
const SQUAD_B = "squad-b";

function context(
  overrides: Partial<AuthContext> & { userId: string; roles: Role[] },
): AuthContext {
  return {
    email: `${overrides.userId}@telkom.test`,
    organizationIds: [CHAPTER_DPS],
    squadIds: [],
    permissions: [],
    ...overrides,
  };
}

const superAdmin = context({ userId: "u-super", roles: ["SUPER_ADMIN"] });

const chapterLead = context({
  userId: "u-lead",
  roles: ["CHAPTER_LEAD"],
  permissions: ["talent.read", "talent.update", "performance.approve_review"],
});

const managerA = context({
  userId: "u-mgr-a",
  roles: ["MANAGER"],
  squadIds: [SQUAD_A],
  permissions: ["talent.read", "performance.read"],
});

const managerB = context({
  userId: "u-mgr-b",
  roles: ["MANAGER"],
  squadIds: [SQUAD_B],
  permissions: ["talent.read", "performance.read"],
});

const talentA = context({
  userId: "u-talent-a",
  roles: ["TALENT"],
  squadIds: [SQUAD_A],
  permissions: ["talent.read", "talent.update"],
});

const executive = context({
  userId: "u-exec",
  roles: ["EXECUTIVE"],
  permissions: ["talent.read", "report.read", "report.export"],
});

const hr = context({
  userId: "u-hr",
  roles: ["HR"],
  permissions: ["talent.read", "talent.create", "admin.users"],
});

const aiService = context({
  userId: "u-ai",
  roles: ["AI_SERVICE"],
  permissions: [
    "talent.read",
    "performance.read",
    "ai.use",
    "ai.analyze",
    "ai.recommend",
  ],
});

/** Talent A sits in Chapter DPS, Squad A. */
const talentInSquadA = {
  profileId: "u-talent-a",
  chapterId: CHAPTER_DPS,
  squadId: SQUAD_A,
};
/** Talent B sits in Chapter DPS, Squad B — another manager's squad. */
const talentInSquadB = {
  profileId: "u-talent-b",
  chapterId: CHAPTER_DPS,
  squadId: SQUAD_B,
};
/** Talent C sits in a different chapter entirely. */
const talentInOtherChapter = {
  profileId: "u-talent-c",
  chapterId: CHAPTER_OTHER,
  squadId: "squad-z",
};

const squadA = {
  squadId: SQUAD_A,
  organizationId: CHAPTER_DPS,
  managerId: "u-mgr-a",
};
const squadB = {
  squadId: SQUAD_B,
  organizationId: CHAPTER_DPS,
  managerId: "u-mgr-b",
};

// ===========================================================================
// Allowed access
// ===========================================================================
describe("allowed access", () => {
  it("talent reaches their own profile", () => {
    expect(canAccessTalent(talentA, talentInSquadA).allowed).toBe(true);
  });

  it("talent reaches their own restricted records", () => {
    expect(
      canAccessTalent(talentA, talentInSquadA, "RESTRICTED").allowed,
    ).toBe(true);
  });

  it("manager reaches talent in their own squad", () => {
    expect(canAccessTalent(managerA, talentInSquadA).allowed).toBe(true);
  });

  it("chapter lead reaches talent in their own chapter", () => {
    expect(canAccessTalent(chapterLead, talentInSquadB).allowed).toBe(true);
  });

  it("HR reaches talent within its people-governance scope", () => {
    expect(canAccessTalent(hr, talentInSquadA).allowed).toBe(true);
  });

  it("super admin is unscoped", () => {
    expect(canAccessTalent(superAdmin, talentInOtherChapter).allowed).toBe(true);
    expect(canAccessChapter(superAdmin, CHAPTER_OTHER).allowed).toBe(true);
    expect(canAccessSquad(superAdmin, squadB).allowed).toBe(true);
  });

  it("manager reaches their own squad", () => {
    expect(canAccessSquad(managerA, squadA).allowed).toBe(true);
  });

  it("grants a permission the context actually holds", () => {
    expect(can(chapterLead, "talent.read").allowed).toBe(true);
  });
});

// ===========================================================================
// Denied access
// ===========================================================================
describe("denied access", () => {
  it("denies a permission the context does not hold", () => {
    const decision = can(talentA, "talent.delete");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("MISSING_PERMISSION");
  });

  it("denies talent reading another person's profile", () => {
    const decision = canAccessTalent(talentA, talentInSquadB);
    expect(decision.allowed).toBe(false);
  });

  it("denies by default rather than falling through to allow", () => {
    const stranger = context({ userId: "u-nobody", roles: [] });
    expect(canAccessTalent(stranger, talentInSquadA).allowed).toBe(false);
    expect(canAccessChapter(stranger, CHAPTER_DPS).allowed).toBe(true); // member
    expect(canAccessChapter(stranger, CHAPTER_OTHER).allowed).toBe(false);
  });
});

// ===========================================================================
// Wrong squad — "a MANAGER role alone never grants every squad"
// ===========================================================================
describe("wrong squad", () => {
  it("denies manager A access to manager B's squad", () => {
    const decision = canAccessSquad(managerA, squadB);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("OUT_OF_SQUAD_SCOPE");
  });

  it("denies manager A access to talent in manager B's squad", () => {
    const decision = canAccessTalent(managerA, talentInSquadB);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("OUT_OF_SQUAD_SCOPE");
  });

  it("is symmetric — manager B cannot reach squad A either", () => {
    expect(canAccessSquad(managerB, squadA).allowed).toBe(false);
    expect(canAccessTalent(managerB, talentInSquadA).allowed).toBe(false);
  });

  it("allows a squad the caller manages even without membership", () => {
    const detachedManager = context({
      userId: "u-mgr-a",
      roles: ["MANAGER"],
      squadIds: [],
    });
    expect(canAccessSquad(detachedManager, squadA).allowed).toBe(true);
  });
});

// ===========================================================================
// Wrong chapter
// ===========================================================================
describe("wrong chapter", () => {
  it("denies chapter lead access outside their chapter", () => {
    const decision = canAccessChapter(chapterLead, CHAPTER_OTHER);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("OUT_OF_ORGANIZATION_SCOPE");
    }
  });

  it("denies chapter lead access to talent in another chapter", () => {
    expect(canAccessTalent(chapterLead, talentInOtherChapter).allowed).toBe(
      false,
    );
  });

  it("denies HR outside its authorized chapter", () => {
    expect(canAccessTalent(hr, talentInOtherChapter).allowed).toBe(false);
  });

  it("bounds executive reach by configured membership, not globally", () => {
    expect(canAccessChapter(executive, CHAPTER_DPS).allowed).toBe(true);
    expect(canAccessChapter(executive, CHAPTER_OTHER).allowed).toBe(false);
  });
});

// ===========================================================================
// Sensitive data — TANIA_RBAC_RLS_MATRIX.md §6
// ===========================================================================
describe("data sensitivity", () => {
  it("keeps restricted records owner-only, even from a chapter lead", () => {
    const decision = canAccessTalent(chapterLead, talentInSquadB, "RESTRICTED");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("SENSITIVITY_RESTRICTED");
    }
  });

  it("keeps restricted records away from HR by default", () => {
    expect(
      canAccessTalent(hr, talentInSquadA, "RESTRICTED").allowed,
    ).toBe(false);
  });

  it("keeps restricted records away from a manager", () => {
    expect(
      canAccessTalent(managerA, talentInSquadA, "RESTRICTED").allowed,
    ).toBe(false);
  });

  it("denies executive individual sensitive records", () => {
    const decision = canAccessTalent(executive, talentInSquadA, "SENSITIVE");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("SENSITIVITY_RESTRICTED");
    }
  });

  it("still allows executive confidential records in scope", () => {
    expect(
      canAccessTalent(executive, talentInSquadA, "CONFIDENTIAL").allowed,
    ).toBe(true);
  });

  it("tightens monotonically as sensitivity rises", () => {
    const levels: Sensitivity[] = [
      "INTERNAL",
      "CONFIDENTIAL",
      "SENSITIVE",
      "RESTRICTED",
    ];
    const results = levels.map(
      (level) => canAccessTalent(managerA, talentInSquadA, level).allowed,
    );
    // Once denied, it must stay denied at higher sensitivity.
    const firstDenial = results.indexOf(false);
    if (firstDenial !== -1) {
      expect(results.slice(firstDenial).every((r) => r === false)).toBe(true);
    }
  });
});

// ===========================================================================
// AI_SERVICE restrictions
// ===========================================================================
describe("AI_SERVICE restrictions", () => {
  it("is identified as a service identity", () => {
    expect(isAiService(aiService)).toBe(true);
    expect(isAiService(chapterLead)).toBe(false);
  });

  it("allows read and analysis", () => {
    for (const permission of ["talent.read", "ai.analyze", "ai.recommend"]) {
      expect(can(aiService, permission).allowed, permission).toBe(true);
    }
  });

  it("refuses every mutating permission, even if wrongly granted", () => {
    const overPrivileged = context({
      userId: "u-ai",
      roles: ["AI_SERVICE"],
      permissions: [
        "talent.create",
        "talent.update",
        "talent.delete",
        "talent.export",
        "capability.assess",
        "ai.execute",
      ],
    });

    for (const permission of overPrivileged.permissions) {
      const decision = can(overPrivileged, permission);
      expect(decision.allowed, `${permission} must be refused`).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toBe("AI_SERVICE_FORBIDDEN");
      }
    }
  });

  it("refuses consequential approvals with the human-approval reason", () => {
    const approver = context({
      userId: "u-ai",
      roles: ["AI_SERVICE"],
      permissions: [
        "performance.approve_review",
        "assignment.approve",
        "development.approve",
        "business_impact.validate",
      ],
    });

    for (const permission of approver.permissions) {
      const decision = can(approver, permission);
      expect(decision.allowed, `${permission} must be refused`).toBe(false);
      if (!decision.allowed) {
        expect(decision.reason).toBe("HUMAN_APPROVAL_REQUIRED");
      }
    }
  });

  it("does not read sensitive individual records", () => {
    const decision = canAccessTalent(aiService, talentInSquadA, "SENSITIVE");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("AI_SERVICE_FORBIDDEN");
  });

  it("does not read restricted records such as private AI conversations", () => {
    expect(
      canAccessTalent(aiService, talentInSquadA, "RESTRICTED").allowed,
    ).toBe(false);
  });

  it("cannot escalate by also holding a privileged role's permissions", () => {
    const blended = context({
      userId: "u-ai",
      roles: ["AI_SERVICE", "CHAPTER_LEAD"],
      permissions: ["performance.approve_review", "talent.update"],
    });
    expect(can(blended, "performance.approve_review").allowed).toBe(false);
    expect(can(blended, "talent.update").allowed).toBe(false);
  });
});

// ===========================================================================
// Project scope
// ===========================================================================
describe("project scope", () => {
  const project = {
    projectId: "proj-1",
    organizationId: CHAPTER_DPS,
    createdBy: "u-lead",
    memberIds: ["u-talent-a"],
  };
  const foreignProject = {
    projectId: "proj-2",
    organizationId: CHAPTER_OTHER,
    createdBy: "u-someone",
    memberIds: [],
  };

  it("allows an assigned member", () => {
    expect(canAccessProject(talentA, project).allowed).toBe(true);
  });

  it("denies an unassigned talent", () => {
    const other = context({ userId: "u-talent-b", roles: ["TALENT"] });
    const decision = canAccessProject(other, project);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("OUT_OF_PROJECT_SCOPE");
  });

  it("denies a project outside the caller's organization", () => {
    expect(canAccessProject(chapterLead, foreignProject).allowed).toBe(false);
  });
});
