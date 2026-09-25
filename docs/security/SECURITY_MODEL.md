# TANIA Security Model

The model as **enforced** after Security Gate #1 (2026-09-24). Where this and a
specification disagree, this describes the running system and the
specification is the intent; the gaps are listed in §9.

> The browser is never the security boundary. PostgreSQL is.

---

## 1. Layers

| Layer | Where | Role | Trusted for security? |
|---|---|---|---|
| UI visibility | React components, `lib/dashboard/views.ts` | what to render | **No** |
| Route gate | `middleware.ts` → `lib/auth/routes.ts` | deny-by-default authentication | Authentication only |
| Policy gate | `lib/auth/policy.ts`, `lib/auth/authorize.ts` | fail fast with a reason | **No** — a gate, not a control |
| RLS | every `public` table | which rows | **Yes** |
| Decision guards | `BEFORE` triggers | which *changes* to a row | **Yes** |
| Audit | `AFTER` triggers → `audit_logs` | who changed what | Evidence |

If the policy gate and RLS disagree, RLS wins and the gate is the bug.

## 2. Identity

- Identity is `auth.uid()` from a JWT the database verifies; in the app,
  `supabase.auth.getUser()`, which revalidates with the auth server.
  `getSession()` is never used.
- No entry point reads a user, role, permission, organization, chapter or squad
  id from a request (enforced by `tests/security/security-gate.security.test.ts`).
- Roles and permissions are **never read from the Entra token**. They come from
  `organization_memberships` → `role_permissions` → `permissions`.
- A forged JWT (bad signature) is rejected by PostgREST with 401, whatever role
  it claims.

## 3. Roles, permissions, scope

**RBAC says what, scope says where, RLS enforces which rows.** A role alone
grants nothing across a scope boundary.

| Helper (all `SECURITY DEFINER`, `search_path = ''`, no identity parameter) | Returns |
|---|---|
| `has_role(code)`, `has_permission(code)` | through the caller's memberships |
| `user_org_ids()` | organizations the caller belongs to |
| `user_squad_ids()` | own squad ∪ squads the caller manages |
| `user_admin_org_ids()` | organizations where the caller holds `admin.users` |
| `can_access_profile(id)` | self ∪ SUPER_ADMIN ∪ CHAPTER_LEAD/HR same chapter ∪ MANAGER managed squad |
| `can_access_project(id)` | SUPER_ADMIN ∪ creator ∪ same organization ∪ assigned |

`user_squad_ids()` trusts `profiles.squad_id`, so **the scope-defining profile
fields are protected** (§5): nobody edits their own chapter, squad, manager or
status, and an editor can only place people inside their own organizations.

## 4. Data classes

| Class | Examples | Default access |
|---|---|---|
| Internal | capabilities, domains, levels, templates | all authenticated read |
| Confidential | profiles, projects, assignments, business impact | scope-based |
| Sensitive | performance, development, capability evidence, AI usage/augmentation | profile scope + permission |
| Restricted | AI conversations, audit log, agent runs | owner + explicit authority |
| Authorization root | memberships, roles, permissions | SUPER_ADMIN; memberships also `admin.users` within own organizations |

EXECUTIVE reads organizations, squads and profiles across chapters, **no**
individual Sensitive or Restricted row, and aggregates only through
`chapter_summary()` / `chapter_capability_summary()` — counts, suppressed below
five people.

## 5. Decision guards — what a row's editor may not do

A policy can say *who may edit a row*; it cannot see *which columns changed*.
Every judgement-bearing field is therefore guarded by a trigger. The rules are
the same everywhere:

1. A record cannot be **created already decided**.
2. Deciding needs the **decision permission**, the subject **in the decider's scope**.
3. The decision is recorded under the **decider's own identity**.
4. **Nobody decides about themselves** or about their own submission.
5. `created_by` is the caller and never changes.

| Table | Decision fields | Permission |
|---|---|---|
| `performance_reviews` | status, approved_by/at | `performance.approve_review` |
| `development_plans` | → approved, approved_by/at | `development.approve` |
| `assignments` | approved_by/at | `assignment.approve` |
| `performance_evidence` | validation_status, validated_by/at | `performance.update_evidence` |
| `capability_evidence` | validation_status, validated_by/at | `capability.validate_evidence` |
| `business_impacts` | validation_status, validated_by/at | `business_impact.validate` |
| `ai_assessments` | validation_status, validated_by/at | `capability.validate_evidence` |
| `talent_capabilities` | assessment_status (manager_assessed, evidence_validated), assessed_by | `capability.assess`; a self-edit of the level demotes to `self_assessed` |
| `learning_evidence` | score, evaluator_id, evaluated_at | `capability.assess` |
| `agent_runs` | human_approved, approved_by | approver = caller |
| `organization_memberships` | the grant itself | `admin.users` in that organization; SUPER_ADMIN, EXECUTIVE, AI_SERVICE only by SUPER_ADMIN; never to oneself |
| `ai_augmentation` / `ai_usage` | the scores / the usage | never about oneself / only about oneself |

A decided evidence row is frozen for anyone without the decision permission,
except that its creator may **withdraw** it — evidence is withdrawn, never erased.

## 6. AI_SERVICE boundary

- Holds read and `ai.analyze` / `ai.recommend` only: no create, update,
  approve or export.
- RESTRICTIVE policies deny every AI write on every domain table, whatever else
  the identity holds; a separate RESTRICTIVE policy denies AI approvals.
  Verified: an AI identity that *also* holds CHAPTER_LEAD cannot approve.
- `can_access_profile` grants AI_SERVICE nothing, so today it reads **no**
  individual data at all — safe, but a real read scope must be designed before
  agents need data (§9).
- Agents act through the gateway's tool pipeline, with the calling user's
  server-derived context. The model never receives SQL, the service role, or
  a way to widen its context.

## 7. Service role

`lib/supabase/admin.ts` is the only module that can build a service-role
client, and **no module imports it**. The key is used only by `tests/rls`
fixtures and maintenance, from a trusted machine, and is never set in Vercel.
`TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked from `anon` and
`authenticated`, including on future tables (default privileges).

## 8. Audit

`audit_security_change()` (definer) appends to `audit_logs` for: membership,
role, permission and role-permission changes (all operations); and updates to
decision fields and profile scope fields. Each row records the actor
(`auth.uid()`), the action (`table.operation`), the resource id, **only the
tracked columns** before and after, and `via` — the request role, so a
service-role change is visible as one. Full rows are never logged.

Direct inserts into `audit_logs` are not granted to `authenticated`, and no
UPDATE or DELETE policy exists. `record_audit_event()` lets a user append an
event attributed to themselves only.

Application events (sign-in failures, API outcomes, unhandled errors) go to
structured JSON logs (`lib/observability/logger.ts`, `instrumentation.ts`), not
to `audit_logs`. Sign-in and sign-out are recorded by Supabase Auth's own audit
log.

## 9. Known gaps (see SECURITY_GATE_1_REPORT.md §20)

- No `SECURITY_DENIED` audit event: RLS denials are silent at the database.
- No Content-Security-Policy.
- Same-chapter project visibility is broader than the matrix specifies.
- CHAPTER_LEAD can read private AI conversations in their chapter via `ai.view_audit`.
- AI_SERVICE has no designed read scope.
- No export surface exists yet; when one is built it needs its own
  permission check, scope filter and audit event.
