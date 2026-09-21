-- 20260921100004_development.sql
-- Development intelligence (TANIA_PRD_v2.0.md §11.19-§11.22, §8).

create table if not exists public.development_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  objective text,
  -- Normalized link to the gap that motivated the plan. The PRD models this
  -- as free text (source_capability_gap); a foreign key keeps the loop
  -- Capability Gap -> Development -> Evidence -> Capability traceable.
  capability_id uuid references public.capabilities(id) on delete set null,
  capability_requirement_id uuid references public.capability_requirements(id) on delete set null,
  source_capability_gap text,
  status text not null default 'draft'
    check (status in ('draft', 'proposed', 'approved', 'in_progress', 'completed', 'cancelled')),
  start_date date,
  target_date date,
  completion_pct numeric(5,2) not null default 0
    check (completion_pct between 0 and 100),
  owner_id uuid references public.profiles(id) on delete set null,
  -- Committing a development plan requires human approval (PRD §58).
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_plans_approval_pairing check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);

create table if not exists public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  development_plan_id uuid not null references public.development_plans(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  total_hours numeric(8,2) check (total_hours is null or total_hours >= 0),
  -- The DPS 20-hour Capability Sprint (PRD §8.2) is one methodology, not the
  -- only one, so it is a value rather than a constraint.
  methodology text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_activities (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  activity_type text not null
    check (activity_type in ('learn', 'practice', 'coaching', 'assignment', 'challenge', 'assessment')),
  sequence_no integer not null check (sequence_no > 0),
  estimated_hours numeric(8,2) check (estimated_hours is null or estimated_hours >= 0),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learning_path_id, sequence_no)
);

comment on column public.learning_activities.activity_type is
  'Mirrors the development loop in PRD §8.1: learn, practice, coaching, assignment, challenge, assessment.';

-- SOFT DELETE: learning evidence feeds capability assessment, so withdrawing
-- it must not erase the record that a claim was once made.
create table if not exists public.learning_evidence (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.learning_activities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  evidence_type text not null check (length(trim(evidence_type)) > 0),
  evidence_url text,
  score numeric(8,2),
  evaluator_id uuid references public.profiles(id) on delete set null,
  evaluated_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null
);

do $$
declare t text;
begin
  foreach t in array array[
    'development_plans','learning_paths','learning_activities','learning_evidence'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;
