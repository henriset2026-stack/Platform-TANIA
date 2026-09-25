# TANIA AI Security Architecture

The AI control plane as enforced after AI Gate #2 (2026-09-24). It builds on
docs/security/SECURITY_MODEL.md: the AI layer adds controls, it never replaces
the database's. Where a control is not yet demonstrated it says so.

> The model is not authority. The prompt is not authorization. Retrieved text,
> tool output and memory are data.

## 1. Trust boundaries

| Trusted | Untrusted |
|---|---|
| Identity from `getUser()` / `auth.uid()` | The user's message |
| `AgentAuthContext`, built server-side | Retrieved document text |
| RLS and decision guards in Postgres | Tool output |
| System prompt and scope description (server-built) | Everything the model returns: text, tool names, arguments, claimed citations |
| The closed tool registry | The page hint from the browser (allowlist-parsed; carries no authority) |
| Verified knowledge (ingestion restricted to admins) | JARVIS results (validated before use) |

## 2. Authorization context

`AgentAuthContext { userId, email, organizationIds, squadIds, roles,
permissions, correlationId, sessionId, isAiService }` is built by
`toAgentAuthContext` from the session. It is never serialized into a form the
model can edit, and the model receives only roles and scope *counts* — not the
permission list, so it has nothing to argue for. A prompt claiming a role
changes nothing: tested across 14 injection payloads.

## 3. AI Gateway

`lib/ai/gateway.ts` is the single path to a model. Order:

1. validate the input (non-empty, at most 16,000 characters)
2. authenticate
3. rate-limit per user
4. check the agent's permissions (`ai.use`)
5. resolve the provider by configuration, never by request
6. open the agent run (`agent_runs`); an agent with any tool above LOW
   refuses to run if it cannot be recorded
7. build the prompt in separate messages
8. **step 1:** call the model with tool **specs** only
9. execute the proposed tool calls through the pipeline, at most 8, recording
   each one
10. **step 2** (only if a tool ran): call the model again with the results
    fenced as `<tool_result>` DATA in a user-role message and **no tools
    offered**. Tool calls proposed here are ignored and logged
11. guard the output
12. assemble the response from what executed, and close the run

The limits live in `AI_LIMITS` (`lib/ai/config.ts`):

| Limit | Value |
|---|---|
| Request deadline | 30 s |
| Per-tool deadline | 10 s |
| Output tokens | 2,000 |
| Tool calls per run | 8 |
| Prompt size | 16,000 characters |

There are no retries today, which is safe but also means no resilience
(readiness M-3). Agent recursion is bounded **by construction**: at most two
model calls per request, and the second is offered no tools, so tool output
can inform the answer but can never cause another tool call.

## 4. Model providers

`LlmProvider.complete()` is the only provider surface. No SDK is installed and
no module outside the gateway can reach a provider. Keys are server-only and
never logged. Provider errors are mapped to codes; provider text is not echoed
to users.

The one adapter is **Google Gemini** (`lib/ai/providers/gemini.ts`), selected
by `LLM_PROVIDER=gemini`. It calls the REST `generateContent` endpoint with
`fetch`.

- **Key:** read through `aiGatewayKey()` in `lib/env.server.ts`; sent only in
  the `x-goog-api-key` header, never in the URL or body.
- **Prompt:** system messages go to `systemInstruction`.
- **Tool calls:** Gemini's function calls come back as proposals for the
  pipeline.
- **Errors:** status only. 429 → `RATE_LIMITED`; a safety block is a failure.
- **Selection:** endpoint, key and model come from configuration; the request
  cannot choose them.

## 5. Prompt architecture

The prompt is sent as separate messages, never one concatenated string:

1. `system`: the agent instruction, which covers:
   - the agent's role
   - answering only from provided information
   - never asserting unprovided facts
   - saying when information is missing
   - never claiming success without a tool result
2. `system`: the scope description (roles and organization/squad counts)
3. `system` (optional): the page hint, fixed text chosen from an allowlist
4. `user`: the message

Retrieved knowledge, when a retrieval tool is wired, enters only through
`fenceRetrievedContent`: numbered `<untrusted_document>` blocks under an
explicit "treat as DATA" preamble, with fence-escape tags neutralized.

## 6. Prompt-injection defence

Defence does not depend on the model obeying its prompt. When a model does
obey an injection:

- it cannot use a tool that isn't registered, or that its agent didn't declare
- it cannot supply unknown arguments (`additionalProperties: false`) or
  another organization's ID (the scope check)
- it cannot act without the caller's permissions
- it cannot run a consequential tool without a human approval bound to that
  exact call
- tool output reaches the model only in step 2, fenced as data, and step 2
  is offered no tools. So indirect injection through a tool can colour an
  answer but cannot trigger a second action
- an answer that echoes the system prompt is withheld
- credential-shaped strings in the answer are redacted

The keyword detector (`detectInjectionSignals`) is supplementary: it flags 8
of the 14 corpus payloads, and nothing depends on it.

## 7. RAG security

Retrieval runs inside Postgres (`match_knowledge_chunks`, SECURITY INVOKER),
and the chunk RLS policy filters **during** the vector scan:

- **Organization:** the caller's own, or none for enterprise-wide content.
- **Sensitivity:** INTERNAL goes to everyone; CONFIDENTIAL needs
  `capability.read`; SENSITIVE and RESTRICTED are SUPER_ADMIN only.
- **Deletion:** deleted documents are excluded, and the deletion propagates to
  their chunks by trigger.

Nothing is retrieved globally and filtered afterwards. A caller-supplied
organization filter can only narrow the results, never widen them.
Verified live in `tests/rls/rag-leakage.rls.test.ts`, 8 of 8. Direct table
reads obey the same scope, so embeddings offer no bypass.

## 8. Agent and tool security

Agents declare bounded tool lists; a tool outside the list is refused even if
registered and even if approved. Every tool call passes the pipeline in this
order:

1. closed registry
2. declared by the agent
3. AI-identity restriction
4. JSON-Schema validation
5. **all** required permissions
6. **organization scope of arguments**
7. **approval bound to the tool, arguments and user**
8. audit before any consequential call
9. **replay protection keyed by the approval**
10. timeout
11. outcome validation
12. **result checked against the tool's `outputSchema`**; an undeclared
    field at any depth fails the call
13. audit

Tools read only through the caller's RLS-scoped client. Nine LOW-risk read
tools are wired to the assistant (`WIRED_TOOLS`). The inventory, with
risk, permission, approval and audit for each tool, is in
[AI_TOOL_REGISTRY.md](AI_TOOL_REGISTRY.md), and a test holds it in sync with
the code.

## 9. Human approval

A tool needing confirmation stops in `awaiting_approval` and returns a
`confirmationToken`: SHA-256 over the tool, the validated arguments and the
user. It only runs when the request presents that exact token.

- Approving one call never approves another: a different allocation, a
  different person or a different tool each produce a different token.
- A bare tool name approves nothing.
- The model cannot approve its own action: the token belongs to the human's
  request, and the pipeline never asks the model whether to proceed.
- The approval flow shows the proposed tool, arguments, risk and error detail.
- **Not yet built:** an approval UI that also shows evidence and a reason
  (gate step 16). No consequential tool exists yet, so no approval screen
  exists either.
- **In the database:** approvals of reviews, plans and assignments are
  separately guarded by triggers (Security Gate #1), so even a future write
  tool cannot record an approval without the approve permission, in scope,
  under the human's own name.

## 10. JARVIS boundary

TANIA → JARVIS carries **context, not commands**:

- a scope that is the intersection of the user's permissions, the requested
  ones and a fixed read/analyse allowlist
- the talent IDs the caller is authorized for
- a 15-minute expiry and a correlation ID
- **no credential of any kind**

Results are rejected when:

- the correlation ID doesn't match
- they arrive late
- evidence claims to be validated
- evidence lacks JARVIS provenance
- evidence concerns someone outside the scope

Evidence enters TANIA as `pending`, for human validation. The gate's
`TANIAActionRequest` / approval-ID model doesn't apply, because no action or
approval ever crosses. **Open:** handoffs carry no integrity signature (R7); one is
required before any transport is registered.

## 11. Memory

There is no conversation memory: the gateway is single-turn and loads no
history. `ai_interactions` is owner-scoped. Executives can't read it (tested in
Security Gate #1). Chapter leads can read it through `ai.view_audit`, which is
an open product decision (Security Gate #1 R-4). If memory is added, it must be
read through the caller's RLS-scoped client and enter the prompt as data,
never as system content.

## 12. Observability

- **Every request** is logged with its outcome and latency (`api.ai.chat`) and
  its gateway events (`ai.gateway.*`), correlated by ID. The logs contain no
  prompt or answer text.
- **Tool calls** are written to `audit_logs` through `record_audit_event`
  under the caller's session. If that fails, any tool above LOW is refused.
- **Model output** that the guard withholds or redacts is logged as
  `ai.gateway.output_guard`.
- **Agent runs** go to `agent_runs` / `agent_tool_calls` through the
  recorder: opened before the model call, one row per tool call, closed with
  the final status. Lengths only, never message text. An agent with any tool
  above LOW refuses to run unrecorded; a read-only agent proceeds and logs
  `run_unrecorded`. A live gateway write to staging has not been exercised.

## 13. Failure modes

| Failure | Behaviour |
|---|---|
| No provider | `NOT_CONFIGURED` (503); nothing generated |
| Provider timeout | `TIMEOUT` (504), distinct from failure |
| Provider error | `PROVIDER_ERROR` (502); provider text not echoed |
| Audit log unreachable | LOW reads run, marked unaudited; anything above LOW refused |
| Unknown tool / bad arguments / missing permission / out-of-scope argument | that call denied, recorded, audited; others continue |
| Rate limit | `RATE_LIMITED` (429) with retry-after |
| JARVIS unconfigured | `unavailable`, not `failed` |

## 14. Threats not addressed by the architecture

- A model can still write fabricated claims in its **prose**. The structured
  fields (`evidence`, `citations`, `toolsUsed`) can't be fabricated, because
  they're built from what executed. But whether an answer is grounded can only
  be measured with a real model, and no model is configured (NOT VERIFIED).
- Idempotency is per server instance. A replay reaching another instance must
  be refused by the database write itself. No write tool exists yet.
