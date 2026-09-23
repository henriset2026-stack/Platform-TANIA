import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

/**
 * Privilege escalation regression suite.
 *
 * TANIA_IMPLEMENTATION_BASELINE.md §7.1: TANIA_SUPABASE_RLS.sql ships
 * organization_memberships with no RLS while granting INSERT on every public
 * table to `authenticated`, letting any signed-in user bind themselves to
 * SUPER_ADMIN. supabase/migrations/20260920120006_rls_core.sql closes that.
 *
 * This suite proves it stays closed. It requires a live database — see
 * tests/rls/README.md. It is skipped, not silently passed, when unconfigured:
 * a green tick against no database would be a fabricated result.
 *
 * Denials assert SQLSTATE 42501. The first live run used a random user id
 * for "another user", which a foreign key would refuse before RLS was ever
 * consulted; the target is now a real user.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

describe.skipIf(!configured)("organization_memberships escalation", () => {
  let admin: ReturnType<typeof createClient<Database>>;
  let talentClient: ReturnType<typeof createClient<Database>>;
  let superAdminRoleId: string;
  let organizationId: string;
  let talentUserId: string;
  let otherUserId: string;

  async function createUser(label: string): Promise<{ id: string; email: string; password: string }> {
    const email = `rls-${label}-${Date.now()}@example.test`;
    const password = crypto.randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

    const profile = await admin.from("profiles").insert({
      id: data.user.id,
      full_name: `RLS Test ${label}`,
      email,
      chapter_id: organizationId,
    });
    if (profile.error) throw new Error(`profile fixture: ${profile.error.message}`);
    return { id: data.user.id, email, password };
  }

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, {
      auth: { persistSession: false },
    });

    const { data: role } = await admin
      .from("roles")
      .select("id")
      .eq("code", "SUPER_ADMIN")
      .single();
    superAdminRoleId = role!.id as string;

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: "RLS Test Chapter", code: `rls-test-${Date.now()}` })
      .select("id")
      .single();
    if (orgError) throw new Error(`organization fixture: ${orgError.message}`);
    organizationId = org.id;

    const talent = await createUser("talent");
    talentUserId = talent.id;
    otherUserId = (await createUser("other")).id;

    talentClient = createClient<Database>(URL!, ANON!, {
      auth: { persistSession: false },
    });
    const signIn = await talentClient.auth.signInWithPassword({
      email: talent.email,
      password: talent.password,
    });
    if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`);
  });

  // Cleanup failures throw: fixtures leaking into a shared project is a
  // defect, not noise.
  afterAll(async () => {
    for (const id of [talentUserId, otherUserId]) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`deleteUser ${id}: ${error.message}`);
    }
    const { error } = await admin.from("organizations").delete().eq("id", organizationId);
    if (error) throw new Error(`delete organization: ${error.message}`);
  });

  it("denies a TALENT user self-granting SUPER_ADMIN", async () => {
    const { error } = await talentClient
      .from("organization_memberships")
      .insert({
        user_id: talentUserId,
        organization_id: organizationId,
        role_id: superAdminRoleId,
      });

    expect(error?.code, "self-escalation was NOT denied by RLS").toBe("42501");
  });

  it("does not report the escalation as having taken effect", async () => {
    const { data, error } = await talentClient.rpc("current_user_roles");
    expect(error, "the role lookup must succeed for this check to mean anything").toBeNull();
    expect(data ?? []).not.toContain("SUPER_ADMIN");
  });

  it("denies inserting a membership for another user", async () => {
    const { error } = await talentClient
      .from("organization_memberships")
      .insert({
        user_id: otherUserId,
        organization_id: organizationId,
        role_id: superAdminRoleId,
      });

    expect(error?.code, "granting another user a role was NOT denied by RLS").toBe("42501");
  });

  it("denies direct writes to the audit log", async () => {
    const { error } = await talentClient
      .from("audit_logs")
      // Generated types permit this insert; the database must refuse it.
      .insert({ action: "forged", resource_type: "test" });

    expect(error?.code, "audit log accepted a forged entry").toBe("42501");
  });
});
