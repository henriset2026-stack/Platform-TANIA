/**
 * Authorization vocabulary — TANIA_RBAC_RLS_MATRIX.md.
 *
 * The matrix is the source of truth. Nothing here may widen it.
 */

export const ROLES = [
  "SUPER_ADMIN",
  "EXECUTIVE",
  "CHAPTER_LEAD",
  "MANAGER",
  "PROJECT_MANAGER",
  "TALENT",
  "HR",
  "AI_SERVICE",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Data sensitivity classes — TANIA_RBAC_RLS_MATRIX.md §6.
 * Ordered least to most restricted; the numeric value is used for comparison.
 */
export const SENSITIVITY = {
  /** Capability definitions, generic learning. Broad authenticated read. */
  INTERNAL: 0,
  /** Talent profile, assignment. Scope-based. */
  CONFIDENTIAL: 1,
  /** Performance evidence, development. Strict scope. */
  SENSITIVE: 2,
  /** Private HR data, private AI conversations. Owner + explicit authority. */
  RESTRICTED: 3,
} as const;

export type Sensitivity = keyof typeof SENSITIVITY;

export type DenialReason =
  | "UNAUTHENTICATED"
  | "MISSING_PERMISSION"
  | "OUT_OF_ORGANIZATION_SCOPE"
  | "OUT_OF_SQUAD_SCOPE"
  | "OUT_OF_PROJECT_SCOPE"
  | "NOT_RESOURCE_OWNER"
  | "SENSITIVITY_RESTRICTED"
  | "AI_SERVICE_FORBIDDEN"
  | "HUMAN_APPROVAL_REQUIRED";

export type Decision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: DenialReason;
      readonly detail: string;
    };

export const ALLOW: Decision = { allowed: true };

export function deny(reason: DenialReason, detail: string): Decision {
  return { allowed: false, reason, detail };
}

/** Resource descriptors. Minimal shapes the policy layer needs to decide. */

export interface TalentResource {
  readonly profileId: string;
  readonly chapterId: string | null;
  readonly squadId: string | null;
}

export interface SquadResource {
  readonly squadId: string;
  readonly organizationId: string;
  readonly managerId: string | null;
}

export interface ProjectResource {
  readonly projectId: string;
  readonly organizationId: string;
  readonly createdBy: string | null;
  /** Profile ids assigned to the project. */
  readonly memberIds: readonly string[];
}

/**
 * Permissions AI_SERVICE may ever exercise — TANIA_RBAC_RLS_MATRIX.md §4 and
 * TANIA_SUPABASE_RLS.sql. Read and analyse only.
 *
 * AGENTS.md §9 and CLAUDE.md §4.5: an agent proposes, a human commits. This
 * list contains no create, update, delete, approve, validate, assess, export
 * or execute permission, and must not grow to include one.
 */
export const AI_SERVICE_ALLOWED_PERMISSIONS: readonly string[] = [
  "talent.read",
  "performance.read",
  "capability.read",
  "development.read",
  "assignment.read",
  "project.read",
  "business_impact.read",
  "ai.use",
  "ai.analyze",
  "ai.recommend",
];

/**
 * Actions that always require a human, regardless of role or permission —
 * TANIA_PRD_v2.0.md §58, TANIA_RBAC_RLS_MATRIX.md §7.
 */
export const HUMAN_APPROVAL_REQUIRED: readonly string[] = [
  "performance.approve_review",
  "assignment.approve",
  "development.approve",
  "business_impact.validate",
];
