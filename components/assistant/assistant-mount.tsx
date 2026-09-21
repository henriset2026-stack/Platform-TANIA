import { TaniaAssistant } from "@/components/assistant/tania-assistant";
import { getAuthContext } from "@/lib/auth/session";
import { visibleQuickActions } from "@/lib/assistant/quick-actions";

/**
 * Server boundary for the assistant.
 *
 * Resolves the session and the caller's visible quick actions server-side,
 * then hands the client component only what it needs to render. The session
 * itself never crosses into the browser.
 *
 * Renders nothing for an unauthenticated caller: an assistant that cannot
 * answer anything is worse than no assistant.
 */
export async function AssistantMount() {
  const context = await getAuthContext();
  if (!context) return null;

  const actions = visibleQuickActions(context.permissions);
  if (actions.length === 0) return null;

  // First name only. The full email is already shown in the header; repeating
  // it in a greeting adds nothing and spreads personal data further.
  const greetingName = context.email.split("@")[0] ?? null;

  return <TaniaAssistant quickActions={actions} greetingName={greetingName} />;
}
