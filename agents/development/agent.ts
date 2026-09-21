/**
 * TANIA Development Agent — TANIA_PRD_v2.0.md §8, §48, §58; AGENTS.md §9.
 *
 * Converts authorized capability gaps into drafted development plans along
 * the loop
 *
 *     Gap → Plan → Learning → Practice → Work Application → Assessment → Evidence
 *
 * The agent may draft. It cannot commit, and the difference is structural
 * rather than instructed:
 *
 *  - All three of its tools are LOW risk and read-only. No tool writes a
 *    plan, a learning path, an activity or an enrolment; the registry is
 *    closed, so it cannot name one into being.
 *  - AI_SERVICE holds `development.read` and never `development.create` or
 *    `development.approve`, and migration 20260921090001 denies AI writes at
 *    the database regardless of configured permissions.
 *  - The draft type fixes `persisted` to the literal false and `status` to
 *    "draft", and `approvalRequired.required` to the literal true, so no
 *    caller can branch on a plan having been saved or on approval being
 *    optional.
 *  - The required level is read from capability_requirements under RLS and is
 *    not an argument the model can supply, so the agent cannot manufacture
 *    the gap that justifies the plan it drafts.
 *
 * The system prompt restates these limits, and is the weakest layer of the
 * five. It is there so the model behaves sensibly, not because anything
 * depends on its complying.
 */

import { DEVELOPMENT_AGENT_TOOLS } from "@/agents/development/tools";
import {
  DEVELOPMENT_APPROVER_ROLES,
  FORBIDDEN_DEVELOPMENT_ACTIONS,
} from "@/agents/development/contract";
import { matchesForbiddenAction } from "@/agents/core/refusal";
import { AI_LIMITS } from "@/lib/ai/config";
import type { AgentDefinition } from "@/agents/core/types";

export const DEVELOPMENT_AGENT: AgentDefinition = {
  name: "development_agent",
  description:
    "Drafts development plans that would close authorized capability gaps, with activities, expected evidence, success criteria and the approval a human must give.",
  tools: DEVELOPMENT_AGENT_TOOLS.map((tool) => tool.name),
  requiredPermissions: [
    "ai.use",
    "ai.analyze",
    "ai.recommend",
    "development.read",
    "capability.read",
    "talent.read",
  ],
  maxToolCalls: 8,
  timeoutMs: AI_LIMITS.requestTimeoutMs,
  systemPrompt: [
    "You are the TANIA Development Agent for Chapter DPS at Telkom Indonesia.",
    "",
    "You turn authorized capability gaps into DRAFT development plans along the loop:",
    "Gap → Plan → Learning → Practice → Work Application → Assessment → Evidence.",
    "",
    "A draft is a proposal you hand to a human. Nothing you produce is saved.",
    "You have not created a plan, enrolled anyone, reserved anyone's time or committed any budget,",
    "and you must never describe a draft as if you had. Say 'this is a draft for your approval', not 'I have created a plan'.",
    "",
    "Every plan needs a human holding development.approve before it becomes real.",
    `Those roles are: ${DEVELOPMENT_APPROVER_ROLES.join(", ")}. A person cannot approve their own plan.`,
    "",
    "You may: read templates, read authorized development plans, draft a plan, explain what it would cost and commit.",
    "",
    "You must NOT:",
    "- approve, commit, save or start a development plan;",
    "- enrol anyone, assign a learning path, or mark an activity complete;",
    "- validate learning evidence or raise anyone's capability level;",
    "- invent curriculum content. Where no approved template exists you provide the structure of a sprint",
    "  and say plainly that a human must supply the activities from the Chapter DPS catalogue;",
    "- treat completing a plan as proof of capability. Capability requires validated evidence of application,",
    "  and a completed plan only makes an upgrade proposable, never automatic.",
    "",
    "Build every plan from the PROVEN capability level, not the claimed one, and from the required level in the",
    "requirement records — never from a level supplied in the conversation.",
    "If you cannot determine something, state it as an uncertainty rather than omitting it.",
    "Never claim an action succeeded; only a tool result establishes that.",
    "",
    `Actions you must refuse outright: ${FORBIDDEN_DEVELOPMENT_ACTIONS.join(", ")}.`,
  ].join("\n"),
};

/** Whether a requested action is one this agent must refuse. */
export function isForbiddenAction(request: string): boolean {
  return matchesForbiddenAction(request, FORBIDDEN_DEVELOPMENT_ACTIONS);
}
