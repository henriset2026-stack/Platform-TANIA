# TANIA_IMPLEMENTATION_BASELINE.md

> **Purpose:** Verified reconnaissance of the TANIA repository prior to any implementation.
> **Date:** 2026-09-20
> **Method:** Direct filesystem inspection and cross-document analysis. No code was written or modified.
> **Scope limit:** Repository only. No live Supabase project, deployment, or CI system was queried.

---

## 0. Headline

The repository is a **specification set with zero implementation**. Every directory and configuration
artifact required by the PRD blueprint is absent — verified individually, not inferred.

Because no code and no deployed database exist, sections 5 and 6 (conflicts against *existing*
implementation and *existing* schema) have **no findings by construction**. They are reported as such
rather than populated with speculation.

The substantive findings in this baseline are therefore **defects inside the specification set itself**,
of which two are critical security flaws in `TANIA_SUPABASE_RLS.sql` that would be inherited by the first
implementation if applied as written.

---

## 1. Current repository tree

Complete, as of inspection (14 tracked files, 0 untracked, working tree clean):

```text
Platform-TANIA/
├── .gitignore
├── AGENTS.md                      21 KB   agent/tool engineering rules (31 sections)
├── ARCHITECTURE.md                16 KB   JARVIS technical architecture (18 sections)
├── CLAUDE.md                      25 KB   Claude Code operating guidance
├── README.md                       8 KB   public overview
├── TANIA_PRD_v2.0.md              64 KB   product + engineering requirements, §1–§79 (3,405 lines)
├── TANIA_PRD_v2.0_working.md      72 KB   superset: §1–§79 identical, plus §80–§92 (3,698 lines)
├── TANIA_RBAC_RLS_MATRIX.md      5.7 KB   role × permission matrix, scope, sensitivity, test matrix
├── TANIA_SUPABASE_RLS.sql         36 KB   RBAC catalog, helper functions, RLS policies
└── Assets/                         9 MB
    ├── Detail Dashboard.png
    ├── Homepage TANIA.png
    ├── Login Homepage.png
    ├── TANIA.png
    └── dashboard TANIA.png
```

Untracked local file: `CLAUDE.md.bak` (excluded by `.gitignore` pattern `*.bak`).

Git: initialised, branch `main`, tracking `github.com/henriset2026-stack/Platform-TANIA` (private),
in sync at commit `d97b643`.

### Verified absent

Checked explicitly — each of the following does **not** exist:

```text
config   package.json · package-lock.json · pnpm-lock.yaml · yarn.lock · tsconfig.json
         next.config.js · next.config.mjs · tailwind.config.ts · postcss.config.js
         components.json · middleware.ts · vercel.json · Dockerfile
env      .env · .env.local · .env.example
quality  .eslintrc.json · eslint.config.js · vitest.config.ts · jest.config.js
         playwright.config.ts · .github/
dirs     app/ · components/ · lib/ · agents/ · tools/ · supabase/ · supabase/migrations/
         tests/ · types/ · docs/ · public/ · node_modules/
```

---

## 2. Current technology stack

**Stack as implemented: none.** No runtime, package manager, language toolchain, or dependency is
installed or declared.

The stack below is **specified, not present**:

| Layer | Specified | Source | Status |
|---|---|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui | PRD §9.1 | PLANNED |
| Data | Supabase: Auth, PostgreSQL, RLS, pgvector, Storage, Realtime, Edge Functions | PRD §9.1 | PLANNED |
| Identity | Microsoft Entra ID → Supabase Auth / OIDC | PRD line 462 | PLANNED |
| AI | AI Gateway, LLM, RAG, agent runtime, tool calling, evaluation | PRD §9.1 | PLANNED |
| Delivery | GitHub, Vercel, CI/CD | README | PARTIAL — GitHub only |

**Undecided, blocking:** no LLM provider or model is selected. `LLM_MODEL` and `EMBEDDING_MODEL` exist as
environment variable names (PRD line 3152–3153) with no values. `ARCHITECTURE.md` names **Gemini Live**,
but that document describes JARVIS, not TANIA (see §5.1). The embedding dimension `vector(1536)`
(PRD line 2113) is explicitly flagged in the PRD as a placeholder.

**Note:** `CLAUDE.md` §5 omits Supabase **Realtime** and **Edge Functions**, which PRD §9.1 includes.

---

## 3. Existing implementation status

Every capability is **MISSING**. No capability is IMPLEMENTED or PARTIALLY IMPLEMENTED.

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Project scaffold / toolchain | MISSING | no `package.json` |
| 2 | Authentication (Entra → Supabase OIDC) | MISSING | no `app/`, no `middleware.ts` |
| 3 | Identity: profiles, organizations, squads | MISSING | no migrations |
| 4 | RBAC catalog (roles, permissions) | PLANNED | DDL exists in `TANIA_SUPABASE_RLS.sql`, unapplied |
| 5 | RLS policies | PLANNED | 32 tables covered in SQL, unapplied |
| 6 | Talent directory / Talent 360 | MISSING | — |
| 7 | Capability framework + matrix | MISSING | — |
| 8 | Capability gap engine | MISSING | — |
| 9 | Performance cockpit + review workflow | MISSING | — |
| 10 | Development plans / learning paths | MISSING | — |
| 11 | 20-hour Capability Sprint | MISSING | — |
| 12 | Work, assignments, projects | MISSING | — |
| 13 | Business impact | MISSING | — |
| 14 | Calculation engine (8 functions, PRD §61) | MISSING | — |
| 15 | API layer `/api/v1` | MISSING | no route handlers |
| 16 | TANIA AI Assistant + Avatar | MISSING | spec only in `_working` §80–§92 |
| 17 | AI Gateway / intent classifier / agent router | MISSING | — |
| 18 | 11 agents (PRD §44–§55) | MISSING | — |
| 19 | Tool registry + governance pipeline | MISSING | — |
| 20 | RAG / pgvector / knowledge_documents | MISSING | table DDL in PRD §42 only |
| 21 | JARVIS integration | MISSING | — |
| 22 | Audit logging | PLANNED | table + policies in SQL, unapplied |
| 23 | Observability / correlation IDs | MISSING | — |
| 24 | Test suites (unit/integration/rls/e2e) | MISSING | no runner configured |
| 25 | CI/CD | MISSING | no `.github/` |
| 26 | Design system / UI components | MISSING | mockups only |

**Specification completeness** is high and is the project's real asset: 79 PRD sections (+13 in
`_working`), a full role × permission matrix, and an executable 36 KB RLS baseline.

---

## 4. Missing components required by TANIA PRD v2.0

Grouped by the PRD's own blueprint (§59) and IA (§23). All MISSING.

**Scaffold** — `package.json`, `tsconfig.json`, `next.config`, Tailwind + shadcn/ui config,
`middleware.ts`, `.env.example`, ESLint, test runners, `.github/workflows`.

**Database** — `supabase/` does not exist. No migration implements PRD §11's 31 tables, and the RBAC
catalog tables (`permissions`, `role_permissions`) exist only inside `TANIA_SUPABASE_RLS.sql`. No seed
data (PRD §69). **No indexes are defined anywhere in the repository** (see §7.5).

**Application** — all route groups `(auth)` and `(portal)`, all 13 screens S01–S13, all `/api/v1`
endpoint families (talent, capability, performance, development, assignment, dashboard, ai).

**Domain layer** — 10 services (PRD §60) and the 8 calculation-engine functions (PRD §61).

**AI layer** — gateway, intent classifier (16 intents, PRD §40), policy/authorization stage, agent
router, 11 agents, tool registry, `AgentRun` lifecycle, response contract (PRD §41), RAG pipeline,
evaluation harness.

**Specification gaps** — items the PRD itself does not yet answer and which must be decided before the
sprints they belong to:

1. No LLM or embedding model selected; `vector(1536)` is a placeholder.
2. **No Entra ID → TANIA role provisioning specification.** The entire RBAC model depends on rows in
   `organization_memberships`, and no document states who creates them, how Entra groups or token claims
   map to `roles`, or whether provisioning is JIT, SCIM, or manual. This is a blocking Sprint 1 gap.
3. No RAG chunking strategy, retrieval parameters, or re-ranking approach.
4. No LLM rate limiting, token budget, or cost-control policy.
5. No data retention or deletion policy (relevant to the Restricted sensitivity class).
6. No index or query-performance specification.
7. No `AI_SERVICE` credential issuance model — the role exists but how an agent obtains a scoped
   identity is unspecified.

---

## 5. Conflicts between existing implementation and PRD

**NONE — no implementation exists.** Nothing can conflict with the PRD yet.

The following are conflicts **within the specification set**, which will become implementation conflicts
if not resolved first.

### 5.1 ARCHITECTURE.md describes a different system and a different stack — CONFLICTING

`ARCHITECTURE.md` is titled *"JARVIS Technical Architecture"* and specifies a **Python desktop
application**: `main.py`, `ui.py`, `core/`, `actions/`, `plugins/`, wake-word lifecycle, audio device
management, and a **Gemini Live** session runtime (§3, §5).

It is listed as a TANIA source of truth by `README.md`, `AGENTS.md` §2, and `CLAUDE.md`. But TANIA is
Next.js/TypeScript/Supabase/Vercel. Its repository mapping, runtime lifecycle, and layer model do not
transfer.

A direct contradiction exists: `CLAUDE.md` §32 rule 9 forbids putting business logic in `main.py` or an
equivalent global runtime file, while `ARCHITECTURE.md` §5 Layer 2 assigns `main.py` ownership of the
live session, prompt construction, streaming interaction, and tool-call lifecycle.

**Resolution needed:** scope `ARCHITECTURE.md` explicitly to JARVIS. Its **§16 Architectural Invariants**
are stack-independent and *should* be inherited by TANIA; its repository and runtime sections should not.

### 5.2 Two PRD files, and the cited one lacks the Avatar spec — CONFLICTING

`TANIA_PRD_v2.0_working.md` is a strict superset: byte-identical through §79 (verified at eight section
boundaries), then adds §80–§92 from line 3407 — the entire Interactive TANIA Avatar specification
(interaction model, UI components, voice, avatar design system, responsive behavior, accessibility,
homepage IA and acceptance criteria).

Every other document cites `TANIA_PRD_v2.0.md` — the file that **does not contain** the Avatar spec,
despite the Avatar being a headline requirement in `CLAUDE.md` §12 and `README.md`.

**Resolution needed:** merge §80–§92 into `TANIA_PRD_v2.0.md` and retire `_working`.

### 5.3 Schema definition is split across two documents — CONFLICTING

`permissions` and `role_permissions` are created in `TANIA_SUPABASE_RLS.sql` §1 but are **absent from
PRD §11**, which otherwise defines the schema table by table. A reader following the PRD alone would
build an incomplete RBAC catalog.

### 5.4 README documents a repository and commands that do not exist — CONFLICTING

`README.md` presents `app/`, `components/`, `lib/`, `agents/`, `supabase/migrations/`, `tests/`,
`public/` as the repository structure, and lists `npm install / dev / lint / test` under Development.
None exist; every command fails.

### 5.5 Helper-function divergence — MINOR

PRD §13.1 specifies a `current_user_id()` helper. `TANIA_SUPABASE_RLS.sql` does not define it; policies
call `auth.uid()` directly. `has_role()` matches the PRD exactly.

---

## 6. Conflicts between existing schema and TANIA_SUPABASE_RLS.sql

**NONE — no database schema exists in this repository, and no live database was inspected.**

There are no migration files, no `supabase/` directory, and no committed schema dump. `TANIA_SUPABASE_RLS.sql`
is unapplied.

**Important limitation:** this reconnaissance covered the repository only. A Supabase project may exist
outside it. Until a live schema is inspected, the statement "no conflicts" means *"none detectable in the
repository"*, not *"none exist"*. Confirming this requires authorization to query the Supabase account.

**Structural dependency to note:** the SQL's own header states it *"assumes the core tables from
TANIA_PRD_v2.0.md already exist."* It is therefore **not standalone** — it will fail against an empty
database. PRD §11 DDL must be applied first. No migration currently does that, so ordering is undefined.

---

## 7. Security gaps

Findings are against `TANIA_SUPABASE_RLS.sql` as written. Two are critical and would be inherited by the
first implementation.

### 7.1 `organization_memberships` has no RLS — CRITICAL, privilege escalation

`organization_memberships` is the authorization root: `has_role()`, `has_permission()` and
`user_org_ids()` all read it (SQL lines 88, 93, 98).

It is referenced **only inside those three functions**. There is no
`alter table ... enable row level security` and no policy for it anywhere in the file — confirmed by
exhaustive grep. Meanwhile line 127 grants:

```sql
grant select,insert,update,delete on all tables in schema public to authenticated;
```

**Consequence:** if that grant is applied while the table exists, any authenticated user can insert a row
binding their own `user_id` to the `SUPER_ADMIN` role. Because the helper functions are `SECURITY DEFINER`
and read that table, the escalation takes effect immediately and defeats every other policy in the file.

This is the single highest-severity finding. **Fix before any deployment:** enable RLS, restrict SELECT
to own rows plus authorized scope, and permit INSERT/UPDATE/DELETE only to `SUPER_ADMIN` / `admin.users`.

### 7.2 `knowledge_documents` has no RLS — HIGH, data exposure and RAG poisoning

`knowledge_documents` (PRD §42, line 2104) holds the RAG corpus and carries an `access_scope jsonb`
column, implying row-level scoping. It appears **zero times** in `TANIA_SUPABASE_RLS.sql`.

**Consequence:** with the blanket grant, every authenticated user can read the full knowledge base —
bypassing `access_scope` entirely — and can **write** to it. Write access to a corpus the assistant later
retrieves is a knowledge-poisoning and indirect prompt-injection path into every agent.

**Fix:** enable RLS, enforce `access_scope` on SELECT, and restrict writes to an ingestion role.

### 7.3 Audit trail is forgeable and erasable — MEDIUM

```sql
audit_logs_insert ... with check(user_id=auth.uid() or has_role('AI_SERVICE') or has_role('SUPER_ADMIN'))
audit_logs_update ... using(has_role('SUPER_ADMIN'))
audit_logs_delete ... using(has_role('SUPER_ADMIN'))
```

Any authenticated user may insert arbitrary audit rows attributed to themselves (forgery/pollution), and
`SUPER_ADMIN` may silently rewrite or delete audit history. For a product whose stated goal is *"evidence
and human accountability at every consequential step"*, a mutable audit log is a weak foundation.

**Fix:** make `audit_logs` append-only (no UPDATE/DELETE policy at all); write audit rows via a
`SECURITY DEFINER` function rather than direct client INSERT.

### 7.4 Blanket table-level grant is a structural footgun — MEDIUM

`grant select,insert,update,delete on all tables in schema public to authenticated` inverts the safe
default: security depends entirely on every table having correct RLS, and the two omissions above are the
direct result. Note the grant applies only to tables existing when it runs — tables created later receive
no grant (and no policy), so behavior differs by creation order, which is fragile and surprising.

**Fix:** grant per-table alongside each table's policies, and set explicit `alter default privileges`.

### 7.5 No indexes anywhere — MEDIUM, availability

`create index` appears **zero times** in both `TANIA_SUPABASE_RLS.sql` and `TANIA_PRD_v2.0.md`.

`can_access_profile(profile_id)` and `can_access_project(project_id)` are correlated — evaluated per
candidate row — and each performs joins over `organization_memberships`, `profiles`, `squads`,
`assignments`. Without indexes on at minimum `organization_memberships(user_id)`,
`role_permissions(role_id)`, `profiles(chapter_id)`, `profiles(squad_id)`, `squads(manager_id)` and
`assignments(project_id, profile_id)`, every policy check degrades to sequential scans. This contradicts
`CLAUDE.md` §30 ("use indexed foreign keys") and will surface as timeouts, i.e. a denial-of-service on
the platform's own authorization path.

### 7.6 `capability_levels` is unadministrable — FUNCTIONAL DEFECT (fails closed)

`capability_levels` has RLS enabled and exactly one policy: `for select ... using(true)`. With
deny-by-default, **no one — including `SUPER_ADMIN` — can insert, update or delete** capability levels.
Its siblings `capabilities` and `capability_domains` both have `for all` policies, so this is an
inconsistency, not a deliberate pattern. The `admin.capabilities` permission exists but is unused here.

Fails safe, but blocks the L1–L5 framework from being administered through the application.

### 7.7 Chapter Lead can read private AI conversations — POLICY CONFLICT, needs a decision

```sql
ai_interactions_select ... using(user_id=auth.uid() or (has_permission('ai.view_audit') and can_access_profile(user_id)))
```

`ai.view_audit` is granted to `CHAPTER_LEAD`. So a Chapter Lead can read the private AI conversations of
anyone in their chapter.

`TANIA_RBAC_RLS_MATRIX.md` §6 classifies private AI conversations as **Restricted — "owner + explicit
authority"**, and `CLAUDE.md` §31 states private AI conversations are private by default. Whether
`ai.view_audit` constitutes "explicit authority" is undefined. This is a product/privacy decision, not a
bug — but it must be decided explicitly, since it governs whether staff can trust the assistant.

### 7.8 Coverage summary

RLS enabled on 32 tables; 2 required tables uncovered. Tables lacking a DELETE policy fail closed
(acceptable). `agent_tool_calls` and `ai_assessments` are select+insert only — appropriate for
append-only trails.

---

## 8. AI architecture gaps

All AI components are **MISSING**. The specification is unusually complete; the gaps below are those the
*specification itself* leaves open.

| Component | Spec | Status |
|---|---|---|
| AI Gateway | PRD §39 | MISSING |
| Intent classifier (16 intents) | PRD §40 | MISSING |
| Policy/authorization stage | PRD §39, RBAC §8 | MISSING |
| Agent router | PRD §44 | MISSING |
| 11 agents | PRD §45–§55 | MISSING |
| Tool registry + contract | AGENTS §7, PRD §56 | MISSING |
| Risk classification (LOW/MED/HIGH) | AGENTS §8 | MISSING |
| Human approval gate | PRD §58, AGENTS §9 | MISSING |
| `AgentRun` lifecycle | PRD §57 | MISSING (tables specified) |
| Response contract | PRD §41 | MISSING |
| RAG pipeline | PRD §42 | MISSING |
| Agent memory | AGENTS §12 | MISSING |
| Idempotency keys | AGENTS §16 | MISSING |
| Evaluation harness | AGENTS §25 | MISSING |
| Observability / correlation IDs | AGENTS §26 | MISSING |

**Unresolved design questions:**

1. **No model or provider selected** — blocks the gateway, and the embedding dimension cannot be fixed
   until an embedding model is chosen.
2. **`AI_SERVICE` identity is undefined** — the role has permissions, but nothing specifies how an agent
   obtains a scoped credential, or how the *user's* authorization context (RBAC §8) is bound to a
   database session. This is the crux of AI authorization and is currently unspecified. Note the
   `AI_SERVICE` grant set is correctly read-only + analyze/recommend, with no write, approve or export.
3. **No RAG scope-enforcement mechanism** — `access_scope jsonb` has no defined evaluation semantics, and
   with §7.2 unresolved there is no enforcement at all.
4. **No prompt-injection defense** — untrusted content (knowledge documents, evidence text, deliverable
   descriptions) reaches the model with no stated isolation or sanitization strategy.
5. **No cost, rate-limit or token-budget controls.**

**Architecturally sound and worth preserving:** the governance chain (schema → permission → scope → risk
→ confirm → execute → audit) is consistent across PRD §56–§58, AGENTS §7–§9 and ARCHITECTURE §7; the
no-fabricated-execution invariant is stated identically in all three.

---

## 9. Recommended implementation sequence

Two prerequisite blocks come before PRD Sprint 0, because they are cheap and they prevent building on
defects.

### Block A — Resolve specification defects (no code)

1. Fix §7.1 `organization_memberships` RLS. **Blocking.**
2. Fix §7.2 `knowledge_documents` RLS. **Blocking.**
3. Decide §7.7 private-AI-conversation visibility.
4. Merge PRD §80–§92 into `TANIA_PRD_v2.0.md`; retire `_working` (§5.2).
5. Scope `ARCHITECTURE.md` to JARVIS; extract its §16 invariants as shared (§5.1).
6. Move `permissions` / `role_permissions` DDL into PRD §11 (§5.3).
7. Correct `README.md` structure and commands (§5.4).
8. Specify Entra → role provisioning (§4 gap 2). **Blocking for Sprint 1.**
9. Select LLM + embedding model; fix vector dimension.

### Block B — Make the security baseline applyable

10. Split into ordered migrations: `001_core` … `008_rls`, so PRD §11 DDL precedes the RLS file.
11. Add indexes for every column read by a policy helper (§7.5).
12. Replace the blanket grant with per-table grants + default privileges (§7.4).
13. Make `audit_logs` append-only (§7.3); add write-path `SECURITY DEFINER` function.
14. Add the missing `capability_levels` write policy (§7.6).
15. Build the RLS test harness **before** the app — every row of RBAC matrix §9 as an executable test.

### Then PRD §72 as written

```text
Sprint 0  Repo · Supabase project · Auth · Env · CI/CD · Design system · Migrations
Sprint 1  SSO · Profiles · Organizations · Squads · Roles · Talent Directory · Talent 360
Sprint 2  Capability Framework · Talent Capability · Evidence · Matrix · Gap Engine
Sprint 3  Performance Period · Metrics · Evidence · Cockpit · Manager Review
Sprint 4  Development Plan · Learning Path · 20-hour Sprint · Evidence · Progress
Sprint 5  AI Gateway · RAG · Assistant · Talent/Capability/Performance/Development Agents
Sprint 6  JARVIS Coach · Product/Solution/Business Case Agents · Tool Calling · Approval
Sprint 7  Business Impact
```

Security build order within Sprint 0–1 (RBAC matrix §11):

```text
Identity → Organization/Squad → Roles → Permissions → Helper Functions → RLS
→ RLS Tests → API Auth → Route Guards → AI/Agent Tool Auth
```

---

## 10. Exact files to create or modify

### Modify (Block A — documents only)

```text
TANIA_SUPABASE_RLS.sql        add organization_memberships RLS (§7.1)
                              add knowledge_documents RLS (§7.2)
                              append-only audit_logs (§7.3)
                              per-table grants (§7.4) · indexes (§7.5)
                              capability_levels write policy (§7.6)
TANIA_PRD_v2.0.md             merge §80–§92 · add permissions/role_permissions DDL
                              add index spec · Entra provisioning · model selection
TANIA_PRD_v2.0_working.md     delete after merge
ARCHITECTURE.md               scope to JARVIS; mark invariants as shared
README.md                     correct structure and commands
TANIA_RBAC_RLS_MATRIX.md      record the §7.7 decision
CLAUDE.md                     record model selection and resolved references
```

### Create — Sprint 0 scaffold

```text
package.json · tsconfig.json · next.config.mjs · tailwind.config.ts · postcss.config.js
components.json · middleware.ts · .env.example · .eslintrc.json · vitest.config.ts
playwright.config.ts · .github/workflows/ci.yml · app/layout.tsx · app/globals.css
```

`.env.example` must carry exactly the PRD §73 keys, values blank:

```text
NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY
ENTRA_CLIENT_ID · ENTRA_CLIENT_SECRET · ENTRA_TENANT_ID
AI_GATEWAY_URL · AI_GATEWAY_KEY · EMBEDDING_MODEL · LLM_MODEL
JARVIS_API_URL · JARVIS_API_KEY
```

### Create — database

```text
supabase/migrations/001_core.sql            profiles · organizations · squads · organization_memberships
supabase/migrations/002_rbac.sql            roles · permissions · role_permissions · seeds
supabase/migrations/003_capability.sql      domains · capabilities · levels · talent_capabilities · evidence
supabase/migrations/004_performance.sql     periods · metrics · evidence · reviews
supabase/migrations/005_development.sql     plans · paths · activities · learning_evidence
supabase/migrations/006_projects.sql        projects · assignments · deliverables
supabase/migrations/007_ai.sql              ai_* · agent_runs · agent_tool_calls · recommendations
                                            · knowledge_documents (pgvector)
supabase/migrations/008_indexes.sql         policy-path indexes (§7.5)
supabase/migrations/009_rls.sql             helper functions + all policies
supabase/migrations/010_audit.sql           append-only audit_logs + write function
supabase/seed/seed.sql                      PRD §69
```

### Create — security tests (before application code)

```text
tests/rls/setup.ts · identity.rls.test.ts · talent.rls.test.ts · performance.rls.test.ts
tests/rls/capability.rls.test.ts · development.rls.test.ts · project.rls.test.ts
tests/rls/ai.rls.test.ts · escalation.rls.test.ts    ← must assert §7.1 is closed
```

### Create — application (Sprints 1+, per PRD §59)

```text
lib/supabase/{server,client,middleware}.ts
lib/auth/ · lib/rbac/ · lib/permissions/ · lib/audit/
lib/calculations/{performance,capability,gap,talent-health,ai-augmentation,match,development,impact}.ts
app/(auth)/login/ · app/(portal)/{dashboard,talents,performance,capabilities,development,
                                   assignments,projects,business-impact,ai,reports,settings}/
app/api/v1/{talents,capabilities,performance,development,assignments,dashboard,ai}/
types/{database,api,ai,agents}.ts
agents/core/{agent-types,auth-context,agent-registry,orchestrator,delegation}.ts
agents/tools/{tool-types,tool-registry,authorization,validation,audit}.ts
agents/{talent,performance,capability,development,assignment,business-impact,jarvis-coach}.ts
```

---

## 11. Classification summary

```text
IMPLEMENTED              none
PARTIALLY IMPLEMENTED    none
PLANNED                  RBAC catalog · RLS policy set · audit_logs   (specified, unapplied)
MISSING                  all 26 capabilities in §3; all AI components in §8
CONFLICTING              ARCHITECTURE.md scope/stack (§5.1)
                         two PRD files, Avatar spec in the uncited one (§5.2)
                         schema split across PRD and SQL (§5.3)
                         README structure and commands (§5.4)
                         private-AI-conversation visibility (§7.7)
```

**Critical before any deployment:** §7.1 and §7.2.

---

## 12. Method and limitations

Verified by direct inspection: file tree; individual existence checks for 22 config artifacts and 12
directories; table extraction from PRD and SQL followed by set comparison; per-table policy census;
exhaustive grep for the two uncovered tables; line-level alignment check between the two PRD files at
eight section boundaries; full read of `ARCHITECTURE.md`, `TANIA_RBAC_RLS_MATRIX.md`, `README.md`.

Not inspected, and therefore not claimed: any live Supabase project, Vercel deployment, CI system, or
repository other than this one. Sampled rather than read line by line: `TANIA_PRD_v2.0.md` (read by
section) and `AGENTS.md` (read by section).

No file outside this document was created or modified.
