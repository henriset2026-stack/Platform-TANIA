# TANIA Incident Response

Security Gate #3, steps 31 (incident response), 32 (secret exposure) and 33
(account compromise). State as of 2026-09-25.

> **No procedure in this document has been exercised.** Every lever is named as
> it exists in the code or platform; none has been rehearsed.

Detection depends on `docs/operations/MONITORING.md`: **no alert fires today**,
so every incident below is detected only by a person reading logs, `audit_logs`,
`agent_runs` or the Vercel dashboard, or by a report.

The database holds no real users and no production data; only a staging
Supabase project exists.

---

## 1. Roles

| Role | Responsibility | Assigned to |
|---|---|---|
| Incident commander | decides severity, containment, communication | NOT ASSIGNED |
| Technical lead | executes containment and recovery | NOT ASSIGNED |
| Vercel team member | promote / instant rollback, env changes, redeploy | NOT ASSIGNED (team `chapter-dps`) |
| Supabase project owner | Auth admin, keys, database | NOT ASSIGNED |
| Entra ID administrator | Entra accounts, `ENTRA_CLIENT_SECRET` | NOT ASSIGNED |
| Second person for membership changes | self-grant is blocked by the database | NOT ASSIGNED |
| Communications / data-protection contact | notification of affected people | NOT ASSIGNED |

Escalation path, channel and notification obligations: **NOT DEFINED**.

## 2. Severity levels (proposed, to be approved)

| Level | Meaning | Response target |
|---|---|---|
| SEV-1 | confirmed exposure of Sensitive/Restricted data, a secret, or an RLS bypass | NOT DEFINED |
| SEV-2 | suspected escalation or compromise; production unavailable | NOT DEFINED |
| SEV-3 | degraded feature (AI, RAG, tools); failed deployment | NOT DEFINED |
| SEV-4 | no user impact | NOT DEFINED |

## 3. Levers available

| Lever | Effect | How | Exercised |
|---|---|---|---|
| `AI_ASSISTANT_ENABLED=off` | gateway returns DISABLED/503 before any model call | Vercel env + redeploy | NOT VERIFIED |
| `TOOL_EXECUTION_ENABLED=off` | no tools offered or executed | Vercel env + redeploy | NOT VERIFIED |
| `RAG_ENABLED=off` | retrieval returns explicit unavailable state | Vercel env + redeploy | NOT VERIFIED |
| `JARVIS_HANDOFF_ENABLED` | default OFF; no JARVIS transport exists | — | — |
| Instant rollback / promote previous deployment | restores previous application version | Vercel dashboard | NOT VERIFIED |
| Revoke sessions / disable user | ends a user's access | Supabase dashboard / Auth admin API | NOT VERIFIED |
| Delete `organization_memberships` rows | removes all roles and scope | requires a second person | NOT VERIFIED |
| Rotate a secret | see §5 | per secret | NOT VERIFIED |
| Evidence | `audit_logs`, `agent_runs`, `agent_tool_calls`, `ai.gateway.*` logs joined by `correlationId` | Supabase / Vercel logs / `/audit` | — |

Kill switches are read per request and fail closed on unrecognised values, but a
changed Vercel env var takes effect only after a redeploy.

## 4. Incident classes

Every class ends with **REVIEW**: written post-incident review, root cause,
new regression test where possible, update this document. Owner: NOT ASSIGNED.

**SECURITY_BREACH** — unauthorised access to the system by any route.
- DETECT: report; manual review of `audit_logs`, `onRequestError` logs.
- CONTAIN: revoke sessions of involved accounts; remove memberships; `AI_ASSISTANT_ENABLED=off` if AI is involved; rotate any touched secret (§5).
- INVESTIGATE: `audit_logs` by actor and time; `agent_runs`/`agent_tool_calls` by `correlationId`.
- ERADICATE: close the entry point with a code fix or new forward migration.
- RECOVER: redeploy; re-enable switches one at a time.

**DATA_LEAK** — data reached someone outside its scope.
- DETECT: report. Changes and AI tool calls (reads included) are in `audit_logs`. Direct page and database reads are not audited, because Postgres triggers cannot fire on SELECT, so a leak through ordinary browsing is not visible there.
- CONTAIN: disable the leaking route or feature (rollback or kill switch).
- INVESTIGATE: identify rows, subjects and recipients; test the path with `tests/rls`.
- ERADICATE: fix the policy or route; add a negative RLS test.
- RECOVER: redeploy; notification obligations NOT DEFINED.

**ACCOUNT_COMPROMISE** — see §6.

**PRIVILEGE_ESCALATION** — a user gained a role, scope or decision they should not have.
- DETECT: membership/role change in `audit_logs`; denial patterns in `agent_tool_calls`.
- CONTAIN: delete the improper `organization_memberships` rows (second person); revoke the user's sessions.
- INVESTIGATE: who granted it (`audit_logs`), which decisions were made under it (decision fields in `SECURITY_MODEL.md` §5).
- ERADICATE: forward migration closing the path.
- RECOVER: reverse improper decisions through the normal approval flow.

**SECRET_EXPOSURE** — see §5.

**AI_DATA_LEAK** — the assistant disclosed data outside the caller's scope.
- DETECT: report; `output_guard`, `tool_result_withheld` events.
- CONTAIN: `AI_ASSISTANT_ENABLED=off`, or `RAG_ENABLED=off` if retrieval is the path.
- INVESTIGATE: `agent_runs`, `agent_tool_calls` (`authorization_decision`) by `correlationId`; logs hold no prompt or answer text.
- ERADICATE: fix tool scope or RAG ACL; add a case to `tests/rls/rag-leakage.rls.test.ts` or `tests/ai`.
- RECOVER: redeploy; re-enable.

**PROMPT_INJECTION** — content steered the model toward unintended tool use or disclosure.
- DETECT: `step2_tool_calls_ignored`, `tool.denied`, `output_guard` events.
- CONTAIN: `TOOL_EXECUTION_ENABLED=off`; `RAG_ENABLED=off` if the payload came from a document.
- INVESTIGATE: identify the source document or input; confirm no tool executed outside authorization.
- ERADICATE: remove or re-scope the document (deletion propagates to chunks); harden prompts (in code).
- RECOVER: redeploy; re-enable.

**TOOL_ABUSE** — a user drives tools to extract or change data.
- DETECT: `tool.denied` / `tool.failed` volume in `agent_tool_calls`.
- CONTAIN: `TOOL_EXECUTION_ENABLED=off`; revoke the user's sessions.
- INVESTIGATE: `agent_tool_calls` and `audit_logs` for the user.
- ERADICATE: tighten the tool's schema or permissions (`docs/ai/AI_TOOL_REGISTRY.md`).
- RECOVER: redeploy; re-enable.

**RLS_BYPASS** — a row was read or written that RLS should have refused.
- DETECT: report; failing `tests/rls` run.
- CONTAIN: disable the route or feature; if the service-role key is involved, rotate it (§5).
- INVESTIGATE: reproduce as a test against staging; find the policy or definer function.
- ERADICATE: forward migration; the new test must fail before and pass after.
- RECOVER: run full `npm run test:rls` before redeploying.

**PRODUCTION_OUTAGE** — the application is unavailable.
- DETECT: report (no uptime check exists).
- CONTAIN: Vercel instant rollback to the previous deployment.
- INVESTIGATE: Vercel build and runtime logs; `onRequestError`.
- ERADICATE: fix and pass CI (`npm run verify`, `npm run build`).
- RECOVER: deliberate promotion (`vercel.json` disables automatic production deploys from `main` once committed).

**DATABASE_CORRUPTION** — data wrong or lost.
- DETECT: report; database errors in logs.
- CONTAIN: stop writes by disabling the affected feature; `TOOL_EXECUTION_ENABLED=off`.
- INVESTIGATE: `audit_logs` to reconstruct changes.
- ERADICATE / RECOVER: **no backup is listed and PITR is disabled**; restore is not possible today. See `docs/operations/DISASTER_RECOVERY.md`.

## 5. Secret exposure runbook (step 32)

1. **Identify the secret.** Name it by variable name, never by value, and note where it was exposed: commit, log, chat, screenshot or machine. A server-only secret is SEV-1.
2. **Disable or rotate it** at the issuer first (table below). Deleting the text does not un-expose it. Update every location that holds it: `.env.local`, Vercel env, Supabase Auth settings.
3. **Determine the exposure window**, from the earliest possible exposure to revocation.
4. **Inspect logs** for use during the window: `audit_logs`, `agent_runs`, provider usage (AI key), Supabase logs.
5. **Identify affected systems**: whatever the secret could reach (table, "Dependencies").
6. **Revoke sessions or tokens if necessary.** A leaked Supabase key does not invalidate user sessions; revoke them in Supabase Auth if a session or JWT secret was involved.
7. **Deploy the fix.** Redeploy so the application reads the new value. If the secret was committed, rewrite history *after* rotating, never instead of it.
8. **Verify** that the old value is refused and that the application works with the new one.
9. **Document the incident**: timeline, window, root cause, prevention. Never put the secret itself in the record.

No secret has ever been committed (full history scanned 2026-09-25). **No rotation has ever been exercised**, so every rotation method below is NOT VERIFIED.

| Secret | Owner | Location | Rotation method | Dependencies | Expected downtime |
|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | NOT ASSIGNED | `.env.local` on trusted machines only; never in Vercel | new key in Supabase project API settings, revoke old | `tests/rls` fixtures, maintenance scripts | none for the application (not used at runtime) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | NOT ASSIGNED | `.env.local`, Vercel env (NOT VERIFIED) | new publishable key in Supabase, revoke old | browser and server clients; inlined at build | rebuild and redeploy required; downtime NOT VERIFIED |
| `NEXT_PUBLIC_SUPABASE_URL` | — | as above | not a secret | — | — |
| `AI_GATEWAY_KEY` | NOT ASSIGNED | `.env.local`, Vercel env (NOT VERIFIED) | revoke and reissue at the LLM provider | AI gateway | AI unavailable until redeploy |
| `ENTRA_CLIENT_SECRET` | NOT ASSIGNED | Entra ID app registration; Supabase Auth provider config | new client secret in Entra, update Supabase Auth, delete old | login | login may fail between the two steps; NOT VERIFIED |
| `ENTRA_CLIENT_ID`, `ENTRA_TENANT_ID` | — | Supabase Auth | identifiers, not secrets | — | — |
| `JARVIS_API_KEY` (`JARVIS_API_URL`) | NOT ASSIGNED | not read by any code | revoke at issuer, if issued | none | none |

## 6. Account compromise (step 33)

| Capability | How | Exercised |
|---|---|---|
| Disable account | Supabase dashboard / Auth admin API | NOT VERIFIED |
| Revoke sessions | Supabase dashboard / Auth admin API | NOT VERIFIED |
| Revoke tokens | session revocation ends refresh; issued access tokens remain valid until expiry (expiry configuration NOT VERIFIED) | NOT VERIFIED |
| Reset credentials | Entra ID (identity provider); TANIA holds no passwords | NOT VERIFIED; Entra administrator NOT ASSIGNED |
| Remove authorization | delete the user's `organization_memberships` rows (second person) | NOT VERIFIED |
| Review audit trail | `audit_logs` by actor and time (`/audit` for `ai.view_audit` holders) | NOT VERIFIED |
| Identify affected resources | `audit_logs`: row changes and decisions made by the actor, plus every AI tool call (reads included) | NOT VERIFIED. Direct page and database reads are not audited, because Postgres triggers cannot fire on SELECT. What a compromised session *viewed* outside the assistant cannot be reconstructed from `audit_logs` |
| Investigate AI activity | `agent_runs` for the user; `ai.gateway.*` logs by `correlationId` (no prompt/answer text) | NOT VERIFIED |
| Identify tool calls | `agent_tool_calls` with `authorization_decision`; AI tool-call events in `audit_logs` | NOT VERIFIED |

Order: disable account → revoke sessions → remove memberships → reset at Entra →
investigate → reverse improper decisions through normal approval flows.
Investigator access to Restricted data (private AI conversations) is NOT DEFINED.
