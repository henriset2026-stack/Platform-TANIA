# TANIA API Security Inventory

**Security Gate #3, step 24 · 2026-09-25.**

Every externally reachable endpoint, taken from the route tree (`app/**/route.ts`, `app/**/page.tsx`, `"use server"` actions). The middleware (`lib/supabase/middleware.ts`) runs first on everything except static assets:

- **Unauthenticated callers:** a page redirects to `/login`; an API path gets a 401 JSON response.
- **Missing Supabase configuration in production:** a 503.
- **Content-Security-Policy:** set on every response.

Being signed in only establishes *who* is calling. What they may read is decided by `lib/auth/authorize.ts` at the server boundary and **enforced by RLS**: every page reads through the caller's RLS-scoped client.

## Route handlers and actions

| Method | Endpoint | Auth | Permission | Scope | Rate limit | Risk |
|---|---|---|---|---|---|---|
| POST | `/api/ai/chat` | Session (401 if none) | `ai.use` (agent); each tool requires **all** its permissions | Server-derived `AuthContext`; tool arguments must stay inside the caller's organizations; RLS on every tool read | Per user, 12 burst, 1 per 10 s. **In memory, per instance** (G3-07) | HIGH: model access, cost |
| GET | `/api/ai/chat` | n/a | n/a | n/a | n/a | 405 only |
| GET | `/auth/callback` | Public (OAuth code exchange) | n/a | `next` must be a local path (`/…`, not `//…`), always prefixed with the site origin | Supabase Auth limits (NOT VERIFIED) | MEDIUM: open-redirect surface, closed |
| POST | `/auth/signout` | Public prefix; acts on the caller's own session only | n/a | own session | none | LOW |
| POST (action) | `signInWithEntra` (login form) | Public | n/a | Starts the Entra ID OAuth flow via Supabase | Supabase Auth limits (NOT VERIFIED) | MEDIUM: authentication entry |

## Pages (GET, server-rendered per request)

All require a session unless marked public. Data access is RLS-scoped, and an unavailable or unauthorized figure renders as an explicit `DataPoint` state, never a number.

| Path | Auth | Permission / scope (enforced by RLS) | Risk |
|---|---|---|---|
| `/` | Public | none (landing) | LOW |
| `/login` | Public | none | LOW |
| `/dashboard` | Session | chapter aggregates: counts only, suppressed below 5 people | MEDIUM |
| `/talent`, `/talent/[id]`, `/talent/[id]/capabilities` | Session | `talent.read` + `can_access_profile` | HIGH (Confidential) |
| `/capability`, `/capability/[id]` | Session | `capability.read` | MEDIUM |
| `/performance`, `/performance/[talentId]`, `/performance/reviews` | Session | `performance.read` + profile scope | HIGH (Sensitive) |
| `/development`, `/development/[talentId]` | Session | `development.read` + profile scope | HIGH (Sensitive) |
| `/assignments`, `/workload` | Session | `assignment.read` + scope | MEDIUM |
| `/projects`, `/projects/[id]`, `/feasibility`, `/budget` | Session | `project.read` + `can_access_project` | MEDIUM |
| `/knowledge`, `/knowledge/[id]` | Session | chunk ACL (organization + sensitivity) inside the query | MEDIUM |
| `/audit` | Session | `ai.view_audit`; audit metadata only, no payloads | MEDIUM |
| `/design-system` | Session | none; shows components in non-live states only | LOW |

## Direct database API (Supabase PostgREST)

The browser never calls it; TANIA's code reads through the server client. It is still reachable by anyone holding the publishable key:

- `anon` is revoked on every table and on the permission RPC. This was verified live: `42501` on SELECT from 11 tables and on INSERT into 3.
- `authenticated` is filtered by RLS on all tables (106 RLS tests pass against staging).
- `SECURITY DEFINER` RPCs all pin `search_path`. `chapter_summary` and `chapter_capability_summary` take no parameters and return only suppressed counts.

## Absent by design (verified by code search)

| Surface | Status |
|---|---|
| Debug or development endpoints | none |
| Health endpoint | none (so none can leak) |
| Export (CSV / XLSX / PDF / JSON download) | none. Step 26: NOT APPLICABLE |
| File upload | none. Step 12: NOT APPLICABLE |
| Arbitrary SQL / query endpoint | none; no AI tool accepts SQL, and the registry refuses names such as `sql` and `execute` |
| Fetch of a user-supplied URL | none. SSRF (step 25): NOT APPLICABLE |
| Webhooks / cron | none |
| JARVIS endpoint | none. The handoff is outbound only, with no transport, and is off by default (`JARVIS_HANDOFF_ENABLED`) |

A new `route.ts` or `"use server"` file must be added to this table in the same change.
