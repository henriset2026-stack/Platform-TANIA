import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

/**
 * RLS enforcement of TANIA_RBAC_RLS_MATRIX.md §9.
 *
 * STATUS: NEVER RUN. No TANIA database exists.
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

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await admin.from("organizations").delete().in("id", [chapterDps, chapterOther]);
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
    expect(error, "self-escalation was NOT denied").toBeTruthy();
  });

  it("an administrator cannot grant a membership to themselves", async () => {
    const { data: role } = await admin.from("roles").select("id").eq("code", "MANAGER").single();
    const { error } = await chapterLead.client.from("organization_memberships").insert({
      user_id: chapterLead.id,
      organization_id: chapterDps,
      role_id: role!.id,
    });
    expect(error, "self-grant was NOT denied").toBeTruthy();
  });

  it("anonymous callers read nothing", async () => {
    const anon = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    const { data } = await anon.from("profiles").select("id");
    expect(data ?? []).toHaveLength(0);
  });
});
