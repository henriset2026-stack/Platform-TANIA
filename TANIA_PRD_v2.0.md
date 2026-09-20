# TANIA_PRD_v2.0.md

# TANIA — Talent Intelligence, Analytics, Insight & Action
## Portal Talent Performance & Capability Intelligence
### Blueprint MVP: PRD → Supabase → RBAC/RLS → API → Next.js → UI → AI Assistant → TANIA/JARVIS Agents

**Version:** 2.0  
**Status:** MVP Blueprint / Engineering Baseline  
**Owner:** Chapter Product & Solution (DPS), Digital Product, Telkom Indonesia  
**Primary Platform:** TANIA  
**AI Companion:** JARVIS  
**Target:** Chapter DPS MVP → scalable Chapter/Group capability intelligence platform

---

## 0. Document Purpose

Dokumen ini menurunkan PRD TANIA dari level product requirement menjadi **implementation blueprint** yang dapat langsung digunakan sebagai baseline repository MVP.

Blueprint ini mencakup:

1. Product Requirements
2. Domain Model
3. Supabase PostgreSQL ERD
4. RBAC/RLS security model
5. API Contract
6. Next.js Information Architecture
7. Screen-by-screen UI Specification
8. TANIA AI Assistant Specification
9. TANIA/JARVIS Agent Specification
10. Repository Architecture
11. MVP delivery sequence
12. Acceptance criteria

Dokumen ini bukan HRIS. TANIA diposisikan sebagai **Talent Performance & Capability Intelligence Platform** yang menghubungkan:

> Talent → Capability → Work → Performance → Development → AI Augmentation → Business Impact

North Star:

> **RIGHT TALENT × RIGHT CAPABILITY × RIGHT WORK × RIGHT AI × RIGHT IMPACT**

---

# 1. Product Definition

## 1.1 Product Statement

**TANIA** adalah platform digital intelligence untuk membantu Chapter DPS mengetahui:

- siapa talent yang tersedia;
- capability apa yang dimiliki;
- capability apa yang dibutuhkan;
- bagaimana performance talent;
- di mana capability gap terjadi;
- bagaimana gap dikembangkan;
- bagaimana AI meningkatkan productivity dan capability;
- di project/work mana talent dapat memberikan impact;
- bagaimana seluruh aktivitas tersebut menghasilkan business impact.

TANIA mengubah pengelolaan talent dari:

> **Data → Reporting**

menjadi:

> **Data → Intelligence → Action → Evidence → Impact**

---

## 1.2 TANIA vs JARVIS

| Platform | Pertanyaan Utama | Fungsi |
|---|---|---|
| TANIA | **Who needs what?** | Talent intelligence, performance, capability, gap, development, matching |
| JARVIS | **How do we build it?** | AI Employee, capability coach, work augmentation, execution assistant |
| TANIA + JARVIS | **How do we turn capability into impact?** | Closed-loop talent operating system |

TANIA tidak menggantikan JARVIS.

TANIA menjadi **intelligence/control layer**, sedangkan JARVIS menjadi **AI execution and augmentation layer**.

---

# 2. Strategic Objectives

## 2.1 Objectives

### O1 — Single Source of Truth

Menyediakan satu sumber data untuk:

- Talent
- Role
- Capability
- Project
- Assignment
- Performance
- Evidence
- Development
- AI Usage
- Business Impact

### O2 — Performance Intelligence

Mengubah performance review dari opini periodik menjadi evidence-based performance intelligence.

### O3 — Capability Intelligence

Mengetahui:

- capability yang tersedia;
- capability yang kurang;
- critical capability gap;
- capability yang sedang berkembang;
- capability yang sudah terbukti melalui evidence.

### O4 — Capability Development

Menghubungkan:

> Capability Gap → Learning → Practice → Project → Evidence → Assessment → Capability Update

### O5 — AI Augmentation

Mengukur bagaimana AI meningkatkan:

- productivity;
- research;
- analysis;
- writing;
- product development;
- solution design;
- automation;
- decision support.

### O6 — Business Impact

Menghubungkan development talent dengan:

- project delivery;
- revenue;
- efficiency;
- customer impact;
- innovation;
- quality;
- strategic outcomes.

---

# 3. Product Principles

1. **Evidence over opinion**
2. **Capability over certification**
3. **Outcome over activity**
4. **Development through work**
5. **AI augments humans; AI does not replace human accountability**
6. **Every intelligence output must be traceable**
7. **Human approval for consequential decisions**
8. **Privacy by design**
9. **Role-based access**
10. **API-first and event-ready**
11. **AI-ready data model**
12. **MVP first, scalable architecture**

---

# 4. Product Scope

## 4.1 Core Domains

### D1 — Executive Intelligence

Dashboard chapter-level:

- Talent Health
- Performance
- Capability Coverage
- Capability Gap
- AI Augmentation
- Utilization
- Development
- Business Impact

### D2 — Digital Talent Profile

Digital Talent Passport:

- identity;
- role;
- grade;
- squad;
- experience;
- project history;
- capability;
- certification;
- performance;
- development;
- AI capability;
- business impact.

### D3 — Performance Intelligence

Evidence-based performance measurement.

### D4 — Capability Intelligence

Capability framework, maturity, gap and coverage.

### D5 — Development Intelligence

Personalized development plan and 20-hour capability sprint.

### D6 — Work & Assignment Intelligence

Talent-to-project/capability matching.

### D7 — AI Augmentation Intelligence

Measurement of AI adoption and AI-assisted productivity.

### D8 — Business Impact

Talent → Capability → Work → Outcome.

### D9 — AI Assistant

Natural-language interface to TANIA intelligence.

### D10 — JARVIS Integration

Execution and capability augmentation layer.

---

# 5. Personas

| Persona | Primary Need |
|---|---|
| Executive | Chapter intelligence and strategic decisions |
| Chapter Leader | Capability, performance, capacity and business impact |
| Manager | Team performance, gap and development |
| Talent | Personal performance, capability and development |
| Project Manager | Staffing, assignment and delivery |
| Architect / Consultant / Product / Solution / Engineer | Capability growth and work evidence |
| HR / People Partner | Talent data governance |
| Super Admin | Platform administration |
| AI Agent | Analysis, recommendation and workflow orchestration |

---

# 6. Performance Framework

Performance must be configurable by role.

## 6.1 Default Dimensions

| Dimension | Default Weight |
|---|---:|
| Delivery | 25% |
| Productivity | 15% |
| Capability Application | 20% |
| Collaboration | 10% |
| Innovation | 10% |
| AI Augmentation | 10% |
| Business Impact | 10% |

> Weights are configuration, not universal policy. Different roles may use different performance models.

## 6.2 Performance Evidence

Evidence sources:

- project;
- deliverable;
- timesheet;
- milestone;
- customer feedback;
- manager feedback;
- peer feedback;
- certification;
- capability assessment;
- AI usage;
- automation;
- business outcome.

Every evidence record should contain:

```text
metric
value
period
source
source_reference
evidence
owner
validation_status
confidence
created_at
```

---

# 7. Capability Framework

## 7.1 Capability Levels

| Level | Definition |
|---|---|
| L1 | Awareness |
| L2 | Foundation |
| L3 | Practitioner |
| L4 | Advanced |
| L5 | Expert / Mentor |

Principle:

> **Certification ≠ Capability**

Capability must be supported by evidence of application.

## 7.2 Capability Domains

Initial domains:

- Product
- Solution
- Business
- Digital
- Architecture
- AI
- Data
- Technology
- Leadership
- Commercial
- Industry

## 7.3 Capability Gap

Conceptual calculation:

```text
Capability Gap =
Required Capability Level
-
Current Proven Capability Level
```

Priority:

```text
Gap Priority =
Business Criticality
×
Gap Magnitude
×
Time Urgency
```

---

# 8. Development Intelligence

## 8.1 Development Loop

```text
Capability Gap
      ↓
Development Plan
      ↓
Learn
      ↓
Practice
      ↓
AI Coaching
      ↓
Project Assignment
      ↓
Evidence
      ↓
Assessment
      ↓
Capability Update
      ↓
Business Impact
```

## 8.2 DPS 20-Hour Capability Sprint

Framework:

```text
DEFINE
  ↓
DECONSTRUCT
  ↓
LEARN
  ↓
PRACTICE
  ↓
FEEDBACK
  ↓
BUILD
  ↓
ASSESS
  ↓
DEPLOY
```

Principle:

> **Don't train people to know. Train people to do.**

Example AI Product Manager:

| Activity | Hours |
|---|---:|
| AI-assisted research | 2 |
| Prompt/context engineering | 3 |
| Competitor analysis | 2 |
| Customer insight synthesis | 3 |
| Product strategy | 3 |
| PRD generation | 3 |
| AI evaluation | 2 |
| Final product case | 2 |
| **Total** | **20** |

---

# 9. Supabase Architecture

## 9.1 Recommended Stack

```text
Next.js
React
TypeScript
Tailwind
shadcn/ui
        ↓
Supabase
 ├── Auth
 ├── PostgreSQL
 ├── pgvector
 ├── Storage
 ├── Realtime
 └── Edge Functions
        ↓
AI Gateway
 ├── LLM
 ├── RAG
 ├── Agent Runtime
 ├── Tool Calling
 └── Evaluation
        ↓
JARVIS
```

Enterprise SSO:

```text
Microsoft Entra ID
       ↓
Supabase Auth / OIDC
       ↓
TANIA RBAC
       ↓
PostgreSQL RLS
```

---

# 10. Supabase ERD

## 10.1 Organization & Identity

```text
auth.users
    │
    └── profiles
          │
          ├── organization_memberships
          │        ├── organizations
          │        ├── squads
          │        └── roles
          │
          └── talent_profiles
```

## 10.2 Capability

```text
capability_domains
      │
      └── capabilities
             │
             ├── capability_levels
             ├── talent_capabilities
             │       └── capability_evidence
             │
             └── capability_requirements
```

## 10.3 Work

```text
projects
   │
   ├── assignments
   │       └── profiles
   │
   ├── deliverables
   │
   └── business_impacts
```

## 10.4 Performance

```text
performance_periods
       │
       ├── performance_metrics
       ├── performance_evidence
       └── performance_reviews
```

## 10.5 Development

```text
development_plans
       │
       ├── learning_paths
       ├── learning_activities
       └── learning_evidence
```

## 10.6 AI

```text
ai_usage
ai_assessments
ai_augmentation
ai_interactions
agent_runs
agent_tool_calls
```

---

# 11. Database Schema

The following schema is the MVP baseline.

## 11.1 Profiles

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text unique,
  full_name text not null,
  email text not null,
  job_title text,
  grade text,
  department text,
  chapter_id uuid,
  squad_id uuid,
  manager_id uuid references public.profiles(id),
  status text not null default 'active',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 11.2 Organizations

```sql
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  type text not null default 'chapter',
  parent_id uuid references public.organizations(id),
  created_at timestamptz not null default now()
);
```

## 11.3 Squads

```sql
create table public.squads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  code text not null,
  manager_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
```

## 11.4 Roles

```sql
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
```

## 11.5 Organization Memberships

```sql
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, organization_id, role_id)
);
```

## 11.6 Talent Profiles

```sql
create table public.talent_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references public.profiles(id) on delete cascade,
  summary text,
  years_experience numeric(5,2),
  career_level text,
  talent_status text default 'active',
  potential_flag boolean default false,
  last_assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 11.7 Capability Domains

```sql
create table public.capability_domains (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  description text,
  sort_order integer default 0
);
```

## 11.8 Capabilities

```sql
create table public.capabilities (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.capability_domains(id),
  code text unique not null,
  name text not null,
  description text,
  criticality text default 'medium',
  active boolean default true,
  created_at timestamptz not null default now()
);
```

## 11.9 Capability Levels

```sql
create table public.capability_levels (
  id uuid primary key default gen_random_uuid(),
  level integer unique not null check(level between 1 and 5),
  name text not null,
  description text
);
```

## 11.10 Talent Capabilities

```sql
create table public.talent_capabilities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability_id uuid not null references public.capabilities(id),
  current_level integer not null default 1 check(current_level between 1 and 5),
  target_level integer check(target_level between 1 and 5),
  confidence numeric(5,2),
  assessment_status text default 'provisional',
  assessed_at timestamptz,
  assessed_by uuid references public.profiles(id),
  unique(profile_id, capability_id)
);
```

## 11.11 Capability Evidence

```sql
create table public.capability_evidence (
  id uuid primary key default gen_random_uuid(),
  talent_capability_id uuid not null references public.talent_capabilities(id) on delete cascade,
  source_type text not null,
  source_reference text,
  title text not null,
  description text,
  evidence_url text,
  evidence_score numeric(5,2),
  validation_status text default 'pending',
  validated_by uuid references public.profiles(id),
  occurred_at timestamptz,
  created_at timestamptz default now()
);
```

## 11.12 Projects

```sql
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text unique not null,
  name text not null,
  description text,
  status text not null default 'planning',
  customer_name text,
  start_date date,
  end_date date,
  budget numeric(18,2),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## 11.13 Assignments

```sql
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  role_name text,
  allocation_pct numeric(5,2) not null default 100,
  start_date date,
  end_date date,
  status text default 'active',
  created_at timestamptz default now()
);
```

## 11.14 Deliverables

```sql
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid references public.profiles(id),
  title text not null,
  type text,
  status text default 'planned',
  quality_score numeric(5,2),
  customer_score numeric(5,2),
  due_date date,
  completed_at timestamptz,
  evidence_url text,
  created_at timestamptz default now()
);
```

## 11.15 Performance Periods

```sql
create table public.performance_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  period_type text not null,
  start_date date not null,
  end_date date not null,
  status text default 'open',
  created_at timestamptz default now()
);
```

## 11.16 Performance Metrics

```sql
create table public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid not null references public.performance_periods(id),
  metric_code text not null,
  metric_name text not null,
  score numeric(8,2),
  weight numeric(8,4),
  source text,
  created_at timestamptz default now()
);
```

## 11.17 Performance Evidence

```sql
create table public.performance_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid references public.performance_periods(id),
  dimension text not null,
  metric text,
  value numeric(18,4),
  unit text,
  source_type text not null,
  source_reference text,
  evidence_text text,
  confidence numeric(5,2),
  validation_status text default 'pending',
  validated_by uuid references public.profiles(id),
  occurred_at timestamptz,
  created_at timestamptz default now()
);
```

## 11.18 Performance Reviews

```sql
create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  period_id uuid not null references public.performance_periods(id),
  reviewer_id uuid not null references public.profiles(id),
  overall_score numeric(8,2),
  strengths text,
  development_areas text,
  manager_comment text,
  status text default 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now(),
  unique(profile_id, period_id)
);
```

## 11.19 Development Plans

```sql
create table public.development_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  objective text,
  source_capability_gap text,
  status text default 'draft',
  start_date date,
  target_date date,
  completion_pct numeric(5,2) default 0,
  owner_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## 11.20 Learning Paths

```sql
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  development_plan_id uuid not null references public.development_plans(id) on delete cascade,
  title text not null,
  total_hours numeric(8,2),
  methodology text,
  created_at timestamptz default now()
);
```

## 11.21 Learning Activities

```sql
create table public.learning_activities (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths(id) on delete cascade,
  title text not null,
  activity_type text not null,
  sequence_no integer not null,
  estimated_hours numeric(8,2),
  status text default 'planned',
  completed_at timestamptz
);
```

## 11.22 Learning Evidence

```sql
create table public.learning_evidence (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.learning_activities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  evidence_type text not null,
  evidence_url text,
  score numeric(8,2),
  evaluator_id uuid references public.profiles(id),
  submitted_at timestamptz default now()
);
```

## 11.23 AI Usage

```sql
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  tool_name text not null,
  use_case text not null,
  task_type text,
  started_at timestamptz,
  completed_at timestamptz,
  output_reference text,
  productivity_delta numeric(8,2),
  quality_score numeric(8,2),
  approved_tool boolean default false,
  created_at timestamptz default now()
);
```

## 11.24 AI Assessments

```sql
create table public.ai_assessments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  capability_id uuid references public.capabilities(id),
  assessment_type text not null,
  score numeric(8,2),
  evidence text,
  evaluator_type text,
  created_at timestamptz default now()
);
```

## 11.25 AI Augmentation

```sql
create table public.ai_augmentation (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  period_id uuid references public.performance_periods(id),
  research_score numeric(8,2),
  analysis_score numeric(8,2),
  writing_score numeric(8,2),
  product_score numeric(8,2),
  solution_score numeric(8,2),
  automation_score numeric(8,2),
  overall_score numeric(8,2),
  evidence_count integer default 0,
  created_at timestamptz default now()
);
```

## 11.26 Business Impact

```sql
create table public.business_impacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  profile_id uuid references public.profiles(id),
  capability_id uuid references public.capabilities(id),
  impact_type text not null,
  metric_name text not null,
  baseline numeric(18,4),
  target numeric(18,4),
  actual numeric(18,4),
  unit text,
  monetary_value numeric(18,2),
  evidence_url text,
  validated_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
```

## 11.27 AI Interactions

```sql
create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  session_id uuid,
  assistant text not null default 'tania',
  intent text,
  user_message text,
  response_summary text,
  citations jsonb,
  tools_used jsonb,
  latency_ms integer,
  feedback text,
  created_at timestamptz default now()
);
```

## 11.28 Agent Runs

```sql
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  agent_name text not null,
  task_type text not null,
  status text not null default 'started',
  input jsonb,
  output jsonb,
  confidence numeric(5,2),
  human_approval_required boolean default false,
  human_approved boolean default false,
  started_at timestamptz default now(),
  completed_at timestamptz
);
```

## 11.29 Agent Tool Calls

```sql
create table public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_name text not null,
  arguments jsonb,
  result jsonb,
  status text default 'completed',
  created_at timestamptz default now()
);
```

## 11.30 Recommendations

```sql
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  recommendation_type text not null,
  title text not null,
  rationale text,
  priority text,
  confidence numeric(5,2),
  evidence jsonb,
  status text default 'open',
  created_by_agent text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
```

## 11.31 Audit Logs

```sql
create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz default now()
);
```

---

# 12. RLS / RBAC Model

## 12.1 Roles

```text
SUPER_ADMIN
EXECUTIVE
CHAPTER_LEAD
MANAGER
PROJECT_MANAGER
TALENT
HR
AI_SERVICE
```

## 12.2 Access Model

| Role | Own | Squad | Chapter | Enterprise |
|---|---:|---:|---:|---:|
| Talent | RW | R limited | - | - |
| Manager | RW | RW | R aggregated | - |
| Project Manager | R | R project | R project | - |
| Chapter Lead | RW | RW | RW | R aggregated |
| Executive | R | R | R aggregated | R aggregated |
| HR | RW | RW | RW | policy-dependent |
| Super Admin | technical | technical | technical | technical |
| AI Service | scoped | scoped | scoped | no unrestricted access |

AI service access must be constrained by the requesting user's authorization context.

---

# 13. Supabase RLS Design

## 13.1 Helper Functions

Recommended security-definer helpers:

```sql
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;
```

Role check:

```sql
create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    join public.roles r on r.id = om.role_id
    where om.user_id = auth.uid()
      and r.code = required_role
  );
$$;
```

## 13.2 Own-Profile Policy

```sql
alter table public.profiles enable row level security;

create policy "profile_self_read"
on public.profiles
for select
using (
  id = auth.uid()
  or public.has_role('SUPER_ADMIN')
  or public.has_role('HR')
);
```

## 13.3 Talent Capability Policy

```sql
alter table public.talent_capabilities enable row level security;

create policy "talent_capability_read"
on public.talent_capabilities
for select
using (
  profile_id = auth.uid()
  or public.has_role('SUPER_ADMIN')
  or public.has_role('HR')
  or public.has_role('CHAPTER_LEAD')
  or public.has_role('MANAGER')
);
```

## 13.4 Performance Evidence

Sensitive performance evidence must not be globally readable.

Baseline:

```sql
alter table public.performance_evidence enable row level security;

create policy "performance_evidence_access"
on public.performance_evidence
for select
using (
  profile_id = auth.uid()
  or public.has_role('SUPER_ADMIN')
  or public.has_role('HR')
  or public.has_role('CHAPTER_LEAD')
  or public.has_role('MANAGER')
);
```

Production implementation must add **organization/squad boundary checks**, not rely only on role checks.

## 13.5 AI Interaction Privacy

```sql
alter table public.ai_interactions enable row level security;

create policy "ai_interaction_owner"
on public.ai_interactions
for all
using (
  user_id = auth.uid()
  or public.has_role('SUPER_ADMIN')
);
```

AI conversations are private by default.

---

# 14. Security Requirements

## 14.1 Authentication

- Microsoft Entra ID / OIDC
- Supabase Auth
- SSO
- MFA inherited from enterprise identity layer where configured

## 14.2 Authorization

- RBAC
- RLS
- least privilege
- server-side authorization
- no trust in client-side role checks

## 14.3 Data Protection

- TLS
- encrypted storage
- secrets in environment/secret manager
- no sensitive employee data in client logs
- audit trail for sensitive operations

## 14.4 AI Security

AI must not:

- decide promotion;
- decide termination;
- issue disciplinary decisions;
- assign final performance rating;
- expose another user's private data;
- bypass RLS;
- execute consequential actions without authorization.

AI may:

- analyze;
- summarize;
- detect;
- recommend;
- retrieve evidence;
- draft;
- calculate;
- identify capability gaps;
- propose development actions.

---

# 15. API Contract

Base:

```text
/api/v1
```

## 15.1 Authentication

```http
GET /api/v1/me
```

Response:

```json
{
  "id": "uuid",
  "employeeId": "EMP001",
  "name": "User Name",
  "roles": ["CHAPTER_LEAD"],
  "organizationId": "uuid",
  "permissions": [
    "talent.read",
    "performance.read",
    "capability.write",
    "development.write"
  ]
}
```

---

# 16. Talent API

## GET /talents

Query:

```text
?page=1&pageSize=25
&search=
&squadId=
&capabilityId=
&minLevel=
&status=
```

Response:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 0
  }
}
```

## GET /talents/:id

Returns:

```json
{
  "profile": {},
  "capabilities": [],
  "performance": {},
  "assignments": [],
  "development": [],
  "aiAugmentation": {},
  "businessImpact": []
}
```

## PATCH /talents/:id

Restricted to authorized roles.

---

# 17. Capability API

## GET /capabilities

## GET /capabilities/:id

## GET /talents/:id/capabilities

## POST /talents/:id/capabilities

## POST /talent-capabilities/:id/evidence

Example:

```json
{
  "sourceType": "PROJECT_DELIVERABLE",
  "title": "AI Product Strategy",
  "description": "Produced product strategy for project X",
  "sourceReference": "PROJECT-123",
  "evidenceScore": 86
}
```

## GET /capability-gaps

Filters:

```text
profileId
capabilityId
squadId
criticality
priority
```

---

# 18. Performance API

## GET /performance/dashboard

## GET /performance/talents/:id

## GET /performance/talents/:id/evidence

## POST /performance/evidence

## GET /performance/reviews/:id

## POST /performance/reviews/:id/submit

## POST /performance/reviews/:id/approve

Approval is human-only.

---

# 19. Development API

## GET /development/plans

## POST /development/plans

## GET /development/plans/:id

## PATCH /development/plans/:id

## POST /development/plans/:id/generate-learning-path

AI may generate a draft learning path.

Final adoption requires user/manager confirmation.

## POST /learning-activities/:id/evidence

---

# 20. Assignment API

## GET /assignments

## POST /assignments

## PATCH /assignments/:id

## GET /talent-matching

Query:

```text
projectId
role
capabilities[]
minimumLevel
availability
```

Response:

```json
{
  "matches": [
    {
      "profileId": "uuid",
      "matchScore": 87,
      "capabilityCoverage": 92,
      "availability": 80,
      "evidence": []
    }
  ]
}
```

The score is a decision-support signal, not an autonomous staffing decision.

---

# 21. AI API

## POST /ai/chat

Request:

```json
{
  "message": "Siapa talent yang memiliki capability AI Product Management level 3?",
  "context": {
    "scope": "chapter"
  },
  "sessionId": "uuid"
}
```

Response:

```json
{
  "answer": "...",
  "intent": "TALENT_SEARCH",
  "citations": [],
  "toolsUsed": [
    "search_talent_capability"
  ],
  "confidence": 0.91,
  "requiresApproval": false
}
```

## POST /ai/analyze-performance

## POST /ai/analyze-capability-gap

## POST /ai/generate-development-plan

## POST /ai/match-talent

## POST /ai/business-impact

---

# 22. Dashboard API

## GET /dashboard/executive

Example:

```json
{
  "talentCount": 0,
  "activeProjects": 0,
  "performanceIndex": 0,
  "capabilityCoverage": 0,
  "criticalCapabilityGaps": 0,
  "aiAugmentationIndex": 0,
  "developmentProgress": 0,
  "businessImpact": {}
}
```

---

# 23. Next.js Information Architecture

Recommended App Router structure:

```text
app/
├── (auth)/
│   └── login/
│
├── (portal)/
│   ├── dashboard/
│   ├── talents/
│   │   ├── page.tsx
│   │   └── [id]/
│   ├── performance/
│   ├── capabilities/
│   ├── development/
│   ├── assignments/
│   ├── projects/
│   ├── ai/
│   ├── business-impact/
│   ├── reports/
│   └── settings/
│
├── api/
│   └── v1/
│       ├── talents/
│       ├── capabilities/
│       ├── performance/
│       ├── development/
│       ├── assignments/
│       ├── dashboard/
│       └── ai/
│
└── layout.tsx
```

---

# 24. Navigation Model

Primary navigation:

```text
TANIA
│
├── Executive Dashboard
├── Talent
├── Performance
├── Capability
├── Development
├── Work & Assignment
├── Projects
├── Business Impact
├── AI Assistant
└── Administration
```

Global header:

```text
[☰] TANIA
[Search]
[AI Assistant]
[Notifications]
[Profile]
```

---

# 25. Screen Specification

## S01 — Login

Purpose:

Authenticate enterprise users.

Components:

- Telkom logo;
- TANIA logo;
- SSO button;
- security notice.

Primary action:

`Sign in with Telkom Account`

---

# 26. S02 — Executive Dashboard

Route:

```text
/dashboard
```

Layout:

```text
┌─────────────────────────────────────────────┐
│ TANIA                         AI Assistant   │
├─────────────────────────────────────────────┤
│ Talent │ Performance │ Capability │ Impact │
├─────────────────────────────────────────────┤
│ Talent Health        Capability Coverage    │
│     87                    82%                │
├─────────────────────────────────────────────┤
│ Critical Capability Gaps                    │
│ ███████████ AI Product                       │
│ ████████ Solution Architecture              │
├─────────────────────────────────────────────┤
│ AI Augmentation │ Development │ Impact      │
└─────────────────────────────────────────────┘
```

Interactions:

- filter by period;
- squad;
- role;
- capability domain.

---

# 27. S03 — Talent Directory

Route:

```text
/talents
```

Features:

- search;
- filters;
- capability;
- role;
- level;
- performance;
- availability;
- AI capability.

Table:

```text
Talent | Role | Capability | Performance | AI | Availability | Action
```

---

# 28. S04 — Talent 360 Profile

Route:

```text
/talents/[id]
```

Tabs:

```text
Overview
Capability
Performance
Projects
Development
AI Augmentation
Business Impact
Evidence
```

Hero section:

```text
Talent Name
Role
Squad
Performance Index
Capability Coverage
AI Augmentation
Development Progress
```

---

# 29. S05 — Performance Cockpit

Route:

```text
/performance
```

Views:

- chapter;
- squad;
- individual.

Visuals:

- performance trend;
- dimension radar;
- evidence;
- performance drivers;
- risk signals;
- development actions.

---

# 30. S06 — Capability Matrix

Route:

```text
/capabilities
```

Matrix:

```text
Talent ↓
Capability →
```

Cell:

```text
L1 L2 L3 L4 L5
```

Color should communicate maturity, but exact visual treatment remains a UI design decision.

Actions:

- identify gaps;
- filter critical capability;
- drill-down;
- create development plan.

---

# 31. S07 — Capability Gap

Route:

```text
/capabilities/gaps
```

Cards:

```text
Critical Gap
Capability
Required Level
Current Level
Priority
Affected Talent
Business Impact
```

CTA:

`Generate Development Plan`

---

# 32. S08 — Development Center

Route:

```text
/development
```

Views:

- My Development;
- Team Development;
- Capability Sprint;
- Learning Evidence.

Progress:

```text
Capability Gap
    ↓
20h Sprint
    ↓
Activities
    ↓
Evidence
    ↓
Assessment
```

---

# 33. S09 — Work & Assignment

Route:

```text
/assignments
```

Inputs:

- project;
- role;
- capability;
- required level;
- duration.

Output:

```text
Recommended Talent
Match Score
Capability Coverage
Availability
Evidence
```

Human confirms assignment.

---

# 34. S10 — Projects

Route:

```text
/projects
```

Project detail:

```text
Overview
Team
Required Capability
Deliverables
Performance
Budget
Business Impact
```

---

# 35. S11 — Business Impact

Route:

```text
/business-impact
```

Views:

- project impact;
- talent impact;
- capability impact;
- financial impact;
- efficiency;
- customer impact.

Traceability:

```text
Talent
 ↓
Capability
 ↓
Project
 ↓
Deliverable
 ↓
Outcome
 ↓
Business Impact
```

---

# 36. S12 — AI Assistant

Route:

```text
/ai
```

Layout:

```text
┌─────────────────────────────────────────────┐
│ TANIA AI ASSISTANT                          │
├─────────────────────────────────────────────┤
│ Ask TANIA anything...                       │
│                                             │
│ "Which capabilities are critical gaps?"     │
│                                             │
├─────────────────────────────────────────────┤
│ Answer                                      │
│                                             │
│ Evidence                                    │
│ [Talent] [Capability] [Project]             │
│                                             │
│ Recommended Action                          │
└─────────────────────────────────────────────┘
```

---

# 37. S13 — Administration

Route:

```text
/settings
```

Modules:

- users;
- roles;
- organizations;
- squads;
- capabilities;
- performance weights;
- AI policies;
- integrations;
- audit logs.

---

# 38. TANIA AI Assistant Specification

## 38.1 Objective

TANIA AI Assistant is the natural-language intelligence interface to the TANIA data and capability graph.

It must answer questions using:

> **Data + Evidence + Context + Authorization**

not generic LLM knowledge alone.

---

# 39. AI Architecture

```text
User
 ↓
TANIA Experience
 ↓
AI Gateway
 ↓
Intent Classifier
 ↓
Policy / Authorization
 ↓
Agent Router
 ↓
┌───────────────────────────────────────┐
│ Talent Agent                          │
│ Performance Agent                     │
│ Capability Agent                      │
│ Development Agent                     │
│ Assignment Agent                      │
│ Business Impact Agent                 │
│ Product Agent                         │
│ Solution Agent                        │
│ Business Case Agent                   │
└───────────────────────────────────────┘
 ↓
Tools
 ↓
Supabase / RAG / Enterprise Systems
 ↓
Evidence + Answer
 ↓
TANIA UI
```

---

# 40. AI Assistant Intents

Initial intents:

```text
TALENT_SEARCH
TALENT_PROFILE
PERFORMANCE_ANALYSIS
PERFORMANCE_SUMMARY
CAPABILITY_SEARCH
CAPABILITY_GAP
CAPABILITY_COVERAGE
DEVELOPMENT_PLAN
LEARNING_PATH
TALENT_MATCHING
PROJECT_STAFFING
AI_AUGMENTATION
BUSINESS_IMPACT
EXECUTIVE_SUMMARY
REPORT_GENERATION
KNOWLEDGE_SEARCH
```

---

# 41. AI Response Contract

Every answer should use:

```json
{
  "answer": "...",
  "intent": "...",
  "confidence": 0.0,
  "evidence": [],
  "citations": [],
  "toolsUsed": [],
  "dataFreshness": "...",
  "scope": "...",
  "requiresApproval": false
}
```

Rules:

1. Never fabricate employee data.
2. Never expose unauthorized records.
3. Cite evidence where applicable.
4. State uncertainty.
5. Distinguish data from inference.
6. Do not make consequential HR decisions.
7. Ask for clarification if query scope is ambiguous.

---

# 42. RAG Architecture

## 42.1 Knowledge Sources

Initial sources:

- DPS capability framework;
- product knowledge;
- solution knowledge;
- architecture standards;
- performance framework;
- learning content;
- internal playbooks;
- approved documentation.

## 42.2 Vector Model

Recommended:

```text
Supabase pgvector
```

Knowledge table:

```sql
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null,
  source_uri text,
  content text not null,
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536),
  access_scope jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

Actual embedding dimension must match the selected embedding model.

---

# 43. JARVIS Integration

TANIA invokes JARVIS when the request changes from:

> **Understand / Measure**

to:

> **Build / Practice / Execute**

Example:

```text
User:
"Capability AI Product Management saya masih L2.
Apa yang harus saya lakukan agar menjadi L3?"

TANIA:
- identifies gap
- retrieves required L3 evidence
- creates capability diagnosis

JARVIS:
- generates 20-hour sprint
- provides coaching
- creates exercises
- reviews outputs
- recommends evidence
- supports project execution

TANIA:
- records evidence
- updates development progress
- recalculates capability
- links result to business impact
```

---

# 44. TANIA/JARVIS Agent Specification

## 44.1 Agent Architecture

```text
                       TANIA
                         │
                  Agent Router
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
 Talent Intelligence  Performance     Capability
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                  Development
                         │
                  JARVIS Layer
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
 Product Agent     Solution Agent    Business Case
        │                │                 │
        └────────────────┼─────────────────┘
                         │
                  Enterprise Data
```

---

# 45. Agent 01 — Talent Intelligence Agent

### Mission

Find and explain talent information within authorized scope.

### Tools

```text
search_talents
get_talent_profile
get_talent_capabilities
get_talent_projects
get_talent_availability
```

### Outputs

- talent profile;
- capability;
- evidence;
- assignment;
- availability.

---

# 46. Agent 02 — Performance Agent

### Mission

Analyze performance based on evidence.

### Tools

```text
get_performance_metrics
get_performance_evidence
get_performance_reviews
calculate_performance_trend
```

### Output

```text
Performance Summary
Drivers
Evidence
Development Areas
Recommended Actions
Confidence
```

The agent cannot approve final performance ratings.

---

# 47. Agent 03 — Capability Agent

### Mission

Understand capability maturity and identify gaps.

### Tools

```text
get_capability
get_talent_capabilities
get_capability_evidence
calculate_capability_gap
get_critical_capabilities
```

---

# 48. Agent 04 — Development Agent

### Mission

Convert capability gaps into development plans.

### Tools

```text
create_development_plan
generate_learning_path
create_capability_sprint
track_learning_progress
evaluate_learning_evidence
```

Human confirmation is required before a generated plan becomes an official commitment.

---

# 49. Agent 05 — Assignment Agent

### Mission

Match talent with work.

### Tools

```text
get_project_requirements
get_talent_capabilities
get_talent_availability
calculate_match
```

The agent recommends; authorized humans decide.

---

# 50. Agent 06 — AI Augmentation Agent

### Mission

Measure how AI contributes to talent capability and productivity.

### Tools

```text
get_ai_usage
get_ai_assessments
calculate_ai_augmentation
compare_before_after
```

---

# 51. Agent 07 — Business Impact Agent

### Mission

Connect talent/capability development with business outcomes.

### Tools

```text
get_project
get_deliverables
get_business_impacts
calculate_impact
trace_capability_to_outcome
```

---

# 52. Agent 08 — JARVIS Capability Coach

### Mission

Act as AI capability coach.

Flow:

```text
Diagnose
 ↓
Explain
 ↓
Teach
 ↓
Practice
 ↓
Challenge
 ↓
Review
 ↓
Improve
 ↓
Generate Evidence
```

JARVIS should be able to generate:

- learning challenge;
- case study;
- practice task;
- feedback;
- simulation;
- role-play;
- assessment;
- project assignment suggestion.

---

# 53. Agent 09 — Product Agent

Capabilities:

```text
market research
customer insight
product discovery
product strategy
PRD
roadmap
competitor analysis
product KPI
```

---

# 54. Agent 10 — Solution Agent

Capabilities:

```text
solution architecture
technical design
BOM
architecture review
integration design
security consideration
solution proposal
```

---

# 55. Agent 11 — Business Case Agent

Capabilities:

```text
business model
revenue model
cost model
ROI
NPV
IRR
sensitivity analysis
business case narrative
```

Financial outputs should remain transparent and reviewable.

---

# 56. Agent Tool Contract

Example:

```typescript
type AgentTool = {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  permission: string[];
  requiresApproval: boolean;
};
```

Example:

```json
{
  "name": "search_talents",
  "description": "Search authorized talent records by capability and role",
  "permission": ["talent.read"],
  "requiresApproval": false
}
```

---

# 57. Agent Execution Contract

```typescript
type AgentRun = {
  id: string;
  agent: string;
  userId: string;
  task: string;
  input: unknown;
  output?: unknown;
  tools: ToolCall[];
  confidence?: number;
  citations: Citation[];
  requiresApproval: boolean;
  approvedBy?: string;
  status:
    | "started"
    | "running"
    | "awaiting_approval"
    | "completed"
    | "failed";
};
```

---

# 58. Human-in-the-Loop Policy

## No Approval Required

- search;
- summarize;
- retrieve;
- analyze;
- calculate;
- draft;
- recommend.

## Approval Required

- official performance rating;
- talent assignment;
- development plan commitment;
- sensitive data export;
- external communication;
- business/legal/commercial commitment;
- consequential HR action;
- production system mutation.

---

# 59. Repository Blueprint

Recommended MVP repository:

```text
tania/
├── app/
│   ├── (auth)/
│   ├── (portal)/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── dashboard/
│   ├── talent/
│   ├── performance/
│   ├── capability/
│   ├── development/
│   ├── assignment/
│   ├── ai/
│   └── business-impact/
│
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── rbac/
│   ├── permissions/
│   ├── ai/
│   ├── rag/
│   ├── agents/
│   ├── calculations/
│   └── audit/
│
├── agents/
│   ├── router.ts
│   ├── talent-agent.ts
│   ├── performance-agent.ts
│   ├── capability-agent.ts
│   ├── development-agent.ts
│   ├── assignment-agent.ts
│   ├── ai-augmentation-agent.ts
│   ├── business-impact-agent.ts
│   ├── jarvis-coach.ts
│   ├── product-agent.ts
│   ├── solution-agent.ts
│   └── business-case-agent.ts
│
├── tools/
│   ├── talent/
│   ├── capability/
│   ├── performance/
│   ├── development/
│   ├── assignment/
│   └── business-impact/
│
├── supabase/
│   ├── migrations/
│   ├── seed/
│   └── functions/
│
├── types/
│   ├── database.ts
│   ├── api.ts
│   ├── ai.ts
│   └── agents.ts
│
├── docs/
│   ├── PRD/
│   ├── architecture/
│   ├── API/
│   └── AI/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── rls/
│   └── e2e/
│
├── .env.example
├── middleware.ts
├── package.json
└── README.md
```

---

# 60. Core Domain Services

```text
TalentService
CapabilityService
PerformanceService
DevelopmentService
AssignmentService
ProjectService
BusinessImpactService
AIService
AgentService
AuditService
```

The service layer must not bypass authorization.

---

# 61. Calculation Engine

Calculations should be centralized.

Example:

```typescript
calculatePerformanceIndex()
calculateCapabilityCoverage()
calculateCapabilityGap()
calculateTalentHealthIndex()
calculateAIaugmentationIndex()
calculateTalentMatchScore()
calculateDevelopmentProgress()
calculateBusinessImpact()
```

Do not duplicate business formulas inside UI components.

---

# 62. Intelligence Metrics

## Talent Health Index

Conceptual:

```text
THI =
Performance
+ Capability
+ Development
+ Deployment
+ AI Augmentation
```

The formula must be configurable.

## Capability Coverage

```text
Proven Capability
/
Required Capability
```

## Development Progress

```text
Completed Evidence
/
Required Evidence
```

## AI Augmentation Index

Composite indicator across:

- AI adoption;
- productivity;
- quality;
- automation;
- capability uplift.

Metrics must show underlying evidence.

---

# 63. Data Freshness

Every dashboard metric should expose:

```text
lastUpdatedAt
source
dataFreshness
```

Example:

```text
Capability Coverage
82%
Updated 10 minutes ago
Source: TANIA Capability Engine
```

---

# 64. Auditability

Sensitive operations create audit records.

Examples:

```text
PROFILE_VIEW
PROFILE_UPDATE
CAPABILITY_UPDATE
EVIDENCE_CREATE
PERFORMANCE_SUBMIT
PERFORMANCE_APPROVE
DEVELOPMENT_APPROVE
ASSIGNMENT_RECOMMEND
ASSIGNMENT_APPROVE
AI_QUERY
AI_TOOL_CALL
DATA_EXPORT
ADMIN_CHANGE
```

---

# 65. Observability

Track:

### Application

- request latency;
- error rate;
- availability;
- database performance.

### AI

- latency;
- token usage;
- tool-call success;
- hallucination/grounding evaluation;
- citation coverage;
- user feedback;
- agent failure.

### Product

- active users;
- feature adoption;
- AI adoption;
- development completion;
- capability gap closure.

---

# 66. MVP Definition

## MVP 1 — Foundation

Must include:

- SSO;
- profile;
- organization;
- squad;
- role;
- capability framework;
- talent capability matrix;
- performance framework;
- evidence;
- dashboard;
- RBAC;
- RLS;
- audit.

## MVP 2 — Intelligence

Add:

- capability gap engine;
- development plan;
- 20-hour sprint;
- AI Assistant;
- RAG;
- JARVIS integration;
- talent matching;
- AI augmentation.

## MVP 3 — Impact

Add:

- business impact;
- predictive/early-warning analytics;
- multi-agent orchestration;
- enterprise integrations;
- cross-chapter intelligence.

---

# 67. MVP Acceptance Criteria

## Talent

- [ ] User can authenticate via SSO.
- [ ] User profile loads.
- [ ] Authorized manager can see team.
- [ ] Talent can update allowed profile attributes.
- [ ] Sensitive data is protected by RLS.

## Capability

- [ ] Capability framework exists.
- [ ] Talent capability level is stored.
- [ ] Evidence can be attached.
- [ ] Gap is calculated.
- [ ] Critical gaps are visible.

## Performance

- [ ] Performance period exists.
- [ ] Evidence is recorded.
- [ ] Performance index is calculated.
- [ ] Manager can review.
- [ ] Approval is human-only.

## Development

- [ ] Development plan can be created.
- [ ] AI can draft learning path.
- [ ] 20-hour sprint can be generated.
- [ ] Evidence can be submitted.
- [ ] Progress is tracked.

## AI

- [ ] AI Assistant is available.
- [ ] AI respects authorization.
- [ ] AI uses approved tools.
- [ ] AI responses expose evidence/citations where applicable.
- [ ] AI interactions are auditable.
- [ ] Consequential actions require approval.

## Security

- [ ] RLS enabled.
- [ ] Role checks enforced server-side.
- [ ] Audit logging enabled.
- [ ] No sensitive information in browser logs.
- [ ] Secrets are not committed.
- [ ] API authorization tested.

---

# 68. Test Strategy

## Unit

- calculation engine;
- permissions;
- agent routing;
- schema validation.

## Integration

- Supabase;
- API;
- AI gateway;
- RAG;
- agent tools.

## RLS

Explicit tests for:

```text
Talent → own data
Manager → squad data
Chapter Lead → chapter data
Executive → aggregate data
Unauthorized → denied
```

## E2E

Critical journeys:

### Journey 1 — Talent

```text
Login
→ Profile
→ Capability
→ Gap
→ Development
→ Evidence
```

### Journey 2 — Manager

```text
Login
→ Team
→ Performance
→ Capability Gap
→ Development
→ Review
```

### Journey 3 — Chapter Leader

```text
Login
→ Executive Dashboard
→ Critical Gap
→ Talent Search
→ Matching
→ Impact
```

### Journey 4 — AI

```text
Ask TANIA
→ Intent
→ Authorization
→ Agent
→ Tool
→ Evidence
→ Answer
```

---

# 69. Seed Data

MVP seed should include:

### Roles

```text
SUPER_ADMIN
EXECUTIVE
CHAPTER_LEAD
MANAGER
PROJECT_MANAGER
TALENT
HR
AI_SERVICE
```

### Capability domains

```text
Product
Solution
Business
Architecture
AI
Data
Technology
Leadership
Commercial
Industry
```

### Capability examples

```text
AI Product Management
Product Discovery
Product Strategy
Prompt Engineering
AI/RAG
Solution Architecture
Enterprise Architecture
Cloud Architecture
Business Case
Consulting
Customer Discovery
Data Analytics
AI Governance
```

---

# 70. Recommended Initial Dashboard KPIs

Initial executive scorecard:

```text
1. Talent Health
2. Performance
3. Capability Coverage
4. Critical Capability Gap
5. Development Progress
6. AI Augmentation
7. Talent Utilization
8. Business Impact
```

The dashboard should prioritize **trend + evidence + action**, not only static numbers.

---

# 71. Proposed Product Maturity

```text
L1 — VISIBILITY
Talent data is centralized.

L2 — MONITORING
Performance and capability are measurable.

L3 — INTELLIGENCE
TANIA identifies gaps and recommends actions.

L4 — AUGMENTATION
JARVIS actively supports development and work.

L5 — OPTIMIZATION
Talent, capability, work and business impact are continuously optimized.
```

Target trajectory:

```text
2026 → L2 → L3
2027 → L4
Future → L5
```

---

# 72. Implementation Sequence

## Sprint 0 — Architecture

```text
Repository
Supabase project
Auth
Environment
CI/CD
Design system
Database migration framework
```

## Sprint 1 — Identity & Talent

```text
SSO
Profiles
Organizations
Squads
Roles
Talent Directory
Talent 360
```

## Sprint 2 — Capability

```text
Capability Framework
Talent Capability
Evidence
Capability Matrix
Gap Engine
```

## Sprint 3 — Performance

```text
Performance Period
Metrics
Evidence
Performance Cockpit
Manager Review
```

## Sprint 4 — Development

```text
Development Plan
Learning Path
20-hour Sprint
Evidence
Progress
```

## Sprint 5 — AI

```text
AI Gateway
RAG
TANIA Assistant
Talent Agent
Capability Agent
Performance Agent
Development Agent
```

## Sprint 6 — JARVIS

```text
JARVIS Coach
Product Agent
Solution Agent
Business Case Agent
Tool Calling
Human Approval
```

## Sprint 7 — Impact

```text
Business Impact
Impact Traceability
Executive Intelligence
```

---

# 73. Environment Strategy

```text
local
 ↓
development
 ↓
staging
 ↓
production
```

Environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

ENTRA_CLIENT_ID
ENTRA_CLIENT_SECRET
ENTRA_TENANT_ID

AI_GATEWAY_URL
AI_GATEWAY_KEY

EMBEDDING_MODEL
LLM_MODEL

JARVIS_API_URL
JARVIS_API_KEY
```

Secrets must never be exposed to client-side code.

---

# 74. Definition of Done

A feature is not complete until it has:

```text
PRD requirement
↓
DB schema
↓
RLS
↓
API
↓
Service
↓
UI
↓
Validation
↓
Audit
↓
Error handling
↓
Unit test
↓
Integration test
↓
E2E test
↓
Documentation
```

---

# 75. Product Governance

TANIA should operate under the following principle:

> **AI recommends. Human decides. System records. Evidence explains.**

For every AI recommendation:

```text
Recommendation
+
Evidence
+
Confidence
+
Data Freshness
+
Scope
+
Human Decision
```

must be traceable.

---

# 76. Final Target Architecture

```text
                         ┌───────────────────────────┐
                         │        TANIA PORTAL       │
                         │ Next.js / React / shadcn │
                         └─────────────┬─────────────┘
                                       │
                         ┌─────────────▼─────────────┐
                         │       TANIA AI ASSISTANT   │
                         └─────────────┬─────────────┘
                                       │
                              AI Gateway / Router
                                       │
             ┌─────────────────────────┼────────────────────────┐
             │                         │                        │
      TANIA Agents               JARVIS Agents            RAG / Knowledge
             │                         │                        │
      ┌──────┼──────┐          ┌───────┼────────┐               │
      │      │      │          │       │        │               │
   Talent  Perf.  Capability  Product Solution Business Case    │
      │      │      │          │       │        │               │
      └──────┼──────┘          └───────┼────────┘               │
             │                         │                        │
             └───────────────┬─────────┴────────────────────────┘
                             │
                    Tool / Function Calling
                             │
                    ┌────────▼────────┐
                    │    Supabase     │
                    │ Auth/Postgres   │
                    │ pgvector/RLS    │
                    │ Storage/Audit   │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
       Entra ID           HRIS               Jira/ADO
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                       Enterprise Data
```

---

# 77. Final Product Loop

```text
                 ┌───────────────────────┐
                 │      BUSINESS NEED    │
                 └──────────┬────────────┘
                            ↓
                 ┌───────────────────────┐
                 │      CAPABILITY GAP   │
                 └──────────┬────────────┘
                            ↓
                 ┌───────────────────────┐
                 │        TANIA          │
                 │ Diagnose / Measure    │
                 └──────────┬────────────┘
                            ↓
                 ┌───────────────────────┐
                 │        JARVIS         │
                 │ Build / Coach / Do    │
                 └──────────┬────────────┘
                            ↓
                 ┌───────────────────────┐
                 │        WORK           │
                 │ Project / Deliverable │
                 └──────────┬────────────┘
                            ↓
                 ┌───────────────────────┐
                 │       EVIDENCE        │
                 └──────────┬────────────┘
                            ↓
                 ┌───────────────────────┐
                 │      PERFORMANCE      │
                 └──────────┬────────────┘
                            ↓
                 ┌───────────────────────┐
                 │    BUSINESS IMPACT    │
                 └──────────┬────────────┘
                            │
                            └──────→ continuous capability growth
```

---

# 78. Engineering Handoff

Dokumen ini menjadi baseline untuk artefak engineering berikutnya:

```text
01_TANIA_PRD_v2.0.md
02_TANIA_ERD.sql
03_TANIA_RLS.sql
04_TANIA_API_OPENAPI.yaml
05_TANIA_NEXTJS_IA.md
06_TANIA_UI_SPEC.md
07_TANIA_AI_ASSISTANT_SPEC.md
08_TANIA_AGENT_SPEC.md
09_TANIA_REPO_STRUCTURE.md
10_TANIA_TEST_PLAN.md
```

Urutan implementasi yang direkomendasikan:

> **Supabase Schema → RLS → Auth → API → Domain Services → UI → AI Gateway → Agents → JARVIS → Business Impact**

---

# 79. MVP North Star

TANIA MVP dinyatakan berhasil apabila seorang Chapter Leader dapat melakukan satu closed-loop workflow:

```text
"Capability apa yang paling kritis?"
        ↓
TANIA menjawab dengan evidence
        ↓
"Siapa yang memiliki capability tersebut?"
        ↓
TANIA menemukan talent
        ↓
"Siapa yang masih gap?"
        ↓
TANIA menghitung gap
        ↓
"Bagaimana menutup gap?"
        ↓
TANIA + JARVIS membuat development sprint
        ↓
Talent menjalankan sprint
        ↓
Evidence terkumpul
        ↓
Capability meningkat
        ↓
Talent diterapkan pada work/project
        ↓
Business impact tercatat
        ↓
TANIA mengukur hasilnya
```

**Inilah definisi TANIA sebagai Talent Performance & Capability Intelligence Platform.**

---

## Source Baseline

Blueprint ini menurunkan dan memperluas struktur PRD TANIA sebelumnya, khususnya lima domain awal:

- Talent Management
- Workload Analysis
- Project Timesheet
- Project Feasibility
- Budget Control

serta target platform enterprise seperti SSO/RBAC, audit, dashboard, integration readiness, dan phased delivery.

Pada v2.0, domain tersebut diperluas menjadi **Talent → Capability → Performance → Development → AI Augmentation → Work → Business Impact**, dengan JARVIS sebagai execution/augmentation layer.

---

## Status

**TANIA_PRD_v2.0.md — MVP Blueprint**

**Next Engineering Artifacts:**

1. Supabase migration SQL
2. Complete RLS policy SQL
3. OpenAPI 3.1 contract
4. Next.js route/component scaffold
5. Screen-level UI implementation
6. AI Gateway + RAG
7. Agent tool schemas
8. JARVIS integration
9. Seed data
10. Automated test suite
