# TANIA Production Security Baseline

**Security Gate #3, step 41 · 2026-09-25.**

This is the configuration a production deployment must hold. The **Required** column is the baseline. The **State** column is what exists today:

- **IMPLEMENTED:** in code or config, and tested.
- **NOT VERIFIED:** configured outside the repository and not visible.
- **MISSING:** does not exist.

A deviation from the baseline is a change to be reviewed, not a setting to be tuned.

## Authentication

| Required | State |
|---|---|
| Sign-in only through Microsoft Entra ID via Supabase Auth OIDC; no password or magic-link sign-in enabled | Code: IMPLEMENTED (`signInWithEntra`). Supabase Auth provider settings: NOT VERIFIED |
| Identity from `getUser()` (server-validated JWT), never `getSession()`, for any authorization decision | IMPLEMENTED (`lib/auth/session.ts`, middleware) |
| Session cookies HttpOnly, SameSite=Lax, Secure in production | IMPLEMENTED (`lib/supabase/cookie-options.ts`); browser sign-in NOT VERIFIED (no test user) |
| Deny by default: a route is private unless listed public | IMPLEMENTED (`lib/auth/routes.ts`) |
| A production deployment without Supabase configuration refuses protected routes (503) | IMPLEMENTED (G3-09) |
| Redirect after sign-in only to a local path | IMPLEMENTED (`/auth/callback`) |

## RBAC and RLS

| Required | State |
|---|---|
| RLS enabled on every `public` table, with explicit policies | IMPLEMENTED; 52 tables, 253 policies (staging) |
| `anon` revoked everywhere | IMPLEMENTED; verified live |
| Every `SECURITY DEFINER` function pins `search_path` and accepts no caller-supplied identity | IMPLEMENTED; 21 of 21 |
| Decision guards on every approvable or validatable column | IMPLEMENTED (Security Gate #1) |
| No self-grant of roles; privilege changes need a second person | IMPLEMENTED |
| RLS suite green against the environment being released | Staging: 106/106. Production: MISSING (no production project) |

## Secrets

| Required | State |
|---|---|
| No secret in Git, in any commit | IMPLEMENTED; full history scanned, 0 |
| Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may reach the browser | IMPLEMENTED (lint allowlist, env contract test, bundle scan 0) |
| `SUPABASE_SERVICE_ROLE_KEY` never set in Vercel | NOT VERIFIED (Vercel env not visible) |
| Production credentials distinct from staging and preview | MISSING (no production project) |
| Every secret rotatable without redesign | Documented in INCIDENT_RESPONSE.md; never exercised |

## Browser security

| Required | State |
|---|---|
| CSP: nonce scripts, `strict-dynamic`, no inline or eval script in production, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self'` | IMPLEMENTED; browser-verified (inline handler blocked, page hydrates) |
| CSP exception: `style-src 'unsafe-inline'` (React style attributes) | Accepted and documented (`lib/security/csp.ts`) |
| HSTS, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, no `X-Powered-By` | IMPLEMENTED (`next.config.mjs`) |
| No `dangerouslySetInnerHTML`; AI output rendered as text | IMPLEMENTED |

## Storage, uploads, exports

None exist. Adding any of them requires, in the same change:

- an authorization decision
- a size and type limit
- private buckets with scoped, expiring signed URLs
- an audit trail
- an entry in API_SECURITY_INVENTORY.md

## Database and migrations

| Required | State |
|---|---|
| All schema change through version-controlled, forward-only migrations | IMPLEMENTED |
| `supabase db push --dry-run`, then push, then RLS suite, per environment | Staging: yes. Production: MISSING |
| Backup before any production migration; PITR enabled | MISSING (`pitr_enabled: false`, no backups) |

## CI/CD

| Required | State |
|---|---|
| CI on every PR and push: typecheck, lint, tests, build, `npm audit --audit-level=high` | IMPLEMENTED (`.github/workflows/ci.yml`); **has never run** |
| Actions pinned to commit SHAs; `permissions: contents: read`; no secrets in CI | IMPLEMENTED |
| No automatic production deployment on push | IMPLEMENTED (`vercel.json` `deploymentEnabled.main: false`); effective once committed |
| Branch protection: required review and required CI on `main` | MISSING (unavailable on the free private plan) |
| Production promotion restricted to named Vercel team members | NOT VERIFIED |

## AI

| Required | State |
|---|---|
| Model and provider selected by server config only; key server-only | IMPLEMENTED |
| No provider approved for real talent data before a data-governance decision | Enforced by policy (docs); NARA cleared for fictional-data evaluation only |
| Bounds: 30 s deadline, 10 s per tool, 2,000 output tokens, 8 tool calls, 2 model calls, 16,000-char prompt | IMPLEMENTED |
| Per-user rate limit shared across instances | MISSING; per instance only (G3-07) |
| Kill switches: `AI_ASSISTANT_ENABLED`, `TOOL_EXECUTION_ENABLED`, `RAG_ENABLED`, `JARVIS_HANDOFF_ENABLED` | IMPLEMENTED, server-side, fail closed |
| Tool output fenced as data; instruction-like fields withheld; step 2 offered no tools | IMPLEMENTED |
| Empty or failed provider answer is an error, never a blank success | IMPLEMENTED |

## RAG

| Required | State |
|---|---|
| Retrieval filtered by RLS inside the vector scan | IMPLEMENTED; verified live (8/8) |
| Retrieval unavailable ⇒ explicit "not available" state, never an invented answer | IMPLEMENTED (`DataPoint` states; `RAG_ENABLED`) |

## Agents, tools, JARVIS

| Required | State |
|---|---|
| Closed registry; every tool documented; LOW-risk reads only wired | IMPLEMENTED (9 wired) |
| Consequential tool ⇒ approval token bound to tool + arguments + user; replay blocked | IMPLEMENTED (pipeline; no consequential tool wired) |
| JARVIS carries context, not commands; off unless enabled | IMPLEMENTED (default off, no transport) |
| Handoffs signed before a transport is registered | MISSING (AI Gate #2 AG-07) |

## Logging, monitoring, alerting

| Required | State |
|---|---|
| Structured, correlated, redacted logs; no prompt or answer text; no secrets | IMPLEMENTED |
| Audit log append-only for users (INSERT/UPDATE/DELETE/TRUNCATE revoked) | IMPLEMENTED |
| Log retention beyond the runtime, error tracking, alert routing to an owner | MISSING (docs/operations/MONITORING.md) |

## Backup and recovery

| Required | State |
|---|---|
| Automated backups + PITR on the production database | MISSING |
| Restore tested into a non-production project | NOT VERIFIED (never performed) |
| RPO / RTO agreed | NOT DEFINED |
