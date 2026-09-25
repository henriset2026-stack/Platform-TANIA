/**
 * TANIA → JARVIS handoff contract — TANIA_PRD_v2.0_working.md §83,
 * ARCHITECTURE.md §12, §16.
 *
 * JARVIS is a SEPARATE RUNTIME (ARCHITECTURE.md §2 — its own process, its own
 * action loader, its own credentials). Everything below follows from that one
 * fact: a handoff is not an internal function call, it is an outbound
 * transmission of a named person's data to another system. So the question is
 * never "what would be convenient to pass" but "what is the least this task
 * can be done with, and what happens when the other side is hostile,
 * compromised or simply wrong".
 *
 * Three consequences shape the types here:
 *
 *  1. The scope is a DERIVED CAPSULE, not the caller's AuthContext. It is the
 *     intersection of what the user holds, what the task asked for, and what
 *     may EVER cross this boundary. A SUPER_ADMIN handoff carries no admin
 *     permission, because no handoff does.
 *  2. Context is selected by PURPOSE. Fields outside a purpose are absent
 *     from the payload rather than optional in it, so a solution-build
 *     handoff cannot carry talent identifiers at all.
 *  3. The RETURN path is an authorization boundary too. Evidence coming back
 *     is untrusted input: it arrives `pending`, and evidence about anyone who
 *     was not in the handoff is refused rather than stored.
 */

// ===========================================================================
// Purpose — what this handoff is for
// ===========================================================================

export const HANDOFF_PURPOSES = [
  "capability_sprint",
  "capability_coaching",
  "solution_build",
] as const;

export type HandoffPurpose = (typeof HANDOFF_PURPOSES)[number];

export const HANDOFF_PURPOSE_LABEL: Record<HandoffPurpose, string> = {
  capability_sprint: "Build a DPS 20-hour Capability Sprint to close a gap",
  capability_coaching: "Coach one person on a specific capability",
  solution_build: "Build or prototype against a solution design",
};

export const HANDOFF_FIELDS = [
  "conversationContext",
  "capabilityContext",
  "selectedTalentIds",
  "projectContext",
  "evidenceRefs",
] as const;

export type HandoffField = (typeof HANDOFF_FIELDS)[number];

/**
 * Minimum necessary context, expressed as data rather than as discipline.
 *
 * A field absent from a purpose's list is REMOVED from the payload, not left
 * to the caller's judgement. "Pass everything, JARVIS will use what it needs"
 * is how a sprint-building request ends up carrying a project's commercial
 * terms and a conversation about six people to a system that needed one
 * capability and one name.
 */
export const PURPOSE_FIELDS: Record<HandoffPurpose, readonly HandoffField[]> = {
  capability_sprint: [
    "capabilityContext",
    "selectedTalentIds",
    "evidenceRefs",
    "conversationContext",
  ],
  capability_coaching: [
    "capabilityContext",
    "selectedTalentIds",
    "conversationContext",
  ],
  solution_build: ["projectContext", "capabilityContext", "conversationContext"],
};

export function purposeAllows(
  purpose: HandoffPurpose,
  field: HandoffField,
): boolean {
  return PURPOSE_FIELDS[purpose].includes(field);
}

// ===========================================================================
// Scope — the capsule
// ===========================================================================

/**
 * Permissions that may EVER cross into JARVIS.
 *
 * Read and analyse only. Not a subset chosen per user — a ceiling that
 * applies to every handoff, so the most privileged account in TANIA cannot
 * hand a second system the ability to write, approve, export or administer
 * anything. JARVIS executes development work; it has never needed to approve
 * a performance review, and an allowlist means nobody can decide otherwise by
 * editing a role.
 */
export const HANDOFF_TRANSMITTABLE_PERMISSIONS: readonly string[] = [
  "capability.read",
  "development.read",
  "talent.read",
  "project.read",
  "ai.use",
  "ai.analyze",
  "ai.recommend",
];

/** Default life of a handoff scope. Short: it authorizes one task, now. */
export const HANDOFF_TTL_MS = 15 * 60 * 1000;

export interface HandoffScope {
  /** user permissions ∩ requested ∩ transmittable. Never wider than any one. */
  readonly permissions: readonly string[];
  readonly organizationIds: readonly string[];
  readonly squadIds: readonly string[];
  /** The individuals this handoff is authorized to concern. */
  readonly talentIds: readonly string[];
  readonly issuedAt: string;
  /** After this, the scope authorizes nothing. */
  readonly expiresAt: string;
  readonly correlationId: string;
  /**
   * Always false, and typed as the literal.
   *
   * No handoff carries a database credential — not a service key, and not the
   * user's own access token either. A session token is a database credential
   * under RLS: handing one to JARVIS would give a separate system the user's
   * full read surface for as long as the token lives, which is not "passing
   * context" but delegating an identity.
   */
  readonly grantsDatabaseAccess: false;
  /**
   * Always false. JARVIS cannot request a wider scope with this capsule; it
   * can only present it. Widening requires a new handoff from TANIA, derived
   * again from the user's session.
   */
  readonly extensible: false;
}

/**
 * What the derivation removed, and why.
 *
 * Returned alongside the scope rather than discarded. Silent narrowing hides
 * a misconfiguration: a caller asking for `development.approve` should be
 * told it was dropped, not left wondering why JARVIS refused later.
 */
export interface ScopeReduction {
  /** Requested, but the user does not hold it. */
  readonly notHeldByUser: readonly string[];
  /** Held by the user, but may never cross this boundary. */
  readonly notTransmittable: readonly string[];
}

// ===========================================================================
// Context payloads
// ===========================================================================

export interface CapabilityContext {
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly requiredLevel: number;
  /** Proven from evidence, never claimed. */
  readonly currentProvenLevel: number;
  readonly gapMagnitude: number;
}

export interface ProjectContext {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
}

export interface ConversationTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly at: string;
}

export interface EvidenceRef {
  readonly evidenceId: string;
  readonly kind: "capability" | "learning" | "performance";
  readonly talentId: string;
}

// ===========================================================================
// The handoff
// ===========================================================================

export interface JarvisHandoff {
  /** Who this is on behalf of. Derived from auth.uid(), never from input. */
  readonly userId: string;
  readonly sessionId: string;
  readonly authorizationScope: HandoffScope;
  /** Redacted and capped. Absent when the purpose does not permit it. */
  readonly conversationContext: readonly ConversationTurn[] | null;
  readonly capabilityContext: CapabilityContext | null;
  readonly selectedTalentIds: readonly string[] | null;
  readonly projectContext: ProjectContext | null;
  readonly evidenceRefs: readonly EvidenceRef[] | null;
  readonly purpose: HandoffPurpose;
  /** The same id as the scope's, repeated where a reader will look for it. */
  readonly correlationId: string;
  readonly issuedAt: string;
  readonly schemaVersion: "1";
}

// ===========================================================================
// Result
// ===========================================================================

/**
 * Evidence returned by JARVIS.
 *
 * `validationStatus` is the literal "pending" and `origin` the literal
 * "jarvis". JARVIS completing a sprint does not make its output a validated
 * capability fact: that is the same error as treating a certificate as
 * capability (PRD §7.1), one system further out. A human in TANIA validates
 * it, or it stays pending forever, and the type gives JARVIS nowhere to say
 * otherwise.
 */
export interface ReturnedEvidence {
  /** JARVIS's own id for the artifact, for tracing back across the boundary. */
  readonly externalId: string;
  readonly talentId: string;
  readonly capabilityId: string;
  readonly sourceType: string;
  readonly title: string;
  readonly occurredAt: string | null;
  readonly validationStatus: "pending";
  readonly origin: "jarvis";
}

/**
 * The outcome of a handoff.
 *
 * Every non-success case is named separately, because they call for different
 * responses: `unavailable` means JARVIS is not wired up, `rejected` means it
 * refused the task, `failed` means it tried and could not, `timed_out` means
 * nobody knows whether it did. Collapsing them into "error" would hide the
 * one that matters most — a timeout is the case where work may still be
 * happening on the other side.
 */
export type JarvisResult =
  | {
      readonly status: "completed";
      readonly correlationId: string;
      readonly summary: string;
      readonly evidence: readonly ReturnedEvidence[];
      readonly completedAt: string;
    }
  | {
      readonly status: "rejected";
      readonly correlationId: string;
      readonly reason: string;
    }
  | {
      readonly status: "failed";
      readonly correlationId: string;
      readonly error: string;
    }
  | {
      readonly status: "timed_out";
      readonly correlationId: string;
      readonly timeoutMs: number;
      /** Stated because it is true and consequential. */
      readonly detail: "JARVIS may still be executing. Nothing here confirms it did or did not.";
    }
  | {
      readonly status: "unavailable";
      readonly correlationId: string;
      readonly detail: string;
    };

export type HandoffFailure =
  | { readonly reason: "NOT_AUTHENTICATED"; readonly detail: string }
  | { readonly reason: "NOT_AUTHORIZED"; readonly detail: string }
  | { readonly reason: "SCOPE_EMPTY"; readonly detail: string }
  | { readonly reason: "UNAUDITABLE"; readonly detail: string }
  | { readonly reason: "INVALID_CONTEXT"; readonly detail: string }
  | { readonly reason: "DISABLED"; readonly detail: string };

export type HandoffOutcome =
  | { readonly ok: true; readonly handoff: JarvisHandoff; readonly reduction: ScopeReduction; readonly result: JarvisResult }
  | { readonly ok: false; readonly failure: HandoffFailure };
