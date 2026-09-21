import { describe, expect, it } from "vitest";

import {
  PAGE_CONTEXT_KINDS,
  contextFromPathname,
  describeContext,
  parsePageContext,
  promptsForContext,
} from "@/lib/assistant/context";
import { QUICK_ACTIONS, visibleQuickActions } from "@/lib/assistant/quick-actions";
import { TANIA_STATES } from "@/components/brand/tania-avatar";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("page context from pathname", () => {
  it("recognises the main surfaces", () => {
    expect(contextFromPathname("/dashboard").kind).toBe("dashboard");
    expect(contextFromPathname("/talent").kind).toBe("talent");
    expect(contextFromPathname("/capabilities").kind).toBe("capability");
    expect(contextFromPathname("/performance").kind).toBe("performance");
    expect(contextFromPathname("/development").kind).toBe("development");
    expect(contextFromPathname("/workload").kind).toBe("workload");
    expect(contextFromPathname("/projects").kind).toBe("project");
    expect(contextFromPathname("/knowledge").kind).toBe("knowledge");
  });

  it("recognises detail pages and captures the entity", () => {
    expect(contextFromPathname(`/talent/${UUID}`)).toMatchObject({
      kind: "talent_detail",
      entityId: UUID,
    });
    expect(contextFromPathname(`/projects/${UUID}`)).toMatchObject({
      kind: "project_detail",
      entityId: UUID,
    });
  });

  it("degrades an unknown path rather than guessing", () => {
    expect(contextFromPathname("/nonsense").kind).toBe("unknown");
    expect(contextFromPathname("/").kind).toBe("unknown");
  });

  it("drops a non-UUID entity id", () => {
    expect(contextFromPathname("/talent/../../etc/passwd").entityId).toBeNull();
    expect(contextFromPathname("/talent/1 OR 1=1").entityId).toBeNull();
  });
});

// ===========================================================================
// The trust boundary: context arrives from the browser.
// ===========================================================================
describe("parsing untrusted context", () => {
  it("accepts a well-formed context", () => {
    expect(parsePageContext({ kind: "talent_detail", entityId: UUID })).toMatchObject({
      kind: "talent_detail",
      entityId: UUID,
    });
  });

  it("rejects an unrecognised kind instead of passing it through", () => {
    expect(parsePageContext({ kind: "admin_everything" }).kind).toBe("unknown");
    expect(parsePageContext({ kind: 42 }).kind).toBe("unknown");
  });

  it("drops a malformed entity id", () => {
    for (const bad of ["' OR 1=1--", "../../secrets", "", 123, null, {}]) {
      expect(parsePageContext({ kind: "talent_detail", entityId: bad }).entityId).toBeNull();
    }
  });

  it("handles non-object input", () => {
    for (const bad of [null, undefined, "talent", 7, []]) {
      expect(parsePageContext(bad).kind).toBe("unknown");
    }
  });

  // Context must never be able to smuggle authority.
  it("carries no roles, permissions or scope", () => {
    const parsed = parsePageContext({
      kind: "dashboard",
      roles: ["SUPER_ADMIN"],
      permissions: ["talent.export"],
      organizationIds: ["org-x"],
    }) as unknown as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual(["entityId", "kind", "label"]);
    expect(parsed["roles"]).toBeUndefined();
    expect(parsed["permissions"]).toBeUndefined();
  });

  it("gives every kind a label", () => {
    for (const kind of PAGE_CONTEXT_KINDS) {
      expect(parsePageContext({ kind }).label.length).toBeGreaterThan(0);
    }
  });
});

describe("describing context to the model", () => {
  it("frames context as looking, never as entitlement", () => {
    const description = describeContext({
      kind: "talent_detail",
      entityId: UUID,
      label: "a talent passport",
    });
    expect(description).toMatch(/looking at/i);
    // Phrasing it as entitlement would invite the model to treat context as
    // permission.
    expect(description).toMatch(/does not grant/i);
    expect(description).not.toMatch(/authorized to|entitled to|may access/i);
  });

  it("says nothing for unknown context", () => {
    expect(describeContext({ kind: "unknown", entityId: null, label: "TANIA" })).toBe("");
  });

  it("does not leak the entity id into the prompt", () => {
    // The model has no use for a raw id, and including it invites it to be
    // quoted back or used as though it had been authorized.
    const description = describeContext({
      kind: "talent_detail",
      entityId: UUID,
      label: "a talent passport",
    });
    expect(description).not.toContain(UUID);
  });
});

describe("context-aware prompts", () => {
  it("offers the PRD's Indonesian examples on the right pages", () => {
    expect(promptsForContext(contextFromPathname("/performance"))).toContain(
      "Siapa yang perlu perhatian?",
    );
    expect(promptsForContext(contextFromPathname("/capabilities"))).toContain(
      "Apa gap terbesar?",
    );
    expect(promptsForContext(contextFromPathname(`/projects/${UUID}`))).toContain(
      "Siapa yang cocok?",
    );
    expect(promptsForContext(contextFromPathname("/development"))).toContain(
      "Buatkan development plan.",
    );
  });

  it("always offers at least one prompt", () => {
    for (const kind of PAGE_CONTEXT_KINDS) {
      expect(promptsForContext({ kind, entityId: null, label: "" }).length).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// Quick actions are prompts, not capabilities.
// ===========================================================================
describe("quick actions", () => {
  it("covers the six actions in PRD §81", () => {
    expect(QUICK_ACTIONS.map((a) => a.label)).toEqual([
      "Ask TANIA",
      "Critical Gaps",
      "Find Talent",
      "Performance",
      "Development",
      "Project Matching",
    ]);
  });

  it("hides actions the viewer has no read permission for", () => {
    const visible = visibleQuickActions(["ai.use", "talent.read"]);
    expect(visible.map((a) => a.id)).toEqual(["ask", "find_talent"]);
  });

  it("shows nothing to an account with no permissions", () => {
    expect(visibleQuickActions([])).toEqual([]);
  });

  // Hiding a button is a convenience; the gateway authorizes regardless.
  it("gates every action on a read permission only", () => {
    for (const action of QUICK_ACTIONS) {
      expect(action.permission).toMatch(/\.(read|use)$/);
    }
  });

  it("carries a prompt rather than an operation", () => {
    for (const action of QUICK_ACTIONS) {
      // An action is text sent to the same authorized endpoint — never a
      // direct call to a privileged operation.
      expect(typeof action.prompt).toBe("string");
    }
  });
});

describe("avatar states", () => {
  it("implements the six states in PRD §80.3", () => {
    expect([...TANIA_STATES]).toEqual([
      "idle",
      "greeting",
      "listening",
      "thinking",
      "answering",
      "expanded",
    ]);
  });
});
