# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. Repository state — read this first

**This repository contains specifications only. There is no application code yet.**

Verified state of the working directory:

- No `package.json`, no `node_modules`, no `app/`, `lib/`, `supabase/`, or `tests/` directories.
- No source files of any kind (`.ts`, `.tsx`, `.sql` migrations).
- No `.env`, no CI config, no lint/test tooling.

The repository is seven Markdown/SQL specification documents plus five PNG design mockups in `Assets/`.

Git is initialised and the `main` branch tracks
`https://github.com/henriset2026-stack/Platform-TANIA` (private). Note that a **system-level**
`credential.helper = osxkeychain` shadows the `gh` helper on this machine, so this repository sets a
local `credential.helper` override; leave it in place or `git fetch`/`push` will fail with
"Repository not found" even though the account has admin rights.

Consequences for how you work here:

- **Do not claim to have inspected "the current implementation."** There isn't one. When a task says
  "check the existing code," the honest answer is that the codebase is at Sprint 0.
- The directory trees in `README.md` and in the PRD are **proposals, not reality**. Do not describe them
  as the repository structure.
- If asked to implement a feature, the first real step is scaffolding the Next.js + Supabase project
  (Sprint 0, PRD line 3040) — say so rather than pretending to edit files that exist.
- Treat the spec documents as live: they are edited between sessions. Re-check the file list rather than
  trusting a previous session's inventory.

### Design mockups

`Assets/Homepage TANIA.png`, `Assets/dashboard TANIA.png`, `Assets/Detail Dashboard.png`,
`Assets/Login Homepage.png`, and `Assets/TANIA.png` are the visual reference for the portal. Read them
with the Read tool before building UI — they are the only concrete source for layout and visual language.

---

## 2. Commands

**There are none yet.** No build, lint, test, or dev command exists because no toolchain is installed.

Do not run or suggest `npm run dev` / `npm test` / `npm run lint` as if they work — they will fail.
`README.md` lists these under "Typical commands," but that section is aspirational.

Once the Next.js app is scaffolded, record the **actual** scripts from `package.json` in this section.
The PRD's test strategy (line 2858) expects four distinct suites, so the eventual command set must be
able to run them independently:

```text
unit          → calculation engine, pure domain logic
integration   → API route handlers
rls           → policy tests executed as real role/scope combinations (PRD line 2875)
e2e           → screen flows S01–S13
```

RLS tests must run in CI against a real Postgres instance with `authenticated` JWTs — they cannot be
mocked, because the thing under test is the database's own row filtering.

---

## 3. Document map

| File | What it is | Size |
|---|---|---|
| `TANIA_PRD_v2.0.md` | Product + engineering requirements, §1–§79. 3,405 lines. | 64 KB |
| `TANIA_PRD_v2.0_working.md` | **Superset of the above.** Identical through §79, then adds §80–§92. 3,698 lines. | 72 KB |
| `TANIA_RBAC_RLS_MATRIX.md` | Role × permission matrix, scope rules, data sensitivity classes, RLS test matrix. | 5.7 KB |
| `TANIA_SUPABASE_RLS.sql` | Executable security baseline: RBAC catalog, helper functions, policies for 32 tables. | 36 KB |
| `AGENTS.md` | Agent/tool engineering rules — the deepest source on tool contracts, risk tiers, provenance, idempotency. 31 sections. | 21 KB |
| `ARCHITECTURE.md` | **JARVIS** technical architecture — runtime lifecycle, layer model, action contract, tool execution, memory, security invariants. 18 sections. | 16 KB |
| `README.md` | Public-facing overview. Its "Repository Structure" and "Development" sections are aspirational. | 8 KB |
| `Assets/` | Five PNG design mockups. | 9 MB |

### The two PRD files

`TANIA_PRD_v2.0_working.md` contains everything in `TANIA_PRD_v2.0.md` plus thirteen extra sections, and
their line numbers align exactly for §1–§79 — so the index below works against either file.

The extra sections exist **only** in `_working` (from line 3407):

```text
§80  Homepage UX — Interactive TANIA Avatar (purpose, placement, states)
§81  TANIA Avatar Interaction Model
§82  Interactive AI Assistant Behavior
§83  TANIA → JARVIS Handoff
§84  AI Assistant UI Components
§85  Context-Aware Assistant
§86  Voice Interaction
§87  Avatar Design System
§88  Responsive Behavior
§89  Accessibility
§90  Updated Homepage Information Architecture
§91  Homepage UX Acceptance Criteria — TANIA Avatar
§92  Updated Homepage North Star
```

The TANIA Avatar is a headline product requirement, so **read `_working` for any homepage, avatar,
assistant-UI, voice, or accessibility work.** For everything else the two are interchangeable; cite
`TANIA_PRD_v2.0.md`, since that is the name the other documents reference.

### Navigating the PRD

The PRD is long; jump directly rather than re-scanning it:

```text
line  170  §4   Core domains
line  256  §6   Performance dimensions and evidence model
line  306  §7   Capability levels, domains, gap formula
line  388  §8.2 DPS 20-hour Capability Sprint
line  430  §9   Stack + Entra ID SSO chain
line  550  §11  Database schema — all 31 tables, column by column
line 1071  §12  RLS/RBAC model
line 1103  §13  RLS helper functions and worked policy examples
line 1265  §15  API contract (/api/v1)
line 1299  §16–§22  Endpoint specs: talent, capability, performance, development, assignment, AI, dashboard
line 1531  §23  Next.js App Router information architecture
line 1603  §25–§37  Screen specifications S01–S13
line 1973  §38  TANIA AI Assistant specification
line 1987  §39  AI architecture (gateway → intent → policy → router → agents → tools)
line 2025  §40  The 16 assistant intents
line 2080  §42  RAG architecture and knowledge_documents table
line 2163  §44–§55  Agent-by-agent specifications (11 agents)
line 2432  §56  Agent tool contract
line 2459  §57  Agent execution contract (AgentRun type)
line 2485  §58  Human-in-the-loop policy
line 2510  §59  Repository blueprint
line 2615  §61  Calculation engine function list
line 2636  §62  Intelligence metric definitions
line 2759  §66  MVP 1/2/3 scope split
line 2858  §68  Test strategy
line 2938  §69  Seed data
line 3038  §72  Sprint-by-sprint implementation sequence
```

`AGENTS.md` goes deeper than the PRD on agent mechanics — tool contract (§7, line 220), risk
classification (§8, line 271), evidence and provenance (§10, line 335), RAG rules (§11, line 373), agent
memory (§12, line 409), idempotency (§16, line 715), output contract (§20, line 811), and context-aware
assistant behavior per page (§21, line 848). Read it, not just the PRD, before building anything agentic.

### Source hierarchy

When sources conflict:

1. Explicit user request in the current task
2. `TANIA_PRD_v2.0.md` (use `_working` for §80–§92 homepage/avatar topics)
3. `TANIA_RBAC_RLS_MATRIX.md`
4. `TANIA_SUPABASE_RLS.sql`
5. `AGENTS.md` (authoritative for agent/tool behavior)
6. `ARCHITECTURE.md` (authoritative for JARVIS runtime)
7. This file
8. Existing implementation
9. General engineering assumptions

Do not silently replace a source-defined requirement with a generic best practice. If a source is
incomplete or self-contradictory, surface the conflict before making a high-impact architectural change.

---

## 4. What TANIA is

**Talent Intelligence, Analytics, Insight & Action** — an AI-native talent performance and capability
intelligence platform for **Chapter Digital Product & Solution (DPS), Telkom Indonesia**.

It is **not an HRIS.** The product closes a loop:

```text
Talent → Capability → Performance → Development → AI Augmentation
      → Work / Assignment → Business Impact → Evidence → (back to Capability)
```

Division of responsibility with the sibling product:

> **TANIA = Who needs what?**
> **JARVIS = How do we build and augment it?**

TANIA detects the capability gap and recommends development. JARVIS runs the 20-hour Capability Sprint
that closes it and returns evidence, which updates TANIA's capability state. The handoff must preserve
user identity, authorization scope, conversation context, capability context, selected talent, project
context, and evidence references.

---

## 5. Architecture

```text
TANIA Portal (Next.js App Router)
        ↓
TANIA AI Assistant  ──────────────┐
        ↓                          │ persistent avatar, lower-right
   AI Gateway                      │ fixed / bottom:24px / right:24px
        ↓                          │ states: Idle → Greeting → Listening
 Intent Classifier                 │         → Thinking → Answering → Expanded
        ↓                          │ must read page context
 Policy / Authorization  ←─────────┘
        ↓
   Agent Router
        ↓
 Specialized Agent  (never one "god agent")
        ↓
 Authorized Tools   (schema → permission → scope → risk → confirm → execute → audit)
        ↓
 Supabase: Auth · PostgreSQL + RLS · pgvector · Storage · Realtime · Edge Functions
```

Authentication chain (PRD line 466):

```text
Microsoft Entra ID → Supabase Auth / OIDC → TANIA RBAC → PostgreSQL RLS
```

### Layering rules

- Keep authorization at server boundaries: Server Component → Server Action / Route Handler →
  authorization → Supabase.
- Business formulas live in the calculation engine (`lib/calculations/`, PRD line 2615), never inside UI
  components. The named functions are `calculatePerformanceIndex`, `calculateCapabilityCoverage`,
  `calculateCapabilityGap`, `calculateTalentHealthIndex`, `calculateAIaugmentationIndex`,
  `calculateTalentMatchScore`, `calculateDevelopmentProgress`, `calculateBusinessImpact`.
- The domain service layer (`TalentService`, `CapabilityService`, … `AuditService`, PRD line 2596) must
  not bypass authorization.
- API base path is `/api/v1`. Every protected endpoint: authenticate → authorize → validate input →
  business logic → database → audit.

---

## 6. Security model — the part that matters most

> **The browser is never the security boundary. PostgreSQL RLS is.**

```text
Identity → RBAC → Organization/Chapter/Squad scope → Resource ownership
        → Data sensitivity → Action permission → RLS → ALLOW/DENY
```

A UI-level check such as `if (role === "CHAPTER_LEAD") showButton()` is a convenience, never a control.
The database must independently prevent the unauthorized read or write.

### Roles

```text
SUPER_ADMIN       platform / technical
EXECUTIVE         aggregated enterprise/chapter intelligence (individual records need explicit authority)
CHAPTER_LEAD      one authorized chapter
MANAGER           own + managed squad — never every squad
PROJECT_MANAGER   assigned projects
TALENT            own records + assigned work
HR                authorized people-governance scope only
AI_SERVICE        explicit delegated service scope — never unrestricted DB access
```

RBAC defines **what** a role may do. Scope defines **where**. RLS enforces **which rows**. All three are
required; a role alone grants nothing across scope boundaries.

### Permission catalog

Permissions are explicit strings, seeded in `TANIA_SUPABASE_RLS.sql`. Read and write/approve are always
separate — **never infer write or approve capability from read access**.

```text
talent.read/create/update/delete/export
performance.read/create_evidence/update_evidence/submit_review/approve_review/export
capability.read/create/update/assess/validate_evidence
development.read/create/update/approve/submit_evidence
assignment.read/recommend/create/update/approve
project.read/create/update/delete/manage_team
business_impact.read/create/update/validate
ai.use/analyze/recommend/execute/view_audit
report.read/export
admin.users/roles/capabilities/organizations/integrations/audit
```

The authoritative role → permission grants are the `grant_permissions_to_role(...)` calls in
`TANIA_SUPABASE_RLS.sql` (lines 65–81). Note the deliberate asymmetries: `AI_SERVICE` receives read and
`ai.analyze`/`ai.recommend` but **no** create, update, approve, or export. `EXECUTIVE` is read + export
only. Only `CHAPTER_LEAD`, `HR`, and `SUPER_ADMIN` hold `performance.approve_review`.

### Helper functions

Defined in `TANIA_SUPABASE_RLS.sql` §2 — all `stable security definer set search_path=public`:

```text
has_role(required_role text)          → membership-derived role check
has_permission(required_permission)   → membership → role → role_permissions → permissions
user_org_ids()                        → orgs via organization_memberships
user_squad_ids()                      → own squad ∪ squads where manager_id = auth.uid()
can_access_profile(target_id uuid)    → self ∪ super_admin ∪ chapter ∪ managed squad ∪ HR chapter
can_access_project(target_id uuid)    → super_admin ∪ creator ∪ org ∪ assigned
```

All context is derived server-side from `auth.uid()`. **Never write an authorization function that
accepts a caller-supplied role, scope, org, or user id** — that is privilege escalation by parameter.

### Policy baseline

The SQL file enables RLS on **32 tables** and writes explicit `select` / `insert` / `update` / `delete`
policies for each. Deny by default. Every new business table requires all four policies plus a decision
on organization boundary, ownership boundary, sensitivity class, AI access, and exportability — reviewed
before the table is introduced, not after.

Note the grant posture: `authenticated` gets table-level CRUD and RLS does the filtering; `anon` is
revoked entirely. A table added without policies is therefore **open to every logged-in user**. Enabling
RLS is not optional.

### Data sensitivity classes

```text
Internal      capability definitions, generic learning     → broad authenticated read
Confidential  talent profile, assignment                   → scope-based
Sensitive     performance evidence, development            → strict scope
Restricted    private HR data, private AI conversations    → owner + explicit authority
```

Private AI conversations are private by default, including from managers.

### Negative tests are mandatory

A security feature whose happy path works is not done. `TANIA_RBAC_RLS_MATRIX.md` §9 is the required
test matrix; every row needs a test:

```text
Anonymous → talent                              DENY
Talent A → own profile                          ALLOW
Talent A → Talent B private performance         DENY
Manager → managed squad                         ALLOW
Manager → other squad                           DENY
Chapter Lead → own chapter                      ALLOW
Chapter Lead → outside chapter                  DENY
PM → assigned project                           ALLOW
PM → unrelated project                          DENY
Executive → aggregate                           ALLOW
Executive → restricted individual record        DENY
AI → outside delegated scope                    DENY
AI → approve performance                        DENY
```

---

## 7. AI and agent rules

### No fabricated execution

> The model's intention is not execution.

```text
correct:   LLM intent → authorization → tool call → actual result → response
incorrect: LLM generated tool call → "Done"
```

Never report success unless the underlying tool, API, or database operation actually returned success.

### Authorization context is server-derived and immutable

Every AI request carries context the model cannot read into or write out of:

```json
{
  "userId": "uuid",
  "organizationIds": ["uuid"],
  "squadIds": ["uuid"],
  "roles": ["CHAPTER_LEAD"],
  "permissions": ["talent.read", "capability.read", "ai.analyze"],
  "sessionId": "uuid"
}
```

The model cannot modify this context, grant itself permissions, or request unrestricted database access.
Final enforcement stays in PostgreSQL.

### Tool contract and pipeline

Every tool declares `name`, `description`, `inputSchema`, `outputSchema`, `riskLevel`
(`LOW` | `MEDIUM` | `HIGH`), `requiredPermissions`, `requiresConfirmation`, and `reversible`
(`AGENTS.md` §7).

```text
LLM proposes tool call → validate schema → validate authorization → validate scope
→ validate risk → confirm if required → execute deterministic tool → validate result
→ write audit event → return evidence to agent
```

The model must never directly execute arbitrary code, SQL, HTTP requests, shell commands, or database
mutations. **No arbitrary-SQL tool in production.** No hidden side effects.

Consequential tools take an `idempotency_key` / `correlation_id` / `request_id` so a retry cannot create
duplicate assignments, approvals, financial records, or notifications (`AGENTS.md` §16).

### Human approval boundary

AI may analyze, summarize, detect patterns, search, calculate, recommend, draft, and prepare actions —
without approval. AI must never silently perform a consequential action. Approval is required for:

```text
performance.approve_review     official performance rating
assignment.approve             talent assignment
development.approve            development plan commitment
business_impact.validate       business impact validation
sensitive export
external communication
business/legal/commercial commitment
consequential HR action
production system mutation
```

### Agent set

Bounded responsibilities, routed — not one agent with universal access:

```text
TANIA:   Talent · Performance · Capability · Development · Assignment
         · AI Augmentation · Business Impact
JARVIS:  Capability Coach · Product · Solution · Business Case
```

### Assistant intents

16 initial intents (PRD line 2025), from `TALENT_SEARCH` and `CAPABILITY_GAP` through
`PROJECT_STAFFING`, `BUSINESS_IMPACT`, and `KNOWLEDGE_SEARCH`.

The assistant is page-context-aware. On the capability page, "Kenapa merah?" must be resolved against
the capability the user is looking at — not treated as a generic query. Per-page expected behavior is in
`AGENTS.md` §21.

### RAG

`pgvector` on a `knowledge_documents` table carrying an `access_scope jsonb` column (PRD line 2095).
Retrieval is scope-filtered — RAG is a retrieval path, not an authorization bypass. Embedding dimension
must match the chosen model; the PRD's `vector(1536)` is illustrative.

---

## 8. Domain rules that are easy to get wrong

### Capability

```text
L1 Awareness → L2 Foundation → L3 Practitioner → L4 Advanced → L5 Expert / Mentor
```

> **Certification ≠ Capability.** Capability requires evidence.

```text
Capability Gap = Required Capability − Current Capability
```

Prioritize by business criticality, gap magnitude, and time urgency together — not by gap size alone.

### Performance

Evidence-based, never assertion-based. Candidate dimensions: Delivery, Productivity, Capability
Application, Collaboration, Innovation, AI Augmentation, Business Impact.

**Do not hard-code universal performance weights** unless an approved product requirement specifies them.

Each piece of performance evidence retains `metric`, `value`, `period`, `source`, `evidence`, `owner`,
`validation status`, `confidence`. **An AI-generated claim never becomes a performance fact without
provenance and human validation.**

### Development

> **Don't train people to know. Train people to do.**

```text
Capability Gap → Development Plan → Learn → Practice → Coaching → Project Assignment
→ AI Challenge → Assessment → Evidence → Capability Update
```

Use the DPS 20-hour Capability Sprint model (PRD line 388).

---

## 9. Data model

Core domains (PRD §11, line 550 — 31 tables specified column by column):

```text
identity      profiles · organizations · squads · roles
              · organization_memberships · talent_profiles
capability    capability_domains · capabilities · capability_levels
              · talent_capabilities · capability_evidence
work          projects · assignments · deliverables
performance   performance_periods · performance_metrics · performance_evidence
              · performance_reviews
development   development_plans · learning_paths · learning_activities · learning_evidence
ai            ai_usage · ai_assessments · ai_augmentation · ai_interactions
              · agent_runs · agent_tool_calls · recommendations
impact        business_impacts
governance    audit_logs
```

The RBAC catalog tables `permissions` and `role_permissions` are **not** in PRD §11 — they are created
by `TANIA_SUPABASE_RLS.sql` §1, along with the seeded role and permission rows.

Prefer normalized data with explicit relationships. Do not duplicate a domain model into another table
for convenience.

---

## 10. UI and visual language

The homepage answers three questions:

```text
INTELLIGENCE   What is happening?
ACTION         What should I do next?
AI PARTNER     Ask TANIA.
```

Hierarchy: Chapter Intelligence → Insight/Priority → Action → TANIA Assistant → JARVIS → Impact.

The Chapter Leader dashboard must expose real intelligence — talent health, performance, capability
coverage, capability gaps, AI adoption, development progress, assignments, projects, business impact,
strategic focus — not decorative KPI cards.

### SCALE

The Chapter DPS transformation narrative, retained in the dashboard identity:

```text
S — Synergize    C — Customer & Culture    A — Automate    L — Lead    E — Expand
```

Visual language: Telkom blue, navy, white, subtle red accents, SCALE identity, professional enterprise AI
aesthetic. Avoid consumer/gaming aesthetics and excessive effects. Screens S01–S13 are specified from
PRD line 1603; the PNG mockups are the visual reference.

---

## 11. Implementation sequence

```text
Sprint 0  Repository · Supabase project · Auth · Environment · CI/CD · Design system · Migrations
Sprint 1  SSO · Profiles · Organizations · Squads · Roles · Talent Directory · Talent 360
Sprint 2  Capability Framework · Talent Capability · Evidence · Matrix · Gap Engine
Sprint 3  Performance Period · Metrics · Evidence · Cockpit · Manager Review
Sprint 4  Development Plan · Learning Path · 20-hour Sprint · Evidence · Progress
Sprint 5  AI Gateway · RAG · TANIA Assistant · Talent/Capability/Performance/Development Agents
Sprint 6  JARVIS Coach · Product/Solution/Business Case Agents · Tool Calling · Human Approval
Sprint 7  Business Impact
```

Security build order within that (`TANIA_RBAC_RLS_MATRIX.md` §11):

```text
Identity → Organization/Squad → Roles → Permissions → Helper Functions → RLS
→ RLS Tests → API Auth → Next.js Route Guards → AI/Agent Tool Auth
```

MVP scope split is at PRD line 2759. RLS and audit are in **MVP 1**, not deferred.

---

## 12. Secrets

Never place `SUPABASE_SERVICE_ROLE_KEY`, LLM API keys, `ENTRA_CLIENT_SECRET`, or enterprise credentials
in browser-executed code. Service-role stays server-only and never bypasses RLS "for convenience."

---

## 13. Migration discipline

Migrations are production artifacts; a SQL file that parses is not therefore safe.

Before: check current schema, dependencies, foreign keys, existing RLS, indexes, ordering, idempotency.
After: schema validation, RLS tests, API integration tests, query performance, policy review.

Add a new migration rather than editing a historical one unless explicitly asked.

---

## 14. Definition of Done

- [ ] Requirement implemented
- [ ] Authorization defined
- [ ] RLS defined and verified where data access is involved
- [ ] API input validation exists
- [ ] Error handling exists — explicit failure, never fabricated success
- [ ] Audit requirements addressed
- [ ] Tests exist, including negative tests for anything security-critical
- [ ] UI handles loading, empty, and error states
- [ ] Documentation updated where architecture changed
- [ ] No secrets committed
- [ ] No unrelated regressions

Do not say "production ready" unless the relevant tests and security verification have actually run.

---

## 15. Reporting

Report what changed, why, which files, security implications, tests executed, test results, known
limitations, and the next recommended step.

For security-related changes, state explicitly: RBAC impact, RLS impact, data scope impact, AI
authorization impact, audit impact.

Always distinguish **IMPLEMENTED** / **PARTIALLY IMPLEMENTED** / **PLANNED**. Given §1, almost everything
in these documents is currently **PLANNED** — never report planned functionality as implemented.

---

## 16. Never

1. Bypass RLS for convenience.
2. Put service-role credentials in the browser.
3. Give an agent unrestricted SQL access.
4. Let AI grant itself permissions.
5. Treat certification as proof of capability.
6. Fabricate performance evidence.
7. Claim an action succeeded without execution evidence.
8. Treat frontend hiding as authorization.
9. Create a single unrestricted "god agent."
10. Remove auditability from consequential workflows.
11. Store unnecessary personal information.
12. Commit secrets.
