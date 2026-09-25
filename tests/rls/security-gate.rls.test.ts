import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

/**
 * SECURITY GATE #1 — attack suite (docs/security/SECURITY_TEST_MATRIX.md).
 *
 * Every test is an attack a real user could attempt through the Data API with
 * their own session, expecting the secure outcome. Outcomes are judged by the
 * row's state afterwards, read through the admin client — a refused write and
 * a write that RLS silently filtered are both "denied", and only the stored
 * state proves which happened.
 *
 * Every denial has a control: someone in scope reaches the same row, so an
 * empty result can never mean "the fixture is missing".
 *
 * User A: chapter A, squad A1.  User B: chapter B, squad B1.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

type Client = SupabaseClient<Database>;
type Membership = readonly [roleCode: string, organizationId: string];

interface Actor {
  readonly id: string;
  readonly client: Client;
}

describe.skipIf(!configured)("SECURITY GATE #1", () => {
  const stamp = Date.now();
  const userIds: string[] = [];
  const projectIds: string[] = [];
  let admin: Client;

  let chapterA: string;
  let chapterB: string;
  let squadA1: string;
  let squadB1: string;
  let periodId: string;
  let domainId: string;
  let capabilityId: string;

  let talentA: Actor;
  let talentA2: Actor;
  let managerA: Actor;
  let leadA: Actor;
  let hrA: Actor;
  let pmA: Actor;
  let aiA: Actor;
  let talentB: Actor;
  let managerB: Actor;
  /** Target of escalation attempts, so a grant that wrongly succeeds cannot contaminate other tests. */
  let bystander: Actor;

  const ids = {
    evidenceB: "",
    planB: "",
    capEvidenceB: "",
    usageB: "",
    impactB: "",
    projectB: "",
    planA2: "",
    planManager: "",
    capabilityA: "",
    capEvidenceA: "",
    impactA: "",
    learningEvidenceA: "",
  };

  async function must<T>(
    request: PromiseLike<{ data: T; error: { message: string } | null }>,
    what: string,
  ): Promise<NonNullable<T>> {
    const { data, error } = await request;
    if (error) throw new Error(`${what}: ${error.message}`);
    return data as NonNullable<T>;
  }

  async function roleId(code: string): Promise<string> {
    return (await must(admin.from("roles").select("id").eq("code", code).single(), `role ${code}`)).id;
  }

  async function makeActor(label: string, memberships: readonly Membership[], squadId?: string): Promise<Actor> {
    const email = `sg-${label}-${stamp}@example.test`;
    const password = crypto.randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
    userIds.push(data.user.id);
    await must(
      admin.from("profiles").insert({
        id: data.user.id,
        full_name: label,
        email,
        chapter_id: memberships[0]![1],
        ...(squadId ? { squad_id: squadId } : {}),
      }),
      `profile ${label}`,
    );
    for (const [code, organizationId] of memberships) {
      await must(
        admin.from("organization_memberships").insert({
          user_id: data.user.id,
          organization_id: organizationId,
          role_id: await roleId(code),
        }),
        `membership ${label}`,
      );
    }
    const client = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`signIn ${label}: ${signIn.error.message}`);
    return { id: data.user.id, client };
  }

  /** Rows visible to `actor` for `table` with `id`. */
  async function visible(actor: Actor, table: keyof Database["public"]["Tables"], id: string): Promise<number> {
    // A union of table names collapses eq()'s column type; every table here has id.
    const { data } = await actor.client.from(table).select("id").eq("id" as never, id as never);
    return (data ?? []).length;
  }

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } });

    const orgs = await must(
      admin
        .from("organizations")
        .insert([
          { name: `SG Chapter A ${stamp}`, code: `SG-A-${stamp}` },
          { name: `SG Chapter B ${stamp}`, code: `SG-B-${stamp}` },
        ])
        .select("id, code"),
      "organizations",
    );
    chapterA = orgs.find((o) => o.code.startsWith("SG-A"))!.id;
    chapterB = orgs.find((o) => o.code.startsWith("SG-B"))!.id;

    const squads = await must(
      admin
        .from("squads")
        .insert([
          { organization_id: chapterA, name: `SG A1 ${stamp}`, code: `SG-SQ-A1-${stamp}` },
          { organization_id: chapterB, name: `SG B1 ${stamp}`, code: `SG-SQ-B1-${stamp}` },
        ])
        .select("id, code"),
      "squads",
    );
    squadA1 = squads.find((s) => s.code.startsWith("SG-SQ-A1"))!.id;
    squadB1 = squads.find((s) => s.code.startsWith("SG-SQ-B1"))!.id;

    talentA = await makeActor("talent-a", [["TALENT", chapterA]], squadA1);
    talentA2 = await makeActor("talent-a2", [["TALENT", chapterA]], squadA1);
    managerA = await makeActor("manager-a", [["MANAGER", chapterA]]);
    leadA = await makeActor("lead-a", [["CHAPTER_LEAD", chapterA]]);
    hrA = await makeActor("hr-a", [["HR", chapterA]]);
    pmA = await makeActor("pm-a", [["PROJECT_MANAGER", chapterA]]);
    aiA = await makeActor("ai-a", [["AI_SERVICE", chapterA]]);
    talentB = await makeActor("talent-b", [["TALENT", chapterB]], squadB1);
    managerB = await makeActor("manager-b", [["MANAGER", chapterB]]);
    bystander = await makeActor("bystander", [["TALENT", chapterA]]);

    await must(admin.from("squads").update({ manager_id: managerA.id }).eq("id", squadA1), "squad A1 manager");
    await must(admin.from("squads").update({ manager_id: managerB.id }).eq("id", squadB1), "squad B1 manager");

    periodId = (
      await must(
        admin
          .from("performance_periods")
          .insert({ name: `SG ${stamp}`, period_type: "quarterly", start_date: "2026-07-01", end_date: "2026-09-30" })
          .select("id")
          .single(),
        "period",
      )
    ).id;

    ids.evidenceB = (
      await must(
        admin
          .from("performance_evidence")
          .insert({ profile_id: talentB.id, period_id: periodId, dimension: "delivery", source_type: "fixture" })
          .select("id")
          .single(),
        "evidence B",
      )
    ).id;

    const plans = await must(
      admin
        .from("development_plans")
        .insert([
          { profile_id: talentB.id, title: "SG planB", status: "proposed" },
          { profile_id: talentA2.id, title: "SG planA2", status: "proposed" },
          { profile_id: managerA.id, title: "SG planManager", status: "proposed" },
          { profile_id: talentA.id, title: "SG planA", status: "approved" },
        ])
        .select("id, title"),
      "plans",
    );
    const planId = (title: string) => plans.find((p) => p.title === title)!.id;
    ids.planB = planId("SG planB");
    ids.planA2 = planId("SG planA2");
    ids.planManager = planId("SG planManager");

    domainId = (
      await must(
        admin.from("capability_domains").insert({ name: `SG ${stamp}`, code: `SG-DOM-${stamp}` }).select("id").single(),
        "domain",
      )
    ).id;
    capabilityId = (
      await must(
        admin
          .from("capabilities")
          .insert({ domain_id: domainId, name: `SG ${stamp}`, code: `SG-CAP-${stamp}` })
          .select("id")
          .single(),
        "capability",
      )
    ).id;
    const held = await must(
      admin
        .from("talent_capabilities")
        .insert([
          { profile_id: talentB.id, capability_id: capabilityId },
          { profile_id: talentA.id, capability_id: capabilityId },
        ])
        .select("id, profile_id"),
      "talent_capabilities",
    );
    const tcB = held.find((r) => r.profile_id === talentB.id)!.id;
    ids.capabilityA = held.find((r) => r.profile_id === talentA.id)!.id;

    const capEvidence = await must(
      admin
        .from("capability_evidence")
        .insert([
          { talent_capability_id: tcB, source_type: "fixture", title: "SG B", created_by: null },
          { talent_capability_id: ids.capabilityA, source_type: "fixture", title: "SG A", created_by: talentA.id },
        ])
        .select("id, title"),
      "capability evidence",
    );
    ids.capEvidenceB = capEvidence.find((e) => e.title === "SG B")!.id;
    ids.capEvidenceA = capEvidence.find((e) => e.title === "SG A")!.id;

    ids.usageB = (
      await must(
        admin.from("ai_usage").insert({ profile_id: talentB.id, tool_name: "fixture", use_case: "fixture" }).select("id").single(),
        "ai usage B",
      )
    ).id;

    const projects = await must(
      admin
        .from("projects")
        .insert([
          { organization_id: chapterA, name: "SG project A", code: `SG-PRJ-A-${stamp}` },
          { organization_id: chapterB, name: "SG project B", code: `SG-PRJ-B-${stamp}` },
        ])
        .select("id, code"),
      "projects",
    );
    const projectA = projects.find((p) => p.code.startsWith("SG-PRJ-A"))!.id;
    ids.projectB = projects.find((p) => p.code.startsWith("SG-PRJ-B"))!.id;
    projectIds.push(projectA, ids.projectB);

    const impacts = await must(
      admin
        .from("business_impacts")
        .insert([
          { project_id: ids.projectB, profile_id: talentB.id, impact_type: "revenue", metric_name: "SG B" },
          { project_id: projectA, profile_id: talentA.id, impact_type: "revenue", metric_name: "SG A" },
        ])
        .select("id, metric_name"),
      "business impacts",
    );
    ids.impactB = impacts.find((i) => i.metric_name === "SG B")!.id;
    ids.impactA = impacts.find((i) => i.metric_name === "SG A")!.id;

    const path = await must(
      admin
        .from("learning_paths")
        .insert({ development_plan_id: planId("SG planA"), title: "SG path" })
        .select("id")
        .single(),
      "learning path",
    );
    const activity = await must(
      admin
        .from("learning_activities")
        .insert({ learning_path_id: path.id, title: "SG activity", activity_type: "practice", sequence_no: 1 })
        .select("id")
        .single(),
      "learning activity",
    );
    ids.learningEvidenceA = (
      await must(
        admin
          .from("learning_evidence")
          .insert({ activity_id: activity.id, profile_id: talentA.id, evidence_type: "fixture" })
          .select("id")
          .single(),
        "learning evidence",
      )
    ).id;
  });

  afterAll(async () => {
    // Evidence tables revoke DELETE from `authenticated` only; the admin
    // client removes fixtures. Order respects RESTRICT foreign keys.
    const first: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
      ["business_impacts", () => admin.from("business_impacts").delete().in("project_id", projectIds)],
      ["performance_evidence", () => admin.from("performance_evidence").delete().in("profile_id", userIds)],
      ["learning_evidence", () => admin.from("learning_evidence").delete().in("profile_id", userIds)],
      ["capability_evidence", () => admin.from("capability_evidence").delete().in("id", [ids.capEvidenceA, ids.capEvidenceB])],
      // Approval columns are ON DELETE SET NULL but paired by a CHECK, so an
      // approver's profile cannot be deleted while their approval stands.
      ["development_plans", () => admin.from("development_plans").delete().in("profile_id", userIds)],
    ];
    for (const [what, step] of first) {
      const { error } = await step();
      if (error) throw new Error(`cleanup ${what}: ${error.message}`);
    }
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`deleteUser ${id}: ${error.message}`);
    }
    const rest: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
      ["projects", () => admin.from("projects").delete().in("id", projectIds)],
      ["period", () => admin.from("performance_periods").delete().eq("id", periodId)],
      ["capability", () => admin.from("capabilities").delete().eq("id", capabilityId)],
      ["domain", () => admin.from("capability_domains").delete().eq("id", domainId)],
      ["squads", () => admin.from("squads").delete().in("organization_id", [chapterA, chapterB])],
      ["organizations", () => admin.from("organizations").delete().in("id", [chapterA, chapterB])],
    ];
    for (const [what, step] of rest) {
      const { error } = await step();
      if (error) throw new Error(`cleanup ${what}: ${error.message}`);
    }
  });

  // =========================================================================
  // AUTH-003 — identity comes from a verified token, never from a claim
  // =========================================================================
  describe("AUTH-003 a forged token is rejected", () => {
    it("a self-signed JWT claiming service_role gets nothing", async () => {
      const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const forged = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
        sub: talentB.id,
        role: "service_role",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })}.forged-signature`;
      const response = await fetch(`${URL}/rest/v1/profiles?select=id&id=eq.${talentB.id}`, {
        headers: { apikey: ANON!, Authorization: `Bearer ${forged}` },
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // RLS-001 / step 5 — horizontal: User A (chapter A) against User B (chapter B)
  // =========================================================================
  describe("RLS-001 cross-chapter read is denied", () => {
    it("control: chapter B's manager sees every User B record", async () => {
      expect(await visible(managerB, "profiles", talentB.id)).toBe(1);
      expect(await visible(managerB, "performance_evidence", ids.evidenceB)).toBe(1);
      expect(await visible(managerB, "development_plans", ids.planB)).toBe(1);
      expect(await visible(managerB, "capability_evidence", ids.capEvidenceB)).toBe(1);
      expect(await visible(managerB, "ai_usage", ids.usageB)).toBe(1);
    });

    it.each([
      ["profiles", "talentB"],
      ["performance_evidence", "evidenceB"],
      ["development_plans", "planB"],
      ["capability_evidence", "capEvidenceB"],
      ["ai_usage", "usageB"],
      ["business_impacts", "impactB"],
    ] as const)("chapter A's manager and lead cannot read User B's %s", async (table, key) => {
      const id = key === "talentB" ? talentB.id : ids[key];
      expect(await visible(managerA, table, id)).toBe(0);
      expect(await visible(leadA, table, id)).toBe(0);
    });

    it("an AI identity cannot read User B", async () => {
      expect(await visible(aiA, "profiles", talentB.id)).toBe(0);
    });
  });

  describe("RLS-002 / RLS-004 cross-chapter write and delete are denied", () => {
    it("chapter A's lead cannot modify User B's profile", async () => {
      await leadA.client.from("profiles").update({ job_title: "SG-forged" }).eq("id", talentB.id);
      const row = await must(admin.from("profiles").select("job_title").eq("id", talentB.id).single(), "B");
      expect(row.job_title).not.toBe("SG-forged");
    });

    it("chapter A's manager cannot modify User B's performance evidence", async () => {
      await managerA.client.from("performance_evidence").update({ value: 999 }).eq("id", ids.evidenceB);
      const row = await must(admin.from("performance_evidence").select("value").eq("id", ids.evidenceB).single(), "e");
      expect(row.value).not.toBe(999);
    });

    it("User A cannot delete User B's profile or development plan", async () => {
      await talentA.client.from("profiles").delete().eq("id", talentB.id);
      await leadA.client.from("development_plans").delete().eq("id", ids.planB);
      expect((await admin.from("profiles").select("id").eq("id", talentB.id)).data?.length).toBe(1);
      expect((await admin.from("development_plans").select("id").eq("id", ids.planB)).data?.length).toBe(1);
    });

    it("a PM cannot create an assignment involving User B on another chapter's project", async () => {
      const { error } = await pmA.client
        .from("assignments")
        .insert({ project_id: ids.projectB, profile_id: talentB.id, status: "proposed" });
      expect(error?.code).toBe("42501");
    });
  });

  describe("RLS-003 same-chapter isolation", () => {
    it("Talent → another Talent: a squad-mate's development plan is invisible", async () => {
      expect(await visible(managerA, "development_plans", ids.planA2)).toBe(1);
      expect(await visible(talentA, "development_plans", ids.planA2)).toBe(0);
    });

    it("Talent → Manager: the manager's development plan is invisible", async () => {
      expect(await visible(leadA, "development_plans", ids.planManager)).toBe(1);
      expect(await visible(talentA, "development_plans", ids.planManager)).toBe(0);
    });
  });

  // =========================================================================
  // IDOR-001 — knowing an id grants nothing
  // =========================================================================
  describe("IDOR-001 object id manipulation is denied", () => {
    it("addressing User B's plan by id neither reads nor changes it", async () => {
      const read = await talentA.client.from("development_plans").select("*").eq("id", ids.planB);
      expect(read.data ?? []).toEqual([]);
      await talentA.client.from("development_plans").update({ title: "SG-idor" }).eq("id", ids.planB);
      const row = await must(admin.from("development_plans").select("title").eq("id", ids.planB).single(), "plan");
      expect(row.title).toBe("SG planB");
    });
  });

  // =========================================================================
  // PRIV-001 / PRIV-002 — role and permission escalation
  // =========================================================================
  describe("PRIV-001 role escalation is denied", () => {
    async function membershipCount(userId: string, roleCode: string): Promise<number> {
      const { data } = await admin
        .from("organization_memberships")
        .select("id, roles!inner(code)")
        .eq("user_id", userId)
        .eq("roles.code", roleCode);
      return (data ?? []).length;
    }

    it("HR (admin.users) cannot grant SUPER_ADMIN", async () => {
      await hrA.client
        .from("organization_memberships")
        .insert({ user_id: bystander.id, organization_id: chapterA, role_id: await roleId("SUPER_ADMIN") });
      expect(await membershipCount(bystander.id, "SUPER_ADMIN")).toBe(0);
    });

    it("HR cannot grant EXECUTIVE, which reaches every chapter", async () => {
      await hrA.client
        .from("organization_memberships")
        .insert({ user_id: bystander.id, organization_id: chapterA, role_id: await roleId("EXECUTIVE") });
      expect(await membershipCount(bystander.id, "EXECUTIVE")).toBe(0);
    });

    it("HR cannot grant a role in another chapter", async () => {
      await hrA.client
        .from("organization_memberships")
        .insert({ user_id: talentB.id, organization_id: chapterB, role_id: await roleId("MANAGER") });
      expect(await membershipCount(talentB.id, "MANAGER")).toBe(0);
    });

    it("control: HR grants MANAGER within its own chapter", async () => {
      const { error } = await hrA.client
        .from("organization_memberships")
        .insert({ user_id: talentA2.id, organization_id: chapterA, role_id: await roleId("MANAGER") });
      expect(error).toBeNull();
      expect(await membershipCount(talentA2.id, "MANAGER")).toBe(1);
    });

    it("a MANAGER (no admin.users) cannot grant memberships", async () => {
      const { error } = await managerA.client
        .from("organization_memberships")
        .insert({ user_id: bystander.id, organization_id: chapterA, role_id: await roleId("CHAPTER_LEAD") });
      expect(error?.code).toBe("42501");
    });
  });

  describe("PRIV-002 permission escalation is denied", () => {
    it.each([
      ["PROJECT_MANAGER", () => pmA],
      ["AI_SERVICE", () => aiA],
      ["CHAPTER_LEAD", () => leadA],
    ] as const)("%s cannot grant a role a permission", async (_label, actor) => {
      const { data: permission } = await admin.from("permissions").select("id").eq("code", "admin.roles").single();
      const { error } = await actor()
        .client.from("role_permissions")
        .insert({ role_id: await roleId("TALENT"), permission_id: permission!.id });
      expect(error?.code).toBe("42501");
    });

    it("an AI identity cannot create a role", async () => {
      const { error } = await aiA.client.from("roles").insert({ code: `SG_${stamp}`, name: "forged" });
      expect(error?.code).toBe("42501");
    });
  });

  describe("PRIV-003 a user cannot move themselves into another scope", () => {
    it("a manager cannot re-home themselves into another chapter's squad", async () => {
      try {
        await managerA.client.from("profiles").update({ squad_id: squadB1 }).eq("id", managerA.id);
        // Whatever the write did, the manager must still not reach chapter B.
        expect(await visible(managerA, "profiles", talentB.id)).toBe(0);
        expect(await visible(managerA, "performance_evidence", ids.evidenceB)).toBe(0);
        const row = await must(admin.from("profiles").select("squad_id").eq("id", managerA.id).single(), "m");
        expect(row.squad_id).toBeNull();
      } finally {
        await admin.from("profiles").update({ squad_id: null }).eq("id", managerA.id);
      }
    });

    it("a talent cannot change their own chapter", async () => {
      try {
        await talentA.client.from("profiles").update({ chapter_id: chapterB }).eq("id", talentA.id);
        const row = await must(admin.from("profiles").select("chapter_id").eq("id", talentA.id).single(), "t");
        expect(row.chapter_id).toBe(chapterA);
      } finally {
        await admin.from("profiles").update({ chapter_id: chapterA }).eq("id", talentA.id);
      }
    });

    it("control: a talent can still edit their own non-privileged fields", async () => {
      const { error } = await talentA.client.from("profiles").update({ job_title: "SG engineer" }).eq("id", talentA.id);
      expect(error).toBeNull();
      const row = await must(admin.from("profiles").select("job_title").eq("id", talentA.id).single(), "t");
      expect(row.job_title).toBe("SG engineer");
    });
  });

  // =========================================================================
  // SEC-003 — mass assignment of provenance / validation fields
  // =========================================================================
  describe("SEC-003 a subject cannot validate their own evidence", () => {
    it("self-submitted performance evidence cannot arrive validated or attributed to someone else", async () => {
      await talentA.client.from("performance_evidence").insert({
        profile_id: talentA.id,
        period_id: periodId,
        dimension: "delivery",
        source_type: "self",
        source_reference: `SG-self-${stamp}`,
        validation_status: "validated",
        validated_by: leadA.id,
        validated_at: new Date().toISOString(),
        created_by: leadA.id,
      });
      const { data } = await admin
        .from("performance_evidence")
        .select("validation_status, created_by, validated_by")
        .eq("source_reference", `SG-self-${stamp}`);
      for (const row of data ?? []) {
        expect(row.validation_status).toBe("pending");
        expect(row.validated_by).toBeNull();
        expect(row.created_by).toBe(talentA.id);
      }
    });

    it("self-submitted capability evidence cannot arrive validated", async () => {
      await talentA.client.from("capability_evidence").insert({
        talent_capability_id: ids.capabilityA,
        source_type: "self",
        title: `SG-self-cap-${stamp}`,
        validation_status: "validated",
        validated_by: leadA.id,
        validated_at: new Date().toISOString(),
      });
      const { data } = await admin
        .from("capability_evidence")
        .select("validation_status")
        .eq("title", `SG-self-cap-${stamp}`);
      for (const row of data ?? []) expect(row.validation_status).toBe("pending");
      await admin.from("capability_evidence").delete().eq("title", `SG-self-cap-${stamp}`);
    });

    it("the creator of capability evidence cannot validate it later", async () => {
      await talentA.client
        .from("capability_evidence")
        .update({ validation_status: "validated", validated_by: talentA.id, validated_at: new Date().toISOString() })
        .eq("id", ids.capEvidenceA);
      const row = await must(
        admin.from("capability_evidence").select("validation_status").eq("id", ids.capEvidenceA).single(),
        "cap A",
      );
      expect(row.validation_status).toBe("pending");
    });

    it("a talent cannot certify their own capability as evidence-validated", async () => {
      await talentA.client
        .from("talent_capabilities")
        .update({ assessment_status: "evidence_validated", current_level: 5, assessed_by: leadA.id })
        .eq("id", ids.capabilityA);
      const row = await must(
        admin.from("talent_capabilities").select("assessment_status, assessed_by").eq("id", ids.capabilityA).single(),
        "tc A",
      );
      expect(row.assessment_status).not.toBe("evidence_validated");
      expect(row.assessed_by).not.toBe(leadA.id);
    });

    it("a talent cannot evaluate their own learning evidence", async () => {
      await talentA.client
        .from("learning_evidence")
        .update({ score: 100, evaluator_id: talentA.id, evaluated_at: new Date().toISOString() })
        .eq("id", ids.learningEvidenceA);
      const row = await must(
        admin.from("learning_evidence").select("score, evaluator_id").eq("id", ids.learningEvidenceA).single(),
        "le A",
      );
      expect(row.evaluator_id).toBeNull();
      expect(row.score).toBeNull();
    });

    it("a talent cannot score their own AI augmentation", async () => {
      const { error } = await talentA.client
        .from("ai_augmentation")
        .insert({ profile_id: talentA.id, overall_score: 100 });
      expect(error?.code).toBe("42501");
    });

    it("control: the squad manager records a talent's AI augmentation", async () => {
      const { error } = await managerA.client
        .from("ai_augmentation")
        .insert({ profile_id: talentA.id, overall_score: 60 });
      expect(error).toBeNull();
    });

    it("a talent cannot record AI usage in someone else's name", async () => {
      const { error } = await talentA.client
        .from("ai_usage")
        .insert({ profile_id: talentA2.id, tool_name: "forged", use_case: "forged" });
      expect(error?.code).toBe("42501");
    });
  });

  describe("business_impact.validate is required to validate impact", () => {
    it("a manager holding only business_impact.update cannot validate", async () => {
      await managerA.client
        .from("business_impacts")
        .update({ validation_status: "validated", validated_by: managerA.id, validated_at: new Date().toISOString() })
        .eq("id", ids.impactA);
      const row = await must(
        admin.from("business_impacts").select("validation_status").eq("id", ids.impactA).single(),
        "impact A",
      );
      expect(row.validation_status).toBe("pending");
    });

    it("control: the chapter lead validates it", async () => {
      const { error } = await leadA.client
        .from("business_impacts")
        .update({ validation_status: "validated", validated_by: leadA.id, validated_at: new Date().toISOString() })
        .eq("id", ids.impactA);
      expect(error).toBeNull();
      const row = await must(
        admin.from("business_impacts").select("validation_status").eq("id", ids.impactA).single(),
        "impact A",
      );
      expect(row.validation_status).toBe("validated");
    });
  });

  describe("step 6 — TALENT attempting approvals", () => {
    it("a talent cannot approve a squad-mate's development plan", async () => {
      await talentA.client
        .from("development_plans")
        .update({ status: "approved", approved_by: talentA.id, approved_at: new Date().toISOString() })
        .eq("id", ids.planA2);
      const row = await must(admin.from("development_plans").select("status").eq("id", ids.planA2).single(), "A2");
      expect(row.status).toBe("proposed");
    });
  });

  // =========================================================================
  // AUDIT-001 — sensitive changes leave an attributed audit record
  // =========================================================================
  describe("AUDIT-001 sensitive actions are audited", () => {
    it("a role grant is recorded with its actor", async () => {
      const { data } = await admin
        .from("audit_logs")
        .select("user_id, action, after_data")
        .eq("resource_type", "organization_memberships")
        .eq("user_id", hrA.id);
      expect((data ?? []).length).toBeGreaterThanOrEqual(1);
      expect(data?.[0]?.action).toBe("organization_memberships.insert");
    });

    it("a business impact validation is recorded with its actor", async () => {
      const { data } = await admin
        .from("audit_logs")
        .select("user_id, action")
        .eq("resource_type", "business_impacts")
        .eq("resource_id", ids.impactA);
      expect((data ?? []).map((r) => r.user_id)).toContain(leadA.id);
    });
  });
});
