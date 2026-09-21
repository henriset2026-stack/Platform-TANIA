-- 20260921100005_ai_and_agents.sql
-- AI and agent records (TANIA_PRD_v2.0.md §11.23-§11.25, §11.27-§11.30).
--
-- ai_interactions is RESTRICTED (TANIA_RBAC_RLS_MATRIX.md §6): private AI
-- conversations belong to their owner. Policies are in the domain RLS
-- migration; the table is shaped here to keep the raw prompt separable from
-- the summary, so a future retention policy can drop message bodies without
-- losing the audit trail.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tool_name text not null check (length(trim(tool_name)) > 0),
  use_case text not null check (length(trim(use_case)) > 0),
  task_type text,
  started_at timestamptz,
  completed_at timestamptz,
  output_reference text,
  productivity_delta numeric(8,2),
  quality_score numeric(8,2) check (quality_score is null or quality_score between 0 and 100),
  approved_tool boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_usage_time_order check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

comment on column public.ai_usage.approved_tool is
  'Whether the tool is on the organization approved-AI list. External transmission must follow the approved AI/data policy (CLAUDE.md §31).';

create table if not exists public.ai_assessments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability_id uuid references public.capabilities(id) on delete set null,
  assessment_type text not null check (length(trim(assessment_type)) > 0),
  score numeric(8,2),
  evidence text,
  evaluator_type text not null default 'ai'
    check (evaluator_type in ('ai', 'human', 'hybrid')),
  -- An AI assessment is a recommendation until a human confirms it.
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'validated', 'rejected')),
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_augmentation (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid references public.performance_periods(id) on delete set null,
  research_score numeric(8,2),
  analysis_score numeric(8,2),
  writing_score numeric(8,2),
  product_score numeric(8,2),
  solution_score numeric(8,2),
  automation_score numeric(8,2),
  overall_score numeric(8,2),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, period_id)
);

-- --------------------------------------------------------------------------
-- ai_interactions — RESTRICTED. Private by default (CLAUDE.md §31).
-- --------------------------------------------------------------------------
create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid,
  assistant text not null default 'tania',
  intent text,
  user_message text,
  response_summary text,
  citations jsonb not null default '[]'::jsonb,
  tools_used jsonb not null default '[]'::jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  feedback text,
  -- Correlation across interaction -> agent run -> tool call -> audit
  -- (CLAUDE.md §24).
  request_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.ai_interactions is
  'RESTRICTED: private AI conversations. Owner-only by default; see TANIA_RBAC_RLS_MATRIX.md §6.';

-- --------------------------------------------------------------------------
-- agent_runs / agent_tool_calls — the execution record.
--
-- human_approval_required and human_approved are separate booleans so an
-- unapproved run that needed approval is a detectable state rather than an
-- absence. A run may not be 'completed' while it still awaits approval.
-- --------------------------------------------------------------------------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  agent_name text not null check (length(trim(agent_name)) > 0),
  task_type text not null check (length(trim(task_type)) > 0),
  status text not null default 'started'
    check (status in ('started', 'running', 'awaiting_approval', 'completed', 'failed')),
  input jsonb,
  output jsonb,
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  human_approval_required boolean not null default false,
  human_approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  request_id uuid,
  error_detail text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint agent_runs_approval_gate check (
    not (status = 'completed' and human_approval_required and not human_approved)
  ),
  constraint agent_runs_approval_pairing check (
    not human_approved or (approved_by is not null and approved_at is not null)
  )
);

comment on constraint agent_runs_approval_gate on public.agent_runs is
  'A run requiring human approval cannot be recorded as completed without it (CLAUDE.md §4.5).';

create table if not exists public.agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_name text not null check (length(trim(tool_name)) > 0),
  arguments jsonb,
  result jsonb,
  status text not null default 'completed'
    check (status in ('proposed', 'authorized', 'denied', 'completed', 'failed')),
  -- Execution evidence. A tool call is not success unless the handler said so
  -- (CLAUDE.md §4.4).
  error_detail text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

comment on column public.agent_tool_calls.status is
  'Includes denied and failed. Intent is not execution: a proposed call that was refused must remain visible (CLAUDE.md §4.4).';

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  recommendation_type text not null check (length(trim(recommendation_type)) > 0),
  title text not null check (length(trim(title)) > 0),
  rationale text,
  priority text check (priority is null or priority in ('low', 'medium', 'high', 'critical')),
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'accepted', 'rejected', 'superseded', 'resolved')),
  created_by_agent text,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.recommendations is
  'AI proposals awaiting a human decision. A recommendation is never an action (AGENTS.md §9).';

do $$
declare t text;
begin
  foreach t in array array[
    'ai_usage','ai_assessments','ai_augmentation','recommendations'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;
