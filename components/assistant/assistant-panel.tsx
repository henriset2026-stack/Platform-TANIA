"use client";

import {
  FolderKanban,
  GraduationCap,
  Maximize2,
  Minimize2,
  SendHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { TaniaAvatar } from "@/components/brand/tania-avatar";
import { StatusBadge } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PageContext } from "@/lib/assistant/context";
import type { QuickAction } from "@/lib/assistant/quick-actions";
import type { AssistantTurn, TaniaState } from "@/components/assistant/types";

const ICONS: Record<QuickAction["icon"], LucideIcon> = {
  sparkles: Sparkles,
  target: Target,
  users: Users,
  trending: TrendingUp,
  graduation: GraduationCap,
  folder: FolderKanban,
};

/** State copy from PRD §80.3. */
const STATE_COPY: Record<TaniaState, string> = {
  idle: "Online",
  greeting: "Hi, I'm TANIA. How can I help you today?",
  listening: "Listening…",
  thinking: "Analyzing your request…",
  answering: "Answering",
  expanded: "Online",
};

/**
 * The floating TANIA assistant — PRD §80–§81.
 *
 * Geometry follows the spec: fixed, bottom 24px, right 24px, 380px wide,
 * capped at 680px tall.
 *
 * SECURITY NOTE. This component holds no authority. It sends a message and
 * the page context to /api/ai/chat; the gateway authenticates, authorizes and
 * decides what may be answered. Quick actions are prompts, not capabilities,
 * and the context it sends is a hint the server re-authorizes — a forged one
 * can only make TANIA answer the wrong question, never reveal the wrong data.
 */
export function AssistantPanel({
  context,
  prompts,
  quickActions,
  greetingName,
}: {
  context: PageContext;
  prompts: readonly string[];
  quickActions: readonly QuickAction[];
  greetingName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<TaniaState>("idle");
  const [turns, setTurns] = useState<readonly AssistantTurn[]>([]);
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Greeting settles back to idle (PRD §80.3). The greeting itself is set by
  // the open handler — opening is an event, not a synchronisation, and
  // setting state synchronously in an effect causes a cascading render.
  useEffect(() => {
    if (state !== "greeting") return;
    const timer = setTimeout(() => {
      setState((current) => (current === "greeting" ? "idle" : current));
    }, 2_500);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, expanded]);

  // Keep the newest turn in view without stealing focus.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns]);

  async function send(message: string) {
    const trimmed = message.trim();
    if (trimmed.length === 0 || state === "thinking") return;

    const userTurn: AssistantTurn = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      evidence: [],
      citations: [],
      toolsUsed: [],
      requiresApproval: false,
      correlationId: null,
      errorCode: null,
    };
    setTurns((prev) => [...prev, userTurn]);
    setDraft("");
    setState("thinking");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          // A hint. The server re-authorizes anything it implies.
          context: { kind: context.kind, entityId: context.entityId },
        }),
      });
      const body = (await res.json()) as {
        response?: {
          answer: string;
          evidence?: string[];
          citations?: { ordinal?: number; source?: string }[];
          toolsUsed?: string[];
          requiresApproval?: boolean;
          correlationId?: string;
        };
        error?: { code: string; message: string; requestId?: string };
      };

      if (!res.ok || !body.response) {
        setTurns((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: body.error?.message ?? "TANIA could not answer that request.",
            evidence: [],
            citations: [],
            toolsUsed: [],
            requiresApproval: false,
            correlationId: body.error?.requestId ?? null,
            errorCode: body.error?.code ?? "UNKNOWN",
          },
        ]);
        setState("idle");
        return;
      }

      setState("answering");
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: body.response!.answer,
          evidence: body.response!.evidence ?? [],
          citations: (body.response!.citations ?? []).map((c, i) => ({
            ordinal: c.ordinal ?? i + 1,
            source: c.source ?? "Source",
          })),
          toolsUsed: body.response!.toolsUsed ?? [],
          requiresApproval: body.response!.requiresApproval ?? false,
          correlationId: body.response!.correlationId ?? null,
          errorCode: null,
        },
      ]);
      setState("idle");
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "The request could not be sent. Nothing was changed.",
          evidence: [],
          citations: [],
          toolsUsed: [],
          requiresApproval: false,
          correlationId: null,
          errorCode: "NETWORK",
        },
      ]);
      setState("idle");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setState("greeting");
        }}
        title="Ask TANIA"
        className={cn(
          "fixed right-6 bottom-6 z-40 flex items-center gap-2.5 rounded-full",
          "border border-slate-200 bg-white py-2 pr-4 pl-2 shadow-lg",
          "transition-colors hover:bg-slate-50",
        )}
      >
        <TaniaAvatar state="idle" size="md" />
        <span className="text-sm font-medium text-[var(--color-telkom-navy)]">
          Ask TANIA
        </span>
        <span className="sr-only">Open the TANIA assistant</span>
      </button>
    );
  }

  return (
    <div
      role="complementary"
      aria-label="TANIA assistant"
      className={cn(
        "fixed right-6 bottom-6 z-40 flex flex-col overflow-hidden",
        "rounded-[var(--radius-card)] border border-slate-200 bg-white shadow-2xl",
        expanded
          ? "top-6 left-6 w-auto md:left-auto md:w-[min(720px,calc(100vw-3rem))]"
          : "w-[min(380px,calc(100vw-3rem))] max-h-[min(680px,calc(100vh-3rem))]",
      )}
    >
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <TaniaAvatar state={state} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-telkom-navy)]">
            TANIA
          </p>
          <p aria-live="polite" className="truncate text-xs text-slate-500">
            {state === "greeting" && greetingName
              ? `Hi ${greetingName}, how can I help you today?`
              : STATE_COPY[state]}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse assistant" : "Expand assistant"}
        >
          {expanded ? (
            <Minimize2 aria-hidden="true" className="size-4" />
          ) : (
            <Maximize2 aria-hidden="true" className="size-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {turns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Ask about talent, capability, performance, development or work.
              I answer only from what you are authorized to see.
            </p>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                Suggested for {context.label}
              </p>
              <ul className="space-y-1.5">
                {prompts.map((prompt) => (
                  <li key={prompt}>
                    <button
                      type="button"
                      onClick={() => void send(prompt)}
                      className="w-full rounded-[var(--radius-control)] border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      {prompt}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          turns.map((turn) => <Turn key={turn.id} turn={turn} />)
        )}

        {state === "thinking" ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <span
              aria-hidden="true"
              className="size-2 animate-pulse rounded-full bg-amber-500"
            />
            Analyzing your request…
          </p>
        ) : null}
      </div>

      {quickActions.length > 0 ? (
        <div className="border-t border-slate-100 px-3 py-2">
          <ul className="flex flex-wrap gap-1.5">
            {quickActions
              .filter((action) => action.prompt.length > 0)
              .map((action) => {
                const Icon = ICONS[action.icon];
                return (
                  <li key={action.id}>
                    <button
                      type="button"
                      onClick={() => void send(action.prompt)}
                      className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Icon aria-hidden="true" className="size-3.5" />
                      {action.label}
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ) : null}

      <form
        className="flex items-center gap-2 border-t border-slate-200 px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Ask TANIA
        </label>
        <input
          id={inputId}
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setState((s) => (s === "idle" ? "listening" : s))}
          onBlur={() => setState((s) => (s === "listening" ? "idle" : s))}
          placeholder="Ask TANIA anything…"
          disabled={state === "thinking"}
          className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
        />
        <Button
          type="submit"
          size="icon"
          disabled={state === "thinking" || draft.trim().length === 0}
          aria-label="Send"
        >
          <SendHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </form>
    </div>
  );
}

/**
 * One turn.
 *
 * An assistant turn shows its evidence, citations and tools used. An answer
 * that used no tool and cited nothing says so — the absence of evidence is
 * information, not something to hide behind confident prose.
 */
function Turn({ turn }: { turn: AssistantTurn }) {
  if (turn.role === "user") {
    return (
      <p className="ml-6 rounded-[var(--radius-control)] bg-[var(--color-telkom-blue-100)] px-3 py-2 text-sm text-[var(--color-telkom-navy)]">
        {turn.content}
      </p>
    );
  }

  const isError = turn.errorCode !== null;

  return (
    <div
      className={cn(
        "mr-6 rounded-[var(--radius-control)] px-3 py-2 text-sm",
        isError ? "bg-red-50 text-red-900" : "bg-slate-50 text-slate-800",
      )}
      {...(isError ? { role: "alert" as const } : {})}
    >
      <p>{turn.content}</p>

      {turn.requiresApproval ? (
        <p className="mt-2">
          <StatusBadge tone="warning">Awaiting your approval</StatusBadge>
        </p>
      ) : null}

      {turn.citations.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {turn.citations.map((citation) => (
            <li key={citation.ordinal} className="text-xs text-slate-500">
              [{citation.ordinal}] {citation.source}
            </li>
          ))}
        </ul>
      ) : null}

      {turn.toolsUsed.length > 0 ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Used: {turn.toolsUsed.join(", ")}
        </p>
      ) : null}

      {turn.correlationId ? (
        <p className="mt-1.5 font-mono text-[10px] text-slate-400">
          Reference: {turn.correlationId}
        </p>
      ) : null}
    </div>
  );
}
