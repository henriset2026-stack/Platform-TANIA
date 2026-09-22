/**
 * Handoff scope derivation. PURE.
 *
 * "JARVIS must never inherit more privileges than the TANIA user context
 * allows" is enforced here, as a three-way intersection:
 *
 *     effective = user's permissions ∩ requested ∩ transmittable
 *
 * The third term is what makes this more than a copy. Intersecting with the
 * user alone would let a SUPER_ADMIN handoff carry `admin.users` into a
 * second system — technically no escalation, since the user holds it, and
 * still indefensible. The transmittable allowlist is a ceiling nobody can
 * raise by editing a role.
 *
 * Nothing here reads a caller-supplied identity. The AuthContext arrives from
 * lib/auth/session.ts, which builds it from four RPCs scoped to auth.uid().
 * An authorization function that accepted a caller-supplied role, scope or
 * user id would be privilege escalation by parameter (CLAUDE.md §6).
 */

import {
  HANDOFF_TRANSMITTABLE_PERMISSIONS,
  HANDOFF_TTL_MS,
  type HandoffScope,
  type ScopeReduction,
} from "@/lib/jarvis/contract";
import type { AuthContext } from "@/lib/auth/session";

export interface ScopeRequest {
  /** Permissions the task says it needs. A request, never a grant. */
  readonly permissions: readonly string[];
  /** Individuals the handoff concerns. Narrowed against what the user sees. */
  readonly talentIds: readonly string[];
  readonly correlationId: string;
}

export interface DerivedScope {
  readonly scope: HandoffScope;
  readonly reduction: ScopeReduction;
}

/**
 * Derives the capsule JARVIS will present.
 *
 * `authorizedTalentIds` is supplied by the caller AFTER it has checked each
 * one through lib/auth/authorize.ts, which reads through the RLS-scoped
 * client. It is not taken on trust from the request: a handoff that named
 * someone the user cannot see would otherwise carry that person's identity
 * across the boundary, which leaks their existence even if JARVIS learns
 * nothing else.
 */
export function deriveHandoffScope(input: {
  context: AuthContext;
  request: ScopeRequest;
  authorizedTalentIds: readonly string[];
  now: Date;
  ttlMs?: number;
}): DerivedScope {
  const held = new Set(input.context.permissions);
  const transmittable = new Set(HANDOFF_TRANSMITTABLE_PERMISSIONS);

  const notHeldByUser: string[] = [];
  const notTransmittable: string[] = [];
  const granted: string[] = [];

  for (const permission of input.request.permissions) {
    if (!held.has(permission)) {
      notHeldByUser.push(permission);
      continue;
    }
    if (!transmittable.has(permission)) {
      // Held, and still refused. The user keeps it; JARVIS never gets it.
      notTransmittable.push(permission);
      continue;
    }
    if (!granted.includes(permission)) granted.push(permission);
  }

  // Talent ids are intersected too. The caller has already authorized these,
  // but intersecting again costs nothing and means a future caller that
  // forgets cannot widen the capsule by passing more.
  const requested = new Set(input.request.talentIds);
  const talentIds = input.authorizedTalentIds.filter((id) => requested.has(id));

  const ttl = input.ttlMs ?? HANDOFF_TTL_MS;

  return {
    scope: {
      permissions: granted.sort(),
      organizationIds: [...input.context.organizationIds],
      squadIds: [...input.context.squadIds],
      talentIds,
      issuedAt: input.now.toISOString(),
      expiresAt: new Date(input.now.getTime() + ttl).toISOString(),
      correlationId: input.request.correlationId,
      grantsDatabaseAccess: false,
      extensible: false,
    },
    reduction: {
      notHeldByUser: notHeldByUser.sort(),
      notTransmittable: notTransmittable.sort(),
    },
  };
}

/** True when the scope has expired and therefore authorizes nothing. */
export function isScopeExpired(scope: HandoffScope, now: Date): boolean {
  return now.getTime() >= Date.parse(scope.expiresAt);
}

/**
 * Re-checks a capsule before it is used.
 *
 * Called on the way out and again when a result comes back. A scope that was
 * valid at transmission may have expired by the time JARVIS replies, and a
 * reply arriving under an expired scope must not be treated as authorized —
 * that is the window in which a slow or replayed response does its damage.
 */
export function validateScope(
  scope: HandoffScope,
  now: Date,
): { valid: true } | { valid: false; detail: string } {
  if (scope.permissions.length === 0) {
    return {
      valid: false,
      detail:
        "The derived scope grants nothing. A handoff with no effective permission cannot do the task " +
        "and must not be sent, rather than being sent and failing on the other side.",
    };
  }
  if (isScopeExpired(scope, now)) {
    return {
      valid: false,
      detail: `The handoff scope expired at ${scope.expiresAt}.`,
    };
  }
  const outside = scope.permissions.filter(
    (permission) => !HANDOFF_TRANSMITTABLE_PERMISSIONS.includes(permission),
  );
  if (outside.length > 0) {
    // Only reachable if a capsule was constructed by hand rather than derived.
    return {
      valid: false,
      detail: `Scope contains permissions that may never cross to JARVIS: ${outside.join(", ")}.`,
    };
  }
  return { valid: true };
}
