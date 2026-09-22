import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  MAX_ARRAY_LENGTH,
  MAX_DEPTH,
  MAX_STRING_LENGTH,
  REDACTED,
  redact,
  stableHash,
} from "@/lib/observability/redact";
import {
  percentile,
  summarizeLatency,
  summarizeRuns,
  summarizeToolCalls,
  type RunRecord,
  type ToolCallRecord,
} from "@/lib/observability/metrics";
import { classifyDecision } from "@/lib/observability/recorder";
import type { ToolCallRecord as PipelineRecord } from "@/agents/core/pipeline";

// ===========================================================================
// NEVER LOG — secrets
// ===========================================================================
describe("redaction: secrets never reach a log", () => {
  // "hunter2" matches no pattern; the KEY is what gives it away.
  it("redacts by key name, whatever the value looks like", () => {
    const { value, redactions } = redact({
      password: "hunter2",
      apiKey: "abc",
      SUPABASE_SERVICE_ROLE_KEY: "x",
      refreshToken: "y",
      authorization: "z",
      cookie: "session=1",
      connectionString: "anything",
    });

    const out = value as Record<string, unknown>;
    for (const key of Object.keys(out)) {
      expect(out[key], key).toBe(REDACTED);
    }
    expect(redactions.every((r) => r.rule === "secret_key")).toBe(true);
  });

  // An innocent key with a live token in the value.
  it("redacts by value shape under a harmless key", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const { value, redactions } = redact({
      note: `Ran curl -H 'Authorization: Bearer ${jwt}'`,
    });
    expect((value as { note: string }).note).toBe(REDACTED);
    expect(redactions[0]?.rule).toBe("secret_value");
  });

  it("catches the common credential shapes", () => {
    const cases: readonly [string, string][] = [
      ["openai-style", "sk-abcdefghijklmnopqrstuvwx"],
      ["github-token", "ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
      ["aws-access-key", "AKIAIOSFODNN7EXAMPLE"],
      ["pem-block", "-----BEGIN RSA PRIVATE KEY-----"],
      ["postgres-dsn", "postgresql://user:pw@host:5432/db"],
      ["basic-auth-url", "https://user:pw@example.test/x"],
      ["supabase-service", "role is service_role here"],
    ];
    for (const [name, secret] of cases) {
      const { value, redactions } = redact({ note: secret });
      expect((value as { note: string }).note, name).toBe(REDACTED);
      expect(redactions[0]?.detail, name).toBe(name);
    }
  });

  // Redacting ids would make the log useless; the thresholds target only
  // things that are always secrets.
  it("leaves ordinary identifiers and text alone", () => {
    const { value, redactions } = redact({
      talentId: "123e4567-e89b-12d3-a456-426614174000",
      toolName: "retrieve_capability_requirements",
      count: 7,
      ok: true,
    });
    expect(redactions).toEqual([]);
    expect((value as { talentId: string }).talentId).toContain("123e4567");
  });

  // Distinguishable from "no secret was present".
  it("reports what it removed, and where", () => {
    const { redactions } = redact({ nested: { deeper: { apiKey: "x" } } });
    expect(redactions).toHaveLength(1);
    expect(redactions[0]?.path).toBe("nested.deeper.apiKey");
    // The path, never the value.
    expect(JSON.stringify(redactions)).not.toContain("\"x\"");
  });
});

// ===========================================================================
// NEVER LOG — unnecessary sensitive employee data
// ===========================================================================
describe("redaction: sensitive employee data", () => {
  it("removes personal fields an audit row does not need", () => {
    const { value, redactions } = redact({
      salary: 50_000_000,
      national_id: "3174xxxxxxxx",
      home_address: "Jl. Example 1",
      date_of_birth: "1990-01-01",
      bank_account: "123456",
      review_narrative: "Struggling with deadlines",
      medical: "condition",
      talentId: "ok-to-keep",
    });

    const out = value as Record<string, unknown>;
    for (const key of [
      "salary",
      "national_id",
      "home_address",
      "date_of_birth",
      "bank_account",
      "review_narrative",
      "medical",
    ]) {
      expect(out[key], key).toBe(REDACTED);
    }
    expect(out.talentId).toBe("ok-to-keep");
    expect(redactions.every((r) => r.rule === "sensitive_personal")).toBe(true);
  });
});

// ===========================================================================
// Redaction robustness — logging must never become an outage
// ===========================================================================
describe("redaction: never throws", () => {
  it("survives a cycle", () => {
    const cyclic: Record<string, unknown> = { name: "a" };
    cyclic.self = cyclic;
    const { value } = redact(cyclic);
    expect((value as { self: unknown }).self).toBe("[circular]");
  });

  it("bounds depth, strings and arrays", () => {
    let deep: unknown = "bottom";
    for (let i = 0; i < MAX_DEPTH + 3; i += 1) deep = { nested: deep };
    expect(JSON.stringify(redact(deep).value)).toContain(REDACTED);

    const long = redact({ text: "x".repeat(MAX_STRING_LENGTH + 100) });
    expect((long.value as { text: string }).text).toMatch(/truncated/);

    const wide = redact({ items: Array.from({ length: MAX_ARRAY_LENGTH + 10 }, () => 1) });
    expect((wide.value as { items: unknown[] }).items).toHaveLength(MAX_ARRAY_LENGTH);
  });

  it("handles primitives, dates, errors and undefined", () => {
    expect(redact(null).value).toBeNull();
    expect(redact(undefined).value).toBeNull();
    expect(redact(42).value).toBe(42);
    expect(typeof redact(new Date("2026-01-01")).value).toBe("string");
    const err = redact(new Error("boom")).value as { message: string };
    expect(err.message).toBe("boom");
  });

  it("hashes stably without storing the text", () => {
    expect(stableHash("why is delivery falling")).toBe(
      stableHash("why is delivery falling"),
    );
    expect(stableHash("a")).not.toBe(stableHash("b"));
    expect(stableHash("secret query")).not.toContain("secret");
  });
});

// ===========================================================================
// Metrics
// ===========================================================================
describe("metrics: latency, failures, denials", () => {
  function call(over: Partial<ToolCallRecord> = {}): ToolCallRecord {
    return {
      toolName: "retrieve_capability_requirements",
      status: "completed",
      authorizationDecision: "allowed",
      riskLevel: "LOW",
      durationMs: 100,
      audited: true,
      createdAt: "2026-09-22T10:00:00.000Z",
      ...over,
    };
  }

  it("computes nearest-rank percentiles", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBe(5);
    expect(percentile([], 0.5)).toBe(0);
  });

  // A mean hides the shape that matters: here it is 2,380ms, which describes
  // nobody's experience — not the 95 fast requests nor the 5 slow ones.
  it("reports p95 and max rather than an average", () => {
    // 10% slow, so p95 sits inside the tail rather than on its boundary:
    // with exactly 5 of 100 above, nearest-rank p95 is the last fast value.
    const durations = [
      ...Array.from({ length: 90 }, () => 400),
      ...Array.from({ length: 10 }, () => 40_000),
    ];
    const summary = summarizeLatency(durations);
    expect(summary?.p50).toBe(400);
    expect(summary?.p95).toBe(40_000);
    expect(summary?.max).toBe(40_000);

    // And a single outlier in twenty is p100, not p95 — nearest-rank says so,
    // which is why max is reported alongside.
    const rare = summarizeLatency([...Array.from({ length: 19 }, () => 400), 40_000]);
    expect(rare?.p95).toBe(400);
    expect(rare?.max).toBe(40_000);
  });

  // A denied call never ran; counting it as 0ms makes refusing look fast.
  it("excludes calls with no duration instead of counting them as zero", () => {
    const summary = summarizeLatency([100, null, 200, null]);
    expect(summary?.count).toBe(2);
    expect(summary?.p50).toBe(100);
  });

  it("returns null for latency over an empty set", () => {
    expect(summarizeLatency([])).toBeNull();
    expect(summarizeLatency([null, null])).toBeNull();
  });

  // 0% failure across no calls is no result, not a good one.
  it("returns null rates for no calls, never zero", () => {
    const metrics = summarizeToolCalls([]);
    expect(metrics.failureRate).toBeNull();
    expect(metrics.denialRate).toBeNull();
    expect(metrics.totalCalls).toBe(0);
  });

  it("counts denials by the gate that made them", () => {
    const metrics = summarizeToolCalls([
      call(),
      call({ status: "denied", authorizationDecision: "denied_permission" }),
      call({ status: "denied", authorizationDecision: "denied_permission" }),
      call({ status: "denied", authorizationDecision: "denied_unknown_tool" }),
      call({ status: "failed" }),
    ]);

    expect(metrics.denied).toBe(3);
    expect(metrics.failed).toBe(1);
    expect(metrics.denialsByReason.denied_permission).toBe(2);
    expect(metrics.denialsByReason.denied_unknown_tool).toBe(1);
    expect(metrics.denialRate).toBe(0.6);
  });

  it("surfaces calls that ran while the log was unreachable", () => {
    const metrics = summarizeToolCalls([call(), call({ audited: false })]);
    expect(metrics.unauditedCalls).toBe(1);
  });

  it("groups by tool and by risk, including unclassified", () => {
    const metrics = summarizeToolCalls([
      call({ toolName: "a", riskLevel: "LOW" }),
      call({ toolName: "a", riskLevel: "HIGH" }),
      call({ toolName: "b", riskLevel: null }),
    ]);
    expect(metrics.callsByTool).toEqual({ a: 2, b: 1 });
    expect(metrics.callsByRisk).toEqual({ LOW: 1, HIGH: 1, unclassified: 1 });
  });

  it("summarizes runs and flags an approval-gate violation", () => {
    const runs: RunRecord[] = [
      {
        agentName: "capability_agent",
        status: "completed",
        latencyMs: 900,
        humanApprovalRequired: false,
        humanApproved: false,
      },
      {
        agentName: "capability_agent",
        status: "awaiting_approval",
        latencyMs: null,
        humanApprovalRequired: true,
        humanApproved: false,
      },
      // Should be impossible: agent_runs has a CHECK forbidding it.
      {
        agentName: "rogue",
        status: "completed",
        latencyMs: 10,
        humanApprovalRequired: true,
        humanApproved: false,
      },
    ];
    const metrics = summarizeRuns(runs);
    expect(metrics.totalRuns).toBe(3);
    expect(metrics.awaitingApproval).toBe(1);
    expect(metrics.completedWithoutRequiredApproval).toBe(1);
    expect(metrics.runsByAgent.capability_agent).toBe(2);
  });
});

// ===========================================================================
// Decision classification — which gate refused, not just that one did
// ===========================================================================
describe("recorder: authorization decisions", () => {
  function record(over: Partial<PipelineRecord> = {}): PipelineRecord {
    return {
      toolName: "t",
      arguments: {},
      status: "denied",
      result: null,
      errorDetail: null,
      durationMs: 1,
      awaitingConfirmation: false,
      audited: true,
      auditFailure: null,
      ...over,
    };
  }

  it("maps each pipeline gate onto a distinct decision", () => {
    const cases: readonly [string, string][] = [
      ['Unknown tool "x".', "denied_unknown_tool"],
      ['Tool "x" is not available to this agent.', "denied_out_of_scope"],
      ['Tool "x" may not be invoked by an AI service identity.', "denied_ai_identity"],
      ["Invalid arguments: talentId must be a UUID", "denied_schema"],
      ["Missing permission(s): talent.read", "denied_permission"],
      ['Tool "x" is HIGH risk and cannot run unaudited: no sink', "denied_unauditable"],
    ];
    for (const [detail, expected] of cases) {
      expect(classifyDecision(record({ errorDetail: detail })), detail).toBe(expected);
    }
  });

  it("marks a completed call allowed and a held call awaiting confirmation", () => {
    expect(classifyDecision(record({ status: "completed" }))).toBe("allowed");
    expect(
      classifyDecision(record({ awaitingConfirmation: true })),
    ).toBe("awaiting_confirmation");
  });
});

// ===========================================================================
// Schema guards — read the migration text, as tests/unit/migrations.test.ts does
// ===========================================================================
describe("migration: observability schema", () => {
  const sql = readFileSync(
    "supabase/migrations/20260922100001_observability.sql",
    "utf8",
  );
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("records every required field", () => {
    for (const column of [
      "session_id",
      "correlation_id",
      "latency_ms",
      "evidence_refs",
      "risk_level",
      "authorization_decision",
    ]) {
      expect(withoutComments, column).toContain(column);
    }
  });

  // The most security-relevant call is the one refused before a run existed.
  it("allows a tool call with no run, so orphan denials are recordable", () => {
    expect(withoutComments).toContain("alter column agent_run_id drop not null");
    expect(withoutComments).toContain("agent_tool_calls_attributable");
  });

  it("requires a reason on every denial", () => {
    expect(withoutComments).toContain("agent_tool_calls_denial_has_reason");
  });

  it("requires latency on a finished run", () => {
    expect(withoutComments).toContain("agent_runs_completed_has_latency");
  });

  // A retrieval query routinely names a person and the concern about them.
  it("stores a query hash and never the query text", () => {
    expect(withoutComments).toContain("query_hash text not null");
    expect(withoutComments).toContain("query_length integer not null");
    // No column holds the query itself, under any of the obvious names.
    for (const column of ["query_text", "query_body", "prompt text", "query text"]) {
      expect(withoutComments, column).not.toContain(`${column} `);
    }
  });

  it("enables RLS and writes policies for the new table", () => {
    expect(withoutComments).toContain(
      "alter table public.rag_retrievals enable row level security",
    );
    expect(withoutComments).toContain("create policy rag_retrievals_select");
    expect(withoutComments).toContain("create policy rag_retrievals_insert");
    expect(withoutComments).toContain(
      "revoke update, delete on public.rag_retrievals from authenticated",
    );
  });

  it("indexes what the viewer orders by and what RLS reads", () => {
    for (const index of [
      "idx_audit_logs_created_desc",
      "idx_agent_tool_calls_user",
      "idx_agent_tool_calls_correlation",
      "idx_rag_retrievals_user",
      "idx_agent_runs_correlation",
    ]) {
      expect(withoutComments, index).toContain(index);
    }
  });
});
