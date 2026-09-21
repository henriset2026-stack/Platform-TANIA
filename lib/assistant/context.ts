/**
 * Assistant page context — TANIA_PRD_v2.0_working.md §85, AGENTS.md §21.
 *
 * THE TRUST BOUNDARY
 * Page context originates in the BROWSER. It is a hint about what the person
 * is looking at, and nothing more. It may shape the question TANIA is asked;
 * it must never widen the answer.
 *
 * Concretely:
 *  - `kind` is matched against an allowlist. An unrecognised value degrades to
 *    "unknown" rather than being passed through.
 *  - `entityId` is re-authorized server-side on every use, exactly as if it
 *    had been typed by the user. A page claiming "I am showing talent X" gives
 *    no access to talent X.
 *  - Nothing here carries roles, permissions or scope. Those come from the
 *    session (lib/auth/session.ts) and are enforced by RLS.
 *
 * A context object is therefore safe to accept from an untrusted client,
 * because the worst a forged one can do is make TANIA answer the wrong
 * question — not reveal the wrong data.
 */

export const PAGE_CONTEXT_KINDS = [
  "dashboard",
  "talent",
  "talent_detail",
  "capability",
  "capability_detail",
  "performance",
  "performance_detail",
  "development",
  "workload",
  "project",
  "project_detail",
  "knowledge",
  "unknown",
] as const;

export type PageContextKind = (typeof PAGE_CONTEXT_KINDS)[number];

export interface PageContext {
  readonly kind: PageContextKind;
  /**
   * Entity the page is showing, when there is one.
   *
   * UNTRUSTED. Every server path that uses it must re-authorize it. Present
   * so TANIA can resolve "why is this red?" against the thing on screen, not
   * so it can fetch it.
   */
  readonly entityId: string | null;
  /** Human label for the current page, used in prompts. */
  readonly label: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LABELS: Record<PageContextKind, string> = {
  dashboard: "the chapter dashboard",
  talent: "the talent directory",
  talent_detail: "a talent passport",
  capability: "the capability matrix",
  capability_detail: "a capability definition",
  performance: "the performance cockpit",
  performance_detail: "a person's performance evidence",
  development: "the development centre",
  workload: "the workload view",
  project: "the project list",
  project_detail: "a project",
  knowledge: "the knowledge base",
  unknown: "TANIA",
};

/**
 * Derives context from a pathname.
 *
 * Done from the URL rather than passed around as state so it cannot drift out
 * of step with what is actually on screen.
 */
export function contextFromPathname(pathname: string): PageContext {
  const segments = pathname.split("/").filter(Boolean);
  const [first, second, third] = segments;

  const withId = (kind: PageContextKind, id: string | undefined): PageContext => ({
    kind,
    entityId: id && UUID_RE.test(id) ? id : null,
    label: LABELS[kind],
  });

  switch (first) {
    case "dashboard":
      return withId("dashboard", undefined);
    case "talent":
      if (second && third === "capabilities") return withId("capability", second);
      return second ? withId("talent_detail", second) : withId("talent", undefined);
    case "capabilities":
    case "capability":
      return second ? withId("capability_detail", second) : withId("capability", undefined);
    case "performance":
      if (second === "reviews") return withId("performance", undefined);
      return second ? withId("performance_detail", second) : withId("performance", undefined);
    case "development":
      return withId("development", second);
    case "workload":
    case "assignments":
      return withId("workload", undefined);
    case "projects":
      return second ? withId("project_detail", second) : withId("project", undefined);
    case "knowledge":
      return withId("knowledge", second);
    default:
      return withId("unknown", undefined);
  }
}

/** Validates a context that arrived over the wire. */
export function parsePageContext(raw: unknown): PageContext {
  const fallback: PageContext = { kind: "unknown", entityId: null, label: LABELS.unknown };
  if (typeof raw !== "object" || raw === null) return fallback;

  const value = raw as Record<string, unknown>;
  const kind = PAGE_CONTEXT_KINDS.includes(value["kind"] as PageContextKind)
    ? (value["kind"] as PageContextKind)
    : "unknown";

  const entityId =
    typeof value["entityId"] === "string" && UUID_RE.test(value["entityId"])
      ? value["entityId"]
      : null;

  return { kind, entityId, label: LABELS[kind] };
}

/**
 * Context-aware suggestions — AGENTS.md §21.
 *
 * The PRD's examples are in Indonesian, which is how Chapter DPS actually
 * asks these questions, so they are kept verbatim rather than translated.
 */
export const CONTEXT_PROMPTS: Record<PageContextKind, readonly string[]> = {
  dashboard: [
    "Apa yang perlu perhatian saya minggu ini?",
    "Show my chapter performance",
    "What should we focus on this month?",
  ],
  talent: ["Siapa yang cocok untuk project baru?", "Which talents need attention?"],
  talent_detail: [
    "Apa gap kapabilitas orang ini?",
    "What development would help most here?",
  ],
  capability: ["Apa gap terbesar?", "Which capabilities are critical?"],
  capability_detail: ["Siapa yang sudah terbukti di kapabilitas ini?"],
  performance: ["Siapa yang perlu perhatian?", "What is driving the trend?"],
  performance_detail: ["Apa evidence terkuat di periode ini?"],
  development: ["Buatkan development plan.", "Which gaps should we close first?"],
  workload: ["Siapa yang overload?", "Where is our spare capacity?"],
  project: ["Project mana yang berisiko?"],
  project_detail: ["Siapa yang cocok?", "What capability does this project need?"],
  knowledge: ["Apa yang kita punya tentang topik ini?"],
  unknown: ["Apa yang bisa saya bantu?"],
};

export function promptsForContext(context: PageContext): readonly string[] {
  return CONTEXT_PROMPTS[context.kind] ?? CONTEXT_PROMPTS.unknown;
}

/**
 * Describes context for the model.
 *
 * Deliberately says the person is LOOKING AT something, never that they are
 * entitled to it. Phrasing it as entitlement would invite the model to treat
 * the context as permission, which it is not.
 */
export function describeContext(context: PageContext): string {
  if (context.kind === "unknown") return "";
  return `The person is currently looking at ${context.label}. Use this to interpret vague questions such as "why is this red?". It does not grant them access to anything.`;
}
