import "server-only";

/**
 * The JARVIS transport boundary.
 *
 * An interface rather than a client, for the same reason lib/ai/provider.ts
 * is: the only honest implementation today is one that refuses. JARVIS is not
 * deployed, no endpoint is configured, and a transport that returned a
 * plausible completion would be the fabricated-execution failure
 * ARCHITECTURE.md §16 puts first in its list of invariants.
 *
 * Note what a transport is NOT given: no Supabase client, no service key, no
 * session token, no environment. It receives a serialized handoff and returns
 * a result. A transport that wanted to hand JARVIS database access would have
 * nothing to hand it.
 */

import type { JarvisHandoff, JarvisResult } from "@/lib/jarvis/contract";

export interface JarvisTransport {
  readonly name: string;
  readonly configured: boolean;
  /**
   * Sends a handoff and awaits JARVIS's result.
   *
   * `signal` carries the caller's deadline. An implementation must abort on
   * it rather than continuing: work that outlives the request that authorized
   * it is work running under an authorization nobody is holding.
   */
  send(handoff: JarvisHandoff, signal: AbortSignal): Promise<JarvisResult>;
}

/**
 * The transport used when none is configured.
 *
 * Returns `unavailable`, which is a distinct outcome from `failed`: nothing
 * was attempted, so nothing can be retried or half-done. Saying "failed"
 * would suggest JARVIS was reached and something went wrong there.
 */
export class UnconfiguredJarvisTransport implements JarvisTransport {
  readonly name = "unconfigured";
  readonly configured = false;

  async send(handoff: JarvisHandoff): Promise<JarvisResult> {
    return {
      status: "unavailable",
      correlationId: handoff.correlationId,
      detail:
        "No JARVIS endpoint is configured, so no handoff was transmitted. Nothing was started on the " +
        "other side and nothing needs undoing.",
    };
  }
}

let transport: JarvisTransport = new UnconfiguredJarvisTransport();

/** Registers a transport. Server-side wiring only; never called from a route. */
export function registerJarvisTransport(next: JarvisTransport): void {
  transport = next;
}

export function resolveJarvisTransport(): JarvisTransport {
  return transport;
}
