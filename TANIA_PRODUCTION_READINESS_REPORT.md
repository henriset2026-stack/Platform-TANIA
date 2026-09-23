# TANIA — Production Readiness Report

**Date:** 2026-09-23 · **Scope:** whole repository, audited against CLAUDE.md,
AGENTS.md, ARCHITECTURE.md, TANIA_PRD_v2.0.md and TANIA_RBAC_RLS_MATRIX.md.

---

## Verdict

**TANIA is not production ready, and no amount of fixing inside this
repository can change that yet.**

The blocker is not a defect list. It is that **the enforcement layer has never
executed.** PostgreSQL row-level security is the authorization boundary in
this design — the application layer is explicitly a gate, not a control
(CLAUDE.md §2d). No TANIA Supabase project has ever been provisioned, so all
24 migrations, every policy, every constraint and every index in this
repository are **unexecuted text**. `tests/rls/` holds 23 assertions written
to prove the database enforces what the gate decides; not one has run.

Read everything below against that. A tidy findings table invites the
conclusion that TANIA is nearly there. The honest position is that its
security model is designed, reviewed, and unverified.

### Findings

| Severity | Open | Fixed in this pass |
|---|---:|---:|
| CRITICAL | 1 | 0 |
| HIGH | 1 | 2 |
| MEDIUM | 5 | 0 |
| LOW | 3 | 0 |
| INFO | 4 | — |

**Fixed:** no security response headers (HIGH); no cost bound on the AI
endpoint (HIGH).
**Open and blocking:** C-1 (RLS never executed), H-1 (no CSP).

---

## A note on this audit's own reliability

Two findings in my first pass were **artifacts of my tooling, not defects**. I
report that because it bears on how much weight the rest deserves.

A regex scan reported 48 tables with missing RLS policies, and claimed
`learning_paths` and `learning_activities` had no SELECT policy at all — which
would have silently broken the development loop. Both were wrong. The scan did
not understand `create policy ... for all`, and it did not understand that RLS
enabled with no policy **denies** rather than exposes. Re-checking against the
actual grants and revokes showed the posture is clean: every granted verb has
a matching policy, and no table is granted a verb it lacks a policy for.

Every finding below was confirmed by reading source, not by pattern matching.

---

## CRITICAL

### C-1 · The security model has never been executed

**Area:** Security · RLS · Database · **Status: OPEN — blocks production**

No database exists. Concretely, none of the following has ever run:

- 24 migrations, including every `enable row level security`
- every policy across 52 tables
- the RESTRICTIVE policies that deny AI writes (`20260921090001`)
- the trigger forbidding a self-granted membership
- every CHECK constraint, including the approval-pairing rules
- `record_audit_event()`, so the audit trail has never recorded anything
- `tests/rls/` — 23 assertions, never run

`tests/security/` proves the policy layer decides correctly, and 736 tests
pass. That is evidence about the gate, not the enforcement. **A correct gate
in front of a table whose policy was never applied is an open table.**

**Cannot be fixed in this repository.** It requires provisioning a project,
applying the migrations, running `npm run test:rls`, and fixing what fails.
Expect failures: hand-written SQL that has never executed rarely runs clean
the first time.

**Until then nobody should state that TANIA enforces RLS.** The accurate
phrasing is that RLS is designed and unverified.

**Update 2026-09-24 — half closed.** All 24 migrations were applied to project
`hcyaqbgbwfxzutamceoq`, and every one ran clean on the first attempt, contrary
to the expectation above. The database now has 52 tables with RLS on all of
them, 253 policies, no RLS-enabled table without a policy, and a clean
`supabase db lint`. `types/database.ts` is now generated. Five type errors
surfaced against the real schema, all in how optional RPC arguments were
passed; they are fixed.

**Update 2026-09-24, later — RLS executed.** `npm run test:rls` passes 25/25.
Every policy it touches denied on the first run. The suite did not hold up as
well: 2 tests returned early on the empty database and asserted nothing, 1
"denial" was a foreign-key failure on a random UUID, the self-grant tests never
reached the self-grant policy, and the fixtures leaked into the project. All of
that is fixed. Denials now assert SQLSTATE `42501`, and the RESTRICTIVE
no-self-grant policy is isolated by a SUPER_ADMIN test with a control.

**Update 2026-09-24, extended matrix.** §9 has 15 rows, not 13. The eight
untested ones now have tests: 46/47 pass. The first run found a **HIGH**
defect. A reviewer holding only `performance.submit_review` (MANAGER, even
TALENT) could approve their own submission, and could record the approval
under another person's name. Migration `20260924100001` adds a trigger that
requires `approve_review`, in scope, under the caller's own identity; re-run
green. Still open: *Executive → aggregate* fails (no aggregate path exists
under RLS), and *Manager → approve subordinate review* contradicts §4.

**Update 2026-09-24, decisions — C-1 CLOSED for staging.** Both rows were
decided and implemented: executive totals via definer aggregate functions
with small-group suppression (`20260924100003`), and manager approval read
as `development.approve`. The same approval defect was then found and fixed
on `development_plans` and `assignments` (`20260924100002`). `npm run
test:rls` passes **57/57**, all 15 matrix rows. C-1 stays open for
*production*, which has no database yet (docs/DEPLOYMENT.md §9).

Before the decisions, C-1 was not closed until those two rows were decided. Earlier text: the
suite covered 7 of the 13 rows in the §9 matrix.

---

## HIGH

### H-1 · No Content-Security-Policy

**Area:** Security · **Status: OPEN**

`next.config.mjs` now sets the response headers that cannot affect rendering
(F-1), but no CSP. Without one an injected script has no second barrier, and
`frame-ancestors` — the modern replacement for the `X-Frame-Options` now in
place — is absent.

**Not fixed, deliberately.** A correct CSP for Next needs per-request nonces
threaded through middleware, and a wrong one fails in the browser at runtime,
not at build time. This environment has no browser, so I could not verify one.
Shipping a CSP that silently breaks rendering is worse than shipping none.

**To close:** generate a nonce in `middleware.ts`, emit
`script-src 'self' 'nonce-…'` and `frame-ancestors 'none'`, and check every
screen in a real browser before merging.

### F-1 · No security response headers — **FIXED**

**Area:** Security

`next.config.mjs` set no headers at all. A talent and performance platform was
servable inside an iframe on any origin (clickjacking); a response could be
re-interpreted as a type it did not declare; full referrer URLs containing
person ids leaked to third-party origins; and the framework version was
advertised.

**Fixed:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`
closing camera / microphone / geolocation, `Strict-Transport-Security` (two
years, subdomains, preload), and `poweredByHeader: false`. All are inert with
respect to rendering, so none can break a page. Voice (PRD §86) is unbuilt, so
`microphone` is closed and whoever builds it must open it deliberately rather
than find it already open. Verified by
`tests/security/hardening.security.test.ts`.

### F-2 · No cost or rate bound on the AI endpoint — **FIXED**

**Area:** AI · cost

`AI_LIMITS` bounded a *single* request — deadline, prompt size, tool calls —
but nothing bounded how many requests one authenticated user could make. A
runaway client retry loop, a stuck component or a deliberate abuser could
issue unlimited model calls. That is unbounded spend and a denial of service
against the provider connection pool at the same time.

**Fixed:** `lib/ai/rate-limit.ts` adds a per-user token bucket, consumed in
`handleGatewayRequest` immediately after the user resolves — the one place the
identity is known, and after authorization, so an anonymous flood cannot
consume real users' allowances. Refusals return **429** with a retry interval.
A token bucket rather than a fixed window, because a fixed window permits
double the allowance across a boundary, which is the burst it was meant to
prevent.

**Known limit, stated in the file:** the state is in memory, so the budget is
per process. Behind several instances a user gets roughly one budget per
instance. That is recorded as M-1 rather than papered over.

---

## MEDIUM

### M-1 · The request budget is per process, not per cluster
**Area:** AI · cost
The limiter above uses in-memory state. Correct behaviour needs shared state —
the database, or a cache. Fixing it properly is a deployment-shaped decision
and was out of scope for a change that could not be load-tested here.

### M-2 · 83 foreign keys have no covering index
**Area:** Database · indexes · query performance
CLAUDE.md §2e requires indexing every foreign key. 83 lack one after
accounting for unique constraints. Those on paths the application actually
filters include `capability_evidence.talent_capability_id` (the join behind the
main capability screen), `performance_evidence.profile_id` and `.period_id`,
`learning_evidence.activity_id`, and `business_impacts.project_id` /
`.profile_id`.

**Not fixed, deliberately.** Adding 83 unmeasured indexes carries its own cost
in write amplification and storage, and "do not make speculative changes"
applies most strongly where the evidence is a `LIKE` pattern rather than a
query plan. Add them with `EXPLAIN` output in hand once a database exists —
which is when C-1 is addressed anyway.

### M-3 · No retry or backoff against the LLM provider
**Area:** AI · retry
`withTimeout` bounds a call and `agents/core/idempotency.ts` makes a retry
*safe*, but nothing retries. A single transient provider error surfaces to the
user as a failure. Reasonably deferred: a retry policy should be written
against a real provider's error taxonomy, and there is no provider.

### M-4 · Agent runs are recorded but the recorder is never called
**Area:** AI · audit
`lib/observability/recorder.ts` implements `openAgentRun` / `recordToolCall` /
`closeAgentRun` against the schema and is tested. Neither the pipeline nor the
assistant calls it, so in practice no run is opened. The tables and the viewer
exist; the wiring does not. The consequence is limited today only because no
agent can run without a provider.

### M-5 · Two correlation columns on `agent_runs`
**Area:** Database · migrations
`request_id uuid` (original) and `correlation_id text` (Phase 20) both exist.
The agents generate text correlation ids, so the uuid column is unused.
Harmless now, confusing later. Consolidate before the database is
provisioned — after that it becomes a data migration.

---

## LOW

### L-1 · Route-level error and loading boundaries only on `/dashboard`
**Area:** Application
`app/error.tsx`, `app/loading.tsx` and `app/not-found.tsx` cover every route by
inheritance, and `/dashboard` adds its own. Next's inheritance makes this
correct rather than broken, but a failure in `/talent` renders the root
boundary and loses the navigation shell. Per-segment boundaries degrade better.

### L-2 · No `global-error.tsx`
**Area:** Application
An error thrown in the root layout has no boundary above it and falls back to
the framework's default screen.

### L-3 · No automated accessibility or visual-regression check
**Area:** UX · accessibility
The type system enforces what it can: `DataTable.caption` and
`ProgressMeter.label` are required props, icons are `aria-hidden`, and one
focus treatment is enforced by test. Nobody has run axe, and no rendered output
has been checked at any viewport. **Responsive behaviour is unverified** —
there is no browser in this environment.

---

## INFO — verified, no action

### I-1 · Secrets are correctly contained
Exactly two modules touch the service role: `lib/env.server.ts` reads it and
`lib/supabase/admin.ts` consumes it through `serviceRoleKey()`. Both import
`server-only`. No agent module imports the admin client; no client component
imports a server module. Enforced by `tests/security/secrets.security.test.ts`,
which matches *env reads and accessor imports* rather than mentions of the
name — an earlier version of that test would have missed `admin.ts` entirely,
because it consumes the accessor rather than reading the variable.

### I-2 · RLS posture is internally consistent
All 52 tables enable RLS. Every verb granted to `authenticated` has a matching
policy; no table is granted a verb it has no policy for; `audit_logs` has
INSERT / UPDATE / DELETE revoked, so it is append-only for everyone including
SUPER_ADMIN. This is consistency of the *text*. See C-1.

### I-3 · Authorization uses `getUser()`, never `getSession()`
`getSession()` appears only in comments explaining why it is not used. Every
authorization path revalidates the JWT with the auth server.

### I-4 · Prompt injection is defended in depth, and honestly labelled
Retrieval is scope-filtered in the database during the index scan, so an
unauthorized document cannot influence an answer at all. Tool authorization is
independent of the prompt, and the registry is closed. `lib/rag/sanitize.ts`
fences retrieved content, labels it as data, flags suspicious passages, and its
own header states that string filtering is *not* the defence. Three detection
gaps found during Phase 21 — markdown-header smuggling, third-person privilege
claims, and exfiltration one clause past a 30-character window — were closed by
adding patterns rather than by lowering the test.

---

## Area summary

| Area | State |
|---|---|
| **Secrets** | Contained and tested. I-1. |
| **RLS** | Designed, consistent, **never executed**. C-1. |
| **RBAC** | Policy layer tested against the full §9 matrix, every DENY row included. Enforcement unverified. |
| **Server/client boundaries** | Enforced by `server-only` plus the bundler; tested. |
| **Service-role exposure** | None. Two allowlisted modules. |
| **Authorization bypass** | No path found. Context derives from `auth.uid()`; no function accepts a caller-supplied role, scope or user id. |
| **Prompt injection** | Defended architecturally; filtering is supplementary and says so. I-4. |
| **Indexes / FKs** | 83 FKs unindexed against CLAUDE.md §2e. M-2. |
| **Constraints** | Approval pairing, no-self-review, approval gates, one-scope checks all present in text. Unexecuted. |
| **Migrations** | 24, additive, never retrospectively edited. Unexecuted. |
| **Error / loading / empty states** | Root boundaries cover all routes; `DataPoint<T>` makes an empty state structurally required rather than optional. L-1, L-2. |
| **API validation** | One HTTP surface. Body shape validated before the gateway; GET refused with 405 and an `Allow` header; error bodies carry no stack, SQL or provider text. Tested. |
| **Input validation** | Search terms sanitised before `ilike`. Tool arguments validated against JSON Schema with `additionalProperties: false`. |
| **Agent authorization** | Ordered gate; denials first-class; AI identities blocked in the policy layer *and* by RESTRICTIVE database policies. |
| **Tool contracts** | Every tool declares risk, permissions and schemas. Registry closed; HIGH risk requires confirmation; non-LOW cannot be exposed to an AI identity. |
| **Evidence** | Compile-time: findings carry non-empty evidence tuples, capability gaps carry a traceable basis, and no fact origin exists for model recollection. |
| **Audit** | Recorded at the sink with redaction; consequential tools fail closed when unauditable. Never executed (C-1), never wired (M-4). |
| **Cost** | Bounded per user as of this pass. F-2, M-1. |
| **Timeout** | Gateway 30s, per tool 10s, handoff 30s. A timeout is a distinct outcome from a failure. |
| **Retry** | Safe (idempotency) but absent. M-3. |
| **Accessibility** | Type-enforced where possible; never machine-checked. L-3. |
| **Responsive** | **Unverified.** No browser. |
| **Navigation** | Derived from `lib/status.ts`, so an unimplemented destination renders disabled rather than linking to a missing route. |
| **TANIA Assistant** | Built, page-context-aware, authorization-wired. Cannot answer: no LLM provider. |

---

## What must happen before anyone says "production ready"

In order. The first item is not optional, and nothing after it means much
without it.

1. **Provision a database, apply the migrations, run `npm run test:rls`.** Fix
   what fails. This closes C-1 and is the only thing that turns this
   repository's security model from designed into verified.
2. Add the CSP with nonces and verify every screen in a browser (H-1).
3. Move the request budget to shared state (M-1).
4. Add the FK indexes `EXPLAIN` justifies — not all 83 (M-2).
5. Wire the observability recorder into the pipeline (M-4).
6. Run axe, and check every screen at phone, tablet and desktop widths (L-3).
7. Connect an LLM provider, then write the retry policy against its real error
   taxonomy (M-3).

---

## Verification performed for this report

`npm run typecheck` · `npm run lint` · **736 tests pass** · `npm run build`
succeeds.

`npm run test:rls` — **23 assertions, skipped, never executed.**
`npm run test:e2e` — **18 assertions, skipped, never executed.**

Both suites skip rather than pass when unconfigured, deliberately: a green tick
against a database that was never contacted is a fabricated result.
