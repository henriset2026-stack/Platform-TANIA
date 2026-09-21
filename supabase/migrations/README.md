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

Two further baseline findings are **out of Phase 2 scope** and remain open:

- §7.2 `knowledge_documents` has no RLS — the table arrives in Phase 14 (RAG).
- §7.6 `capability_levels` is unadministrable — the table arrives in Phase 8.

## Scope

Phase 2 covers the base schema only. Capability, performance, development,
project, assignment, business-impact and AI tables are Phases 4 and later.

## Seed data

Migration 8 seeds the role and permission catalog, which is reference data
defined by `TANIA_RBAC_RLS_MATRIX.md`. No person, organization, squad or
membership is seeded — those are real records and are not fabricated.
