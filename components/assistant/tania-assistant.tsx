"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { contextFromPathname, promptsForContext } from "@/lib/assistant/context";
import type { QuickAction } from "@/lib/assistant/quick-actions";

/**
 * Mounts the assistant and derives page context from the live pathname.
 *
 * Context is computed from the URL rather than passed down as props, so it
 * cannot drift out of step with what is actually on screen when a user
 * navigates within the shell.
 *
 * `quickActions` is resolved on the SERVER from the session's permissions and
 * passed in. Doing it here would mean the browser deciding what it may ask
 * for — harmless in itself, since the gateway authorizes anyway, but it would
 * put a permission list in the client bundle for no benefit.
 */
export function TaniaAssistant({
  quickActions,
  greetingName,
}: {
  quickActions: readonly QuickAction[];
  greetingName: string | null;
}) {
  const pathname = usePathname();
  const context = useMemo(() => contextFromPathname(pathname), [pathname]);
  const prompts = useMemo(() => promptsForContext(context), [context]);

  return (
    <AssistantPanel
      context={context}
      prompts={prompts}
      quickActions={quickActions}
      greetingName={greetingName}
    />
  );
}
