/**
 * Minimum necessary context. PURE.
 *
 * Conversation history is the field most likely to carry something a handoff
 * did not need. A chapter lead's session may have discussed forty people, a
 * performance concern and a budget before reaching "ask JARVIS to build this
 * sprint" — and the sprint needs one capability and one name.
 *
 * Two rules, both mechanical rather than advisory:
 *
 *  - the payload is capped, by turns and by characters, so an unbounded
 *    transcript cannot cross the boundary by default;
 *  - identifiers that are not in the handoff's scope are removed from the
 *    text. A uuid in a sentence is still an identifier, and a system that
 *    receives one learns that the person exists and was being discussed.
 */

import {
  PURPOSE_FIELDS,
  type ConversationTurn,
  type EvidenceRef,
  type HandoffField,
  type HandoffPurpose,
} from "@/lib/jarvis/contract";

export const MAX_CONVERSATION_TURNS = 6;
export const MAX_TURN_CHARS = 600;
export const MAX_CONVERSATION_CHARS = 2_400;

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export const REDACTED_ID = "[id-withheld]";

/**
 * Removes identifiers the handoff is not scoped to.
 *
 * Allowed ids are left intact: JARVIS needs them to do the task, and they are
 * exactly the ones the caller was authorized for. Everything else becomes a
 * marker rather than being deleted silently, so a reader can see that a
 * redaction happened.
 */
export function redactIdentifiers(
  text: string,
  allowedIds: readonly string[],
): string {
  const allowed = new Set(allowedIds.map((id) => id.toLowerCase()));
  return text.replace(UUID_RE, (match) =>
    allowed.has(match.toLowerCase()) ? match : REDACTED_ID,
  );
}

/**
 * Trims and redacts a conversation for transmission.
 *
 * Keeps the most recent turns: the handoff was decided at the end of the
 * conversation, so the end is the part that explains it. Older turns are
 * dropped rather than summarized, because a summary of a conversation about
 * people is itself content about people, generated rather than recorded.
 */
export function prepareConversation(
  turns: readonly ConversationTurn[],
  allowedIds: readonly string[],
): readonly ConversationTurn[] {
  const recent = turns.slice(-MAX_CONVERSATION_TURNS);

  const prepared: ConversationTurn[] = [];
  let budget = MAX_CONVERSATION_CHARS;

  for (const turn of recent) {
    if (budget <= 0) break;
    const redacted = redactIdentifiers(turn.content, allowedIds);
    const capped = redacted.slice(0, Math.min(MAX_TURN_CHARS, budget));
    budget -= capped.length;
    prepared.push({ role: turn.role, content: capped, at: turn.at });
  }

  return prepared;
}

/**
 * Restricts evidence references to the people the handoff is scoped to.
 *
 * An evidence id is a pointer into someone's record. Sending one for a person
 * outside the scope hands JARVIS a reference it has no basis to hold, and
 * which a later bug could dereference.
 */
export function scopeEvidenceRefs(
  refs: readonly EvidenceRef[],
  allowedTalentIds: readonly string[],
): readonly EvidenceRef[] {
  const allowed = new Set(allowedTalentIds);
  return refs.filter((ref) => allowed.has(ref.talentId));
}

/**
 * Drops any field the purpose does not permit.
 *
 * Applied last, over everything else, so a field that survived preparation
 * still does not cross unless the purpose called for it. Returns the fields
 * it removed so the decision is visible in the audit trail rather than
 * implicit in an absence.
 */
export function applyPurposeFilter<T extends Partial<Record<HandoffField, unknown>>>(
  purpose: HandoffPurpose,
  fields: T,
): { kept: Partial<T>; removed: readonly HandoffField[] } {
  const permitted = new Set<HandoffField>(PURPOSE_FIELDS[purpose]);
  const kept: Partial<T> = {};
  const removed: HandoffField[] = [];

  for (const key of Object.keys(fields) as HandoffField[]) {
    if (fields[key] === undefined || fields[key] === null) continue;
    if (permitted.has(key)) {
      kept[key as keyof T] = fields[key] as T[keyof T];
    } else {
      removed.push(key);
    }
  }

  return { kept, removed };
}
