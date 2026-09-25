# TANIA Monitoring and Security Alerting

Security Gate #3, steps 29 (monitoring) and 30 (security alerting). State as of
2026-09-25.

> **No alert fires anywhere today.** Signals are written to logs and tables;
> nothing reads them automatically, nobody is paged, and no on-call exists.

Status vocabulary: **IMPLEMENTED** (code exists and writes the signal),
**NOT IMPLEMENTED** (does not exist), **NOT VERIFIED** (exists, never exercised
where it matters), **NOT DEFINED**, **NOT ASSIGNED**, **N/A** (the feature does
not exist in the application).

Environment: one Supabase project (`hcyaqbgbwfxzutamceoq`, staging). No
production Supabase project exists. No application deployment on Vercel has
succeeded (see `docs/operations/DISASTER_RECOVERY.md`), so no signal below has
been observed in a deployed environment.

---

## 1. What is observable today

| Signal | Source | Where it lands | Status |
|---|---|---|---|
| Structured application logs (JSON, level via `LOG_LEVEL`) | `lib/observability/logger.ts` | stdout/stderr → Vercel runtime logs | IMPLEMENTED; in Vercel NOT VERIFIED |
| Credential redaction at the log sink (JWTs, `sb_secret_`, `sk-` keys, bearer tokens, PEM blocks) | `lib/observability/redact.ts` | applied before write | IMPLEMENTED |
| Unhandled server errors (digest, path without query, route type) | `instrumentation.ts` `onRequestError` | logs | IMPLEMENTED |
| AI gateway events `ai.gateway.*` with `correlationId` | AI gateway | logs | IMPLEMENTED |
| Agent runs and tool calls, with `authorization_decision` per call | `lib/observability/recorder.ts` | `agent_runs`, `agent_tool_calls` | IMPLEMENTED |
| AI tool-call audit events | tool pipeline | `audit_logs` | IMPLEMENTED |
| Data changes on audited tables (incl. roles/memberships) | audit triggers, `record_audit_event` | `audit_logs` | IMPLEMENTED |
| Run / tool / latency summaries | `lib/observability/metrics.ts` (computed from recorded runs) | on request | IMPLEMENTED |
| Audit viewer | `/audit` page, holders of `ai.view_audit` | UI | IMPLEMENTED |
| Deployment status | Vercel project `platform-tania` | Vercel dashboard | exists; notification NOT IMPLEMENTED |
| CI results | `.github/workflows/ci.yml` | GitHub Actions | NOT VERIFIED (never run) |
| Log shipping / retention outside Vercel runtime logs | — | — | NOT IMPLEMENTED |
| Error tracking service | — | — | NOT IMPLEMENTED |
| Uptime checks | — | — | NOT IMPLEMENTED |
| Dashboards | — | — | NOT IMPLEMENTED |
| Alert routing, on-call, paging | — | — | NOT IMPLEMENTED |

Logs never contain prompt or answer text.

`ai.gateway.*` events: `provider_error`, `disabled`, `empty_answer`,
`tool_result_withheld`, `step2_tool_calls_ignored`, `output_guard`,
`tool.authorized`, `tool.completed`, `tool.failed`, `tool.denied`,
`run_unrecorded`.

## 2. Required monitors (step 29)

| Monitor | Signal available | Automated monitor | Status |
|---|---|---|---|
| Application errors | `onRequestError` log lines | none | signal IMPLEMENTED; monitor NOT IMPLEMENTED |
| API errors | `onRequestError`; `ai.gateway.*` for `/api/ai/chat` | none | signal IMPLEMENTED; monitor NOT IMPLEMENTED |
| Authentication failures | no application-side signal; Supabase Auth side NOT VERIFIED | none | NOT IMPLEMENTED |
| Authorization denials | `ai.gateway.tool.denied`; `agent_tool_calls.authorization_decision` | none | signal IMPLEMENTED for AI tools only; monitor NOT IMPLEMENTED |
| RLS violations (SQLSTATE `42501`) | only if the error reaches `onRequestError`; no dedicated count | none | NOT IMPLEMENTED |
| AI failures | `provider_error`, `empty_answer`, `output_guard`, `disabled`, `run_unrecorded` | none | signal IMPLEMENTED; monitor NOT IMPLEMENTED |
| Tool failures | `tool.failed`; `agent_tool_calls` | none | signal IMPLEMENTED; monitor NOT IMPLEMENTED |
| High latency | `metrics.ts` latency summary (AI runs only) | none | partial signal; monitor NOT IMPLEMENTED |
| Database errors | only via `onRequestError` | none | NOT IMPLEMENTED |
| Storage failures | — | — | N/A (no storage, no file uploads) |
| Deployment failures | Vercel deployment status | none | notification NOT IMPLEMENTED |
| Unusual export activity | — | — | N/A (no exports) |
| Unusual AI usage | `agent_runs`, `metrics.ts`; rate limiter rejections | none | NOT IMPLEMENTED |

Rate limiting on `POST /api/ai/chat` (token bucket, capacity 12, refill 0.1/s)
is **in memory per server instance** and not shared across Vercel instances.
It limits; it does not report.

## 3. Security alert definitions (step 30)

OWNER and CHANNEL are **NOT ASSIGNED** for every row: no team, channel or pager
exists. Thresholds are **proposed, to be tuned** — none is configured anywhere.

| Trigger | Severity (proposed) | Owner | Channel | Response | Status |
|---|---|---|---|---|---|
| Multiple auth failures for one account or source (proposed: ≥ 10 in 10 min) | SEV-3 | NOT ASSIGNED | NOT ASSIGNED | `INCIDENT_RESPONSE.md` → ACCOUNT_COMPROMISE | defined, NOT IMPLEMENTED (no auth-failure signal) |
| Authorization denial spike (`tool.denied`, `42501`) (proposed: ≥ 20 per user in 10 min) | SEV-2 | NOT ASSIGNED | NOT ASSIGNED | PRIVILEGE_ESCALATION / TOOL_ABUSE | defined, NOT IMPLEMENTED |
| Unexpected admin activity: role or `organization_memberships` change in `audit_logs` outside an agreed change (proposed: every event reviewed) | SEV-2 | NOT ASSIGNED | NOT ASSIGNED | PRIVILEGE_ESCALATION | defined, NOT IMPLEMENTED (audit rows exist; manual review via `/audit`) |
| Unusual bulk export | — | NOT ASSIGNED | NOT ASSIGNED | — | N/A (no exports) |
| Service-role misuse (service-role key used outside `tests/rls` fixtures or maintenance) | SEV-1 | NOT ASSIGNED | NOT ASSIGNED | SECRET_EXPOSURE | defined, NOT IMPLEMENTED; detection mechanism NOT DEFINED |
| AI tool failure spike (`tool.failed`) (proposed: > 25 % of calls in 15 min) | SEV-3 | NOT ASSIGNED | NOT ASSIGNED | TOOL_ABUSE; `TOOL_EXECUTION_ENABLED=off` | defined, NOT IMPLEMENTED |
| Agent recursion | — | NOT ASSIGNED | NOT ASSIGNED | — | bounded by construction: at most 2 model calls and 8 tool calls per request, 30 s deadline; no alert needed |
| AI cost spike | SEV-3 | NOT ASSIGNED | NOT ASSIGNED | `AI_ASSISTANT_ENABLED=off` | defined, NOT IMPLEMENTED (no cost metering; no provider approved) |
| Database error spike (proposed: > 5× baseline in 15 min; baseline NOT DEFINED) | SEV-2 | NOT ASSIGNED | NOT ASSIGNED | PRODUCTION_OUTAGE / DATABASE_CORRUPTION | defined, NOT IMPLEMENTED |
| Production deployment failure | SEV-3 | NOT ASSIGNED | NOT ASSIGNED | keep or roll back to the previous deployment | defined, NOT IMPLEMENTED (Vercel shows status; nobody is notified) |

## 4. Gaps blocking production

1. No log destination or retention outside Vercel runtime logs.
2. No alert routing, no on-call, no owner for any alert.
3. No authentication-failure or `42501` signal.
4. Rate limiting is per instance, so its effective limit across instances is NOT DEFINED.
5. No signal has been observed in a deployed environment.
