import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

/**
 * TANIA_RBAC_RLS_MATRIX.md §9 — the rows matrix.rls.test.ts does not cover.
 *
 *   Talent → another private performance     DENY
 *   PM → assigned project                     ALLOW
 *   PM → unrelated project                    DENY
 *   Executive → aggregate                     ALLOW
 *   Executive → restricted individual record  DENY
 *   HR → authorized people scope              ALLOW
 *   AI → outside delegated scope              DENY
 *   AI → approve performance                  DENY
 *
 * plus the approval rules behind the last row (approve_review only, in scope,
 * recorded under your own name — CLAUDE.md §2e "approval pairing").
 *
 * Assertions encode the MATRIX, not current behaviour. Every denial has a
 * control showing the same row is reachable by someone in scope, so an empty
 * result means "denied", never "the fixture is missing". Approval attempts
 * are judged by the row's state afterwards, read through the admin client:
 * what matters is whether the review ended up approved, not which error
 * shape PostgREST chose.
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

type Membership = readonly [roleCode: string, organizationId: string];

describe.skipIf(!configured)("RLS matrix §9: extended rows", () => {
  const stamp = Date.now();
  const userIds: string[] = [];
  const periodIds: string[] = [];
  const reviewIds: string[] = [];
  const projectIds: string[] = [];
  let admin: Client;

  let chapterA: string;
  let chapterB: string;
  let squadA: string;
  let domainId: string;
  const capabilityIds: string[] = [];

  let talentA: Actor;
  let peerA: Actor;
  let talentB: Actor;
  let managerA: Actor;
  let leadA: Actor;
  let leadB: Actor;
  let pmA: Actor;
  let executive: Actor;
  let hrA: Actor;
  let aiA: Actor;
  let aiLead: Actor;

  let evidenceId: string;
  let conversationId: string;
  /** Held by five chapter-A talents: at the suppression threshold. */
  let widelyHeldCapability: string;
  /** Held by two: below it, so any figure would single people out. */
  let rarelyHeldCapability: string;
  const plan: Record<"talentSelf" | "managerForged" | "managerApproves", string> = {
    talentSelf: "",
    managerForged: "",
    managerApproves: "",
  };
  let proposedAssignment: string;
  let projectAssigned: string;
  let projectUnrelated: string;
  /** One review per approval attempt, so an attempt that wrongly succeeds cannot contaminate the next. */
  const review: Record<"managerSelf" | "managerForged" | "otherChapter" | "ai", string> = {
    managerSelf: "",
    managerForged: "",
    otherChapter: "",
    ai: "",
  };

  async function must<T>(
    request: PromiseLike<{ data: T; error: { message: string } | null }>,
    what: string,
  ): Promise<NonNullable<T>> {
    const { data, error } = await request;
    if (error) throw new Error(`${what}: ${error.message}`);
    // Writes without .select() legitimately return null; callers that use the
    // data always select it.
    return data as NonNullable<T>;
  }

  async function roleId(code: string): Promise<string> {
    const row = await must(admin.from("roles").select("id").eq("code", code).single(), `role ${code}`);
    return row.id;
  }

  async function makeActor(label: string, memberships: readonly Membership[], squadId?: string): Promise<Actor> {
    const email = `xrls-${label}-${stamp}@example.test`;
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
        `membership ${label}/${code}`,
      );
    }

    const client = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`signIn ${label}: ${signIn.error.message}`);
    return { id: data.user.id, client };
  }

  async function reviewStatus(id: string): Promise<{ status: string; approved_by: string | null }> {
    return must(
      admin.from("performance_reviews").select("status, approved_by").eq("id", id).single(),
      "read review",
    );
  }

  function approval(approverId: string) {
    return { status: "approved", approved_by: approverId, approved_at: new Date().toISOString() };
  }

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } });

    const orgs = await must(
      admin
        .from("organizations")
        .insert([
          { name: `XRLS Chapter A ${stamp}`, code: `XRLS-A-${stamp}` },
          { name: `XRLS Chapter B ${stamp}`, code: `XRLS-B-${stamp}` },
        ])
        .select("id, code"),
      "organizations",
    );
    chapterA = orgs.find((o) => o.code.startsWith("XRLS-A"))!.id;
    chapterB = orgs.find((o) => o.code.startsWith("XRLS-B"))!.id;

    squadA = (
      await must(
        admin
          .from("squads")
          .insert({ organization_id: chapterA, name: `XRLS Squad A ${stamp}`, code: `XRLS-SQ-A-${stamp}` })
          .select("id")
          .single(),
        "squad",
      )
    ).id;

    talentA = await makeActor("talent-a", [["TALENT", chapterA]], squadA);
    peerA = await makeActor("peer-a", [["TALENT", chapterA]], squadA);
    talentB = await makeActor("talent-b", [["TALENT", chapterB]]);
    managerA = await makeActor("manager-a", [["MANAGER", chapterA]]);
    leadA = await makeActor("lead-a", [["CHAPTER_LEAD", chapterA]]);
    leadB = await makeActor("lead-b", [["CHAPTER_LEAD", chapterB]]);
    pmA = await makeActor("pm-a", [["PROJECT_MANAGER", chapterA]]);
    executive = await makeActor("executive", [["EXECUTIVE", chapterA]]);
    hrA = await makeActor("hr-a", [["HR", chapterA]]);
    aiA = await makeActor("ai-a", [["AI_SERVICE", chapterA]]);
    // An AI identity that ALSO holds approve_review in scope. Only the
    // RESTRICTIVE ai_no_approval policy stands between it and an approval,
    // which is exactly what the "AI → approve performance" row must prove.
    aiLead = await makeActor("ai-lead", [
      ["AI_SERVICE", chapterA],
      ["CHAPTER_LEAD", chapterA],
    ]);

    await must(admin.from("squads").update({ manager_id: managerA.id }).eq("id", squadA), "squad manager");

    // Performance: evidence on peerA; four reviews of talentA by their manager.
    for (let i = 0; i < 4; i += 1) {
      const period = await must(
        admin
          .from("performance_periods")
          .insert({
            name: `XRLS ${stamp} P${i}`,
            period_type: "quarterly",
            start_date: `202${i}-01-01`,
            end_date: `202${i}-03-31`,
          })
          .select("id")
          .single(),
        "period",
      );
      periodIds.push(period.id);
    }
    evidenceId = (
      await must(
        admin
          .from("performance_evidence")
          .insert({ profile_id: peerA.id, dimension: "delivery", source_type: "project_deliverable", period_id: periodIds[0]! })
          .select("id")
          .single(),
        "evidence",
      )
    ).id;
    const reviews = await must(
      admin
        .from("performance_reviews")
        .insert(
          periodIds.map((periodId) => ({
            profile_id: talentA.id,
            period_id: periodId,
            reviewer_id: managerA.id,
            status: "submitted",
          })),
        )
        .select("id, period_id"),
      "reviews",
    );
    const byPeriod = (index: number) => reviews.find((r) => r.period_id === periodIds[index])!.id;
    review.managerSelf = byPeriod(0);
    review.managerForged = byPeriod(1);
    review.otherChapter = byPeriod(2);
    review.ai = byPeriod(3);
    reviewIds.push(...reviews.map((r) => r.id));

    // Projects live in chapter B, so the PM's chapter-A membership cannot
    // reach them: the only path to projectAssigned is the assignment itself.
    const projects = await must(
      admin
        .from("projects")
        .insert([
          { organization_id: chapterB, name: "XRLS assigned", code: `XRLS-PRJ-1-${stamp}` },
          { organization_id: chapterB, name: "XRLS unrelated", code: `XRLS-PRJ-2-${stamp}` },
        ])
        .select("id, code"),
      "projects",
    );
    projectAssigned = projects.find((p) => p.code.startsWith("XRLS-PRJ-1"))!.id;
    projectUnrelated = projects.find((p) => p.code.startsWith("XRLS-PRJ-2"))!.id;
    projectIds.push(projectAssigned, projectUnrelated);
    await must(
      admin.from("assignments").insert({ project_id: projectAssigned, profile_id: pmA.id }),
      "assignment",
    );

    // Restricted: a private AI conversation, and a capability for roll-ups.
    conversationId = (
      await must(
        admin.from("ai_interactions").insert({ user_id: talentA.id }).select("id").single(),
        "ai_interaction",
      )
    ).id;
    domainId = (
      await must(
        admin
          .from("capability_domains")
          .insert({ name: `XRLS domain ${stamp}`, code: `XRLS-DOM-${stamp}` })
          .select("id")
          .single(),
        "domain",
      )
    ).id;
    const capabilities = await must(
      admin
        .from("capabilities")
        .insert([
          { domain_id: domainId, name: `XRLS wide ${stamp}`, code: `XRLS-CAP-W-${stamp}` },
          { domain_id: domainId, name: `XRLS rare ${stamp}`, code: `XRLS-CAP-R-${stamp}` },
        ])
        .select("id, code"),
      "capabilities",
    );
    widelyHeldCapability = capabilities.find((c) => c.code.startsWith("XRLS-CAP-W"))!.id;
    rarelyHeldCapability = capabilities.find((c) => c.code.startsWith("XRLS-CAP-R"))!.id;
    capabilityIds.push(widelyHeldCapability, rarelyHeldCapability);

    const holders = [talentA, peerA];
    for (let i = 0; i < 3; i += 1) {
      holders.push(await makeActor(`holder-${i}`, [["TALENT", chapterA]], squadA));
    }
    await must(
      admin.from("talent_capabilities").insert([
        ...holders.map((h, i) => ({
          profile_id: h.id,
          capability_id: widelyHeldCapability,
          current_level: i < 2 ? 2 : 4,
          target_level: 3,
        })),
        // A bulk insert sends every key for every row; missing keys become NULL.
        { profile_id: talentA.id, capability_id: rarelyHeldCapability, current_level: 1, target_level: 3 },
        { profile_id: peerA.id, capability_id: rarelyHeldCapability, current_level: 1, target_level: 3 },
      ]),
      "talent_capabilities",
    );

    // Development plans of talentA awaiting approval, one per attempt.
    const plans = await must(
      admin
        .from("development_plans")
        .insert(
          (["talentSelf", "managerForged", "managerApproves"] as const).map((key) => ({
            profile_id: talentA.id,
            title: `XRLS ${key}`,
            status: "proposed",
          })),
        )
        .select("id, title"),
      "development_plans",
    );
    for (const key of ["talentSelf", "managerForged", "managerApproves"] as const) {
      plan[key] = plans.find((p) => p.title === `XRLS ${key}`)!.id;
    }

    // A proposed assignment the chapter-A PM can edit (same organization).
    const projectA = await must(
      admin
        .from("projects")
        .insert({ organization_id: chapterA, name: "XRLS chapter A", code: `XRLS-PRJ-A-${stamp}` })
        .select("id")
        .single(),
      "project A",
    );
    projectIds.push(projectA.id);
    proposedAssignment = (
      await must(
        admin
          .from("assignments")
          .insert({ project_id: projectA.id, profile_id: talentA.id, status: "proposed" })
          .select("id")
          .single(),
        "proposed assignment",
      )
    ).id;
  });

  // Every step throws on failure: leaked fixtures in a shared project are a
  // defect. Reviews go first (reviewer_id is ON DELETE RESTRICT), projects
  // and squads before organizations (also RESTRICT).
  afterAll(async () => {
    const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
      ["reviews", () => admin.from("performance_reviews").delete().in("id", reviewIds)],
      ["evidence", () => admin.from("performance_evidence").delete().in("profile_id", userIds)],
    ];
    for (const [what, step] of steps) {
      const { error } = await step();
      if (error) throw new Error(`cleanup ${what}: ${error.message}`);
    }
    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`deleteUser ${id}: ${error.message}`);
    }
    const after: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
      ["projects", () => admin.from("projects").delete().in("id", projectIds)],
      ["periods", () => admin.from("performance_periods").delete().in("id", periodIds)],
      ["capabilities", () => admin.from("capabilities").delete().in("id", capabilityIds)],
      ["domain", () => admin.from("capability_domains").delete().eq("id", domainId)],
      ["squads", () => admin.from("squads").delete().in("organization_id", [chapterA, chapterB])],
      ["organizations", () => admin.from("organizations").delete().in("id", [chapterA, chapterB])],
    ];
    for (const [what, step] of after) {
      const { error } = await step();
      if (error) throw new Error(`cleanup ${what}: ${error.message}`);
    }
  });

  describe("Talent → another talent's private performance: DENY", () => {
    it("control: the chapter lead can read the evidence", async () => {
      const { data } = await leadA.client.from("performance_evidence").select("id").eq("id", evidenceId);
      expect(data?.length).toBe(1);
    });

    it("a talent cannot read a squad-mate's performance evidence", async () => {
      const { data } = await talentA.client.from("performance_evidence").select("id").eq("id", evidenceId);
      expect(data ?? []).toEqual([]);
    });

    it("a talent cannot read a review of someone else", async () => {
      const { data } = await peerA.client.from("performance_reviews").select("id").in("id", reviewIds);
      expect(data ?? []).toEqual([]);
    });
  });

  describe("PM → assigned project: ALLOW", () => {
    it("a PM reads a project they are assigned to, outside their own chapter", async () => {
      const { data } = await pmA.client.from("projects").select("id").eq("id", projectAssigned);
      expect(data?.length).toBe(1);
    });
  });

  describe("PM → unrelated project: DENY", () => {
    it("control: the owning chapter's lead can read the project", async () => {
      const { data } = await leadB.client.from("projects").select("id").eq("id", projectUnrelated);
      expect(data?.length).toBe(1);
    });

    it("a PM cannot read an unrelated project in another chapter", async () => {
      const { data } = await pmA.client.from("projects").select("id").eq("id", projectUnrelated);
      expect(data ?? []).toEqual([]);
    });
  });

  describe("Executive → aggregate: ALLOW", () => {
    it("an executive reads organization structure across chapters", async () => {
      const { data } = await executive.client
        .from("organizations")
        .select("id")
        .in("id", [chapterA, chapterB]);
      expect(data?.length).toBe(2);
    });

    // Aggregates come from chapter_capability_summary() / chapter_summary():
    // counts only, and suppressed below five people so a figure can never
    // single someone out. The rows themselves stay invisible (next block).
    it("an executive reads a capability roll-up for a chapter", async () => {
      const { data, error } = await executive.client.rpc("chapter_capability_summary");
      expect(error).toBeNull();
      const row = (data ?? []).find(
        (r) => r.organization_id === chapterA && r.capability_id === widelyHeldCapability,
      );
      expect(row, "no roll-up row for a capability five people hold").toBeDefined();
      expect(row).toMatchObject({
        suppressed: false,
        talents_assessed: 5,
        below_target: 2,
        average_level: 3.2,
      });
    });

    it("suppresses a roll-up that would describe fewer than five people", async () => {
      const { data } = await executive.client.rpc("chapter_capability_summary");
      const row = (data ?? []).find(
        (r) => r.organization_id === chapterA && r.capability_id === rarelyHeldCapability,
      );
      expect(row).toMatchObject({
        suppressed: true,
        talents_assessed: null,
        below_target: null,
        average_level: null,
      });
    });

    it("an executive reads chapter totals that match the underlying rows", async () => {
      // Expected values come from the raw rows, read through the admin client.
      const { count: headcount } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("chapter_id", chapterA)
        .eq("status", "active");

      const { data, error } = await executive.client.rpc("chapter_summary");
      expect(error).toBeNull();
      const row = (data ?? []).find((r) => r.organization_id === chapterA);
      expect(row).toMatchObject({
        suppressed: false,
        active_headcount: headcount,
        talents_assessed: 5,
        // planning + active, the dashboard's definition; the one chapter-A project.
        active_projects: 1,
      });
    });

    it("gives a talent no roll-up at all", async () => {
      const { data } = await talentA.client.rpc("chapter_capability_summary");
      expect(data ?? []).toEqual([]);
    });

    it("gives a chapter lead only their own chapter", async () => {
      const { data } = await leadB.client.rpc("chapter_summary");
      const chapters = (data ?? []).map((r) => r.organization_id);
      expect(chapters).toContain(chapterB);
      expect(chapters).not.toContain(chapterA);
    });

    it("gives an AI identity no roll-up", async () => {
      const { data } = await aiA.client.rpc("chapter_summary");
      expect(data ?? []).toEqual([]);
    });
  });

  describe("Executive → restricted individual record: DENY", () => {
    it("an executive cannot read an individual's performance evidence", async () => {
      const { data } = await executive.client.from("performance_evidence").select("id").eq("id", evidenceId);
      expect(data ?? []).toEqual([]);
    });

    it("an executive cannot read an individual's performance review", async () => {
      const { data } = await executive.client.from("performance_reviews").select("id").in("id", reviewIds);
      expect(data ?? []).toEqual([]);
    });

    it("an executive cannot read a private AI conversation", async () => {
      const { data } = await executive.client.from("ai_interactions").select("id").eq("id", conversationId);
      expect(data ?? []).toEqual([]);
    });
  });

  describe("HR → authorized people scope: ALLOW", () => {
    it("HR reads a profile in its chapter", async () => {
      const { data } = await hrA.client.from("profiles").select("id").eq("id", peerA.id);
      expect(data?.length).toBe(1);
    });

    it("HR reads performance evidence in its chapter", async () => {
      const { data } = await hrA.client.from("performance_evidence").select("id").eq("id", evidenceId);
      expect(data?.length).toBe(1);
    });

    it("HR cannot read a profile outside its chapter", async () => {
      const { data } = await hrA.client.from("profiles").select("id").eq("id", talentB.id);
      expect(data ?? []).toEqual([]);
    });
  });

  describe("AI → outside delegated scope: DENY", () => {
    it("an AI identity cannot read a profile in another chapter", async () => {
      const { data } = await aiA.client.from("profiles").select("id").eq("id", talentB.id);
      expect(data ?? []).toEqual([]);
    });

    it("an AI identity cannot read individual performance evidence", async () => {
      const { data } = await aiA.client.from("performance_evidence").select("id").eq("id", evidenceId);
      expect(data ?? []).toEqual([]);
    });

    it("an AI identity cannot write performance evidence", async () => {
      const { error } = await aiA.client.from("performance_evidence").insert({
        profile_id: talentA.id,
        dimension: "delivery",
        source_type: "ai_forged",
        origin: "ai_generated",
      });
      expect(error?.code).toBe("42501");
    });
  });

  describe("AI → approve performance: DENY", () => {
    it("an AI identity cannot approve a review, even holding approve_review in scope", async () => {
      await aiLead.client.from("performance_reviews").update(approval(aiLead.id)).eq("id", review.ai);
      expect((await reviewStatus(review.ai)).status).toBe("submitted");
    });

    it("control: a human chapter lead approves the same review", async () => {
      const { error } = await leadA.client
        .from("performance_reviews")
        .update(approval(leadA.id))
        .eq("id", review.ai);
      expect(error).toBeNull();
      expect(await reviewStatus(review.ai)).toEqual({ status: "approved", approved_by: leadA.id });
    });
  });

  describe("approval requires approve_review, in scope, under your own name", () => {
    // TANIA_RBAC_RLS_MATRIX.md §4 gives MANAGER Performance R/C/U — no A —
    // and the catalog grants performance.approve_review to CHAPTER_LEAD, HR
    // and SUPER_ADMIN only.
    it("a manager who submitted a review cannot approve it", async () => {
      await managerA.client
        .from("performance_reviews")
        .update(approval(managerA.id))
        .eq("id", review.managerSelf);
      expect((await reviewStatus(review.managerSelf)).status).toBe("submitted");
    });

    it("a reviewer cannot record an approval in someone else's name", async () => {
      await managerA.client
        .from("performance_reviews")
        .update(approval(leadA.id))
        .eq("id", review.managerForged);
      expect(await reviewStatus(review.managerForged)).toEqual({
        status: "submitted",
        approved_by: null,
      });
    });

    it("a chapter lead cannot approve a review in another chapter", async () => {
      await leadB.client
        .from("performance_reviews")
        .update(approval(leadB.id))
        .eq("id", review.otherChapter);
      expect((await reviewStatus(review.otherChapter)).status).toBe("submitted");
    });
  });

  // §9 "Manager → approve authorized subordinate review: ALLOW" is read as the
  // approval a MANAGER actually holds — development.approve (§4: Development
  // R/C/U/A) — since §4 and the catalog give MANAGER no performance approval.
  describe("Manager → approve subordinate development plan: ALLOW", () => {
    async function planState(id: string) {
      return must(
        admin.from("development_plans").select("status, approved_by").eq("id", id).single(),
        "read plan",
      );
    }

    it("a talent cannot approve their own development plan", async () => {
      await talentA.client
        .from("development_plans")
        .update(approval(talentA.id))
        .eq("id", plan.talentSelf);
      expect(await planState(plan.talentSelf)).toEqual({ status: "proposed", approved_by: null });
    });

    it("a manager cannot record a plan approval in someone else's name", async () => {
      await managerA.client
        .from("development_plans")
        .update(approval(leadA.id))
        .eq("id", plan.managerForged);
      expect(await planState(plan.managerForged)).toEqual({ status: "proposed", approved_by: null });
    });

    it("a manager approves a direct report's development plan", async () => {
      const { error } = await managerA.client
        .from("development_plans")
        .update(approval(managerA.id))
        .eq("id", plan.managerApproves);
      expect(error).toBeNull();
      expect(await planState(plan.managerApproves)).toEqual({
        status: "approved",
        approved_by: managerA.id,
      });
    });
  });

  describe("assignment approval requires assignment.approve", () => {
    async function assignmentApprover(): Promise<string | null> {
      const row = await must(
        admin.from("assignments").select("approved_by").eq("id", proposedAssignment).single(),
        "read assignment",
      );
      return row.approved_by;
    }

    it("a PM who may edit the assignment cannot approve it", async () => {
      await pmA.client
        .from("assignments")
        .update({ approved_by: pmA.id, approved_at: new Date().toISOString() })
        .eq("id", proposedAssignment);
      expect(await assignmentApprover()).toBeNull();
    });

    it("control: the chapter lead approves it", async () => {
      const { error } = await leadA.client
        .from("assignments")
        .update({ approved_by: leadA.id, approved_at: new Date().toISOString(), status: "active" })
        .eq("id", proposedAssignment);
      expect(error).toBeNull();
      expect(await assignmentApprover()).toBe(leadA.id);
    });
  });
});
