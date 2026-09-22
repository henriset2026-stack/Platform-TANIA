/**
 * Idempotency for consequential tool calls — AGENTS.md §16.
 *
 * A retry must not create a second assignment, a second approval, a second
 * financial record or a second notification. Retries are not hypothetical
 * here: the gateway has a timeout, a timed-out call may still be executing on
 * the other side, and the obvious response to a timeout is to try again.
 *
 * Scope is deliberately narrow.
 *
 *  - Only tools above LOW risk, or requiring confirmation, are deduplicated.
 *    Re-running a read is not a duplicate side effect, and caching reads would
 *    serve stale data while looking like a safety feature.
 *  - Only COMPLETED calls are replayed. A failed call may legitimately be
 *    retried, and a DENIED call must be re-evaluated from scratch — permissions
 *    change, and replaying a stored denial would keep refusing someone after
 *    they were granted access.
 *
 * The key includes the arguments. Two calls to the same tool with the same
 * correlation id but different arguments are different operations, and
 * treating them as one would silently drop the second.
 */

import type { ToolDefinition } from "@/agents/core/types";

export interface IdempotencyRecord {
  readonly key: string;
  readonly toolName: string;
  readonly result: unknown;
  readonly recordedAt: number;
}

export interface IdempotencyStore {
  get(key: string): IdempotencyRecord | undefined;
  set(record: IdempotencyRecord): void;
}

/** Whether a repeat of this tool must be suppressed rather than re-executed. */
export function requiresIdempotency(
  tool: Pick<ToolDefinition, "riskLevel" | "requiresConfirmation">,
): boolean {
  return tool.riskLevel !== "LOW" || tool.requiresConfirmation;
}

/**
 * Stable key over the operation's identity.
 *
 * Arguments are serialized with sorted keys so `{a,b}` and `{b,a}` — the same
 * call, differently ordered by the model — produce one key rather than two.
 */
export function idempotencyKey(input: {
  correlationId: string;
  toolName: string;
  args: unknown;
}): string {
  return `${input.correlationId}:${input.toolName}:${stableStringify(input.args)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/**
 * In-memory store, scoped to one process.
 *
 * Enough for retries within a single request or a single agent loop, which is
 * where duplicates actually come from. It is NOT enough for a retry arriving
 * on another instance after a client-side timeout: that needs the key
 * persisted alongside the row the tool writes, in the same transaction, so
 * the database refuses the duplicate. Stated here because an in-memory store
 * that looks like idempotency is worse than none — it invites the belief that
 * the problem is solved.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  constructor(private readonly maxEntries = 500) {}

  get(key: string): IdempotencyRecord | undefined {
    return this.records.get(key);
  }

  set(record: IdempotencyRecord): void {
    if (this.records.size >= this.maxEntries) {
      const oldest = this.records.keys().next();
      if (!oldest.done) this.records.delete(oldest.value);
    }
    this.records.set(record.key, record);
  }

  get size(): number {
    return this.records.size;
  }
}
