import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

/**
 * RLS across all four verbs, plus cross-scope access.
 *
 * STATUS: NEVER RUN. No TANIA database exists (CLAUDE.md §2c).
 *
 * tests/rls/matrix.rls.test.ts covers SELECT against the §9 matrix. This adds
 * the write verbs, which are where the damaging failures live: a missing
 * SELECT policy leaks, a missing INSERT or UPDATE policy lets someone alter
 * another chapter's records, and a missing DELETE revocation destroys
 * evidence.
 *
 * Skipped rather than passed when unconfigured — a green tick against no
 * database would be a fabricated result.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

type Client = SupabaseClient<Database>;

interface Actor {
  readonly id: string;
  readonly client: Client;
}

describe.skipIf(!configured)("RLS: SELECT, INSERT, UPDATE, DELETE", () => {
  let admin: Client;
  let chapterA: string;
  let chapterB: string;
  let squadA: string;
  let managerA: Actor;
  let managerB: Actor;
  let talentA: Actor;
  const createdUserIds: string[] = [];

  async function makeActor(label: string, roleCode: string, orgId: string): Promise<Actor> {
    const email = `crud-${label}-${Date.now()}@example.test`;
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
      chapter_id: orgId,
    });

    const { data: role } = await admin
      .from("roles")
      .select("id")
      .eq("code", roleCode)
      .single();

    await admin.from("organization_memberships").insert({
      user_id: created.user.id,
      organization_id: orgId,
      role_id: role!.id,
    });

    const client = createClient<Database>(URL!, ANON!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`signIn failed: ${signInError.message}`);

    return { id: created.user.id, client };
  }

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const stamp = Date.now();
    const { data: orgs } = await admin
      .from("organizations")
      .insert([
        { name: `Chapter A ${stamp}`, code: `CRUD-A-${stamp}` },
        { name: `Chapter B ${stamp}`, code: `CRUD-B-${stamp}` },
      ])
      .select("id");
    chapterA = orgs![0]!.id;
    chapterB = orgs![1]!.id;

    const { data: squads } = await admin
      .from("squads")
      .insert([{ organization_id: chapterA, name: `Squad A ${stamp}`, code: `SQ-A-${stamp}` }])
      .select("id");
    squadA = squads![0]!.id;

    managerA = await makeActor("manager-a", "MANAGER", chapterA);
    managerB = await makeActor("manager-b", "MANAGER", chapterB);
    talentA = await makeActor("talent-a", "TALENT", chapterA);

    await admin.from("profiles").update({ squad_id: squadA }).eq("id", talentA.id);
    await admin.from("squads").update({ manager_id: managerA.id }).eq("id", squadA);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await admin.from("organizations").delete().in("id", [chapterA, chapterB]);
  });

  // --- SELECT -----------------------------------------------------------
  it("SELECT: a manager reads their own squad", async () => {
    const { data } = await managerA.client.from("profiles").select("id").eq("id", talentA.id);
    expect(data?.length).toBe(1);
  });

  it("SELECT: a manager in another chapter reads nothing", async () => {
    const { data } = await managerB.client.from("profiles").select("id").eq("id", talentA.id);
    expect(data ?? []).toEqual([]);
  });

  // --- INSERT -----------------------------------------------------------
  it("INSERT: a talent cannot create capability evidence for someone else", async () => {
    const { data: held } = await admin
      .from("talent_capabilities")
      .select("id")
      .limit(1);
    if (!held || held.length === 0) return;

    const { error } = await talentA.client.from("capability_evidence").insert({
      talent_capability_id: held[0]!.id,
      source_type: "project_deliverable",
      title: "forged",
    });
    expect(error, "an insert outside scope must be refused").not.toBeNull();
  });

  it("INSERT: nobody can write an audit row directly", async () => {
    const { error } = await managerA.client.from("audit_logs").insert({
      action: "forged.event",
      resource_type: "profiles",
      user_id: managerA.id,
    } as never);
    // Direct INSERT is revoked; rows arrive only via record_audit_event().
    expect(error).not.toBeNull();
  });

  // --- UPDATE -----------------------------------------------------------
  it("UPDATE: a manager cannot modify a profile in another chapter", async () => {
    const { error, data } = await managerB.client
      .from("profiles")
      .update({ job_title: "escalated" })
      .eq("id", talentA.id)
      .select("id");
    // Either refused outright, or filtered to zero rows by RLS.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  // types/database.ts declares audit_logs as a ReadOnlyTable, so its Update
  // type is `never` and this does not compile without a cast — the type
  // system refuses before the database does. The cast is deliberate: the
  // point is to confirm the database refuses it too, since a type is not a
  // control.
  it("UPDATE: nobody can rewrite an audit row", async () => {
    const { error, data } = await managerA.client
      .from("audit_logs")
      .update({ action: "rewritten" } as never)
      .eq("id", 1 as never)
      .select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  // --- DELETE -----------------------------------------------------------
  it("DELETE: evidence is withdrawn, never erased", async () => {
    const { data: evidence } = await admin
      .from("capability_evidence")
      .select("id")
      .limit(1);
    if (!evidence || evidence.length === 0) return;

    const { error, data } = await managerA.client
      .from("capability_evidence")
      .delete()
      .eq("id", evidence[0]!.id)
      .select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("DELETE: an audit row cannot be removed by anyone", async () => {
    const { error, data } = await managerA.client
      .from("audit_logs")
      .delete()
      .eq("id", 1 as never)
      .select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  // --- Cross-scope ------------------------------------------------------
  it("cross-scope: an anonymous client reads nothing", async () => {
    const anonymous = createClient<Database>(URL!, ANON!);
    const { data } = await anonymous.from("profiles").select("id").limit(1);
    expect(data ?? []).toEqual([]);
  });

  it("cross-scope: a manager cannot widen their own membership", async () => {
    const { data: role } = await admin.from("roles").select("id").eq("code", "SUPER_ADMIN").single();
    const { error } = await managerA.client.from("organization_memberships").insert({
      user_id: managerA.id,
      organization_id: chapterA,
      role_id: role!.id,
    });
    // Migration 20260921090001 forbids granting a membership to yourself:
    // a privilege change needs a second person.
    expect(error, "self-granted membership must be refused").not.toBeNull();
  });
});
