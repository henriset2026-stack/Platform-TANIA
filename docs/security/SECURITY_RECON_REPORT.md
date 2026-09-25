# Security Reconnaissance — Security Gate #1

**Date:** 2026-09-24 · **Scope:** repository at commit `5c61fe2` and the live
staging database `hcyaqbgbwfxzutamceoq` *before* the Gate #1 fixes.
**Method:** source reading, plus queries against the live Postgres catalog
(`pg_policies`, `pg_proc`, `information_schema.role_table_grants`,
`pg_trigger`). Catalog facts are what the database actually enforces; the
migration text is only what it was asked to do.

Fixes and results are in [SECURITY_GATE_1_REPORT.md](SECURITY_GATE_1_REPORT.md).

---

## 1. Architecture discovered

| Layer | Implementation |
|---|---|
| Framework | Next.js **16.3.5**, React 19.3, App Router, TypeScript 6.0.3 |
| Supabase | `@supabase/supabase-js` 2.117, `@supabase/ssr` 0.12 |
| Pages | 23 `page.tsx`, all Server Components by default |
| Route handlers | `POST/GET /api/ai/chat`, `GET /auth/callback`, `POST /auth/signout` |
| Server actions | 1: `signInWithEntra` (`app/(auth)/login/actions.ts`) |
| Middleware | `middleware.ts` → `lib/supabase/middleware.ts` (session refresh + route gate) |
| Database | 52 `public` tables, 28 migrations (27 before this gate), no views, no storage buckets |
| Validation | Hand-written, no Zod. Chat body validated in the route; tool arguments validated against JSON Schema with `additionalProperties: false` |

The data API **is** the attack surface: PostgREST exposes every `public`
table to any holder of the publishable key plus a user JWT. The three route
handlers are small; the 52 tables are not.

## 2. Authentication flow

```text
Login button → signInWithEntra (server action) → Supabase /authorize?provider=azure
  → Entra ID → Supabase → /auth/callback → exchangeCodeForSession → session cookie
Every request → middleware: supabase.auth.getUser()  (verifies the JWT with the auth server)
  → no user + non-public path → 307 /login   (pages)  |  401 JSON  (/api/*)
```

- `getUser()` is used everywhere identity matters (`lib/supabase/middleware.ts`,
  `lib/auth/session.ts`). `getSession()` is **never called**.
- No entry point reads a user, role, permission or scope id from a request.
- Entra ID is **not configured** in Supabase, so the flow has never completed
  end to end (docs/DEPLOYMENT.md §9).

## 3. Authorization flow

```text
AuthContext  ← lib/auth/session.ts: getUser() + RPCs current_user_roles / current_user_permissions /
               user_org_ids / user_squad_ids — all scoped to auth.uid() inside SECURITY DEFINER functions
Gate         ← lib/auth/policy.ts (pure, fail-fast)  — NOT enforcement
Enforcement  ← PostgreSQL RLS on every table, via has_role / has_permission / can_access_profile /
               can_access_project; RESTRICTIVE policies deny AI_SERVICE writes and self-granted memberships
Decisions    ← triggers on performance_reviews / development_plans / assignments (approval guards, 2026-09-24)
```

## 4. Database access flow

| Client | Key | RLS | Used by |
|---|---|---|---|
| `lib/supabase/client.ts` | publishable | applies | browser |
| `lib/supabase/server.ts` | publishable + session cookie | applies | every server read and write |
| `lib/supabase/admin.ts` | service role | **bypassed** | **nothing** — no module imports it |

## 5. Client/server boundaries

- 29 modules import `server-only`; the build fails if a client component
  pulls one in.
- Client components contain no authorization logic. The only `role` symbols
  in client code are chat-message roles (`user` / `assistant`).
- **Finding (SG-08):** `components/layout/sidebar-nav.tsx` (client) imported
  `lib/navigation.ts`, which imported `lib/status.ts`. The entire phase
  evidence text — internal notes including descriptions of security defects
  — shipped to every browser. The variable *name* `SUPABASE_SERVICE_ROLE_KEY`
  appeared in the bundle; **no key value did**.

## 6. RLS coverage (live catalog, before fixes)

- RLS **enabled on 52/52** tables. `anon` holds **no** table grants.
- Every granted verb has a permissive policy; no table has RLS without one.
- Every `SECURITY DEFINER` function pins `search_path = ''`. None of the
  non-trigger ones is executable by `anon`.
- **Finding (SG-07):** `authenticated` still held `TRUNCATE`, `REFERENCES`
  and `TRIGGER` on `audit_logs`, `organization_memberships`, `organizations`,
  `permissions`, `profiles`, `role_permissions`, `roles`, `squads` — Supabase
  defaults the first migrations never revoked. `TRUNCATE` ignores RLS.
  PostgREST cannot issue it, so it was not reachable through the API.

## 7. Security-sensitive files

| File | Why |
|---|---|
| `supabase/migrations/20260920120005_auth_helpers.sql` | `has_role`, `has_permission`, `user_org_ids`, `user_squad_ids`, `can_access_profile` |
| `supabase/migrations/20260920120006_rls_core.sql` | identity, membership, catalog policies |
| `supabase/migrations/20260921100008_domain_rls.sql` | 63 domain policies |
| `supabase/migrations/20260921090001_…`, `…100010_…` | RESTRICTIVE AI_SERVICE denials |
| `lib/auth/{session,policy,authorize,routes}.ts` | context, gate, route protection |
| `lib/supabase/{server,middleware,admin}.ts`, `lib/env.server.ts` | clients and secrets |
| `app/api/ai/chat/route.ts`, `lib/ai/gateway.ts` | the only JSON API |

## 8. Suspicious patterns (to be proven or disproven by attack)

| # | Pattern | Why suspicious |
|---|---|---|
| P1 | `organization_memberships_insert` checks `admin.users` with **no organization scope and no role ceiling** | HR holds `admin.users` |
| P2 | `user_squad_ids()` includes the caller's own `profiles.squad_id`, and `profiles_update` lets anyone update their own row with **no column restriction** | a MANAGER could re-home into any squad |
| P3 | `created_by`, `validated_by`, `validation_status` are ordinary client-writable columns on evidence tables | self-validation, forged provenance |
| P4 | `talent_capabilities_write` lets the subject write their own row | self-certification |
| P5 | `learning_evidence_update` requires only `can_access_profile` — true for oneself | self-grading |
| P6 | `business_impacts_update` accepts `business_impact.update` **or** `.validate` | validation without `.validate` |
| P7 | `ai_usage_write` accepts `profile_id = self OR has_permission('ai.use')` | usage recorded in another's name |
| P8 | `ai_augmentation_write` accepts `ai.analyze` + `can_access_profile` — true for oneself | self-scoring |
| P9 | Audit triggers exist only on `feasibility_assessments` and `budget_reallocations` | role grants, approvals, validations unaudited |

## 9. Missing controls

- No audit event for role or permission changes, approvals, validations or
  scope changes (P9).
- No `SECURITY_DENIED` event: RLS denials are silent at the database.
- No Content-Security-Policy (readiness report H-1).
- No export surface exists; the `*.export` permissions are catalogued but
  unimplemented.

## 10. Risk classification (before attack verification)

| Severity | Items |
|---|---|
| CRITICAL | P1, P2 (both confirmed by attack — SG-01, SG-02) |
| HIGH | P3–P6 (SG-04), P9 (SG-06), self chapter change (SG-03) |
| MEDIUM | P7 (SG-05), P8 (SG-09), `TRUNCATE` grants (SG-07), same-chapter project visibility, chapter-lead access to private AI conversations |
| LOW | status notes in the bundle (SG-08), logout CSRF, self-attributed free-text audit rows, approver deletion blocked by the pairing CHECK |
| INFO | AI_SERVICE has no read scope at all; trigger functions executable by `anon` (harmless — Postgres refuses direct calls) |
