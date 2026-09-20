-- 20260920120002_core_identity.sql
-- Organizations, profiles and squads (TANIA_PRD_v2.0.md §11.1-§11.3).
--
-- Deviations from the PRD, deliberate and documented:
--
-- 1. profiles.chapter_id and profiles.squad_id are declared `uuid` with no
--    foreign key in the PRD. Every RLS scope decision depends on those two
--    columns resolving to real organizations and squads, so they are given
--    real foreign keys here. An unconstrained scope column is an
--    authorization bug waiting to happen.
-- 2. updated_at is added to organizations and squads; the PRD gives them only
--    created_at, but they are mutable records.
-- 3. created_by is recorded for organizations and squads for provenance.
-- 4. CHECK constraints pin the small enumerations the PRD states in prose.

-- --------------------------------------------------------------------------
-- organizations
-- --------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  code text unique not null check (length(trim(code)) > 0),
  type text not null default 'chapter'
    check (type in ('enterprise', 'chapter', 'tribe', 'department')),
  parent_id uuid references public.organizations(id) on delete restrict,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_no_self_parent check (parent_id is null or parent_id <> id)
);

comment on table public.organizations is
  'Organizational units. Chapter DPS is an organization of type `chapter`.';

-- --------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text unique,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null check (position('@' in email) > 1),
  job_title text,
  grade text,
  department text,
  chapter_id uuid references public.organizations(id) on delete set null,
  squad_id uuid,  -- FK added after squads exists (circular reference)
  manager_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'on_leave', 'exited')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_no_self_manage check (manager_id is null or manager_id <> id)
);

comment on table public.profiles is
  'Person record, keyed to auth.users. chapter_id and squad_id define RLS scope.';

-- --------------------------------------------------------------------------
-- squads
-- --------------------------------------------------------------------------
create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  code text not null check (length(trim(code)) > 0),
  manager_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

comment on table public.squads is
  'Team within an organization. squads.manager_id drives MANAGER scope.';

-- Close the circular reference now that both tables exist.
alter table public.profiles
  drop constraint if exists profiles_squad_id_fkey;
alter table public.profiles
  add constraint profiles_squad_id_fkey
  foreign key (squad_id) references public.squads(id) on delete set null;

alter table public.organizations
  drop constraint if exists organizations_created_by_fkey;
alter table public.organizations
  add constraint organizations_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- updated_at triggers
drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists squads_set_updated_at on public.squads;
create trigger squads_set_updated_at
  before update on public.squads
  for each row execute function public.set_updated_at();
