import "server-only";

/**
 * Server-side authorization utilities.
 *
 * Each function resolves the resource **through the caller's own RLS-scoped
 * client**, then applies the pure policy in lib/auth/policy.ts. That ordering
 * matters: if RLS already hides the row, the lookup returns nothing and the
 * answer is a denial without the policy layer ever being consulted. The two
 * layers agree by construction rather than by coordination.
 *
 * These never use the service-role client. An authorization check that
 * bypassed RLS to decide whether RLS should apply would be circular.
 */

import { requireAuthContext } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/session";
import {
  can as canPolicy,
  canAccessChapter as canAccessChapterPolicy,
  canAccessSquad as canAccessSquadPolicy,
  canAccessTalent as canAccessTalentPolicy,
} from "@/lib/auth/policy";
import { createClient } from "@/lib/supabase/server";
import { deny } from "@/types/authorization";
import type { Decision, Sensitivity } from "@/types/authorization";

/** Permission check against the current session. */
export async function can(permission: string): Promise<Decision> {
  const context = await requireAuthContext();
  return canPolicy(context, permission);
}

export async function canAccessChapter(chapterId: string): Promise<Decision> {
  const context = await requireAuthContext();
  return canAccessChapterPolicy(context, chapterId);
}

/**
 * Squad access. The squad row is read under RLS; a squad the caller cannot
 * see is indistinguishable from one that does not exist, which is the
 * intended concealment (CLAUDE.md §22).
 */
export async function canAccessSquad(squadId: string): Promise<Decision> {
  const context = await requireAuthContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("squads")
    .select("id, organization_id, manager_id")
    .eq("id", squadId)
    .maybeSingle();

  if (error) {
    // Explicit failure, never a permissive default (CLAUDE.md §25).
    return deny("OUT_OF_SQUAD_SCOPE", `Squad lookup failed: ${error.message}`);
  }
  if (!data) {
    return deny("OUT_OF_SQUAD_SCOPE", "Squad not found or not visible");
  }

  return canAccessSquadPolicy(context, {
    squadId: data.id,
    organizationId: data.organization_id,
    managerId: data.manager_id,
  });
}

/** Person-level access, gated by the sensitivity of what is being read. */
export async function canAccessTalent(
  talentId: string,
  sensitivity: Sensitivity = "CONFIDENTIAL",
): Promise<Decision> {
  const context = await requireAuthContext();

  if (talentId === context.userId) {
    return canAccessTalentPolicy(
      context,
      { profileId: talentId, chapterId: null, squadId: null },
      sensitivity,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, chapter_id, squad_id")
    .eq("id", talentId)
    .maybeSingle();

  if (error) {
    return deny("NOT_RESOURCE_OWNER", `Profile lookup failed: ${error.message}`);
  }
  if (!data) {
    return deny("NOT_RESOURCE_OWNER", "Profile not found or not visible");
  }

  return canAccessTalentPolicy(
    context,
    {
      profileId: data.id,
      chapterId: data.chapter_id,
      squadId: data.squad_id,
    },
    sensitivity,
  );
}

/**
 * Project access.
 *
 * NOT IMPLEMENTED against the database: the `projects` and `assignments`
 * tables arrive in Phase 12. The pure policy exists and is tested; this
 * wrapper refuses rather than guessing, because a permissive stub on an
 * authorization path is worse than a missing feature.
 */
export async function canAccessProject(projectId: string): Promise<Decision> {
  await requireAuthContext();
  return deny(
    "OUT_OF_PROJECT_SCOPE",
    `Project authorization is not available until the projects table exists (Phase 12); refusing access to ${projectId}`,
  );
}

/** Re-exported for call sites that already hold a context. */
export type { AuthContext };
