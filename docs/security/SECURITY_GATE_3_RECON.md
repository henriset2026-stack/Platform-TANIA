# Security Gate #3: Production Reconnaissance

**Date:** 2026-09-25 · **Commit inspected:** `8712b69` (main, before any Gate #3 change).
Read-only inspection. Nothing below was changed while it was recorded.

## Platform

| Item | Finding | Source |
|---|---|---|
| Framework | Next.js 16.3.5 (App Router, Turbopack), React, TypeScript 6.0.3 | `package.json` |
| Package manager | npm, lockfile committed | `package-lock.json` |
| Node | engines `>=20.9.0`; local runtime 24.19.0 | `package.json` |
| Build | `next build`, type errors fail the build | `next.config.mjs` |
| Middleware | `middleware.ts` → `lib/supabase/middleware.ts` (session refresh + sign-in gate) | |
| Instrumentation | `instrumentation.ts` logs every unhandled server error | |
| Docker | none | |
| `vercel.json` | **none** | |
| CI (`.github/workflows`) | **none** | |

## Deployment (Vercel)

Observed through the GitHub deployments API and read-only HTTP requests.

| Item | Finding |
|---|---|
| Integration | Vercel project `platform-tania`, team `chapter-dps`, connected to the GitHub repo. GitHub environments `Preview` and `Production` exist. |
| Trigger | **A push to `main` creates a Production deployment automatically.** The push of `8712b69` created one at 2026-09-25T03:57Z, with no review or approval step. |
| Deployments | 4 total. The **only successful Production deployment is `1982432`, the repository's initial commit** (2026-09-20, documents only). Both deployments of the application (`8712b69`, Production and Preview) **failed**; cause not visible (no Vercel CLI or log access). |
| Access | Every deployment URL tried returns 302 to `vercel.com/sso-api`: Vercel Deployment Protection is on. `platform-tania.vercel.app` returns 404. No custom domain found. |
| Environment variables | **Not visible.** Which Supabase project and keys Preview and Production would use is NOT VERIFIED. |

## Source control (GitHub)

| Item | Finding |
|---|---|
| Repo | `henriset2026-stack/Platform-TANIA`, **private, free plan** |
| Branch protection / rulesets | **Unavailable**: API returns 403 "Upgrade to GitHub Pro or make this repository public" |
| Branches | `main` only |
| Webhooks | none returned |
| History | 35 commits. No `.env.local` value appears anywhere in history; `.env.example` is the only env file ever committed. Key-shaped strings found are test fixtures (`sb_secret_AbCd…`, `sk-abcdefghijk…`, a PEM header), used by redaction tests. |

## Supabase

| Item | Finding |
|---|---|
| Projects | **One**: `hcyaqbgbwfxzutamceoq` (ap-southeast-1), used as staging. **No production project exists.** |
| Migrations | 30 SQL files, forward-only, applied to staging (history equal 30/30) |
| Backups | `supabase backups list`: `walg_enabled: true`, **`pitr_enabled: false`, `backups: []`** |
| Local config | `supabase/config.toml` (local stack only; `max_rows = 1000`) |
| SECURITY DEFINER | 21 functions across 11 migrations; **all set `search_path`** |
| Storage | No bucket or storage policy in any migration |
| Edge Functions | none |
| Auth configuration (remote) | NOT VERIFIED: not visible from the repository or CLI |

## Application surface

| Item | Finding |
|---|---|
| Route handlers | `POST /api/ai/chat`, `GET /auth/callback`, `POST /auth/signout` |
| Server actions | `signInWithEntra` (`app/(auth)/login/actions.ts`) |
| Pages | 23 (see API_SECURITY_INVENTORY.md) |
| Public routes | `/`, `/login`, `/auth/callback`, prefixes `/_next/`, `/favicon`, `/auth/`; everything else is private by default (`lib/auth/routes.ts`) |
| Uploads | none (no `type="file"`, `formData` upload or storage call) |
| Exports | none (no CSV/XLSX/PDF/Content-Disposition) |
| Raw HTML | no `dangerouslySetInnerHTML` anywhere |
| Outbound fetch | browser: only `/api/ai/chat`; server: model providers at the configured `AI_GATEWAY_URL` only. No user-supplied URL is fetched. |
| Cron / webhooks | none |
| JARVIS | contract, scope, redaction, handoff code; **no transport registered** |
| AI providers | adapters `gemini`, `openai-compatible` (NARA, evaluation only); `LLM_PROVIDER` selects |

## Security headers at `8712b69`

Set in `next.config.mjs`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, microphone, geolocation off)
- `Strict-Transport-Security` (2 years, preload)
- `poweredByHeader: false`

**No Content-Security-Policy** (Security Gate #1 H-1).

## Observability at `8712b69`

- **Implemented:**
  - structured JSON logs to stdout, with redaction at the sink
  - unhandled-error hook
  - `ai.gateway.*` events with correlation ids
  - `agent_runs` / `agent_tool_calls` persistence
  - `audit_logs`
- **Not implemented:** log shipping, error tracking, uptime checks, dashboards, alert routing.

## Dependencies

- `npm audit`: **0 vulnerabilities** at every severity.
- Dependencies with install scripts: `fsevents` (macOS-only, optional) and `unrs-resolver` (native-binary check).
- No `curl | sh`, remote script or dynamic install in `package.json` scripts.
