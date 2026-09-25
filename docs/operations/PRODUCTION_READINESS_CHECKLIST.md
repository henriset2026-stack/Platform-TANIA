# TANIA Production Readiness Checklist

**Security Gate #3, step 42.**

| Status | Meaning |
|---|---|
| PASS | Evidence exists and was checked. |
| FAIL | Required, but missing or broken. |
| NOT VERIFIED | May exist, but was not observable or never exercised. |
| NOT APPLICABLE | The surface does not exist. |

- **OWNER:** no operational owner has been named for TANIA, so every row reads NOT ASSIGNED. Naming owners is itself a readiness item (Ownership, below).
- **DATE:** every row was checked on 2026-09-25.

| Area | Item | Status | Owner | Evidence |
|---|---|---|---|---|
| APPLICATION | Production build succeeds (clean checkout, no `.env.local`) | PASS | NOT ASSIGNED | clean build in a scratch copy, with and without placeholder env |
| APPLICATION | Typecheck and lint pass | PASS | NOT ASSIGNED | `npm run typecheck`, `npm run lint` |
| APPLICATION | Hermetic tests pass | PASS | NOT ASSIGNED | `npm test` (see report §23) |
| APPLICATION | A deployed build runs on Vercel | FAIL | NOT ASSIGNED | both deployments of the application failed; cause not visible |
| DATABASE | Production database exists | FAIL | NOT ASSIGNED | one Supabase project only (staging) |
| DATABASE | Migrations version-controlled, forward-only, applied cleanly | PASS | NOT ASSIGNED | 30/30 local = staging |
| DATABASE | SECURITY DEFINER functions reviewed | PASS | NOT ASSIGNED | 21/21 pin `search_path`; RECON |
| AUTH | Entra ID sign-in configured in Supabase Auth | NOT VERIFIED | NOT ASSIGNED | code path exists; provider config not visible |
| AUTH | Session cookies HttpOnly / Secure / Lax | PASS (code) · NOT VERIFIED (browser) | NOT ASSIGNED | `lib/supabase/cookie-options.ts`, hardening tests |
| AUTH | Authorization enforced (RLS) | PASS | NOT ASSIGNED | RLS suite 106/106 on staging |
| AI | Provider approved for real data | FAIL | NOT ASSIGNED | none approved; NARA fictional-data only |
| AI | Cost bounds (tokens, steps, tool calls, deadline) | PASS | NOT ASSIGNED | `AI_LIMITS`; tests |
| AI | Provider failure is safe (timeout, 429, 5xx, malformed, empty) | PASS | NOT ASSIGNED | provider-error, adapter and empty-answer tests; live 503s handled |
| AI | Kill switches | PASS | NOT ASSIGNED | `lib/ai/switches.ts`; kill-switch tests |
| AI | Live model baseline | NOT VERIFIED | NOT ASSIGNED | 2 runs on a free-tier model; not a stable rate |
| RAG | Scoped retrieval | PASS | NOT ASSIGNED | rag-leakage 8/8 live |
| RAG | No embedding model or corpus configured | NOT APPLICABLE | NOT ASSIGNED | retrieval returns "not integrated" |
| AGENTS | Only documented LOW-risk read tools wired | PASS | NOT ASSIGNED | tool-registry test |
| TOOLS | Approval binding and replay protection | PASS | NOT ASSIGNED | AI Gate #2 evals |
| JARVIS | Handoff off by default; no transport | PASS | NOT ASSIGNED | kill switch + handoff tests |
| JARVIS | Handoff integrity signature | FAIL | NOT ASSIGNED | AI Gate #2 AG-07; must precede any transport |
| SECURITY | CSP | PASS | NOT ASSIGNED | browser-verified; hardening tests |
| SECURITY | No secrets in Git or bundle | PASS | NOT ASSIGNED | history scan 0; bundle scan 0 |
| SECURITY | Dependency audit | PASS | NOT ASSIGNED | `npm audit`: 0 |
| SECURITY | Distributed rate limiting | FAIL | NOT ASSIGNED | per-instance token bucket (G3-07) |
| SECURITY | Uploads / exports / SSRF surfaces | NOT APPLICABLE | NOT ASSIGNED | none exist (API inventory) |
| OBSERVABILITY | Structured, redacted, correlated logs | PASS | NOT ASSIGNED | logger + redact tests |
| OBSERVABILITY | Error tracking, log retention, dashboards | FAIL | NOT ASSIGNED | MONITORING.md |
| OBSERVABILITY | Alerting routed to an owner | FAIL | NOT ASSIGNED | defined only; nothing fires |
| BACKUP | Database backups / PITR | FAIL | NOT ASSIGNED | `backups: []`, `pitr_enabled: false` |
| BACKUP | Restore tested | NOT VERIFIED | NOT ASSIGNED | never performed |
| DR | RPO / RTO | NOT VERIFIED (NOT DEFINED) | NOT ASSIGNED | DISASTER_RECOVERY.md |
| DR | Scenarios documented | PASS (documentation only) | NOT ASSIGNED | DISASTER_RECOVERY.md |
| CI/CD | CI workflow | PASS | NOT ASSIGNED | run 36095487907 green on GitHub (`6da04fd`) |
| CI/CD | Branch protection / required review | FAIL | NOT ASSIGNED | unavailable on the free private plan |
| DEPLOYMENT | No automatic production deploy on push | PASS | NOT ASSIGNED | pushes of `192bbe3` and `6da04fd` created no deployment |
| DEPLOYMENT | Environment separation (prod vs preview credentials) | FAIL | NOT ASSIGNED | no production project; Vercel env not visible |
| DEPLOYMENT | Rollback exercised | NOT VERIFIED | NOT ASSIGNED | Vercel instant rollback never used |
| INCIDENT RESPONSE | Runbooks | PASS (documentation only) | NOT ASSIGNED | INCIDENT_RESPONSE.md |
| INCIDENT RESPONSE | Secret rotation exercised | NOT VERIFIED | NOT ASSIGNED | never performed |
| OWNERSHIP | Service owner, security owner, on-call named | FAIL | NOT ASSIGNED | none named |
| OWNERSHIP | Data retention policy | FAIL (NOT DEFINED) | NOT ASSIGNED | DISASTER_RECOVERY.md |
