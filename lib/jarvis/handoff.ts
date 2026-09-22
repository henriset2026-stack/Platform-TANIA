import "server-only";

/**
 * TANIA → JARVIS handoff orchestration.
 *
 *     authenticate → authorize → derive scope → minimise context
 *     → audit → transmit (bounded) → validate result → return
 *
 * The order is fixed and every stage can only narrow. Two of them are worth
 * calling out.
 *
 * AUDIT BEFORE TRANSMISSION, FAIL CLOSED. A handoff sends a named person's
 * data to another system, which makes it consequential by any reading of
 * CLAUDE.md §16 rule 10. If the audit write fails, nothing is sent. This is
 * the same rule agents/core/audit.ts applies to a consequential tool, and for
 * the same reason: "the log was down" does not become a defence six months
 * later.
 *
 * VALIDATE THE RESULT, NOT JUST THE REQUEST. Everything JARVIS returns is
 * untrusted input from a separate system. Evidence for someone who was not in
 * the handoff is refused, and evidence claiming to be validated is refused,
 * because both would let the other side write into records this handoff never
 * authorized.
 */

import { requireAuthContext } from "@/lib/auth/session";
import { canAccessTalent } from "@/lib/auth/authorize";
import { deriveHandoffScope, validateScope, type ScopeRequest } from "@/lib/jarvis/scope";
import {
  applyPurposeFilter,
  prepareConversation,
  scopeEvidenceRefs,
} from "@/lib/jarvis/redaction";
import { resolveJarvisTransport, type JarvisTransport } from "@/lib/jarvis/transport";
import { unconfiguredAuditSink, type AuditSink } from "@/agents/core/audit";
import type {
  CapabilityContext,
  ConversationTurn,
  EvidenceRef,
  HandoffOutcome,
  HandoffPurpose,
  JarvisHandoff,
  JarvisResult,
  ProjectContext,
  ReturnedEvidence,
} from "@/lib/jarvis/contract";

/** Bound on how long a handoff may occupy the request that authorized it. */
export const HANDOFF_TIMEOUT_MS = 30_000;

export interface HandoffRequest {
  readonly purpose: HandoffPurpose;
  readonly sessionId: string;
  readonly correlationId: string;
  readonly requestedPermissions: readonly string[];
  readonly selectedTalentIds: readonly string[];
  readonly capabilityContext: CapabilityContext | null;
  readonly projectContext: ProjectContext | null;
  readonly conversationContext: readonly ConversationTurn[];
  readonly evidenceRefs: readonly EvidenceRef[];
}

export interface HandoffDependencies {
  readonly transport?: JarvisTransport;
  readonly audit?: AuditSink;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

export async function initiateHandoff(
  request: HandoffRequest,
  dependencies: HandoffDependencies = {},
): Promise<HandoffOutcome> {
  const now = dependencies.now ?? (() => new Date());
  const audit = dependencies.audit ?? unconfiguredAuditSink;
  const transport = dependencies.transport ?? resolveJarvisTransport();
  const timeoutMs = dependencies.timeoutMs ?? HANDOFF_TIMEOUT_MS;

  // --- 1. Authenticated -------------------------------------------------
  // requireAuthContext uses getUser(), which validates the JWT with the auth
  // server. getSession() only reads a cookie and would authenticate nobody.
  let context;
  try {
    context = await requireAuthContext();
  } catch (error) {
    return {
      ok: false,
      failure: {
        reason: "NOT_AUTHENTICATED",
        detail:
          error instanceof Error
            ? error.message
            : "No authenticated session; a handoff cannot be made on nobody's behalf.",
      },
    };
  }

  if (request.correlationId.trim().length === 0) {
    return {
      ok: false,
      failure: {
        reason: "INVALID_CONTEXT",
        detail:
          "A correlation id is required. Without one the handoff, its audit event and whatever JARVIS " +
          "returns cannot be tied together, and an unlinkable execution is an unauditable one.",
      },
    };
  }

  // --- 2. Authorize each named person, through RLS ----------------------
  // Checked one at a time against the caller's own client, so someone the
  // database hides is simply not found. Their id never reaches the payload,
  // which matters: an id crossing the boundary reveals that the person exists.
  const authorizedTalentIds: string[] = [];
  const refusedTalentIds: string[] = [];
  for (const talentId of request.selectedTalentIds) {
    const decision = await canAccessTalent(talentId, "SENSITIVE");
    if (decision.allowed) authorizedTalentIds.push(talentId);
    else refusedTalentIds.push(talentId);
  }

  if (request.selectedTalentIds.length > 0 && authorizedTalentIds.length === 0) {
    return {
      ok: false,
      failure: {
        reason: "NOT_AUTHORIZED",
        detail:
          "None of the selected people are within your authorized scope, so there is nobody this handoff " +
          "could legitimately concern.",
      },
    };
  }

  // --- 3. Derive the scope ----------------------------------------------
  const scopeRequest: ScopeRequest = {
    permissions: request.requestedPermissions,
    talentIds: request.selectedTalentIds,
    correlationId: request.correlationId,
  };

  const { scope, reduction } = deriveHandoffScope({
    context,
    request: scopeRequest,
    authorizedTalentIds,
    now: now(),
  });

  const scopeCheck = validateScope(scope, now());
  if (!scopeCheck.valid) {
    return { ok: false, failure: { reason: "SCOPE_EMPTY", detail: scopeCheck.detail } };
  }

  // --- 4. Minimise the context ------------------------------------------
  const conversation = prepareConversation(
    request.conversationContext,
    scope.talentIds,
  );
  const evidence = scopeEvidenceRefs(request.evidenceRefs, scope.talentIds);

  const { kept, removed } = applyPurposeFilter(request.purpose, {
    conversationContext: conversation.length > 0 ? conversation : null,
    capabilityContext: request.capabilityContext,
    selectedTalentIds: scope.talentIds.length > 0 ? scope.talentIds : null,
    projectContext: request.projectContext,
    evidenceRefs: evidence.length > 0 ? evidence : null,
  });

  const issuedAt = now().toISOString();
  const handoff: JarvisHandoff = {
    userId: context.userId,
    sessionId: request.sessionId,
    authorizationScope: scope,
    conversationContext:
      (kept.conversationContext as readonly ConversationTurn[] | undefined) ?? null,
    capabilityContext: (kept.capabilityContext as CapabilityContext | undefined) ?? null,
    selectedTalentIds: (kept.selectedTalentIds as readonly string[] | undefined) ?? null,
    projectContext: (kept.projectContext as ProjectContext | undefined) ?? null,
    evidenceRefs: (kept.evidenceRefs as readonly EvidenceRef[] | undefined) ?? null,
    purpose: request.purpose,
    correlationId: request.correlationId,
    issuedAt,
    schemaVersion: "1",
  };

  // --- 5. Audit before transmitting. Fail closed. -----------------------
  const audited = await recordSafely(audit, {
    action: "jarvis.handoff.initiated",
    resourceType: "jarvis_handoff",
    resourceId: request.correlationId,
    correlationId: request.correlationId,
    agentName: "tania_jarvis_bridge",
    toolName: `handoff:${request.purpose}`,
    status: "initiated",
    arguments: {
      purpose: request.purpose,
      permissions: scope.permissions.join(","),
      talentCount: scope.talentIds.length,
      refusedTalentCount: refusedTalentIds.length,
      fieldsRemoved: removed.join(",") || "none",
      conversationTurns: conversation.length,
      evidenceRefs: evidence.length,
    },
    errorDetail: null,
    durationMs: null,
  });

  if (!audited.ok) {
    return {
      ok: false,
      failure: {
        reason: "UNAUDITABLE",
        detail:
          `This handoff was not sent because it could not be recorded: ${audited.error} ` +
          "Transmitting a person's data to another system off the record is not something a log outage excuses.",
      },
    };
  }

  // --- 6. Transmit, bounded ---------------------------------------------
  const result = await sendWithTimeout(transport, handoff, timeoutMs);

  // --- 7. Validate what came back ---------------------------------------
  const validated = validateResult(result, handoff, now());

  await recordSafely(audit, {
    action: `jarvis.handoff.${validated.status}`,
    resourceType: "jarvis_handoff",
    resourceId: request.correlationId,
    correlationId: request.correlationId,
    agentName: "tania_jarvis_bridge",
    toolName: `handoff:${request.purpose}`,
    status: validated.status,
    arguments: { transport: transport.name },
    errorDetail: describeResult(validated),
    durationMs: null,
  });

  return { ok: true, handoff, reduction, result: validated };
}

// ===========================================================================
// Result validation — the return path is an authorization boundary too
// ===========================================================================

/**
 * Checks a result before it is believed.
 *
 * Three refusals, each closing a way the other side could write into records
 * this handoff never authorized:
 *
 *  - evidence for anyone outside the handoff's scope;
 *  - evidence under a correlation id that is not this one, which is how a
 *    replayed or crossed response gets attributed to the wrong request;
 *  - a result arriving after the scope expired.
 *
 * A refusal downgrades the whole result to `rejected` rather than dropping
 * the offending rows. Partially accepting a response from a system that
 * returned something it should not have is a judgement this layer is not in a
 * position to make.
 */
export function validateResult(
  result: JarvisResult,
  handoff: JarvisHandoff,
  now: Date,
): JarvisResult {
  if (result.correlationId !== handoff.correlationId) {
    return {
      status: "rejected",
      correlationId: handoff.correlationId,
      reason:
        `The result carried correlation id ${result.correlationId}, which is not this handoff's. ` +
        "A response that cannot be tied to its request is not evidence that the request succeeded.",
    };
  }

  if (result.status !== "completed") return result;

  const expiry = Date.parse(handoff.authorizationScope.expiresAt);
  if (now.getTime() >= expiry) {
    return {
      status: "rejected",
      correlationId: handoff.correlationId,
      reason:
        `The result arrived after the handoff scope expired at ${handoff.authorizationScope.expiresAt}. ` +
        "Work returned under a lapsed authorization is not accepted; re-issue the handoff.",
    };
  }

  const allowed = new Set(handoff.authorizationScope.talentIds);
  const outside = result.evidence.filter((item) => !allowed.has(item.talentId));
  if (outside.length > 0) {
    return {
      status: "rejected",
      correlationId: handoff.correlationId,
      reason:
        `The result returned evidence for ${outside.length} person(s) who were not part of this handoff. ` +
        "Accepting it would let JARVIS write into records this handoff never authorized.",
    };
  }

  const preValidated = result.evidence.filter(
    (item) => item.validationStatus !== "pending" || item.origin !== "jarvis",
  );
  if (preValidated.length > 0) {
    return {
      status: "rejected",
      correlationId: handoff.correlationId,
      reason:
        "The result returned evidence claiming to be already validated, or without JARVIS provenance. " +
        "Evidence arrives pending and a human in TANIA validates it; a system does not validate its own output " +
        "into someone's capability record.",
    };
  }

  return result;
}

/**
 * Evidence ready to be written into TANIA, once a human validates it.
 *
 * Returned separately from the result so that accepting a result and writing
 * evidence remain two decisions. This function does not write; there is no
 * path here from a JARVIS response to a row.
 */
export function acceptedEvidence(
  result: JarvisResult,
): readonly ReturnedEvidence[] {
  return result.status === "completed" ? result.evidence : [];
}

// ===========================================================================
// Helpers
// ===========================================================================

/**
 * Sends, bounded by a deadline.
 *
 * Exported because the timeout and the thrown-transport path are the two
 * behaviours here most likely to be got wrong and least likely to be
 * exercised by accident: both only happen when the other side misbehaves.
 */
export async function sendWithTimeout(
  transport: JarvisTransport,
  handoff: JarvisHandoff,
  timeoutMs: number,
): Promise<JarvisResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      transport.send(handoff, controller.signal),
      new Promise<JarvisResult>((resolve) => {
        controller.signal.addEventListener(
          "abort",
          () =>
            resolve({
              status: "timed_out",
              correlationId: handoff.correlationId,
              timeoutMs,
              detail:
                "JARVIS may still be executing. Nothing here confirms it did or did not.",
            }),
          { once: true },
        );
      }),
    ]);
  } catch (error) {
    // A transport that throws is a failure, never a success with odd data.
    return {
      status: "failed",
      correlationId: handoff.correlationId,
      error: error instanceof Error ? error.message : "Handoff transmission failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function recordSafely(
  sink: AuditSink,
  event: Parameters<AuditSink>[0],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const outcome = await sink(event);
    return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Audit sink threw.",
    };
  }
}

function describeResult(result: JarvisResult): string | null {
  switch (result.status) {
    case "completed":
      return null;
    case "rejected":
      return result.reason;
    case "failed":
      return result.error;
    case "timed_out":
      return `Timed out after ${result.timeoutMs}ms. ${result.detail}`;
    case "unavailable":
      return result.detail;
  }
}
