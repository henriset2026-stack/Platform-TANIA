/**
 * Pure authorization policy — TANIA_RBAC_RLS_MATRIX.md.
 *
 * Every function here is a total function of (AuthContext, resource) with no
 * I/O, which is what makes the security matrix testable without a database.
 *
 * WHAT THIS LAYER IS NOT
 * ----------------------
 * It is not the enforcement boundary. PostgreSQL RLS is (CLAUDE.md §4.1).
 * These checks run at the server boundary so a request fails fast with a
 * clear reason instead of returning an empty result set that reads like "no
 * data". If this layer and RLS ever disagree, RLS wins and this layer is the
 * bug. Never relax an RLS policy because a check here already passed.
 *
 * Deny by default: every function returns a denial unless a rule explicitly
 * permits the access.
 */

import type { AuthContext } from "@/lib/auth/session";
import {
  AI_SERVICE_ALLOWED_PERMISSIONS,
  ALLOW,
  deny,
  HUMAN_APPROVAL_REQUIRED,
  SENSITIVITY,
} from "@/types/authorization";
import type {
  Decision,
  ProjectResource,
  Role,
  Sensitivity,
  SquadResource,
  TalentResource,
} from "@/types/authorization";

export function hasRole(context: AuthContext, role: Role): boolean {
  return context.roles.includes(role);
}

/** An AI service identity, as opposed to a human acting through the product. */
export function isAiService(context: AuthContext): boolean {
  return hasRole(context, "AI_SERVICE");
}

/**
 * Permission check.
 *
 * Two hard rules run before the permission lookup, because they must hold
 * even if the RBAC catalog is misconfigured:
 *
 *  1. An AI_SERVICE identity may only exercise read/analyse permissions.
 *  2. Consequential actions require a human, so an AI identity is refused
 *     outright (CLAUDE.md §4.5, AGENTS.md §9).
 */
export function can(context: AuthContext, permission: string): Decision {
  if (isAiService(context)) {
    if (HUMAN_APPROVAL_REQUIRED.includes(permission)) {
      return deny(
        "HUMAN_APPROVAL_REQUIRED",
        `${permission} is a consequential action and requires a human decision`,
      );
    }
    if (!AI_SERVICE_ALLOWED_PERMISSIONS.includes(permission)) {
      return deny(
        "AI_SERVICE_FORBIDDEN",
        `AI_SERVICE may not exercise ${permission}; it is limited to read and analysis`,
      );
    }
  }

  if (!context.permissions.includes(permission)) {
    return deny("MISSING_PERMISSION", `Missing permission: ${permission}`);
  }

  return ALLOW;
}

/**
 * Organization/chapter scope — TANIA_RBAC_RLS_MATRIX.md §5.
 *
 * SUPER_ADMIN is unscoped. Everyone else is limited to organizations they
 * hold a membership in. A CHAPTER_LEAD does not get other chapters, and
 * EXECUTIVE's broad read is still bounded by configured membership rather
 * than being global.
 */
export function canAccessChapter(
  context: AuthContext,
  chapterId: string,
): Decision {
  if (hasRole(context, "SUPER_ADMIN")) return ALLOW;

  if (!context.organizationIds.includes(chapterId)) {
    return deny(
      "OUT_OF_ORGANIZATION_SCOPE",
      `Chapter ${chapterId} is outside the caller's organizational scope`,
    );
  }

  return ALLOW;
}

/**
 * Squad scope — TANIA_RBAC_RLS_MATRIX.md §5.
 *
 * "A MANAGER role alone never grants access to every squad." A manager
 * reaches their own squad and squads they manage; another manager's squad is
 * denied unless a wider role authorizes it.
 */
export function canAccessSquad(
  context: AuthContext,
  squad: SquadResource,
): Decision {
  if (hasRole(context, "SUPER_ADMIN")) return ALLOW;

  // Directly a member of, or the manager of, this squad.
  if (context.squadIds.includes(squad.squadId)) return ALLOW;
  if (squad.managerId !== null && squad.managerId === context.userId) {
    return ALLOW;
  }

  // Chapter-wide roles reach squads inside their own organization only.
  const inScope = context.organizationIds.includes(squad.organizationId);
  if (
    inScope &&
    (hasRole(context, "CHAPTER_LEAD") ||
      hasRole(context, "HR") ||
      hasRole(context, "EXECUTIVE"))
  ) {
    return ALLOW;
  }

  if (hasRole(context, "MANAGER")) {
    return deny(
      "OUT_OF_SQUAD_SCOPE",
      `Squad ${squad.squadId} is managed by someone else; MANAGER does not grant cross-squad access`,
    );
  }

  return deny(
    "OUT_OF_SQUAD_SCOPE",
    `Squad ${squad.squadId} is outside the caller's scope`,
  );
}

/**
 * Resource-level authorization for a person's records, gated by sensitivity —
 * TANIA_RBAC_RLS_MATRIX.md §5 and §6.
 *
 * EXECUTIVE is deliberately narrow. The matrix says executive access defaults
 * to aggregated intelligence and that "individual sensitive records require
 * explicit authorization". No mechanism for that explicit grant is specified
 * anywhere in the source documents, so this denies — deny by default — and
 * the gap is recorded in the Phase 3 report rather than invented here.
 */
export function canAccessTalent(
  context: AuthContext,
  talent: TalentResource,
  sensitivity: Sensitivity = "CONFIDENTIAL",
): Decision {
  const level = SENSITIVITY[sensitivity];

  // A person always reaches their own records.
  if (talent.profileId === context.userId) return ALLOW;

  if (hasRole(context, "SUPER_ADMIN")) return ALLOW;

  // RESTRICTED is owner-only: private HR data and private AI conversations
  // are not visible to managers or chapter leads by default.
  if (level >= SENSITIVITY.RESTRICTED) {
    return deny(
      "SENSITIVITY_RESTRICTED",
      "Restricted records are visible to their owner and explicit authority only",
    );
  }

  if (isAiService(context)) {
    // An AI identity reads only within the scope delegated to it, and never
    // reaches sensitive individual records on its own authority.
    if (level >= SENSITIVITY.SENSITIVE) {
      return deny(
        "AI_SERVICE_FORBIDDEN",
        "AI_SERVICE may not read sensitive individual records",
      );
    }
  }

  const inChapter =
    talent.chapterId !== null &&
    context.organizationIds.includes(talent.chapterId);
  const inSquad =
    talent.squadId !== null && context.squadIds.includes(talent.squadId);

  if (hasRole(context, "CHAPTER_LEAD") && inChapter) return ALLOW;
  if (hasRole(context, "HR") && inChapter) return ALLOW;
  if (hasRole(context, "MANAGER") && inSquad) return ALLOW;

  if (hasRole(context, "EXECUTIVE")) {
    if (level >= SENSITIVITY.SENSITIVE) {
      return deny(
        "SENSITIVITY_RESTRICTED",
        "EXECUTIVE defaults to aggregated intelligence; individual sensitive records need explicit authorization, which is not yet specified",
      );
    }
    if (inChapter) return ALLOW;
  }

  if (hasRole(context, "MANAGER") && !inSquad) {
    return deny(
      "OUT_OF_SQUAD_SCOPE",
      `Talent ${talent.profileId} is not in a squad managed by the caller`,
    );
  }

  return deny(
    "NOT_RESOURCE_OWNER",
    `Talent ${talent.profileId} is outside the caller's authorized scope`,
  );
}

/**
 * Project scope — TANIA_RBAC_RLS_MATRIX.md §5.
 * Assigned members, the creator, and organization-scoped roles.
 */
export function canAccessProject(
  context: AuthContext,
  project: ProjectResource,
): Decision {
  if (hasRole(context, "SUPER_ADMIN")) return ALLOW;

  if (project.memberIds.includes(context.userId)) return ALLOW;
  if (project.createdBy !== null && project.createdBy === context.userId) {
    return ALLOW;
  }

  if (context.organizationIds.includes(project.organizationId)) {
    if (
      hasRole(context, "CHAPTER_LEAD") ||
      hasRole(context, "EXECUTIVE") ||
      hasRole(context, "PROJECT_MANAGER") ||
      hasRole(context, "MANAGER")
    ) {
      return ALLOW;
    }
  }

  return deny(
    "OUT_OF_PROJECT_SCOPE",
    `Project ${project.projectId} is outside the caller's authorized scope`,
  );
}

/** Throws on denial. For server boundaries that must stop the request. */
export class AuthorizationError extends Error {
  constructor(public readonly decision: Extract<Decision, { allowed: false }>) {
    super(decision.detail);
    this.name = "AuthorizationError";
  }
}

export function assertAllowed(decision: Decision): void {
  if (!decision.allowed) throw new AuthorizationError(decision);
}
