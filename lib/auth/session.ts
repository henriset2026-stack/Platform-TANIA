import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-derived authorization context.
 *
 * Shape follows TANIA_RBAC_RLS_MATRIX.md §8. Every field is read from the
 * database under the caller's own session — nothing is taken from a request
 * body, header or model output. A model cannot widen it, and it is never used
 * as the last line of defence: RLS is (CLAUDE.md §11).
 */
export interface AuthContext {
  readonly userId: string;
  readonly email: string;
  readonly organizationIds: readonly string[];
  readonly squadIds: readonly string[];
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/** The signed-in user, or null. Validates the JWT with the auth server. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

/**
 * Builds the authorization context for the signed-in user.
 *
 * Returns null when unauthenticated. Every query below runs under RLS, so a
 * caller can only ever assemble their own context.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const [rolesResult, permissionsResult, orgsResult, squadsResult] =
    await Promise.all([
      supabase.rpc("current_user_roles"),
      supabase.rpc("current_user_permissions"),
      supabase.rpc("user_org_ids"),
      supabase.rpc("user_squad_ids"),
    ]);

  // Explicit failure over fabricated success (CLAUDE.md §25). Returning a
  // context with empty roles would be indistinguishable from a genuinely
  // unprivileged user, which would silently under-authorize rather than error.
  const failure =
    rolesResult.error ??
    permissionsResult.error ??
    orgsResult.error ??
    squadsResult.error;

  if (failure) {
    throw new Error(
      `Failed to resolve authorization context: ${failure.message}`,
    );
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    organizationIds: orgsResult.data ?? [],
    squadIds: squadsResult.data ?? [],
    roles: rolesResult.data ?? [],
    permissions: permissionsResult.data ?? [],
  };
}

/** Throws when unauthenticated. For server boundaries that require a user. */
export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw new Error("UNAUTHENTICATED");
  }
  return context;
}

/**
 * Permission check for use at a server boundary.
 *
 * This is a gate, never the enforcement. RLS enforces (CLAUDE.md §4.1); this
 * exists so a request fails early with a clean error instead of returning an
 * empty result set that reads like "no data".
 */
export function hasPermission(
  context: AuthContext,
  permission: string,
): boolean {
  return context.permissions.includes(permission);
}

export function hasRole(context: AuthContext, role: string): boolean {
  return context.roles.includes(role);
}

/** Throws unless the context carries the permission. */
export function requirePermission(
  context: AuthContext,
  permission: string,
): void {
  if (!hasPermission(context, permission)) {
    throw new Error("FORBIDDEN");
  }
}
