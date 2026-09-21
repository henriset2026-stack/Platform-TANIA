# TANIA migration sequence

**Applied to: nothing.** No TANIA Supabase project exists. These migrations
have never been executed, and no statement in them has been validated by a
database. Treat every claim below as intent, not as verified behaviour.

## Order

Migrations are ordered by filename and must be applied in sequence. Later
files depend on objects created earlier.

| # | File | Creates |
|---|---|---|
| 1 | `20260920120001_extensions.sql` | `pgcrypto`; `set_updated_at()` trigger function |
| 2 | `20260920120002_core_identity.sql` | `organizations`, `profiles`, `squads` + circular FKs + updated_at triggers |
| 3 | `20260920120003_rbac.sql` | `roles`, `permissions`, `role_permissions`, `organization_memberships` |
| 4 | `20260920120004_audit.sql` | `audit_logs`; `record_audit_event()` |
| 5 | `20260920120005_auth_helpers.sql` | `has_role`, `has_permission`, `user_org_ids`, `user_squad_ids`, `can_access_profile`, `current_user_roles`, `current_user_permissions` |
| 6 | `20260920120006_rls_core.sql` | RLS enablement, per-table grants, all policies |
| 7 | `20260920120007_indexes.sql` | indexes on every policy-path column |
| 8 | `20260920120008_rbac_catalog.sql` | role and permission reference data + role grants |
| 9 | `20260921090001_ai_service_restrictions.sql` | `is_ai_service()`; RESTRICTIVE policies denying AI writes; no-self-grant on memberships |
| 10 | `20260921100001_talent_and_work.sql` | `talent_profiles`, `projects`, `assignments`, `deliverables`; `can_access_project()` |
| 11 | `20260921100002_capability.sql` | capability domains, capabilities, levels, requirements, talent capabilities, evidence |
| 12 | `20260921100003_performance.sql` | periods, metrics, evidence, reviews |
| 13 | `20260921100004_development.sql` | plans, learning paths, activities, evidence |
| 14 | `20260921100005_ai_and_agents.sql` | `ai_usage`, `ai_assessments`, `ai_augmentation`, `ai_interactions`, `agent_runs`, `agent_tool_calls`, `recommendations` |
| 15 | `20260921100006_business_impact.sql` | `business_impacts` |
| 16 | `20260921100007_knowledge.sql` | pgvector; `knowledge_documents` |
| 17 | `20260921100008_domain_rls.sql` | RLS, grants and 63 policies for every Phase 4 table |
| 18 | `20260921100009_domain_indexes.sql` | 55 indexes on foreign keys and policy paths |
| 19 | `20260921100010_ai_service_domain_restrictions.sql` | extends the AI write ban across Phase 4 |

Migration 9 is Phase 3. It only subtracts: RESTRICTIVE policies are AND-ed
with the permissive ones, so it can never widen access.

### Why this order

`profiles` and `squads` reference each other, so migration 2 creates both and
then closes the loop with `ALTER TABLE`. Policies (6) must follow the helper
functions (5) they call. Indexes (7) precede the catalog seed (8) so the seed
writes against indexed tables. The catalog seed is last because it depends on
both `roles` and `permissions`.

## Applying

```bash
supabase link --project-ref <ref>
supabase db push
supabase gen types typescript --project-id <ref> > types/database.ts
npm run test:rls
```

`types/database.ts` is currently **hand-written** and must be replaced with
generated output once a database exists.

## Relationship to TANIA_SUPABASE_RLS.sql

These migrations **replace** `TANIA_SUPABASE_RLS.sql` for the tables they
cover. That file is retained as the specification baseline, but it must not be
executed as-is — `TANIA_IMPLEMENTATION_BASELINE.md` §7 records why. Four
deliberate divergences:

| Baseline finding | In `TANIA_SUPABASE_RLS.sql` | Here |
|---|---|---|
| §7.1 escalation | `organization_memberships` has no RLS at all | RLS on; writes restricted to `SUPER_ADMIN` / `admin.users` |
| §7.3 audit | Users may insert own rows; `SUPER_ADMIN` may UPDATE/DELETE | Append-only; direct writes revoked; written via `record_audit_event()` |
| §7.4 grants | `grant … on all tables in schema public to authenticated` | Per-table grants; default privileges revoked |
| §7.5 indexes | none anywhere | 16 indexes on policy-path columns |

Both remaining baseline findings are **closed in Phase 4**:

- §7.2 `knowledge_documents` now has RLS, scoped by organization and
  sensitivity, with ingestion restricted to `admin.integrations`.
- §7.6 `capability_levels` now has a write policy under `admin.capabilities`,
  so the L1–L5 framework is administrable.

All six findings from `TANIA_IMPLEMENTATION_BASELINE.md` §7 are addressed in
the migration source. **None is verified against a running database.**

## Seed data

`seed/01_reference.sql` holds PRD-defined framework data (capability levels
§7.1, capability domains §7.2) and is safe in any environment. It seeds no
performance weights: PRD §6.1 makes those configuration, not policy.

`seed/02_dev_sample.sql` is fictional development data and refuses to run
unless `-v tania_allow_sample_data=1` is passed, and aborts if any non-sample
organization exists. It seeds no people: `profiles` is keyed to `auth.users`,
so fictional talent would mean creating real loginable accounts.

## Scope

Phase 2 covers the base schema only. Capability, performance, development,
project, assignment, business-impact and AI tables are Phases 4 and later.

## Seed data

Migration 8 seeds the role and permission catalog, which is reference data
defined by `TANIA_RBAC_RLS_MATRIX.md`. No person, organization, squad or
membership is seeded — those are real records and are not fabricated.
