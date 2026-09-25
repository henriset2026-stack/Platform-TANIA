# SECURITY GATE #3

**Production security and operational readiness · 2026-09-25**

**Baseline:** `8712b69` on `main`, plus uncommitted changes from this gate. Security Gate #1 and AI Gate #2 are both PASS WITH CONDITIONS; their open conditions are carried here where they matter for production.

## 1. Executive Summary

**Status: FAIL**

TANIA is **not ready for production or an enterprise pilot**, and this gate does not recommend deploying it.

The reason is not the application's security controls. Authorization, RLS, the AI gateway, and the new CSP and kill switches are implemented and tested. The failure is that the operational platform around them does not exist yet:

- **No production database.** One Supabase project exists, used as staging. **No backups are listed and PITR is off.** A restore has never been tested.
- **The application has never run on Vercel.** Both deployments of it failed, with the cause not visible from here. The only successful "Production" deployment is the initial documents-only commit.
- **Nothing monitors or alerts.** Logs go to stdout, and there is no error tracking, alert routing or named owner.
- **No operational ownership.** No service owner, security owner or on-call is named. RPO, RTO and retention are NOT DEFINED.

This gate fixed six findings in the repository, all tested:

- **Automatic production deployment on push** is turned off.
- **CSP (H-1)** is added and browser-verified.
- **CI** is added, pinned and read-only.
- **HttpOnly session cookies** are set.
- **The middleware no longer fails open.**
- **Server-side AI kill switches** exist.

## 2. Scope

The full path was reviewed:

browser → Next.js → middleware and auth → route handlers and actions → AI gateway, tools, RAG and JARVIS → Supabase → Vercel and GitHub → observability → operations.

- **Evidence method:** the repository, the GitHub API, the Supabase CLI, read-only HTTP requests to deployment URLs, local production builds and servers, a real browser, and the RLS and e2e suites against staging.
- **Nothing was run against production** (none exists).
- **Nothing destructive was run anywhere.**

Reconnaissance: [SECURITY_GATE_3_RECON.md](SECURITY_GATE_3_RECON.md).

## 3. Environment Security

| Environment | State |
|---|---|
| Local | `.env.local` (gitignored). It holds the staging service key for `tests/rls` only |
| Test | Hermetic suites need no credentials. RLS and e2e run against **staging** |
| Staging / Preview | One Supabase project. Vercel Preview is SSO-protected. Which env vars Preview uses is **NOT VERIFIED** |
| Production | **No Supabase project.** Vercel "Production" serves the initial commit behind SSO. Its env vars are **NOT VERIFIED** |

Separation of production credentials from preview and test **cannot exist yet**: there are no production credentials. Crossover, such as Preview reaching a production database, is therefore not possible today. It becomes the first thing to verify once a production project exists (G3-11).

## 4. Secrets

**Repository and bundle, all verified:**

- Full history: 35 commits scanned, **0** `.env.local` values found. `.env.example` is the only env file ever committed.
- Key-shaped strings in history are redaction-test fixtures.
- Client bundle: 0 hits for the service role, `sb_secret_`, `AI_GATEWAY_KEY`, provider hosts, `DATABASE_URL` and the switch internals.
- Only the Supabase URL and publishable key may be `NEXT_PUBLIC_*`, enforced by lint and a contract test.

**Not verified:**

- whether `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel
- the Supabase Auth and Entra secret configuration

**Rotation readiness:** documented per secret in [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) §5 (secret, owner, location, method, dependencies, downtime). Rotation needs no redesign: every secret is read from the environment. **No rotation has been exercised.**

**Session note:** in an earlier session, the NARA key was sent once to Google's endpoint by mistake, which rejected it. Rotating that key is recommended.

## 5. CI/CD

| Control | State |
|---|---|
| CI on PR and push | **Added** (`.github/workflows/ci.yml`): `npm ci`, `npm audit --audit-level=high`, typecheck, lint, tests, build. **Never run on GitHub** |
| CI permissions and supply chain | `permissions: contents: read`, `persist-credentials: false`, actions pinned to commit SHAs, no secrets |
| Production deployment on push | **Was automatic; now off** (`vercel.json` `git.deploymentEnabled.main: false`). Production is promoted deliberately (DEPLOYMENT.md §2). Takes effect once committed |
| Branch protection, required review, required checks | **Unavailable**: GitHub 403 on the free private plan |
| Vercel who-may-promote | **NOT VERIFIED** |

## 6. Dependency Security

- `npm audit`: **0** vulnerabilities (critical, high, moderate and low all 0).
- Lockfile committed.
- Install scripts: `fsevents` (macOS-only) and `unrs-resolver` (native-binary check), both reviewed.
- No `curl | sh`, remote script or dynamic install.
- Automated dependency alerts (Dependabot or GitHub security features) are **NOT VERIFIED**.
- No major upgrade was made. The pins recorded in CLAUDE.md (TypeScript 6, ESLint 9) stand.

## 7. Application Security

- **Middleware:**
  - session refresh through `getUser()`
  - deny-by-default routes
  - 401 JSON for API paths
  - **now returns 503 in production if Supabase configuration is missing**, where it used to skip the sign-in gate (G3-09)
- **Cookies:** `@supabase/ssr` 0.12.7 defaults to `httpOnly: false`. They are **now HttpOnly, SameSite=Lax, and Secure in production** (G3-10). This is safe because no browser Supabase client is in use. The browser sign-in round trip is **NOT VERIFIED**: staging has no users.
- **Redirects:** `/auth/callback` accepts only local paths and prefixes the origin.
- **CSRF:** only POST mutates; cookies are SameSite=Lax; server actions carry Next.js origin checks.
- **Headers:** HSTS (2 years, preload), `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, no `X-Powered-By`.
- **CSP (H-1, closed):**
  - A per-request nonce, `'strict-dynamic'`, and no inline script or eval in production.
  - `frame-ancestors`, `object-src`, `base-uri`, `form-action` and `connect-src` are all locked down.
  - Exception: `style-src 'unsafe-inline'`, because React style attributes need it. Documented in `lib/security/csp.ts`.
  - Every page now renders per request, which is required for nonces.
  - **Browser-verified against `next start`:** the login form hydrates; an injected `<img onerror>` was blocked (`script-src-attr` violation); scripts load only from self.
- **XSS:**
  - No `dangerouslySetInnerHTML` anywhere.
  - AI answers render as text.
  - RAG text reaches the model fenced as data, never HTML.

## 8. API Security

Full table: [API_SECURITY_INVENTORY.md](API_SECURITY_INVENTORY.md).

- **Endpoints:** 3 route handlers, 1 server action, 23 pages.
- **Absent by design:** debug, health, export, upload, SQL and URL-fetch endpoints.
- **SSRF (step 25):** NOT APPLICABLE.
- **Export (step 26):** NOT APPLICABLE.

## 9. Database Security

- **Migrations:** 30, forward-only, version-controlled, and equal between local and staging.
- **RLS:** enabled on all 52 tables.
- **anon:** revoked everywhere (verified live).
- **Arbitrary SQL:** none is reachable by a client or the AI. The tool registry refuses `sql` and `execute`, and no tool accepts SQL.

## 10. Supabase Security

- **SECURITY DEFINER:** **21 functions reviewed; all pin `search_path`.** None takes a caller-supplied identity; the aggregates take no parameters.
- **Not present:** Edge Functions and storage.
- **Remote configuration:** Auth, rate limits and email settings are **NOT VERIFIED**; they are not visible.

## 11. Storage Security

No bucket, storage policy or upload path exists. Step 12 is **NOT APPLICABLE**. The baseline lists what adding one requires.

## 12. AI Security

These are carried from AI Gate #2 and still hold:

- approval bound to the tool, arguments and user
- replay protection
- argument scope
- output guard
- at most 2 model calls, 8 tool calls, a 30 s deadline and 2,000 output tokens
- fixed provider-error messages
- empty answers fail (L16)
- instruction-like tool fields withheld (L11)

**New in this gate: kill switches** (`lib/ai/switches.ts`).

- **The switches:** `AI_ASSISTANT_ENABLED`, `TOOL_EXECUTION_ENABLED`, `RAG_ENABLED` and `JARVIS_HANDOFF_ENABLED`.
- **Behaviour:** server-side, read per request, and fail closed: any unrecognised value means off. The assistant switch refuses with `DISABLED` (503) before any model call. The tools switch offers and runs no tools. JARVIS is off by default.
- **Changing one:** a Vercel env change needs a redeploy.

**Provider failure (step 19)** is tested:

- timeout → `TIMEOUT`
- 429 → `RATE_LIMITED`
- 5xx → `PROVIDER_ERROR`
- malformed response or filtered answer → `PROVIDER_ERROR`
- empty answer → failure (L16)
- no endpoint → `NOT_CONFIGURED`

The provider-failure behaviour holds across the board:

- There is no automatic provider fallback or switching.
- The gateway itself never retries. Only the evaluation harness does.
- The run is closed as `failed` and recorded.
- The model's text is never echoed.

Live: 15/15 Google 503s were contained.

**Cost:** there is a per-user rate limit. **It is in memory, per instance (G3-07).** No token-cost metering or cost alert exists.

**No provider is approved for real talent data.** NARA is cleared for fictional-data evaluation only.

## 13. RAG Security

- **Retrieval:** RLS applies during the vector scan (8/8 verified live).
- **Failure states:** "not connected", "not integrated" and "failed" are explicit `DataPoint` states, and `RAG_ENABLED=false` is one of them. None fabricates an answer.
- **Current state:** no embedding model and no corpus are configured, so retrieval is inert.

## 14. Agent Security

- Nine LOW-risk read tools are wired, and the registry document is held equal to the code by a test.
- The assistant is the only routed agent.
- Agent recursion is impossible by construction.

## 15. JARVIS Security

- Handoffs carry context, not commands, within a scope ceiling.
- There is no transport, and handoff is **now off by default** (tested: an unset, `false` or misspelt switch all refuse, and nothing is sent).
- **Open (carried, AG-07):** handoffs must be signed before any transport is registered.
- **JARVIS failure (step 21)** is tested in `tests/unit/jarvis-handoff.test.ts`: timeout, thrown transport, rejection, unauthenticated caller and switch-off. None executes anything.

## 16. Monitoring

Details: [MONITORING.md](../operations/MONITORING.md).

- **Implemented:**
  - redacted structured logs
  - the unhandled-error hook
  - `ai.gateway.*` events
  - `agent_runs` and `agent_tool_calls`
  - `audit_logs`
  - `/audit`
- **NOT IMPLEMENTED:**
  - log retention beyond the runtime
  - error tracking
  - uptime checks
  - dashboards

Rule 14 applies: nothing here proves that an incident would be detected.

## 17. Alerting

Ten alert conditions are defined in MONITORING.md, with proposed thresholds. **None is implemented, and none has an owner or channel.** No alert fires anywhere today.

## 18. Backup

| Backup | State |
|---|---|
| Database | `backups: []`, **`pitr_enabled: false`** (staging, free tier). No production database |
| Storage | N/A |
| Configuration | Git (yes). Vercel env: NOT VERIFIED |

- **RPO:** **NOT DEFINED**
- **RTO:** **NOT DEFINED**
- **Restore test:** **NOT VERIFIED**; never performed

Details: [DISASTER_RECOVERY.md](../operations/DISASTER_RECOVERY.md).

## 19. Disaster Recovery

Ten scenarios are documented. **No failover exists for any of them.** The only degraded modes are:

- the kill switches
- `DataPoint` "not connected" states

Every owner is NOT ASSIGNED.

## 20. Incident Response

[INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) covers:

- 11 incident classes, each through detect, contain, investigate, eradicate, recover and review
- the 9-step secret-exposure runbook, with a rotation table
- an account-compromise checklist

**None of these procedures has been exercised.** Page and database reads are not audited, because triggers cannot fire on SELECT. So what a compromised session viewed outside the assistant cannot be reconstructed.

## 21. Rollback

| What | How | State |
|---|---|---|
| Application | Vercel Instant Rollback or promotion | NOT VERIFIED |
| Database | Forward-fix only: no down-migrations, and no backup to fall back on | Documented |
| Configuration and flags | Env change plus redeploy | Kill switches tested in code |
| Prompts | Live in code, so they roll back with the application | — |
| Model | `LLM_MODEL` env plus redeploy | — |

## 22. Data Retention

**NOT DEFINED for every category.** No owner is named and no deletion job exists.

The deletion behaviour that exists:

- evidence is soft-deleted, with `DELETE` revoked
- document deletion propagates to its chunks, and deleted documents are never retrieved (verified)
- the audit log is append-only for users

## 23. Testing

| Suite | Result |
|---|---|
| Typecheck, lint | pass |
| Hermetic (unit, integration, security, AI) | **964/964** (50 files). New: CSP 5, session cookies 2, kill switches 14, JARVIS switch 1 |
| RLS, live staging | **106/106** |
| E2E against `next start`, with CSP on | **18/18**, run twice: after the CSP change and after the cookie change |
| Browser (Chrome) | CSP enforced (inline handler blocked); login form hydrates |
| Production build | pass, local and in a clean scratch checkout, with and without Supabase env |
| `npm audit` | 0 |
| Bundle scan | 0 secrets |
| Git history secret scan | 0 |

**Not run:**

- **Load and stress tests (step 38):** there is no production-like environment to load.
- **Latency (step 37):** there is no deployed target. Local observations: the live-model evaluation measured p50 18 s for an assistant request with two model calls on a free-tier model.
- **The CI workflow on GitHub.**
- **The Vercel build.**

## 24. Findings

| ID | Severity | Finding | Evidence | Fix | Status |
|----|----------|---------|----------|-----|--------|
| G3-01 | HIGH | A push to `main` deployed to Vercel Production with no review or approval | GitHub deployments API: `8712b69` Production at 03:57Z after push | `vercel.json` disables auto-deploy of `main`; promotion documented | **Fixed (config); takes effect when committed** |
| G3-02 | MEDIUM | No branch protection, required review or required checks | GitHub API 403 (free private plan) | — (plan change, or org move) | **Open.** Residual after G3-01: unreviewed code can reach `main` but not production |
| G3-03 | HIGH | No Content-Security-Policy (Security Gate #1 H-1) | `next.config.mjs` | Nonce CSP via middleware; dynamic rendering | **Fixed, browser-verified** |
| G3-04 | HIGH | No CI | no `.github/workflows` | `ci.yml`: SHA-pinned, read-only, audit, typecheck, lint, test, build | **Fixed; NOT VERIFIED on GitHub** |
| G3-05 | HIGH | No production database; no backups; PITR off; restore never tested | `supabase backups list` | — | **Open** |
| G3-06 | HIGH | No monitoring, error tracking, alerting or owners | MONITORING.md | — | **Open** |
| G3-07 | MEDIUM | AI rate limit is in memory per instance; only the AI endpoint is limited | `lib/ai/rate-limit.ts` | — (needs a shared store) | **Open** |
| G3-08 | HIGH | Every Vercel deployment of the application failed; cause unknown | GitHub deployment statuses | — (needs Vercel logs). Local clean builds pass, with and without env | **Open** |
| G3-09 | LOW | Middleware skipped the sign-in gate when Supabase config was missing | `lib/supabase/middleware.ts` | 503 in production | **Fixed** |
| G3-10 | MEDIUM | Session cookies readable by JavaScript (`httpOnly: false` default) | `@supabase/ssr` constants | HttpOnly, Lax, Secure in production | **Fixed; browser sign-in NOT VERIFIED** |
| G3-11 | MEDIUM | Vercel env vars and Supabase Auth config not visible; environment separation unverifiable | — | — | **Open (NOT VERIFIED)** |
| G3-12 | MEDIUM | No AI kill switch | code search | `lib/ai/switches.ts`, enforced in gateway, RAG and JARVIS | **Fixed, tested** |
| G3-13 | MEDIUM | RPO, RTO and retention NOT DEFINED; no service or security owner | — | — | **Open** |
| G3-14 | LOW | Direct page and database reads are not audited | triggers cannot fire on SELECT | — (would need read logging) | **Open, accepted as documented** |
| G3-15 | INFO | Positives: `npm audit` 0; 21/21 definer functions pin `search_path`; no upload, export, SSRF or debug surface | RECON | — | — |

Carried from earlier gates:

- **AG-07** (MEDIUM, latent): JARVIS handoffs are unsigned.
- **NARA** is evaluation only, pending a data-governance decision.
- **Security Gate #1 R-4:** chapter-lead access to private AI conversations is undecided.

## 25. NOT VERIFIED Items

- Vercel environment variables (Preview and Production), including whether the service role is absent
- the cause of the Vercel build failures
- who may promote to Production in Vercel
- Supabase Auth, Entra ID provider and rate-limit configuration
- the full browser sign-in round trip, and the HttpOnly cookie in a real session
- the CI workflow running on GitHub
- application rollback (Vercel Instant Rollback)
- database restore
- secret rotation
- account disable and session revocation
- Dependabot or GitHub security alerts
- load, stress and production latency
- a live model on a reliable tier (two free-tier runs only)

## 26. Remaining Risks

1. **Data loss.** A future production database has no backup strategy until PITR and backups are enabled and a restore is rehearsed.
2. **Undetected incidents.** Nothing alerts, and nobody is on call.
3. **Unreviewed code on `main`.** There's no branch protection. Production is still gated by promotion once `vercel.json` is committed.
4. **Abuse across instances.** The AI rate limit is per instance.
5. **Detector-evading injection.** It can colour an answer, though not cause an action.
6. **Undecided data governance.** No model or provider is approved for real talent data.

## 27. Files Changed

**New:**

- `lib/security/csp.ts`
- `lib/ai/switches.ts`
- `lib/supabase/cookie-options.ts`
- `.github/workflows/ci.yml`
- `vercel.json`
- `tests/ai/kill-switch.ai.test.ts`

**Modified:**

- `lib/supabase/middleware.ts`: CSP, 503 when not configured, cookie options
- `lib/supabase/server.ts`: cookie options
- `app/layout.tsx`: per-request rendering
- `next.config.mjs`: comment only
- `lib/ai/gateway.ts`: switches and the `DISABLED` code
- `app/api/ai/chat/route.ts`: `DISABLED` → 503
- `lib/rag/retrieval.ts`: `RAG_ENABLED`
- `lib/jarvis/contract.ts`, `lib/jarvis/handoff.ts`: `DISABLED`, off by default
- `.env.example`, `tests/unit/env-contract.test.ts`: switch variables
- `tests/security/hardening.security.test.ts`: CSP and cookies
- `tests/unit/jarvis-handoff.test.ts`: switch

**Docs:**

- `docs/security/SECURITY_GATE_3_RECON.md`
- `docs/security/API_SECURITY_INVENTORY.md`
- `docs/security/PRODUCTION_SECURITY_BASELINE.md`
- `docs/security/INCIDENT_RESPONSE.md`
- `docs/security/THREAT_MODEL.md` (T20 closed; P1–P20 added)
- `docs/security/SECURITY_GATE_3_REPORT.md`
- `docs/operations/MONITORING.md`
- `docs/operations/DISASTER_RECOVERY.md`
- `docs/operations/PRODUCTION_READINESS_CHECKLIST.md`
- `docs/DEPLOYMENT.md`
- `CLAUDE.md`

## 28. Migrations Changed

None.

## 29. Deployment Configuration Changed

- `vercel.json`: `git.deploymentEnabled.main: false`.
- `.github/workflows/ci.yml`: new.

Both are **uncommitted**. Until `vercel.json` is committed, a push to `main` still deploys to Production.

## 30. Final Gate Decision

**SECURITY GATE #3: FAIL.** Production and enterprise-pilot deployment are **not recommended**.

The pass criteria that fail:

- environment separation verified
- production deployment controlled (pending commit)
- backup exists
- monitoring exists
- alerting exists
- production-like testing passes
- no HIGH findings: G3-05, G3-06 and G3-08 are open
- all MEDIUM risks have owners: no owners exist

The in-repository security controls this gate examined are implemented and tested. What remains is platform and ownership work that needs decisions and access outside the repository. It is listed in the recommended next steps in the final summary.
