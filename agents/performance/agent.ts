/**
 * TANIA Performance Agent — TANIA_PRD_v2.0.md §46, AGENTS.md §13.1.
 *
 * Analyses authorized performance evidence and produces evidence-backed
 * insight. Its boundaries are enforced structurally rather than by
 * instruction:
 *
 *  - It declares only three tools, all LOW risk and read-only. No tool exists
 *    to write evidence, set a score, submit or approve a review, or export.
 *  - The registry is closed, so it cannot name a tool into existence.
 *  - Its output type fixes isFinalRating to the literal false, so no caller
 *    can branch on it having produced a rating.
 *  - Findings and recommendations carry non-empty evidence tuples, so an
 *    unsupported claim does not compile.
 *
 * The system prompt restates these limits, but the prompt is the weakest of
 * the four — it is there so the model behaves sensibly, not because anything
 * depends on it complying.
 */

import { PERFORMANCE_AGENT_TOOLS } from "@/agents/performance/tools";
import { FORBIDDEN_AGENT_ACTIONS } from "@/agents/performance/contract";
import { matchesForbiddenAction } from "@/agents/core/refusal";
import { AI_LIMITS } from "@/lib/ai/config";
import type { AgentDefinition } from "@/agents/core/types";

export const PERFORMANCE_AGENT: AgentDefinition = {
  name: "performance_agent",
  description:
    "Analyses authorized performance evidence: trends, anomalies, evidence gaps and recommendations.",
  tools: PERFORMANCE_AGENT_TOOLS.map((tool) => tool.name),
  requiredPermissions: ["ai.use", "ai.analyze", "performance.read"],
  maxToolCalls: 6,
  timeoutMs: AI_LIMITS.requestTimeoutMs,
  systemPrompt: [
    "You are the TANIA Performance Agent for Chapter DPS at Telkom Indonesia.",
    "",
    "You analyse performance evidence that has already been authorized for the person asking.",
    "You may: retrieve evidence, describe trends, report anomalies, summarize, identify evidence gaps, and recommend next steps.",
    "",
    "You must NOT:",
    "- produce, suggest or imply a final performance rating or overall score;",
    "- make or recommend a promotion decision;",
    "- make or recommend a disciplinary decision;",
    "- speculate about anyone whose evidence you were not given.",
    "",
    "Every finding you state must reference the specific evidence it rests on.",
    "If evidence is unvalidated or AI-generated, say so — it is not a measured fact.",
    "If you cannot determine something, state it as an uncertainty rather than omitting it.",
    "Never claim an action succeeded; only a tool result establishes that.",
    "",
    `Actions you must refuse outright: ${FORBIDDEN_AGENT_ACTIONS.join(", ")}.`,
  ].join("\n"),
};

/** Whether a requested action is one this agent must refuse. */
export function isForbiddenAction(request: string): boolean {
  return matchesForbiddenAction(request, FORBIDDEN_AGENT_ACTIONS);
}
