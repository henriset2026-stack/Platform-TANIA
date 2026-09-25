# Security Test Matrix — Security Gate #1

Maps every required test ID to the tests that exercise it and to the result of
the run on **2026-09-24** against staging project `hcyaqbgbwfxzutamceoq`.

**How the database tests work.** They sign in as real users with real JWTs
and attack through the Data API, exactly as a browser could. An outcome is
judged by the row's state afterwards, read through the service-role client: a
refused write and a write RLS silently filtered are both "denied", and only
the stored state proves which. Every denial has a **control** — someone in
scope reaching the same row — so an empty result never means "the fixture is
missing". Denials that raise assert SQLSTATE `42501`, not "some error".

## Running

```bash
npm test                                   # unit, integration, security, ai — hermetic
set -a; . ./.env.local; set +a
npm run test:rls                           # live database — staging only, never production
npm run build && npm start &
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

## Suites

| Suite | File | Tests | Result |
|---|---|---:|---|
| RLS — gate attacks | `tests/rls/security-gate.rls.test.ts` | 41 | **41/41** |
| RLS — matrix §9 extended | `tests/rls/matrix-extended.rls.test.ts` | 32 | **32/32** |
| RLS — matrix §9 core | `tests/rls/matrix.rls.test.ts` | 11 | **11/11** |
| RLS — CRUD | `tests/rls/crud.rls.test.ts` | 10 | **10/10** |
| RLS — escalation | `tests/rls/escalation.rls.test.ts` | 4 | **4/4** |
| Static — HTTP surface | `tests/security/security-gate.security.test.ts` | 5 | **5/5** |
| Static — secrets | `tests/security/secrets.security.test.ts` | 11 | **11/11** |
| Policy layer — RBAC matrix | `tests/security/rbac-matrix.security.test.ts` | 20 | **20/20** |
| Hardening (headers, rate limit) | `tests/security/hardening.security.test.ts` | 14 | **14/14** |
| AI tools / claims / injection | `tests/ai/*.ai.test.ts` | 41 | **41/41** |
| API route | `tests/integration/api-chat.integration.test.ts` | 7 | **7/7** |
| E2E against `next start` | `tests/e2e/route-protection.e2e.test.ts` | 18 | **18/18** |
| Migration regression guards | `tests/unit/migrations.test.ts` | 24 | **24/24** |

Full hermetic run: **765/765**. RLS: **98/98**. E2E: **18/18**.

## Required IDs

| ID | Requirement | Evidence | Result |
|---|---|---|---|
| AUTH-001 | Unauthenticated access denied | e2e: 10 protected pages → 307 `/login`; `/api/ai/chat` → JSON 401. `matrix`/`crud`: anonymous reads nothing. PostgREST with no user JWT → 401 `42501` | PASS |
| AUTH-002 | Authenticated access allowed | `matrix`: talent reads own profile; every control test in `security-gate` | PASS |
| AUTH-003 | Forged / invalid session rejected | `security-gate`: self-signed JWT claiming `service_role` → 401. Manual: forged `sb-…-auth-token` cookie → 307 `/login` (`getUser()` verifies with the auth server) | PASS |
| RBAC-001 | Unauthorized role denied | `security-gate` PRIV-001/002 (MANAGER, PM, CHAPTER_LEAD, AI_SERVICE on memberships, roles, role_permissions); `rbac-matrix` | PASS |
| RBAC-002 | Authorized role allowed | HR grants MANAGER in own chapter; chapter lead validates impact; manager approves a direct report's plan | PASS |
| RLS-001 | Cross-chapter read denied | `security-gate` RLS-001: profile, performance evidence, development plan, capability evidence, AI usage, business impact — manager **and** chapter lead of chapter A, all zero; control: chapter B manager sees all | PASS |
| RLS-002 | Cross-chapter update denied | lead A → profile B; manager A → evidence B; state unchanged | PASS |
| RLS-003 | Cross-squad / same-chapter isolation | talent → squad-mate's plan; talent → manager's plan; `matrix`: manager → other squad | PASS |
| RLS-004 | Unauthorized delete denied | talent A → profile B; lead A → plan B; `crud`: evidence and audit rows | PASS |
| IDOR-001 | Object-id manipulation denied | plan B addressed by id: not read, not changed. No id-addressed HTTP route exists | PASS |
| PRIV-001 | Role escalation denied | HR → SUPER_ADMIN, EXECUTIVE, cross-chapter role: none granted; `escalation`: self-grant SUPER_ADMIN | PASS (**failed before SG-01 fix**) |
| PRIV-002 | Permission escalation denied | PM, AI, CHAPTER_LEAD → `role_permissions`: `42501`; AI → `roles`: `42501` | PASS |
| PRIV-003 | Self-move into another scope denied | manager → own `squad_id` in chapter B: refused, still sees nothing of B; talent → own `chapter_id`: unchanged | PASS (**failed before SG-02/03 fix**) |
| SEC-001 | Service role not exposed | `secrets` static tests; no entry point imports `lib/supabase/admin`; clean-build scan of `.next/static`: 0 occurrences of `sb_secret_`, `service_role`, `SUPABASE_SERVICE_ROLE_KEY` | PASS |
| SEC-002 | Secrets not exposed client-side | same scan for `AI_GATEWAY_KEY`, `ENTRA_CLIENT_SECRET`: 0; status notes: 0 after SG-08; `.env.local` gitignored; git history scan clean | PASS |
| SEC-003 | Mass assignment blocked | evidence created pre-validated / with forged `created_by`; creator validates own evidence; self-certified capability; self-graded learning; AI usage for others; self-scored AI augmentation — all refused | PASS (**7 succeeded before SG-04/05/09 fixes**) |
| API-001 | Protected API requires auth | e2e: GET/POST/malformed POST to `/api/ai/chat` → JSON 401, no redirect | PASS |
| API-002 | Protected API requires permission | `api-chat` integration; gateway denies without `ai.use`; tool calls re-authorized per tool | PASS |
| API-003 | Export requires authorization | No export surface exists; `security-gate.security` fails the build if a route or action named export/download/csv, or serving `text/csv`, appears unreviewed | PASS (by absence, guarded) |
| AI-001 | AI cannot bypass authorization | AI reads another chapter's profile: 0; individual evidence: 0; writes evidence: `42501`; creates roles or grants permissions: `42501`; roll-ups: none | PASS |
| AI-002 | AI cannot execute consequential action without approval | AI holding `approve_review` in scope still cannot approve (RESTRICTIVE policy); policy layer blocks consequential tools; agent-run approval must be the approver's own identity | PASS |
| AUDIT-001 | Sensitive action generates audit event | role grant by HR → `organization_memberships.insert` with actor; business-impact validation → row with the lead as actor | PASS (**failed before SG-06 fix**) |

## Attacks that succeeded before the fixes

The first run of `security-gate.rls.test.ts` (before migration
`20260924100004`) failed **15 of 38**. The ai_augmentation test, added later,
failed before `20260924100005`. Every one now passes. See
[SECURITY_GATE_1_REPORT.md](SECURITY_GATE_1_REPORT.md) §17.

## Not automated

| Check | Why | Evidence instead |
|---|---|---|
| Entra ID round trip | Provider not configured | Callback failure paths exercised against `next start` |
| Expired session | Needs a real expired token | Identity always comes from `getUser()`, which rejects expired tokens server-side |
| `TRUNCATE` / `REFERENCES` / `TRIGGER` revocation | Not expressible through PostgREST | Live catalog query: **0** such grants to `anon`/`authenticated` |
| CSP | No browser in this environment | Open: readiness report H-1 |
