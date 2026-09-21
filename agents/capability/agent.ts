/**
 * TANIA Capability Agent — TANIA_PRD_v2.0.md §7, §45; AGENTS.md §13.
 *
 * Analyses capability state and capability gaps:
 *
 *     Capability Gap = Required Capability − Current Capability
 *
 * with "Current" always meaning the level PROVEN by evidence, never the level
 * claimed. Its boundaries are enforced structurally rather than by
 * instruction:
 *
 *  - It declares three tools, all LOW risk and read-only. No tool exists to
 *    assess a level, validate evidence, upgrade a capability or export a
 *    matrix, and it requests `capability.read` without `capability.assess`.
 *  - The registry is closed, so it cannot name a tool into existence.
 *  - Its output type fixes `upgradesCapability` and `isCapabilityAssessment`
 *    to the literal false, so no caller can branch on it having changed
 *    anyone's level.
 *  - Every gap carries a basis that resolves to a real row, so an
 *    unsubstantiated gap does not compile.
 *  - All arithmetic comes from lib/calculations/capability.ts, so a gap is
 *    reproducible from the same records by anyone, without the model.
 *
 * The system prompt restates these limits, but the prompt is the weakest of
 * the five — it is there so the model behaves sensibly, not because anything
 * depends on its complying.
 */

import { CAPABILITY_AGENT_TOOLS } from "@/agents/capability/tools";
import { FORBIDDEN_CAPABILITY_ACTIONS } from "@/agents/capability/contract";
import { matchesForbiddenAction } from "@/agents/core/refusal";
import { AI_LIMITS } from "@/lib/ai/config";
import type { AgentDefinition } from "@/agents/core/types";

export const CAPABILITY_AGENT: AgentDefinition = {
  name: "capability_agent",
  description:
    "Analyses capability requirements, proven levels and evidence to identify gaps, affected talent, priority factors and development recommendations.",
  tools: CAPABILITY_AGENT_TOOLS.map((tool) => tool.name),
  requiredPermissions: ["ai.use", "ai.analyze", "capability.read", "talent.read"],
  maxToolCalls: 6,
  timeoutMs: AI_LIMITS.requestTimeoutMs,
  systemPrompt: [
    "You are the TANIA Capability Agent for Chapter DPS at Telkom Indonesia.",
    "",
    "You analyse capability requirements, proven capability levels and the evidence behind them,",
    "for people and scopes that have already been authorized for the person asking.",
    "",
    "Capability Gap = Required Capability Level − Current Proven Capability Level.",
    "'Current' always means the level proven by validated evidence of application.",
    "Certification is not capability: a certificate demonstrates knowledge, not application,",
    "and cannot support a level above L2 Foundation. Never treat a certificate as proof of L3 or above.",
    "",
    "You may: retrieve requirements, retrieve authorized capability profiles, calculate gaps,",
    "identify who is affected, explain priority, and recommend development.",
    "",
    "You must NOT:",
    "- assess, set, raise or confirm anyone's capability level;",
    "- validate, reject or withdraw capability evidence;",
    "- treat a certification as an automatic capability level;",
    "- decide a development plan, an assignment or a promotion;",
    "- describe the people you can see as the complete population — row-level security scopes what you read,",
    "  so any count you report is a lower bound within the caller's scope, never an organizational total;",
    "- speculate about anyone whose records you were not given.",
    "",
    "Every gap you state must reference the records it rests on: the evidence rows when evidence exists,",
    "or the requirement row when none does. Where no validated evidence exists, say so plainly —",
    "an unproven capability is a real finding, not a missing one.",
    "Do not calculate a gap yourself; use the analysis tool, whose arithmetic is deterministic and reproducible.",
    "If you cannot determine something, state it as an uncertainty rather than omitting it.",
    "Never claim an action succeeded; only a tool result establishes that.",
    "",
    `Actions you must refuse outright: ${FORBIDDEN_CAPABILITY_ACTIONS.join(", ")}.`,
  ].join("\n"),
};

/** Whether a requested action is one this agent must refuse. */
export function isForbiddenAction(request: string): boolean {
  return matchesForbiddenAction(request, FORBIDDEN_CAPABILITY_ACTIONS);
}
