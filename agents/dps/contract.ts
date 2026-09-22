/**
 * Shared contract for the three DPS specialist agents — Product, Solution and
 * Business Case (CLAUDE.md §7, TANIA_PRD_v2.0.md §52–§55).
 *
 * These three differ from TANIA's own agents in one way that changes their
 * whole design: the material they work on is mostly NOT in the database.
 * Market size, competitor positioning, vendor pricing, customer counts,
 * expected revenue — TANIA holds none of it, and a language model will
 * produce confident, specific, entirely invented figures for all of it.
 *
 * So the envelope below carries two lists, and the second is the important
 * one. `sourcedFacts` is what the agent could stand behind, each with an
 * origin from a closed union that has no "the model knows this" variant.
 * `missingFacts` is what it needed and could not get — present in the output
 * rather than quietly filled, because an analysis with a visible hole is
 * useful and an analysis with an invisible one is dangerous.
 *
 * When a missing fact is load-bearing, `conclusionWithheld` is set and the
 * conclusion itself is absent. The structure is still returned: knowing which
 * seven questions must be answered before a decision is worth more than an
 * answer derived from four of them and three guesses.
 */

import type { ApprovalRequirement } from "@/agents/core/approval";
import type { Uncertainty } from "@/agents/core/output";
import type { MissingFact, SourcedFact } from "@/agents/core/sourcing";
import type { RiskLevel } from "@/agents/core/types";

export type { ApprovalRequirement } from "@/agents/core/approval";

/**
 * What this output is, and what happens if it is wrong.
 *
 * Tool risk is declared per tool and governs execution. This is a different
 * question: the risk of the ANALYSIS being acted on. All three agents are
 * LOW-risk to run and inform decisions that are not, which is exactly the
 * asymmetry a reader needs told.
 */
export interface RiskClassification {
  /** Risk of producing this output. LOW: nothing is written or sent. */
  readonly outputRisk: RiskLevel;
  /** Risk carried by the decisions it feeds. Stated, never scored. */
  readonly consequenceIfWrong: string;
  readonly reversible: boolean;
  readonly decisionsThisInforms: readonly string[];
}

export interface SpecialistEnvelope<TPayload> {
  readonly agent: string;
  readonly purpose: string;
  /** Null exactly when conclusionWithheld is set. */
  readonly payload: TPayload | null;
  readonly sourcedFacts: readonly SourcedFact<unknown>[];
  readonly missingFacts: readonly MissingFact[];
  readonly uncertainties: readonly Uncertainty[];
  readonly approval: ApprovalRequirement;
  readonly risk: RiskClassification;
  /**
   * Why no conclusion is offered, or null when one is.
   *
   * Set when a missing fact is load-bearing. The alternative — completing the
   * analysis around the hole — produces a document that reads as a decision
   * basis and is not one.
   */
  readonly conclusionWithheld: string | null;
  readonly generatedAt: string;
  /** Always false. An analysis is not a decision. */
  readonly isDecision: false;
  /** Always false. Nothing here was written anywhere. */
  readonly persisted: false;
}

/** Roles that may commit a commercial or product decision. */
export const COMMERCIAL_APPROVER_ROLES: readonly string[] = [
  "CHAPTER_LEAD",
  "EXECUTIVE",
  "SUPER_ADMIN",
];

/**
 * Actions no DPS specialist agent may take.
 *
 * Every one is already impossible — no such tool is registered, the registry
 * is closed, AI_SERVICE holds no write permission and the database denies AI
 * writes — but each is stated so a future tool registration that contradicts
 * it fails a test rather than shipping.
 */
export const FORBIDDEN_SPECIALIST_ACTIONS: readonly string[] = [
  "approve_business_case",
  "commit_budget",
  "approve_investment",
  "contact_customer",
  "publish_proposal",
  "sign_contract",
  "approve_architecture",
  "start_project",
];
