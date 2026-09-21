-- 20260921100001_talent_and_work.sql
-- Phase 4 — talent, project and work entities (TANIA_PRD_v2.0.md §11.6, §11.12-§11.14).
--
-- CONVENTIONS APPLIED THROUGHOUT PHASE 4, and why they differ from the PRD:
--
-- 1. created_at is NOT NULL. The PRD writes `timestamptz default now()`, which
--    still permits an explicit NULL and would leave records undatable.
-- 2. updated_at plus a trigger on every mutable table. The PRD gives most
--    tables only created_at.
-- 3. created_by where a record represents a human judgement, for provenance
--    (rule 11, AGENTS.md §10).
-- 4. CHECK constraints pin the enumerations the PRD states in prose.
-- 5. Soft delete ONLY on evidence-bearing tables (see 20260921100002 onward).
--    Everything else deletes for real; a deleted_at column that nothing needs
--    is complexity without justification.

create table if not exists public.talent_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique not null references public.profiles(id) on delete cascade,
  summary text,
  years_experience numeric(5,2) check (years_experience is null or years_experience >= 0),
  career_level text,
  talent_status text not null default 'active'
    check (talent_status in ('active', 'inactive', 'on_leave', 'exited')),
  potential_flag boolean not null default false,
  last_assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.talent_profiles is
  'Talent extension of a profile. One row per person (profile_id is unique).';

-- --------------------------------------------------------------------------
-- projects
-- --------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text unique not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  description text,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  customer_name text,
  start_date date,
  end_date date,
  budget numeric(18,2) check (budget is null or budget >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_date_order check (end_date is null or start_date is null or end_date >= start_date)
);

-- --------------------------------------------------------------------------
-- assignments
-- --------------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_name text,
  allocation_pct numeric(5,2) not null default 100
    check (allocation_pct > 0 and allocation_pct <= 100),
  start_date date,
  end_date date,
  status text not null default 'active'
    check (status in ('proposed', 'active', 'completed', 'cancelled')),
  -- An assignment is a consequential action requiring approval
  -- (TANIA_PRD_v2.0.md §58). These record that decision rather than implying it.
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_date_order check (end_date is null or start_date is null or end_date >= start_date),
  constraint assignments_approval_pairing check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);

comment on column public.assignments.approved_by is
  'Human who approved the assignment. AI may recommend; only a human commits (CLAUDE.md §4.5).';

-- --------------------------------------------------------------------------
-- deliverables
-- --------------------------------------------------------------------------
create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  type text,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'in_review', 'completed', 'cancelled')),
  quality_score numeric(5,2) check (quality_score is null or quality_score between 0 and 100),
  customer_score numeric(5,2) check (customer_score is null or customer_score between 0 and 100),
  due_date date,
  completed_at timestamptz,
  evidence_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists talent_profiles_set_updated_at on public.talent_profiles;
create trigger talent_profiles_set_updated_at before update on public.talent_profiles
  for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();
drop trigger if exists deliverables_set_updated_at on public.deliverables;
create trigger deliverables_set_updated_at before update on public.deliverables
  for each row execute function public.set_updated_at();

-- Resource-level authorization for projects, used by RLS and mirrored by
-- lib/auth/policy.ts canAccessProject().
create or replace function public.can_access_project(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_role('SUPER_ADMIN')
    or exists (
      select 1 from public.projects p
      where p.id = target_id
        and (
          p.created_by = auth.uid()
          or p.organization_id in (select public.user_org_ids())
          or exists (
            select 1 from public.assignments a
            where a.project_id = p.id and a.profile_id = auth.uid()
          )
        )
    );
$$;

revoke all on function public.can_access_project(uuid) from public, anon;
grant execute on function public.can_access_project(uuid) to authenticated;
