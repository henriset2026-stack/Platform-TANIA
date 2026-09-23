# Deploying TANIA to Vercel

**Status, 2026-09-24: ready for a Vercel *preview/staging* deployment. NOT
ready for production.** The code passes every required check (§8). Two
production blockers are outside the code: no production Supabase project,
and no Entra ID provider configured (§9). All 15 RLS matrix rows pass on
staging.

---

## 1. Requirement checklist

| # | Requirement | State | Evidence |
|---|---|---|---|
| 1 | Production build succeeds | **Met** | `npm run build` exit 0 |
| 2 | Environment variables documented | **Met** | `.env.example`, §3 |
| 3 | No secrets committed | **Met** | Git history and tree scanned; only documented dummy values in redaction tests. `.env.local` is gitignored |
| 4 | Supabase production project configured | **Not met** | Only `hcyaqbgbwfxzutamceoq` exists, and it is the RLS test target. §4 |
| 5 | Auth callback URLs documented | **Met** | §5. The sign-in flow is **untested end to end**: Entra is not configured |
| 6 | Database migrations documented | **Met** | §4, `supabase/migrations/README.md` |
| 7 | Server/client boundaries validated | **Met** | 29 `server-only` modules; no client component imports a server module; build enforces it; `tests/security/secrets.security.test.ts` |
| 8 | API routes validated | **Met** | Integration tests plus the e2e suite against a production build (18/18), which found and fixed a defect (§8) |
| 9 | RLS validated | **Met (staging)** | `npm run test:rls` 57/57: all 15 §9 rows. Must be re-run against the production project once it exists |
| 10 | Production logging enabled | **Met** | Structured JSON logger and `instrumentation.ts`; confirmed in `next start` output. §7 |

---

## 2. Vercel project settings

| Setting | Value |
|---|---|
| Framework preset | Next.js (auto-detected) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Node.js version | 20.x or later (`engines.node` is `>=20.9.0`) |
| Function region | `sin1` (Singapore), next to the Supabase project in `ap-southeast-1`. Every request makes at least one database round trip |

No `vercel.json` is needed. `app/api/ai/chat` declares `runtime = "nodejs"`
itself.

---

## 3. Environment variables

Set these in Vercel → Project → Settings → Environment Variables.
`.env.example` has the same list with no values.

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **required** | **required** | `https://<ref>.supabase.co`. Use a different project per environment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **required** | **required** | Publishable key. Browser-safe; RLS applies |
| `SITE_URL` | **required** | omit | Canonical origin, e.g. `https://tania.example.com`. Previews use Vercel's automatic `VERCEL_URL` |
| `LOG_LEVEL` | optional | optional | `debug`/`info`/`warn`/`error`. Defaults to `info` in production |
| `AI_GATEWAY_URL`, `AI_GATEWAY_KEY`, `LLM_MODEL` | optional | optional | All three or none. Without them the assistant reports "not configured" |
| `EMBEDDING_MODEL` | optional | optional | Needed for RAG retrieval |
| `SUPABASE_SERVICE_ROLE_KEY` | **do not set** | **do not set** | Bypasses RLS. The deployed app never reads it; only `tests/rls` and maintenance scripts do, from a trusted machine |
| `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID` | **do not set** | **do not set** | Not read by the app. They go into Supabase (§5) |
| `JARVIS_API_URL`, `JARVIS_API_KEY` | not used yet | not used yet | No code reads them |

Only the two `NEXT_PUBLIC_*` variables reach the browser.
`tests/unit/env-contract.test.ts` fails if any other variable gains that
prefix, or if `.env.example` ever holds a value.

---

## 4. Supabase

### Projects

Use **one Supabase project per environment**. The existing project
`hcyaqbgbwfxzutamceoq` is suitable for **staging** only. `npm run test:rls`
creates and deletes users and organizations in it, and `tests/rls/README.md`
forbids pointing that suite at production.

For production, create a separate project in `ap-southeast-1` (the Pro tier
is needed for backups and no auto-pause) and apply the migrations below.

### Migrations

27 migrations in `supabase/migrations/`, forward-only, applied in filename
order. The full sequence and rationale are in `supabase/migrations/README.md`.

```bash
supabase link --project-ref <ref>
supabase db push --dry-run   # review the list first
supabase db push
supabase db lint --linked    # expect: No schema errors found
```

On `hcyaqbgbwfxzutamceoq` the first 24 applied cleanly on the first attempt (the
three 2026-09-24 guard and aggregate migrations followed): 52 tables, RLS on
all 52, and a clean lint.

After any new migration, regenerate the types and re-append the named aliases
at the bottom of the file:

```bash
supabase gen types typescript --linked --schema public > types/database.ts
```

### Seed data

- `supabase/seed/01_reference.sql` holds framework reference data and is safe
  in every environment.
- `02_dev_sample.sql` and `03_demo_dataset.sql` are **never for production**.
  They refuse to run without an explicit flag, and `scripts/db.mjs` refuses
  production-looking targets.

### Rollback

Migrations are forward-only. Roll back with a new migration, never by editing
an applied one. Application rollback is Vercel's "Instant Rollback", which is
safe because no migration removes something the previous deployment relied
on. Keep it that way.

---

## 5. Authentication (Microsoft Entra ID → Supabase Auth)

The flow is: the login button calls the `signInWithEntra` server action. That
redirects to Supabase `/auth/v1/authorize?provider=azure`, which goes to Entra
ID, back to Supabase, and then to **`/auth/callback`** on the TANIA origin.
The callback exchanges the code for a session and redirects to `next`, which
must be a same-origin path.

Roles are **never** read from the Entra token. Authorization comes from
`organization_memberships`, so a signed-in user with no membership sees
nothing.

### 5.1 Entra ID app registration (Azure portal)

| Field | Value |
|---|---|
| Redirect URI (Web) | `https://<supabase-ref>.supabase.co/auth/v1/callback` |
| Supported account types | Single tenant (Telkom) |
| Token configuration | Add the optional claim `email` (ID token) |

This redirect URI points at **Supabase**, not at TANIA.

### 5.2 Supabase → Authentication → Providers → Azure

| Field | Value |
|---|---|
| Client ID | Entra application (client) ID |
| Secret | Entra client secret *value* |
| Azure Tenant URL | `https://login.microsoftonline.com/<tenant-id>/v2.0` |

### 5.3 Supabase → Authentication → URL Configuration

| Field | Value |
|---|---|
| Site URL | the production `SITE_URL` |
| Redirect URLs | `https://<production-domain>/auth/callback` |
| | `https://*-<vercel-team-slug>.vercel.app/auth/callback` (previews, staging project only) |
| | `http://localhost:3000/auth/callback` (development, non-production projects only) |

Supabase rejects any `redirectTo` that is not on this list. A wrong
`SITE_URL` therefore makes sign-in fail at Supabase; it cannot redirect users
elsewhere.

### 5.4 After the first sign-in

A user who signs in has a session but **no access** until a membership exists.
Grant the first SUPER_ADMIN membership with SQL from the dashboard. Memberships
cannot be self-granted through the API, by design: the RESTRICTIVE policy in
`20260921090001` enforces it, and `tests/rls` proves it.

---

## 6. Security posture on Vercel

- **Headers:** `next.config.mjs` sets `X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` and HSTS, and removes the
  `X-Powered-By` header. Verified on the production build.
- **No CSP yet.** This is finding H-1 in `TANIA_PRODUCTION_READINESS_REPORT.md`.
  A nonce-based CSP needs browser verification before it ships.
- **Route protection:** deny by default (`lib/auth/routes.ts`).
  Unauthenticated page requests redirect to `/login`. Unauthenticated `/api/*`
  requests get a **JSON 401**, never a redirect.
- **Rate limiting** of the AI endpoint is per instance, in memory. On Vercel
  every function instance has its own budget. That is finding M-1: move it to
  shared state before a public launch.

---

## 7. Logging

Server logs are **one JSON object per line** on stdout/stderr, which Vercel's
Runtime Logs index. Attach a Log Drain for retention beyond Vercel's window.

```json
{"ts":"2026-09-23T18:32:21.908Z","level":"warn","event":"auth.callback_missing_code"}
```

| Source | Events |
|---|---|
| `instrumentation.ts` `onRequestError` | `server.unhandled_error`, with digest, message, method, path without the query string, and route type. Every unhandled error in Server Components, Route Handlers, Server Actions and middleware |
| `app/api/ai/chat` | `api.ai.chat`, with correlationId, status, error code and durationMs |
| `lib/ai/gateway.ts` | `ai.gateway.*`, correlated by correlationId |
| auth | `auth.signin_failed`, `auth.signin_no_origin`, `auth.callback_ok`, `auth.callback_missing_code`, `auth.callback_failed` |

**Never logged:** prompts, answers, tool arguments and query strings. Every
payload goes through `lib/observability/redact.ts` at the sink, which redacts
by key and by value and counts what it removed. The error boundary's `digest`
matches a user-quoted error to its `server.unhandled_error` line.

Agent runs and tool calls are also written to the database audit tables by
`lib/observability/recorder.ts`. That is a separate channel, and it is **not
yet called from the pipeline** (finding M-4).

---

## 8. Verification performed (2026-09-24)

| Command | Result |
|---|---|
| `npm run lint` | exit 0, 0 problems |
| `npm run typecheck` | exit 0 |
| `npm run test` | exit 0, **759 tests**, 36 files |
| `npm run build` | exit 0 |
| `npm run test:e2e` against `next start` | **18/18** |
| `npm run test:rls` against `hcyaqbgbwfxzutamceoq` | **57/57**. Fixtures cleaned up; the database is empty afterwards |

The first e2e run **failed 3/18**. Anonymous calls to `/api/ai/chat` got a
`307` to `/login`, and `fetch` followed it to an HTML page with status 200.
The API error contract was broken. The middleware now answers anonymous
`/api/*` requests with a JSON 401 (`isApiRoute` in `lib/auth/routes.ts`), and
the e2e suite asserts JSON and no redirect.

Before a deployment, run:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
set -a; . ./.env.local; set +a; npm run test:rls                  # staging project only
npm start & E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

---

## 9. Blocking production — must be closed first

1. **Production Supabase project** (requirement 4). Create it separately from
   staging, apply the migrations, configure Auth (§5.2–5.3), and turn on
   backups and PITR.
2. **Entra ID** (§5.1–5.2). Until the Azure provider is enabled, the login
   button reaches Supabase and fails, and **nobody can sign in**. Redirect
   resolution and the action's wiring are unit-tested. The callback's failure
   paths were exercised against `next start`. The full round trip has never
   run.
3. **RLS on production.** Apply all 27 migrations and re-run `npm run
   test:rls` against a *staging copy* of it, never production itself.
4. **CSP** (H-1), verified in a browser.
5. **Shared rate-limit state** (M-1).

Not blocking deployment, but known: there is no LLM provider (the assistant
answers "not configured"), the audit recorder is not wired (M-4), and there
is no accessibility or responsive check (L-3).
