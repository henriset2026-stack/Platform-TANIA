# SECURITY GATE #1

**Date:** 2026-09-24 · **Target:** repository `main` (from `5c61fe2`) and staging
Supabase project `hcyaqbgbwfxzutamceoq` · **Scope:** Next.js foundation,
Supabase foundation, authentication, RBAC, authorization, RLS.

## 1. Executive Summary

**Status: PASS WITH CONDITIONS**

Every check inside the gate's scope passes with evidence from the live
database. That scope is authentication, authorization, RBAC, RLS, scope
isolation, privilege escalation, IDOR, service role, secrets, mass assignment,
audit, and the AI boundary. The results:

- **98/98** RLS attack and matrix tests against the real database.
- **765/765** hermetic tests.
- **18/18** e2e tests against a production build.
- Lint, typecheck and build clean; `npm audit` reports 0 vulnerabilities.

That result was not the starting point. **The first attack run succeeded 15
times out of 38.** There were two CRITICAL findings:

- HR could make any user a SUPER_ADMIN. During the run, the talent HR had
  promoted then approved a squad-mate's development plan.
- A manager could move themselves into another chapter's squad and read its
  people's performance evidence.

There were also HIGH findings: self-validation of evidence and capability,
and no audit trail for any of it. Two migrations fixed all of it, and every
attack now fails.

**Why not PASS.** One HIGH item stays open: no Content-Security-Policy (H-1,
from the production-readiness report). It is XSS defence in depth rather than
an authorization defect, but the gate's own criterion is "no HIGH remains".
The gate was also verified against **staging**, because no production project
exists yet. The conditions are in §21.

## 2. Repository Reviewed

- `app/` — 23 pages, 3 route handlers (`api/ai/chat`, `auth/callback`, `auth/signout`), 1 server action (`(auth)/login/actions.ts`)
- `middleware.ts`, `instrumentation.ts`, `next.config.mjs`
- `lib/auth/` (session, policy, authorize, routes, site-url), `lib/supabase/` (client, server, admin, middleware), `lib/env.server.ts`
- `lib/ai/`, `agents/core/` (gateway, tool pipeline, registry), `lib/observability/`
- `lib/dashboard/`, `lib/navigation.ts`, `components/layout/`, `components/assistant/`
- `supabase/migrations/` — all 29 files, cross-checked against the **live catalog** (`pg_policies`, `pg_proc`, `role_table_grants`, `pg_trigger`)
- `.env.example`, `.gitignore`, git history (secret scan), `.next/static` (bundle scan)
- `tests/` — unit, integration, security, ai, rls, e2e

Architecture detail: [SECURITY_RECON_REPORT.md](SECURITY_RECON_REPORT.md).

## 3. Authentication Findings

- **Server-side, verified.** Identity is `auth.uid()` in the database and
  `supabase.auth.getUser()` in the app, which revalidates with the auth
  server. `getSession()` is never called.
- **Deny by default.** Any path not on the public list gets a 307 to `/login`
  (pages) or a JSON 401 (`/api/*`). Verified against `next start`.
- **A forged session is rejected.** A forged `sb-…-auth-token` cookie gets a
  307 to `/login`. A self-signed JWT claiming `service_role` gets a 401 from
  PostgREST (automated as AUTH-003).
- **No request-supplied identity.** No entry point reads a user id, role,
  permission or scope from the request. A static test enforces it.
- The callback validates `next` as a same-origin path.
- **Not verified:** the Entra ID round trip, because the provider is not
  configured.
- **LOW:** `POST /auth/signout` has no CSRF token. SameSite=Lax cookies limit
  it, and the impact is a forced logout (R-5).

## 4. RBAC Findings

- **Catalog.** The permission catalog matches the specified set (talent,
  performance, capability, development, assignment, project, business_impact,
  ai, report, admin).
- **No wildcards and no role inheritance.** SUPER_ADMIN is granted every
  permission explicitly.
- **AI_SERVICE** holds read plus `ai.analyze` and `ai.recommend` only.
- **Enforced server-side.** The policy layer (`lib/auth/policy.ts`) is a gate,
  tested across the whole matrix (20 tests). RLS is the enforcement.
- **Escalation paths found and fixed:**
  - SG-01: `admin.users` had no organization scope and no role ceiling.
  - SG-10: permission to edit a row also let the editor record its approval.
- **Unimplemented permissions.** `*.export`, `admin.integrations`,
  `project.delete` and some others exist in the catalog but nothing
  implements them. That is safe, because nothing uses them.

## 5. RLS Findings

RLS is **on for 52/52** tables. `anon` holds **no** table grant. `authenticated`
holds **no** `TRUNCATE`, `REFERENCES` or `TRIGGER` (SG-07). Every definer
function pins `search_path`. The table below is generated from the live catalog
after the fixes:

- "policy +R" means a RESTRICTIVE policy also applies.
- "revoked" means the verb is not granted to `authenticated` at all, so it is
  denied before RLS is consulted.
- "Guards" means the table has decision-guard or audit triggers.

| Table | RLS | SELECT | INSERT | UPDATE | DELETE | Scope (SELECT) | Class | Guards | Residual risk |
|---|---|---|---|---|---|---|---|---|---|
| `agent_runs` | on | policy | policy | policy +R | revoked | admin.audit / own | Restricted | yes | Low |
| `agent_tool_calls` | on | policy | policy | revoked | revoked | admin.audit / own | Restricted | — | Low |
| `ai_assessments` | on | policy | policy | policy +R | revoked | profile scope | Sensitive | yes | Low |
| `ai_augmentation` | on | policy | policy | policy +R | revoked | profile scope | Sensitive | — | Low |
| `ai_interactions` | on | policy | policy | revoked | revoked | profile scope | Restricted | — | MEDIUM: CHAPTER_LEAD reads chapter conversations via ai.view_audit (R-4) |
| `ai_usage` | on | policy | policy +R | policy +R | revoked | profile scope | Sensitive | — | LOW: quality fields self-reported (R-7) |
| `assignments` | on | policy | policy +R | policy +R | policy +R | profile scope, project scope | Confidential | yes | Low |
| `audit_logs` | on | policy | revoked | revoked | revoked | admin.audit / own | Restricted | — | LOW: written only by definer triggers and record_audit_event (R-8) |
| `budget_reallocations` | on | policy | policy +R | policy +R | revoked | project scope | Confidential | yes | Low |
| `budget_thresholds` | on | policy | policy +R | policy +R | policy | org/squad | Internal | — | Low |
| `business_impacts` | on | policy | policy +R | policy +R | revoked | profile scope, project scope | Confidential | yes | Low |
| `capabilities` | on | policy | policy +R | policy +R | policy +R | all authenticated | Internal | — | Low |
| `capability_domains` | on | policy | policy +R | policy +R | policy +R | all authenticated | Internal | — | Low |
| `capability_evidence` | on | policy | policy +R | policy +R | revoked | profile scope | Sensitive | yes | Low |
| `capability_levels` | on | policy | policy +R | policy +R | policy +R | all authenticated | Internal | — | Low |
| `capability_requirements` | on | policy | policy +R | policy +R | policy +R | org/squad | Internal | — | Low |
| `capability_upgrade_proposals` | on | policy | policy | policy +R | revoked | profile scope | Sensitive | — | Low |
| `deliverables` | on | policy | policy +R | policy +R | policy +R | project scope | Confidential | — | Low |
| `development_plans` | on | policy | policy +R | policy +R | policy +R | profile scope | Sensitive | yes | Low |
| `development_template_activities` | on | policy | policy +R | policy +R | policy | SUPER_ADMIN | Internal | — | Low |
| `development_templates` | on | policy | policy +R | policy +R | policy | org/squad | Internal | — | Low |
| `feasibility_assessments` | on | policy | policy +R | policy +R | revoked | org/squad | Confidential | yes | Low |
| `feasibility_criteria` | on | policy | policy +R | policy +R | policy | SUPER_ADMIN | Internal | — | Low |
| `feasibility_reviews` | on | policy | policy +R | policy +R | revoked | org/squad | Confidential | — | Low |
| `feasibility_scores` | on | policy | policy +R | policy +R | revoked | org/squad | Confidential | — | Low |
| `feasibility_weight_profile_criteria` | on | policy | policy +R | policy +R | policy | SUPER_ADMIN | Internal | — | Low |
| `feasibility_weight_profiles` | on | policy | policy +R | policy +R | policy | org/squad | Internal | — | Low |
| `knowledge_chunks` | on | policy | policy +R | policy +R | policy +R | org/squad | Internal | — | Low |
| `knowledge_documents` | on | policy | policy +R | policy +R | policy +R | org/squad | Internal | — | Low |
| `learning_activities` | on | policy | policy +R | policy +R | policy +R | profile scope | Sensitive | — | Low |
| `learning_evidence` | on | policy | policy +R | policy +R | revoked | profile scope | Sensitive | yes | Low |
| `learning_paths` | on | policy | policy +R | policy +R | policy +R | profile scope | Sensitive | — | Low |
| `organization_memberships` | on | policy | policy +R | policy +R | policy +R | org/squad | Authorization root | yes | Low |
| `organizations` | on | policy | policy +R | policy +R | policy +R | org/squad, +EXECUTIVE | Confidential | — | Low |
| `performance_dimensions` | on | policy | policy +R | policy +R | policy | all authenticated | Internal | — | Low |
| `performance_evidence` | on | policy | policy +R | policy +R | revoked | profile scope | Sensitive | yes | Low |
| `performance_metrics` | on | policy | policy +R | policy +R | policy +R | profile scope | Sensitive | — | Low |
| `performance_periods` | on | policy | policy +R | policy +R | policy +R | SUPER_ADMIN | Internal | — | Low |
| `performance_reviews` | on | policy | policy +R | policy +R | revoked | profile scope | Sensitive | yes | Low |
| `performance_weight_profile_dimensions` | on | policy | policy +R | policy +R | policy | SUPER_ADMIN | Internal | — | Low |
| `performance_weight_profiles` | on | policy | policy +R | policy +R | policy | org/squad | Internal | — | Low |
| `permissions` | on | policy | policy +R | policy +R | policy +R | all authenticated | Authorization root | yes | Low |
| `profiles` | on | policy | policy +R | policy +R | policy +R | profile scope, +EXECUTIVE | Confidential | yes | LOW: EXECUTIVE reads all profiles (Confidential, not Sensitive) |
| `project_budgets` | on | policy | policy +R | policy +R | revoked | project scope | Confidential | — | Low |
| `projects` | on | policy | policy +R | policy +R | policy +R | project scope | Confidential | — | MEDIUM: any chapter member sees every chapter project (R-3) |
| `rag_retrievals` | on | policy | policy | revoked | revoked | admin.audit / own | Restricted | — | Low |
| `recommendations` | on | policy | policy | policy +R | revoked | profile scope | Sensitive | — | Low |
| `role_permissions` | on | policy | policy +R | policy +R | policy +R | all authenticated | Authorization root | yes | Low |
| `roles` | on | policy | policy +R | policy +R | policy +R | all authenticated | Authorization root | yes | Low |
| `squads` | on | policy | policy +R | policy +R | policy +R | org/squad, +EXECUTIVE | Confidential | — | Low |
| `talent_capabilities` | on | policy | policy +R | policy +R | policy +R | profile scope | Sensitive | yes | Low |
| `talent_profiles` | on | policy | policy +R | policy +R | policy +R | profile scope | Confidential | — | Low |

DELETE is revoked wherever a record is evidence or a decision. Evidence is
withdrawn, never erased; reviews, approvals and audit rows are never deleted.

## 6. IDOR Findings

No HTTP route addresses an object by id. The Data API does, so IDOR was tested
there: talent A addressing chapter B's development plan by id could neither
read it nor change it (IDOR-001). The chat endpoint's page-context `entityId`
is allowlist-parsed and re-authorized by the gateway. Possessing an id grants
nothing, because every read goes through RLS.

## 7. Privilege Escalation Findings

| Attempt | Before | After |
|---|---|---|
| HR grants SUPER_ADMIN / EXECUTIVE / a role in another chapter | **succeeded** | denied |
| Manager moves own profile into chapter B's squad | **succeeded — read B's evidence** | denied |
| Talent changes own chapter | **succeeded** | denied |
| Talent self-grants SUPER_ADMIN | denied | denied |
| MANAGER / PM / CHAPTER_LEAD / AI writes memberships, roles, role_permissions | denied | denied |
| TALENT approves a plan, review or assignment, or validates impact | approval bypass (SG-10) | denied |
| AI identity holding CHAPTER_LEAD approves a review | denied | denied |

## 8. API Security Findings

| Method | Path | Auth | Permission | Scope | Input validation | Audit | Risk |
|---|---|---|---|---|---|---|---|
| POST | `/api/ai/chat` | required (middleware 401 + gateway) | `ai.use`; each tool re-authorized | user's server-derived context | body shape, page context allowlist, tool JSON Schema | structured log per request | Low |
| GET | `/api/ai/chat` | required | — | — | refused 405 (`Allow: POST`) | — | Low |
| GET | `/auth/callback` | public by design | — | — | `next` same-origin only | `auth.callback_*` logs | Low |
| POST | `/auth/signout` | — | — | own session | none needed | Supabase Auth log | Low (R-5) |
| — | PostgREST `/rest/v1/*` | JWT | RLS per table | RLS | Postgres types + CHECKs + guards | audit triggers | see §5 |

There are no PATCH, DELETE, bulk or export routes. The static test fails if an
export surface appears unreviewed.

## 9. Server Action Findings

There is one action, `signInWithEntra`. It runs before authentication by
nature, and it:

- validates `next` with `safeNextPath`
- derives the redirect origin server-side (`SITE_URL` → `VERCEL_URL` → request
  host), and Supabase refuses any redirect not on its allow-list
- never reads identity from the form
- logs failures without provider detail

No action assumes authorization from UI visibility, because no other action
exists.

## 10. Service Role Findings

- **Where it could be used:** `lib/supabase/admin.ts` is the only module able
  to build a service-role client. It imports `server-only`, and ESLint
  allowlists it.
- **Who can invoke it:** **no module imports it** (verified, and enforced for
  entry points by a static test). The deployed app never uses the service role.
- **Why it exists:** `tests/rls` fixtures and maintenance, from a trusted
  machine.
- **What it can access:** everything. It bypasses RLS, which is exactly why it
  is not in the app.
- **Extra control:** `docs/DEPLOYMENT.md` marks it *do not set in Vercel*.
- **Visibility:** a service-role write now appears in `audit_logs` with
  `via = service_role` and no actor, not silently.

## 11. Secret Exposure Findings

- **Bundle scan.** A clean-build scan of `.next/static` found **0**
  occurrences of `sb_secret_`, `service_role`, `SUPABASE_SERVICE_ROLE_KEY`,
  `AI_GATEWAY_KEY` or `ENTRA_CLIENT_SECRET`.
- **SG-08 (LOW, fixed).** Before the fix, the client sidebar imported
  `lib/status.ts`, which shipped internal engineering notes to every browser.
  Those notes included the *name* `SUPABASE_SERVICE_ROLE_KEY` and descriptions
  of security defects. No key value was exposed. Availability is now computed
  on the server; the client receives only ids; a static test guards it.
- **Repository.** `.env.local` is gitignored. `.env.example` holds no values
  (tested). The git history scan found only documented dummy values in the
  redaction tests.
- **Public keys.** Only `NEXT_PUBLIC_SUPABASE_URL` and the publishable key are
  public, and both are browser-safe.

## 12. Input Validation Findings

- **No Zod**; validation is explicit where input enters.
  - The chat route checks body shape.
  - The page context is parsed through an allowlist, and a non-UUID
    `entityId` is dropped.
  - Tool arguments are checked against JSON Schema with
    `additionalProperties: false`.
  - Search terms are sanitised before `ilike`.
- **The real mass-assignment surface was the Data API.** PostgREST accepts any
  column the grant allows, and that is where SG-02, SG-03, SG-04, SG-05 and
  SG-09 lived. Allowlisting in TypeScript cannot fix that, because clients can
  bypass the app. The fix is in the database: triggers protect the scope,
  provenance and decision columns (SECURITY_MODEL.md §5).
- There is no route or action that persists a request body.

## 13. Audit Findings

- **SG-06 (HIGH, fixed).** Before the fix, only feasibility and budget
  decisions were audited. `audit_security_change()` now records, on 14 tables:
  - ROLE_CHANGE: `organization_memberships`
  - PERMISSION_CHANGE: `role_permissions`, `roles`, `permissions`
  - scope changes: `profiles.chapter_id`, `squad_id`, `manager_id`, `status`
  - PERFORMANCE_APPROVAL, DEVELOPMENT_APPROVAL, ASSIGNMENT_APPROVAL
  - BUSINESS_IMPACT_VALIDATION and evidence validation
  - CAPABILITY_ASSESSMENT and learning evaluation
  - agent-run approval
  - SERVICE_ROLE_ACTION, as `via`
- **What a row contains:** the actor, action, resource and only the tracked
  columns. Tokens, secrets and full rows are never logged, and nobody can
  update or delete an audit row.
- **Verified by test:** a grant by HR and a validation by a chapter lead each
  produced an attributed row.
- **Not in `audit_logs`:**
  - LOGIN / LOGOUT / FAILED_AUTH: in Supabase Auth's log and the structured
    app logs.
  - SECURITY_DENIED: RLS denials are silent (R-2).
  - PROFILE_ACCESS / PERFORMANCE_ACCESS reads: not logged. Read auditing has a
    volume cost and was not specified.
  - AI_ACTION: the recorder exists, but the pipeline does not call it yet
    (readiness M-4).

## 14. Privacy/Data Access Findings

| Role | Profiles | Performance | Development | AI usage | Business impact |
|---|---|---|---|---|---|
| TALENT | self | self | self | self | own/assigned |
| MANAGER | managed squad | managed squad | managed squad | managed squad | scope |
| CHAPTER_LEAD | own chapter | own chapter | own chapter | own chapter | scope |
| HR | own chapter | own chapter | own chapter | own chapter | read |
| EXECUTIVE | all (Confidential) | **none** — aggregates only | **none** | **none** | read |
| PROJECT_MANAGER | via chapter / assignment | none individually | none | none | project |
| AI_SERVICE | **none** | none | none | none | none |

Verified by the RLS suites. Aggregates suppress any figure over fewer than
five people. Nothing here is a legal-compliance assessment.

## 15. AI_SERVICE Security Boundary

AI_SERVICE:

- cannot write any domain table (RESTRICTIVE, tested)
- cannot approve, even while also holding CHAPTER_LEAD (tested)
- cannot create roles or grant permissions (tested)
- cannot read another chapter's profile or any individual evidence (tested)
- gets no aggregates (tested)

Agents run through the gateway with the calling user's server-derived
context. Every tool declares its permissions and risk; HIGH-risk tools need
confirmation; and tool queries run under RLS. No SQL tool and no service-role
path exists. **Gap:** AI_SERVICE currently reads *nothing* individual, so a
delegated read scope must be designed before agents need data (R-4).

## 16. Security Test Results

| Test | Result | Evidence |
|---|---|---|
| AUTH-001 unauthenticated access denied | PASS | e2e 18/18; PostgREST anon 401 |
| AUTH-002 authenticated access allowed | PASS | matrix; gate controls |
| AUTH-003 forged token rejected | PASS | security-gate.rls |
| RBAC-001 unauthorized role denied | PASS | security-gate.rls PRIV-002; rbac-matrix 20/20 |
| RBAC-002 authorized role allowed | PASS | gate controls |
| RLS-001 cross-chapter read denied | PASS | 6 tables × manager and lead |
| RLS-002 cross-chapter update denied | PASS | state unchanged |
| RLS-003 cross-squad access denied | PASS | matrix; security-gate.rls |
| RLS-004 unauthorized delete denied | PASS | state unchanged |
| IDOR-001 object id manipulation denied | PASS | security-gate.rls |
| PRIV-001 role escalation denied | PASS | **failed before SG-01 fix** |
| PRIV-002 permission escalation denied | PASS | 4 actors |
| SEC-001 service role not exposed | PASS | bundle scan 0; static guards |
| SEC-002 secrets not exposed client-side | PASS | bundle scan 0; SG-08 fixed |
| SEC-003 mass assignment blocked | PASS | **7 attacks succeeded before SG-04/05/09 fixes** |
| API-001 protected API requires auth | PASS | e2e JSON 401 |
| API-002 protected API requires permission | PASS | api-chat 7/7 |
| API-003 export requires authorization | PASS | no export surface; static guard |
| AI-001 AI cannot bypass authorization | PASS | matrix-extended; security-gate.rls |
| AI-002 AI cannot act consequentially without approval | PASS | RESTRICTIVE approval denial |
| AUDIT-001 sensitive action audited | PASS | **failed before SG-06 fix** |
| lint / typecheck / build | PASS | exit 0 |
| `npm audit` | PASS | 0 vulnerabilities |

Full mapping: [SECURITY_TEST_MATRIX.md](SECURITY_TEST_MATRIX.md). One hermetic
run during the gate had a single unexplained failure that did not reproduce
in three subsequent runs; the output did not name the test.

## 17. Findings

| ID | Severity | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| SG-01 | CRITICAL | `admin.users` (HR) could grant SUPER_ADMIN, EXECUTIVE, or roles in any organization | PRIV-001 succeeded 3× on staging | Grant ceiling: own admin organizations only; SUPER_ADMIN/EXECUTIVE/AI_SERVICE only by SUPER_ADMIN (`20260924100004`) | **Fixed, verified** |
| SG-02 | CRITICAL | Manager moved own `squad_id` into another chapter's squad and read its profiles and evidence (`user_squad_ids` trusts `profiles.squad_id`) | PRIV-003 succeeded | Profile scope-field guard (`…100004`) | **Fixed, verified** |
| SG-03 | HIGH | Talent changed own `chapter_id` | PRIV-003 succeeded | same guard | **Fixed, verified** |
| SG-04 | HIGH | Evidence created pre-validated with forged `created_by`; creator validated own evidence; talent self-certified capability; talent graded own learning; `business_impact.update` validated impact | 6 attacks succeeded | Validation, assessment and evaluation guards (`…100004`) | **Fixed, verified** |
| SG-05 | MEDIUM | `ai_usage` recorded in another person's name | SEC-003 succeeded | `profile_id = auth.uid()` (`…100004`) | **Fixed, verified** |
| SG-06 | HIGH | Role grants, permission changes, approvals and validations left no audit trail | AUDIT-001 failed | `audit_security_change` on 14 tables (`…100004`) | **Fixed, verified** |
| SG-07 | MEDIUM | `TRUNCATE` (ignores RLS), `REFERENCES`, `TRIGGER` granted to `authenticated` on 8 tables | live catalog | Revoked, incl. default privileges (`…100004`) | **Fixed, verified (0 remain)** |
| SG-08 | LOW | Internal status notes, incl. security-defect descriptions, shipped in the client bundle | bundle scan | Availability computed server-side (`lib/navigation-availability.ts`) | **Fixed, verified (0 in bundle)** |
| SG-09 | MEDIUM | Talent wrote own `ai_augmentation` scores | SEC-003 succeeded | RESTRICTIVE no-self policy (`20260924100005`) | **Fixed, verified** |
| SG-10 | HIGH | Reviewer/editor recorded approvals without the approve permission, under any name (reviews, plans, assignments) | matrix-extended, same day | Decision guards (`20260924100001`, `…100002`) | **Fixed, verified** |
| SG-11 | LOW | An approver's profile cannot be deleted: approval FKs are `SET NULL` but a CHECK pairs them | reproduced in a rolled-back transaction | None — preserves attribution; offboard by deactivating (`status`), not deleting | Accepted, documented |
| H-1 | HIGH | No Content-Security-Policy | readiness report | Needs nonce-based CSP verified in a browser | **Open — condition** |

## 18. Files Changed

- `supabase/migrations/20260924100004_security_gate_1.sql` (new)
- `supabase/migrations/20260924100005_ai_augmentation_no_self_scoring.sql` (new)
- `tests/rls/security-gate.rls.test.ts` (new, 41 tests)
- `tests/security/security-gate.security.test.ts` (new, 5 tests)
- `tests/unit/migrations.test.ts` (Gate #1 regression guards)
- `tests/unit/navigation.test.ts` (import path)
- `lib/navigation-availability.ts` (new, server-only)
- `lib/navigation.ts` (no longer imports `lib/status.ts`)
- `components/layout/app-shell.tsx`, `top-bar.tsx`, `mobile-nav.tsx`, `sidebar-nav.tsx` (availability passed as ids)
- `types/database.ts` (regenerated from staging)
- `docs/security/SECURITY_RECON_REPORT.md`, `SECURITY_GATE_1_REPORT.md`, `SECURITY_MODEL.md`, `SECURITY_TEST_MATRIX.md`, `THREAT_MODEL.md` (new)
- `CLAUDE.md`, `lib/status.ts`, `TANIA_PRODUCTION_READINESS_REPORT.md`, `supabase/migrations/README.md` (status)

## 19. Database Migrations Changed

New migrations only; no applied migration was edited. All were applied to
staging after a dry run, and `supabase db lint` is clean.

- `20260924100004_security_gate_1.sql`: SG-01 to SG-07
- `20260924100005_ai_augmentation_no_self_scoring.sql`: SG-09

Applied earlier the same day and within this gate's findings (SG-10):
`20260924100001`, `20260924100002`.

## 20. Remaining Risks

| ID | Severity | Risk | Why not fixed here |
|---|---|---|---|
| R-1 | HIGH | No CSP (H-1) | Needs per-request nonces and browser verification; no browser in this environment |
| R-2 | MEDIUM | RLS denials produce no `SECURITY_DENIED` audit event, and the agent-run recorder is not wired (M-4) | Postgres cannot log a filtered row; needs an application-layer denial recorder |
| R-3 | MEDIUM | Any chapter member sees every project in the chapter; the matrix says PMs and talents see assigned projects | Source conflict (baseline SQL vs matrix §2/§4); product decision |
| R-4 | MEDIUM | CHAPTER_LEAD reads the chapter's private AI conversations via `ai.view_audit`; AI_SERVICE has no designed read scope | Product and privacy decisions |
| R-5 | LOW | Logout CSRF on `POST /auth/signout` | Impact limited to forced logout; SameSite=Lax |
| R-6 | LOW | AI rate limit is per instance on Vercel (readiness M-1) | Needs shared state |
| R-7 | LOW | `ai_usage` quality and productivity fields are self-reported and feed a performance dimension | Needs a validation workflow before they are used in scoring |
| R-8 | LOW | `record_audit_event` lets a user append free-text events (attributed to themselves) | Cannot forge another actor; noise only |
| R-9 | INFO | Test runs leave append-only audit rows in staging | By design; the log is never pruned |

## 21. Gate Decision

**PASS WITH CONDITIONS.**

| Criterion | Result |
|---|---|
| Authentication enforced server-side | ✅ |
| Authorization enforced server-side | ✅ |
| RBAC enforced | ✅ |
| RLS enabled for sensitive tables | ✅ 52/52 |
| Scope isolation verified | ✅ |
| IDOR tests pass | ✅ |
| Privilege escalation tests pass | ✅ (after SG-01/02/03) |
| Service-role is not exposed | ✅ |
| Secrets are not exposed | ✅ |
| Mass assignment protected | ✅ (after SG-04/05/09) |
| API authorization verified | ✅ |
| Server Actions authorization verified | ✅ |
| Sensitive exports protected | ✅ none exist; guarded |
| Audit controls exist for sensitive operations | ✅ (after SG-06); denials not audited (R-2) |
| AI_SERVICE has explicit authorization boundary | ✅ |
| No critical vulnerabilities remain | ✅ |
| No high vulnerabilities remain | ❌ **H-1, no CSP** |
| Security test suite passes | ✅ 98/98 RLS, 765/765 hermetic, 18/18 e2e |
| Typecheck / lint / build pass | ✅ |

**Conditions**, each with the point it must be met by:

1. **Before any production deployment:** close H-1 with a nonce-based CSP
   verified in a browser.
2. **Before production:** apply all migrations to the production project and
   rerun `test:rls` against a staging copy of it, never production itself.
3. **Before agents act on data:** wire the audit recorder into the pipeline,
   add denial events (R-2), and design the AI_SERVICE read scope (R-4).
4. **Before the Projects/Staffing and AI Assistant modules extend further:**
   decide R-3 and R-4.

Development of the next domain modules may proceed on this boundary. New
tables must follow SECURITY_MODEL.md §5: any judgement-bearing column gets a
decision guard and an audit trigger in the same migration that creates it.
