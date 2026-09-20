import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

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
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

describe.skipIf(!configured)("organization_memberships escalation", () => {
  let talentClient: ReturnType<typeof createClient<Database>>;
  let superAdminRoleId: string;
  let organizationId: string;
  let talentUserId: string;

  beforeAll(async () => {
    const admin = createClient<Database>(URL!, SERVICE!, {
      auth: { persistSession: false },
    });

    const { data: role } = await admin
      .from("roles")
      .select("id")
      .eq("code", "SUPER_ADMIN")
      .single();
    superAdminRoleId = role!.id as string;

    const { data: org } = await admin
      .from("organizations")
      .insert({ name: "RLS Test Chapter", code: `rls-test-${Date.now()}` })
      .select("id")
      .single();
    organizationId = org!.id as string;

    const email = `rls-talent-${Date.now()}@example.test`;
    const password = crypto.randomUUID();
    const { data: created } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    talentUserId = created.user!.id;

    await admin.from("profiles").insert({
      id: talentUserId,
      full_name: "RLS Test Talent",
      email,
      chapter_id: organizationId,
    });

    talentClient = createClient<Database>(URL!, ANON!, {
      auth: { persistSession: false },
    });
    await talentClient.auth.signInWithPassword({ email, password });
  });

  it("denies a TALENT user self-granting SUPER_ADMIN", async () => {
    const { error } = await talentClient
      .from("organization_memberships")
      .insert({
        user_id: talentUserId,
        organization_id: organizationId,
        role_id: superAdminRoleId,
      });

    expect(error, "self-escalation was NOT denied").toBeTruthy();
  });

  it("does not report the escalation as having taken effect", async () => {
    const { data } = await talentClient.rpc("current_user_roles");
    expect(data ?? []).not.toContain("SUPER_ADMIN");
  });

  it("denies inserting a membership for another user", async () => {
    const { error } = await talentClient
      .from("organization_memberships")
      .insert({
        user_id: crypto.randomUUID(),
        organization_id: organizationId,
        role_id: superAdminRoleId,
      });

    expect(error).toBeTruthy();
  });

  it("denies direct writes to the audit log", async () => {
    const { error } = await talentClient
      .from("audit_logs")
      // @ts-expect-error audit_logs.Insert is `never` by design
      .insert({ action: "forged", resource_type: "test" });

    expect(error, "audit log accepted a forged entry").toBeTruthy();
  });
});
