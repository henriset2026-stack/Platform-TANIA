# AI Gate #2 — Reconnaissance

**Date:** 2026-09-24 · **State reviewed:** repository after Security Gate #1
(`5c61fe2` + staged Gate #1 changes), before any AI Gate #2 change.
Method: source reading and targeted search; no behaviour assumed from comments.

## 1. Current AI architecture (as built, not as planned)

```text
Browser ─POST /api/ai/chat─▶ route.ts ─▶ handleGatewayRequest (lib/ai/gateway.ts)
                                            │ 1. validate message (non-empty, ≤ 16,000 chars)
                                            │ 2. getAuthContext()  ← getUser() + auth.uid()-scoped RPCs
                                            │ 3. per-user token bucket (12 burst, 1 per 10 s, per instance)
                                            │ 4. agent.requiredPermissions (ai.use)
                                            │ 5. resolveProvider(config)  → UnconfiguredProvider today
                                            │ 6. prompt: system prompt · scope description · page hint · user message
                                            │ 7. provider.complete(tool SPECS only)   ← ONE call, no loop
                                            │ 8. executeToolCall × ≤ 8  (agents/core/pipeline.ts)
                                            └ 9. response built from what executed
```

The gateway is **single-step**: the model is called once; proposed tool calls
are executed by the pipeline; tool results are **not** returned to the model.
There is no agent loop, so recursion is bounded by construction.

## 2. Entry points

| Entry point | Reaches a model? |
|---|---|
| `POST /api/ai/chat` | Yes, through the gateway. Always `DEFAULT_AGENT` (no tools). The request cannot choose an agent or a model. |
| Domain agents (`agents/{capability,performance,development,product,solution,business-case}`) | No. Deterministic analysis functions and tool definitions; not wired to the gateway. |
| `lib/jarvis/handoff.ts` `initiateHandoff` | No model. Sends a scoped context to a JARVIS transport — `UnconfiguredJarvisTransport` today. |

**No direct model-provider call exists anywhere.** No provider SDK is in
`package.json`; a search for `fetch(`, `openai`, `anthropic`, `gemini`,
`groq`, `openrouter` and provider URLs across `lib/`, `agents/` and `app/`
finds nothing outside a redaction pattern.

## 3. Model providers

`lib/ai/provider.ts` defines `LlmProvider { name, configured, complete() }`.
The only registered provider is `UnconfiguredProvider`, which returns
`NOT_CONFIGURED`. Selection is by server configuration (`AI_GATEWAY_URL`,
`AI_GATEWAY_KEY`, `LLM_MODEL`), never by request. The key is server-only;
`lib/ai/config.ts` reports only *whether* it exists. There is no `stream()`,
`structuredOutput()` or `embed()` on the interface yet
(`lib/rag/embedding.ts` defines an embedding interface separately, also
unconfigured).

## 4. Prompts

One system prompt (`DEFAULT_AGENT.systemPrompt`) plus a server-built scope
description (`describeScope`: roles and organization/squad *counts*, never the
permission list) and, optionally, a page hint whose text comes from a
server-side allowlist (`LABELS[kind]`). The user's message is the only
`user`-role content. Domain agents carry their own prompts but none is
reachable.

## 5. Agents and tools

14 tools across 6 agents, **all LOW risk, read/analysis/draft only, none
writes** (docs/ai/AI_TOOL_REGISTRY.md). The gateway's process-wide registry is
empty. Registration enforces: naming, reserved names, description,
`additionalProperties: false`, permissions above LOW, confirmation for HIGH,
AI-service only at LOW.

## 6. RAG

`knowledge_documents` → `knowledge_chunks` (`vector(1536)`), organization and
sensitivity denormalized onto chunks by trigger, `deleted_at` propagated.
Retrieval: `match_knowledge_chunks` (SECURITY INVOKER) — RLS filters inside the
vector scan. `fenceRetrievedContent` wraps chunks as labelled
`<untrusted_document>` data; `detectInjectionSignals` flags known shapes.
Ingestion is restricted to SUPER_ADMIN / `admin.integrations`; AI identities
cannot write the corpus. The PRD's `access_scope jsonb` column exists but no
policy reads it — access is organization + sensitivity.

## 7. Data sources

All AI-facing data access is through `lib/*/queries.ts` with the caller's
RLS-scoped server client. The service-role client is imported by nothing.

## 8. Authorization boundary

`AgentAuthContext` = `{ userId, email, organizationIds, squadIds, roles,
permissions, correlationId, sessionId, isAiService }`, built by
`toAgentAuthContext` from the server `AuthContext`. Nothing in it comes from
the request or the model.

## 9. JARVIS boundary

`JarvisHandoff` carries a `HandoffScope` = user permissions ∩ requested ∩ a
fixed read/analyse allowlist (`HANDOFF_TRANSMITTABLE_PERMISSIONS`), talent ids
intersected with the caller's, a 15-minute expiry and a correlation id. No
database credential of any kind crosses (typed as the literal `false`). Results
are validated: correlation must match, arrival must precede expiry, returned
evidence must be `pending` with `origin: "jarvis"`. **No action requests or
approvals cross the boundary** — TANIA hands over context, not commands. There
is **no integrity signature** on a handoff, and no transport is registered.

## 10. Observability

Gateway and pipeline events go to structured JSON logs with a correlation id
(`logger`). The pipeline supports an audit sink, but **the gateway passed
none**, so AI tool calls were not written to `audit_logs`. The agent-run
recorder (`lib/observability/recorder.ts`) exists and is tested but is not
called from the gateway.

## 11. Security-sensitive components

`lib/ai/gateway.ts`, `agents/core/pipeline.ts`, `agents/core/tool-registry.ts`,
`agents/core/schema.ts`, `agents/core/idempotency.ts`, `lib/ai/provider.ts`,
`lib/ai/config.ts`, `lib/ai/rate-limit.ts`, `lib/rag/{retrieval,sanitize}.ts`,
`lib/jarvis/{contract,handoff,scope,transport}.ts`,
`supabase/migrations/20260921140001_knowledge_chunks.sql`.

## 12. Identified risks (before fixes)

| # | Risk | Severity |
|---|---|---|
| R1 | Human confirmation matched the **tool name** only, taken from the same request as the prompt — not bound to arguments or user | HIGH (latent: no confirmation-requiring tool exists) |
| R2 | A confirmed consequential call replayed in a **new** request would execute again (idempotency keyed by correlation id; gateway passed no store) | MEDIUM (latent) |
| R3 | A model-proposed `organizationId` for another chapter reached the handler; RLS returned an empty result a model could narrate as "nothing found" | MEDIUM |
| R4 | Model output returned verbatim: no check for system-prompt echo or credentials | MEDIUM |
| R5 | AI tool calls not written to `audit_logs` | MEDIUM |
| R6 | Agent runs not persisted (recorder unwired) | MEDIUM |
| R7 | JARVIS handoff has no integrity signature | MEDIUM (latent: no transport) |
| R8 | Tool `outputSchema` declared but not enforced | LOW |
| R9 | CONFIDENTIAL knowledge with no organization is readable enterprise-wide by `capability.read` holders; `access_scope` unused | LOW |
| R10 | Log redaction lacked the Supabase `sb_secret_` key shape | LOW |
