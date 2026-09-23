import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

/**
 * RLS enforcement of TANIA_RBAC_RLS_MATRIX.md §9.
 *
 * First run green 2026-09-24 against project hcyaqbgbwfxzutamceoq.
 *
 * Denials assert SQLSTATE 42501 rather than "any error": an insert that fails
 * on a foreign key would otherwise pass as an RLS denial.
 *
 * tests/unit/policy.test.ts proves the decision logic in lib/auth/policy.ts.
 * It cannot prove PostgreSQL agrees, and the application layer is explicitly
 * not the enforcement boundary — so until this file runs green, TANIA's
 * authorization is unverified where it actually matters.
 *
 * Skipped rather than passed when unconfigured: a green tick against no
 * database would be a fabricated result.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

type Client = SupabaseClient<Database>;

interface Actor {
  readonly id: string;
  readonly email: string;
  readonly client: Client;
}

describe.skipIf(!configured)("RLS authorization matrix", () => {
  let admin: Client;
  let chapterDps: string;
  let chapterOther: string;
  let squadA: string;
  let squadB: string;
  let managerA: Actor;
  let managerB: Actor;
  let talentA: Actor;
  let talentB: Actor;
  let chapterLead: Actor;
  let superAdmin: Actor;
  const createdUserIds: string[] = [];

  async function makeActor(label: string, roleCode: string, organizationId: string): Promise<Actor> {
    const email = `rls-${label}-${Date.now()}@example.test`;
    const password = crypto.randomUUID();

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(`createUser failed: ${error?.message}`);
    createdUserIds.push(created.user.id);

    await admin.from("profiles").insert({
      id: created.user.id,
      full_name: label,
      email,
      chapter_id: organizationId,
    });

    const { data: role } = await admin
      .from("roles").select("id").eq("code", roleCode).single();
    await admin.from("organization_memberships").insert({
      user_id: created.user.id,
      organization_id: organizationId,
      role_id: role!.id,
    });

    const client = createClient<Database>(URL!, ANON!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email, password });
    return { id: created.user.id, email, client };
  }

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } });
    const stamp = Date.now();

    const { data: dps } = await admin.from("organizations")
      .insert({ name: "Chapter DPS", code: `dps-${stamp}` }).select("id").single();
    chapterDps = dps!.id;
    const { data: other } = await admin.from("organizations")
      .insert({ name: "Other Chapter", code: `other-${stamp}` }).select("id").single();
    chapterOther = other!.id;

    managerA = await makeActor("mgr-a", "MANAGER", chapterDps);
    managerB = await makeActor("mgr-b", "MANAGER", chapterDps);
    talentA = await makeActor("talent-a", "TALENT", chapterDps);
    talentB = await makeActor("talent-b", "TALENT", chapterDps);
    chapterLead = await makeActor("lead", "CHAPTER_LEAD", chapterDps);
    superAdmin = await makeActor("super", "SUPER_ADMIN", chapterDps);

    const { data: sa } = await admin.from("squads")
      .insert({ organization_id: chapterDps, name: "Squad A", code: `sa-${stamp}`, manager_id: managerA.id })
      .select("id").single();
    squadA = sa!.id;
    const { data: sb } = await admin.from("squads")
      .insert({ organization_id: chapterDps, name: "Squad B", code: `sb-${stamp}`, manager_id: managerB.id })
      .select("id").single();
    squadB = sb!.id;

    await admin.from("profiles").update({ squad_id: squadA }).eq("id", talentA.id);
    await admin.from("profiles").update({ squad_id: squadB }).eq("id", talentB.id);
  });

  // Cleanup failures throw: fixtures leaking into a shared project is a
  // defect, not noise. Squads go before organizations (ON DELETE RESTRICT).
  afterAll(async () => {
    for (const id of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`deleteUser ${id}: ${error.message}`);
    }
    const squads = await admin.from("squads").delete().in("id", [squadA, squadB]);
    if (squads.error) throw new Error(`delete squads: ${squads.error.message}`);
    const orgs = await admin.from("organizations").delete().in("id", [chapterDps, chapterOther]);
    if (orgs.error) throw new Error(`delete organizations: ${orgs.error.message}`);
  });

  it("talent reads own profile", async () => {
    const { data } = await talentA.client.from("profiles").select("id").eq("id", talentA.id);
    expect(data?.length).toBe(1);
  });

  it("talent cannot read another talent's profile", async () => {
    const { data } = await talentA.client.from("profiles").select("id").eq("id", talentB.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("manager reads own squad's talent", async () => {
    const { data } = await managerA.client.from("profiles").select("id").eq("id", talentA.id);
    expect(data?.length).toBe(1);
  });

  it("manager cannot read another manager's squad talent", async () => {
    const { data } = await managerA.client.from("profiles").select("id").eq("id", talentB.id);
    expect(data ?? [], "cross-squad read was NOT denied").toHaveLength(0);
  });

  it("chapter lead reads within own chapter", async () => {
    const { data } = await chapterLead.client.from("profiles").select("id").eq("id", talentB.id);
    expect(data?.length).toBe(1);
  });

  it("chapter lead cannot read outside own chapter", async () => {
    const { data } = await chapterLead.client
      .from("organizations").select("id").eq("id", chapterOther);
    expect(data ?? []).toHaveLength(0);
  });

  it("talent cannot escalate via organization_memberships", async () => {
    const { data: superRole } = await admin.from("roles").select("id").eq("code", "SUPER_ADMIN").single();
    const { error } = await talentA.client.from("organization_memberships").insert({
      user_id: talentA.id,
      organization_id: chapterDps,
      role_id: superRole!.id,
    });
    expect(error?.code, "self-escalation was NOT denied by RLS").toBe("42501");
  });

  it("a chapter lead without admin.users cannot grant memberships", async () => {
    const { data: role } = await admin.from("roles").select("id").eq("code", "MANAGER").single();
    const { error } = await chapterLead.client.from("organization_memberships").insert({
      user_id: talentB.id,
      organization_id: chapterOther,
      role_id: role!.id,
    });
    expect(error?.code, "membership grant was NOT denied by RLS").toBe("42501");
  });

  // The pair below isolates the RESTRICTIVE no-self-grant policy
  // (20260921090001). A SUPER_ADMIN passes the permissive insert policy, so
  // the only thing that can refuse their own row is the self-grant ban; the
  // control proves the same actor is otherwise allowed.
  it("a SUPER_ADMIN cannot grant a membership to themselves", async () => {
    const { data: role } = await admin.from("roles").select("id").eq("code", "MANAGER").single();
    const { error } = await superAdmin.client.from("organization_memberships").insert({
      user_id: superAdmin.id,
      organization_id: chapterOther,
      role_id: role!.id,
    });
    expect(error?.code, "self-grant was NOT denied by RLS").toBe("42501");
  });

  it("control: a SUPER_ADMIN can grant a membership to someone else", async () => {
    const { data: role } = await admin.from("roles").select("id").eq("code", "MANAGER").single();
    const { error } = await superAdmin.client.from("organization_memberships").insert({
      user_id: talentB.id,
      organization_id: chapterOther,
      role_id: role!.id,
    });
    expect(error, "the control grant failed, so the self-grant denial proves nothing").toBeNull();
  });

  it("anonymous callers read nothing", async () => {
    const anon = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    const { data } = await anon.from("profiles").select("id");
    expect(data ?? []).toHaveLength(0);
  });
});
