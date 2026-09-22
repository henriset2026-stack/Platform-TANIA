import { describe, expect, it } from "vitest";

import {
  HANDOFF_PURPOSES,
  HANDOFF_TRANSMITTABLE_PERMISSIONS,
  PURPOSE_FIELDS,
  purposeAllows,
  type ConversationTurn,
  type EvidenceRef,
  type JarvisHandoff,
  type JarvisResult,
} from "@/lib/jarvis/contract";
import { deriveHandoffScope, isScopeExpired, validateScope } from "@/lib/jarvis/scope";
import {
  MAX_CONVERSATION_TURNS,
  MAX_CONVERSATION_CHARS,
  REDACTED_ID,
  applyPurposeFilter,
  prepareConversation,
  redactIdentifiers,
  scopeEvidenceRefs,
} from "@/lib/jarvis/redaction";
import {
  UnconfiguredJarvisTransport,
  type JarvisTransport,
} from "@/lib/jarvis/transport";
import {
  acceptedEvidence,
  initiateHandoff,
  sendWithTimeout,
  validateResult,
} from "@/lib/jarvis/handoff";
import type { AuthContext } from "@/lib/auth/session";

const NOW = new Date("2026-09-22T10:00:00.000Z");
const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CHARLIE = "33333333-3333-3333-3333-333333333333";

function context(over: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "user-1",
    email: "lead@telkom.test",
    organizationIds: ["org-1"],
    squadIds: ["squad-1"],
    roles: ["CHAPTER_LEAD"],
    permissions: [
      "capability.read",
      "development.read",
      "development.approve",
      "talent.read",
      "ai.use",
      "ai.analyze",
    ],
    ...over,
  };
}

function derive(over: {
  context?: AuthContext;
  permissions?: readonly string[];
  talentIds?: readonly string[];
  authorized?: readonly string[];
  now?: Date;
  ttlMs?: number;
} = {}) {
  return deriveHandoffScope({
    context: over.context ?? context(),
    request: {
      permissions: over.permissions ?? ["capability.read", "development.read"],
      talentIds: over.talentIds ?? [ALICE],
      correlationId: "corr-1",
    },
    authorizedTalentIds: over.authorized ?? [ALICE],
    now: over.now ?? NOW,
    ...(over.ttlMs === undefined ? {} : { ttlMs: over.ttlMs }),
  });
}

function handoff(over: Partial<JarvisHandoff> = {}): JarvisHandoff {
  const { scope } = derive();
  return {
    userId: "user-1",
    sessionId: "sess-1",
    authorizationScope: scope,
    conversationContext: null,
    capabilityContext: null,
    selectedTalentIds: [ALICE],
    projectContext: null,
    evidenceRefs: null,
    purpose: "capability_sprint",
    correlationId: "corr-1",
    issuedAt: NOW.toISOString(),
    schemaVersion: "1",
    ...over,
  };
}

// ===========================================================================
// REQUIREMENT 9 — no privilege escalation
// ===========================================================================
describe("scope: JARVIS never inherits more than the user holds", () => {
  it("drops a permission the user does not hold", () => {
    const { scope, reduction } = derive({
      permissions: ["capability.read", "performance.approve_review"],
    });
    expect(scope.permissions).toEqual(["capability.read"]);
    expect(reduction.notHeldByUser).toEqual(["performance.approve_review"]);
  });

  // The stronger rule: held by the user, and still refused.
  it("drops a permission the user DOES hold but which may never cross", () => {
    const { scope, reduction } = derive({
      permissions: ["capability.read", "development.approve"],
    });
    expect(context().permissions).toContain("development.approve");
    expect(scope.permissions).not.toContain("development.approve");
    expect(reduction.notTransmittable).toEqual(["development.approve"]);
  });

  // A super-admin handoff is no wider than anyone else's.
  it("gives a SUPER_ADMIN no more than the transmittable ceiling", () => {
    const superAdmin = context({
      roles: ["SUPER_ADMIN"],
      permissions: [
        "admin.users",
        "admin.roles",
        "talent.export",
        "performance.approve_review",
        "capability.read",
        "ai.use",
      ],
    });
    const { scope } = derive({
      context: superAdmin,
      permissions: [
        "admin.users",
        "admin.roles",
        "talent.export",
        "performance.approve_review",
        "capability.read",
        "ai.use",
      ],
    });
    expect(scope.permissions).toEqual(["ai.use", "capability.read"]);
  });

  it("never grants anything outside the transmittable allowlist", () => {
    for (const forbidden of [
      "talent.create",
      "talent.export",
      "capability.assess",
      "capability.validate_evidence",
      "development.approve",
      "performance.approve_review",
      "assignment.approve",
      "business_impact.validate",
      "admin.users",
      "ai.execute",
    ]) {
      expect(HANDOFF_TRANSMITTABLE_PERMISSIONS, forbidden).not.toContain(forbidden);
    }
  });

  it("carries only read and analyse permissions", () => {
    for (const permission of HANDOFF_TRANSMITTABLE_PERMISSIONS) {
      expect(permission, permission).toMatch(
        /\.read$|^ai\.(use|analyze|recommend)$/,
      );
    }
  });

  it("intersects talent ids with what the caller was authorized for", () => {
    const { scope } = derive({
      talentIds: [ALICE, BOB],
      authorized: [ALICE],
    });
    expect(scope.talentIds).toEqual([ALICE]);
  });

  // Passing more ids than were requested must not widen the capsule.
  it("cannot be widened by supplying extra authorized ids", () => {
    const { scope } = derive({
      talentIds: [ALICE],
      authorized: [ALICE, BOB, CHARLIE],
    });
    expect(scope.talentIds).toEqual([ALICE]);
  });
});

// ===========================================================================
// REQUIREMENT 8 — no unrestricted database credentials
// ===========================================================================
describe("scope: no credential crosses the boundary", () => {
  it("declares that it grants no database access, as a literal", () => {
    const { scope } = derive();
    expect(scope.grantsDatabaseAccess).toBe(false);
    expect(scope.extensible).toBe(false);
  });

  // A session token is a database credential under RLS, not merely context.
  it("carries no key, token or secret anywhere in the payload", () => {
    const serialized = JSON.stringify(handoff());
    for (const pattern of [
      /service_role/i,
      /accessToken/i,
      /access_token/i,
      /refreshToken/i,
      /"jwt"/i,
      /apiKey/i,
      /supabase/i,
      /bearer /i,
      /secret/i,
      /password/i,
      /connectionString/i,
    ]) {
      expect(serialized, String(pattern)).not.toMatch(pattern);
    }
  });

  it("exposes no field through which a credential could be added", () => {
    const keys = Object.keys(handoff());
    expect(keys.sort()).toEqual(
      [
        "authorizationScope",
        "capabilityContext",
        "conversationContext",
        "correlationId",
        "evidenceRefs",
        "issuedAt",
        "projectContext",
        "purpose",
        "schemaVersion",
        "selectedTalentIds",
        "sessionId",
        "userId",
      ].sort(),
    );
  });
});

// ===========================================================================
// REQUIREMENT 3 — minimum necessary context
// ===========================================================================
describe("context minimisation", () => {
  it("removes fields the purpose does not permit", () => {
    const { kept, removed } = applyPurposeFilter("solution_build", {
      capabilityContext: { capabilityId: "c1" },
      selectedTalentIds: [ALICE],
      projectContext: { projectId: "p1" },
      evidenceRefs: [{ evidenceId: "e1" }],
    });
    expect([...removed].sort()).toEqual(["evidenceRefs", "selectedTalentIds"]);
    expect(kept).not.toHaveProperty("selectedTalentIds");
    expect(kept).toHaveProperty("projectContext");
  });

  // A sprint-building handoff has no business carrying a project's details.
  it("gives a capability sprint no project context", () => {
    expect(purposeAllows("capability_sprint", "projectContext")).toBe(false);
    expect(purposeAllows("solution_build", "selectedTalentIds")).toBe(false);
  });

  it("defines a field list for every purpose", () => {
    for (const purpose of HANDOFF_PURPOSES) {
      expect(PURPOSE_FIELDS[purpose].length, purpose).toBeGreaterThan(0);
    }
  });

  // A uuid in a sentence is still an identifier.
  it("redacts identifiers that are not in scope, and keeps those that are", () => {
    const text = `Compare ${ALICE} against ${BOB} on delivery.`;
    const redacted = redactIdentifiers(text, [ALICE]);
    expect(redacted).toContain(ALICE);
    expect(redacted).not.toContain(BOB);
    expect(redacted).toContain(REDACTED_ID);
  });

  it("caps the conversation by turns and by characters", () => {
    const turns: ConversationTurn[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "x".repeat(1000),
      at: NOW.toISOString(),
    }));
    const prepared = prepareConversation(turns, []);
    expect(prepared.length).toBeLessThanOrEqual(MAX_CONVERSATION_TURNS);
    const total = prepared.reduce((sum, turn) => sum + turn.content.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_CONVERSATION_CHARS);
  });

  it("keeps the most recent turns, which are the ones that explain the handoff", () => {
    const turns: ConversationTurn[] = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"].map(
      (content) => ({ role: "user" as const, content, at: NOW.toISOString() }),
    );
    const prepared = prepareConversation(turns, []);
    expect(prepared.at(-1)?.content).toBe("seventh");
    expect(prepared.map((t) => t.content)).not.toContain("first");
  });

  it("redacts while trimming, not afterwards", () => {
    const prepared = prepareConversation(
      [{ role: "user", content: `Look at ${BOB}`, at: NOW.toISOString() }],
      [ALICE],
    );
    expect(prepared[0]?.content).not.toContain(BOB);
  });

  // An evidence id is a pointer into somebody's record.
  it("drops evidence references for people outside the scope", () => {
    const refs: EvidenceRef[] = [
      { evidenceId: "e1", kind: "capability", talentId: ALICE },
      { evidenceId: "e2", kind: "capability", talentId: BOB },
    ];
    expect(scopeEvidenceRefs(refs, [ALICE])).toEqual([refs[0]]);
  });
});

// ===========================================================================
// REQUIREMENTS 4, 6 — correlation id and expiry
// ===========================================================================
describe("scope lifetime and correlation", () => {
  it("carries the correlation id on the scope and the handoff", () => {
    const sent = handoff();
    expect(sent.correlationId).toBe("corr-1");
    expect(sent.authorizationScope.correlationId).toBe("corr-1");
  });

  it("expires, and an expired scope authorizes nothing", () => {
    const { scope } = derive({ ttlMs: 1000 });
    expect(isScopeExpired(scope, NOW)).toBe(false);
    expect(isScopeExpired(scope, new Date(NOW.getTime() + 2000))).toBe(true);

    const check = validateScope(scope, new Date(NOW.getTime() + 2000));
    expect(check.valid).toBe(false);
  });

  it("refuses to send a scope that grants nothing", () => {
    const { scope } = derive({ permissions: ["admin.users"] });
    const check = validateScope(scope, NOW);
    expect(check.valid).toBe(false);
    if (check.valid) return;
    expect(check.detail).toMatch(/grants nothing/i);
  });

  // Only reachable if a capsule was hand-built rather than derived.
  it("rejects a hand-built scope containing a non-transmittable permission", () => {
    const { scope } = derive();
    const tampered = { ...scope, permissions: ["capability.read", "admin.users"] };
    const check = validateScope(tampered, NOW);
    expect(check.valid).toBe(false);
    if (check.valid) return;
    expect(check.detail).toMatch(/may never cross/i);
  });
});

// ===========================================================================
// REQUIREMENT 10 — explicit execution result
// ===========================================================================
describe("result: explicit, never fabricated", () => {
  it("reports unavailable rather than failed when nothing was attempted", async () => {
    const transport: JarvisTransport = new UnconfiguredJarvisTransport();
    const result = await transport.send(handoff(), new AbortController().signal);
    expect(transport.configured).toBe(false);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.detail).toMatch(/no handoff was transmitted/i);
  });

  it("accepts a well-formed completion", () => {
    const result: JarvisResult = {
      status: "completed",
      correlationId: "corr-1",
      summary: "Sprint built.",
      evidence: [
        {
          externalId: "j-1",
          talentId: ALICE,
          capabilityId: "cap-1",
          sourceType: "challenge",
          title: "Built a reference pipeline",
          occurredAt: NOW.toISOString(),
          validationStatus: "pending",
          origin: "jarvis",
        },
      ],
      completedAt: NOW.toISOString(),
    };
    const validated = validateResult(result, handoff(), NOW);
    expect(validated.status).toBe("completed");
    expect(acceptedEvidence(validated)).toHaveLength(1);
  });

  it("yields no evidence from a non-completed result", () => {
    expect(
      acceptedEvidence({ status: "failed", correlationId: "corr-1", error: "boom" }),
    ).toEqual([]);
  });

  it("distinguishes a timeout from a failure", () => {
    const timedOut: JarvisResult = {
      status: "timed_out",
      correlationId: "corr-1",
      timeoutMs: 30_000,
      detail: "JARVIS may still be executing. Nothing here confirms it did or did not.",
    };
    const validated = validateResult(timedOut, handoff(), NOW);
    expect(validated.status).toBe("timed_out");
    if (validated.status !== "timed_out") return;
    expect(validated.detail).toMatch(/may still be executing/i);
  });
});

// ===========================================================================
// The return path is an authorization boundary too
// ===========================================================================
describe("result validation: what JARVIS returns is untrusted", () => {
  function completion(over: Partial<Extract<JarvisResult, { status: "completed" }>> = {}) {
    return {
      status: "completed" as const,
      correlationId: "corr-1",
      summary: "done",
      completedAt: NOW.toISOString(),
      evidence: [
        {
          externalId: "j-1",
          talentId: ALICE,
          capabilityId: "cap-1",
          sourceType: "challenge",
          title: "Artifact",
          occurredAt: null,
          validationStatus: "pending" as const,
          origin: "jarvis" as const,
        },
      ],
      ...over,
    };
  }

  // JARVIS writing into a record this handoff never named is an escalation.
  it("rejects evidence for someone who was not in the handoff", () => {
    const result = validateResult(
      completion({
        evidence: [
          {
            externalId: "j-2",
            talentId: BOB,
            capabilityId: "cap-1",
            sourceType: "challenge",
            title: "Artifact",
            occurredAt: null,
            validationStatus: "pending",
            origin: "jarvis",
          },
        ],
      }),
      handoff(),
      NOW,
    );
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/never authorized/i);
  });

  // A system does not validate its own output into someone's capability record.
  it("rejects evidence that claims to be already validated", () => {
    const result = validateResult(
      completion({
        evidence: [
          {
            externalId: "j-3",
            talentId: ALICE,
            capabilityId: "cap-1",
            sourceType: "challenge",
            title: "Artifact",
            occurredAt: null,
            validationStatus: "validated" as unknown as "pending",
            origin: "jarvis",
          },
        ],
      }),
      handoff(),
      NOW,
    );
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/validate its own output/i);
  });

  it("rejects evidence without JARVIS provenance", () => {
    const result = validateResult(
      completion({
        evidence: [
          {
            externalId: "j-4",
            talentId: ALICE,
            capabilityId: "cap-1",
            sourceType: "challenge",
            title: "Artifact",
            occurredAt: null,
            validationStatus: "pending",
            origin: "human" as unknown as "jarvis",
          },
        ],
      }),
      handoff(),
      NOW,
    );
    expect(result.status).toBe("rejected");
  });

  // A response that cannot be tied to its request proves nothing.
  it("rejects a result carrying a different correlation id", () => {
    const result = validateResult(
      completion({ correlationId: "corr-other" }),
      handoff(),
      NOW,
    );
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/not this handoff/i);
  });

  it("rejects a completion that arrives after the scope expired", () => {
    const sent = handoff();
    const late = new Date(Date.parse(sent.authorizationScope.expiresAt) + 1000);
    const result = validateResult(completion(), sent, late);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/lapsed authorization/i);
  });

  // Partial acceptance is a judgement this layer cannot make.
  it("rejects the whole result rather than filtering the bad rows out", () => {
    const result = validateResult(
      completion({
        evidence: [
          {
            externalId: "ok",
            talentId: ALICE,
            capabilityId: "cap-1",
            sourceType: "challenge",
            title: "Good",
            occurredAt: null,
            validationStatus: "pending",
            origin: "jarvis",
          },
          {
            externalId: "bad",
            talentId: CHARLIE,
            capabilityId: "cap-1",
            sourceType: "challenge",
            title: "Outside scope",
            occurredAt: null,
            validationStatus: "pending",
            origin: "jarvis",
          },
        ],
      }),
      handoff(),
      NOW,
    );
    expect(result.status).toBe("rejected");
    expect(acceptedEvidence(result)).toEqual([]);
  });
});

// ===========================================================================
// REQUIREMENTS 1, 5, 6, 7 — authentication, audit, timeout, error handling
// ===========================================================================
describe("orchestration: bounded, audited, fail-closed", () => {
  function transportThat(
    behaviour: (signal: AbortSignal) => Promise<JarvisResult>,
    name = "test",
  ) {
    return { name, configured: true, send: (_h: JarvisHandoff, signal: AbortSignal) => behaviour(signal) };
  }

  it("returns timed_out when the transport outlives the deadline", async () => {
    const slow = transportThat(
      () => new Promise<JarvisResult>(() => undefined),
      "slow",
    );
    const result = await sendWithTimeout(slow, handoff(), 20);
    expect(result.status).toBe("timed_out");
    if (result.status !== "timed_out") return;
    expect(result.timeoutMs).toBe(20);
    // A timeout is the case where work may still be happening over there.
    expect(result.detail).toMatch(/may still be executing/i);
  });

  it("aborts the transport's signal rather than leaving it running", async () => {
    let aborted = false;
    const watching = transportThat(
      (signal) =>
        new Promise<JarvisResult>(() => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
        }),
      "watching",
    );
    await sendWithTimeout(watching, handoff(), 20);
    expect(aborted).toBe(true);
  });

  // A transport that throws is a failure, never a success with odd data.
  it("reports a thrown transport as failed", async () => {
    const throwing = transportThat(async () => {
      throw new Error("connection refused");
    }, "throwing");
    const result = await sendWithTimeout(throwing, handoff(), 1_000);
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toBe("connection refused");
  });

  it("passes a prompt result through unchanged", async () => {
    const fast = transportThat(async () => ({
      status: "rejected" as const,
      correlationId: "corr-1",
      reason: "JARVIS declined.",
    }));
    const result = await sendWithTimeout(fast, handoff(), 1_000);
    expect(result.status).toBe("rejected");
  });

  // No session, no handoff — and the transport is never reached.
  it("refuses an unauthenticated handoff without transmitting anything", async () => {
    let sent = false;
    const spy = transportThat(async () => {
      sent = true;
      return { status: "failed" as const, correlationId: "corr-1", error: "x" };
    }, "spy");

    const outcome = await initiateHandoff(
      {
        purpose: "capability_sprint",
        sessionId: "sess-1",
        correlationId: "corr-1",
        requestedPermissions: ["capability.read"],
        selectedTalentIds: [ALICE],
        capabilityContext: null,
        projectContext: null,
        conversationContext: [],
        evidenceRefs: [],
      },
      { transport: spy, now: () => NOW },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.reason).toBe("NOT_AUTHENTICATED");
    expect(sent, "nothing may be transmitted without a session").toBe(false);
  });
});
