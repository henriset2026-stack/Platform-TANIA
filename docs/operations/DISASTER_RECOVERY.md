# TANIA Backup, Disaster Recovery, Rollback and Data Lifecycle

Security Gate #3, steps 16 (backup), 17 (restore test), 18 (disaster recovery),
34 (rollback), 39 (data retention) and 40 (data deletion). State as of
2026-09-25.

> **No backup is listed, PITR is disabled, and no restore has ever been
> performed.** Nothing in this document can currently be recovered from a
> backup.

Environments: one Supabase project, `hcyaqbgbwfxzutamceoq` (ap-southeast-1,
free tier), used as **staging**. No production Supabase project exists. The
database holds no real users and no production data. Vercel project
`platform-tania` (team `chapter-dps`); the only successful Production deployment
is commit `1982432` (documents only). Both application deployments (`8712b69`
Production and Preview) failed; cause NOT VERIFIED.

---

## 1. Backup inventory (step 16)

| Asset | Mechanism | Status |
|---|---|---|
| Database (staging) | Supabase managed backups: `walg_enabled: true`, `backups: []` | NO BACKUP LISTED |
| Point-in-time recovery | `pitr_enabled: false` | NOT IMPLEMENTED |
| Database (production) | — | no production project exists |
| Storage / files | — | N/A (no storage, no uploads) |
| Schema | 30 migrations in `supabase/migrations/` (git) | IMPLEMENTED (schema only, no data) |
| Application code and config | git, `henriset2026-stack/Platform-TANIA` (private) | IMPLEMENTED; `vercel.json` not yet committed |
| Vercel environment variables | Vercel | NOT VERIFIED (not visible) |
| Supabase Auth configuration (Entra provider) | Supabase dashboard | backup NOT VERIFIED |
| Knowledge / RAG documents and chunks | database tables | covered only by database backup (none); source-document origin NOT DEFINED |
| Audit logs | `audit_logs` table | covered only by database backup (none) |
| Agent run metadata | `agent_runs`, `agent_tool_calls` | covered only by database backup (none) |
| System logs | Vercel runtime logs | retention NOT DEFINED; no export |

| Objective | Value |
|---|---|
| RPO | NOT DEFINED |
| RTO | NOT DEFINED |
| Backup owner | NOT ASSIGNED |
| Backup frequency | NOT DEFINED |

## 2. Restore test (step 17)

| Restore test | Date | Environment | Result | Issues |
|---|---|---|---|---|
| Database restore from backup | never performed | — | NOT VERIFIED | no backup exists to restore |
| Schema rebuild from migrations into an empty project | never performed | — | NOT VERIFIED | yields schema and reference seed only, no data |
| Application redeploy from git | never succeeded | Vercel | NOT VERIFIED | application deployments failed; local clean build succeeds |
| Vercel instant rollback | never performed | Vercel | NOT VERIFIED | — |

Before production: define RPO/RTO, enable a backup mechanism that meets them,
and record a restore test in this table.

## 3. Disaster recovery scenarios (step 18)

No failover exists for any component. OWNER is **NOT ASSIGNED** for every row.
Detection relies on reports: no monitor or alert is implemented
(`MONITORING.md`).

| Scenario | Detection | Impact | Failover | Degraded mode | Recovery | Owner |
|---|---|---|---|---|---|---|
| Application failure | report; `onRequestError` logs | portal unavailable | none | none | Vercel instant rollback (NOT VERIFIED) or fix and redeploy | NOT ASSIGNED |
| Database failure / data loss | report; errors in logs | all data unavailable or lost | none | UI renders explicit error / "not connected" states, never fabricated figures | no backup: recreate schema from migrations; **data not recoverable** | NOT ASSIGNED |
| Supabase platform outage | report | database and login unavailable | none | none | wait for Supabase; no alternative | NOT ASSIGNED |
| Vercel outage | report | portal unavailable | none | none | wait for Vercel; no alternative host | NOT ASSIGNED |
| AI provider outage | `ai.gateway.provider_error` | assistant answers fail with fixed error message | none | `AI_ASSISTANT_ENABLED=off`; rest of portal unaffected | provider recovery; no provider is approved for real data | NOT ASSIGNED |
| RAG failure | report; gateway logs | retrieval unavailable | none | `RAG_ENABLED=off` → explicit unavailable state | fix and redeploy; re-ingest source NOT DEFINED | NOT ASSIGNED |
| Authentication failure (Entra / Supabase Auth) | report | nobody can sign in | none | none | restore Entra app registration / Supabase Auth config (backup NOT VERIFIED) | NOT ASSIGNED |
| Enterprise integration | — | only Entra ID exists (see authentication) | — | — | — | NOT ASSIGNED |
| JARVIS | — | none: no JARVIS transport exists; `JARVIS_HANDOFF_ENABLED` default OFF | — | — | — | NOT ASSIGNED |
| Storage | — | N/A: no storage | — | — | — | — |

## 4. Rollback (step 34)

| Layer | Method | Status |
|---|---|---|
| Application | Vercel "Instant Rollback" / "Promote to Production" of a previous deployment | NOT VERIFIED (never exercised) |
| Automatic production deploys | `vercel.json` sets `git.deploymentEnabled.main=false`; production then needs deliberate promotion by a Vercel team member | not yet committed: until it is, a push to `main` deploys to Production |
| Database | forward-fix only: a new forward migration. No down-migrations exist. Migrations `20260924100001`–`100005` add triggers/policies and drop no data | a data-restoring rollback requires a backup, which does not exist |
| Configuration (Vercel env) | Vercel env history | NOT VERIFIED |
| Feature flags | `AI_ASSISTANT_ENABLED`, `TOOL_EXECUTION_ENABLED`, `RAG_ENABLED`, `JARVIS_HANDOFF_ENABLED` via Vercel env + redeploy | NOT VERIFIED in Vercel |
| AI prompt version | prompts are code (`lib/ai/gateway.ts` `DEFAULT_AGENT`, `lib/ai/tool-results.ts`); they roll back with the application | as application |
| AI model | `LLM_MODEL` env + redeploy | NOT VERIFIED |

Application rollback does not roll back the database. Before promoting a
deployment that depends on a new migration, confirm the previous deployment
still works against the migrated schema.

## 5. Data retention (step 39)

No retention policy exists for any category. No automated deletion job exists
(the application has no cron jobs).

| Category | Retention | Owner | Deletion (current mechanism) | Legal / policy source |
|---|---|---|---|---|
| Audit logs (`audit_logs`) | NOT DEFINED | NOT ASSIGNED | none: INSERT/UPDATE/DELETE/TRUNCATE revoked from `authenticated`; written only by `record_audit_event` and audit triggers | NOT DEFINED |
| AI conversations (`ai_interactions`) | NOT DEFINED | NOT ASSIGNED | NOT VERIFIED | NOT DEFINED |
| Prompts | NOT DEFINED | NOT ASSIGNED | not written to logs; persistence elsewhere NOT VERIFIED | NOT DEFINED |
| Model outputs | NOT DEFINED | NOT ASSIGNED | not written to logs; persistence elsewhere NOT VERIFIED | NOT DEFINED |
| Agent runs / tool calls | NOT DEFINED | NOT ASSIGNED | NOT VERIFIED | NOT DEFINED |
| Knowledge documents | NOT DEFINED | NOT ASSIGNED | deletion propagates to chunks by trigger (`propagate_document_acl`) | NOT DEFINED |
| RAG chunks | NOT DEFINED | NOT ASSIGNED | follow their document; deleted documents never retrieved (verified, `tests/rls/rag-leakage.rls.test.ts`) | NOT DEFINED |
| Evidence (capability, performance, learning) | NOT DEFINED | NOT ASSIGNED | soft delete (`deleted_at`); DELETE revoked | NOT DEFINED |
| Business impact | NOT DEFINED | NOT ASSIGNED | soft delete (`deleted_at`); DELETE revoked | NOT DEFINED |
| Timesheets | NOT DEFINED | NOT ASSIGNED | NOT VERIFIED | NOT DEFINED |
| System logs (Vercel runtime) | NOT DEFINED | NOT ASSIGNED | platform-controlled; not configured by TANIA | NOT DEFINED |

## 6. Data deletion (step 40)

1. **Erasure request process** (a person asks for their data to be deleted): NOT DEFINED.
2. **Evidence and business impact** cannot be hard-deleted by any `authenticated` user; withdrawal sets `deleted_at` and the row remains.
3. **Audit logs** cannot be deleted or truncated by `authenticated`. Deletion of audit rows, if ever required, is NOT DEFINED.
4. **Knowledge documents**: deleting a document removes its chunks from retrieval (trigger + live test).
5. **User accounts**: `profiles` is keyed to `auth.users`; the effect of deleting an Auth user on dependent rows is NOT VERIFIED.
6. **Backups**: none exist, so no deleted data persists in backups today. Once backups exist, how deletion applies to them is NOT DEFINED.
7. **Logs**: prompt and answer text never reach logs; credentials are redacted at the sink.
