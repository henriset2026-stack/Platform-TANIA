import type { TaniaState } from "@/components/brand/tania-avatar";

/** A turn in the conversation. */
export interface AssistantTurn {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  /** Sources the answer cited, when it had any. */
  readonly evidence: readonly string[];
  readonly citations: readonly { readonly ordinal: number; readonly source: string }[];
  readonly toolsUsed: readonly string[];
  readonly requiresApproval: boolean;
  /** Present on failures. Surfaced so a user can quote it to an operator. */
  readonly correlationId: string | null;
  readonly errorCode: string | null;
}

export type { TaniaState };
