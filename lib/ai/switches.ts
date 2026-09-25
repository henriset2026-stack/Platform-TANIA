import "server-only";

/**
 * AI kill switches (Security Gate #3, step 35).
 *
 * Server-side only, read on every call: a browser cannot flip them, and a
 * redeploy with a changed variable takes effect without a code change. Each
 * switches off one capability and leaves the rest of the portal running.
 *
 * Fail closed: unset means the default; "true", "1", "on" or "yes" means on;
 * ANY other value, including a typo, means off. An operator reaching for a
 * kill switch in an incident must not be defeated by spelling.
 *
 *   AI_ASSISTANT_ENABLED    default on   the whole assistant (no model call)
 *   TOOL_EXECUTION_ENABLED  default on   tools offered to, and run for, the model
 *   RAG_ENABLED             default on   knowledge retrieval
 *   JARVIS_HANDOFF_ENABLED  default OFF  no JARVIS transport exists yet
 *
 * There is no separate AGENTS_ENABLED: the assistant is the only routed
 * agent, and agents act only through tools, so AI_ASSISTANT_ENABLED and
 * TOOL_EXECUTION_ENABLED cover it.
 */

export type AiSwitch = "AI_ASSISTANT_ENABLED" | "TOOL_EXECUTION_ENABLED" | "RAG_ENABLED" | "JARVIS_HANDOFF_ENABLED";

const DEFAULTS: Record<AiSwitch, boolean> = {
  AI_ASSISTANT_ENABLED: true,
  TOOL_EXECUTION_ENABLED: true,
  RAG_ENABLED: true,
  JARVIS_HANDOFF_ENABLED: false,
};

export function isEnabled(name: AiSwitch, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return DEFAULTS[name];
  return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
}
