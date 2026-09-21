-- 20260921110001_performance_weights.sql
-- Phase 9 — configurable performance weighting.
--
-- PRD §6.1 lists default dimension weights and then says plainly: "Weights are
-- configuration, not universal policy. Different roles may use different
-- performance models." CLAUDE.md §16 forbids hard-coding them.
--
-- So weights live in data, scoped to an organization, a role and/or a period.
-- A weight profile must be chosen explicitly; there is no implicit global
-- model, because a hidden default IS universal policy however it is spelled.

-- --------------------------------------------------------------------------
-- performance_dimensions — the vocabulary (PRD §6.1).
--
-- The dimension NAMES are stable product vocabulary and are seeded. Their
-- WEIGHTS are not.
-- --------------------------------------------------------------------------
create table if not exists public.performance_dimensions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[a-z_]+$'),
  name text not null check (length(trim(name)) > 0),
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.performance_dimensions is
  'Performance dimension vocabulary (PRD §6.1). Names are stable; weights live in performance_weight_profiles.';

-- --------------------------------------------------------------------------
-- performance_weight_profiles — a named, scoped weighting model.
-- --------------------------------------------------------------------------
create table if not exists public.performance_weight_profiles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null check (length(trim(name)) > 0),
  description text,
  -- Scope. All null means the profile is available organization-wide but
  -- still has to be selected; it never applies implicitly.
  organization_id uuid references public.organizations(id) on delete cascade,
  role_name text,
  period_id uuid references public.performance_periods(id) on delete cascade,
  -- An approved profile is one a human has signed off as policy. Approval is
  -- a consequential act, so approver and time are paired.
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weight_profiles_approval_pairing check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);

comment on column public.performance_weight_profiles.approved_by is
  'A weighting model determines how people are rated. Using an unapproved profile for a final review is a policy decision a human must make.';

create table if not exists public.performance_weight_profile_dimensions (
  profile_id uuid not null
    references public.performance_weight_profiles(id) on delete cascade,
  dimension_id uuid not null
    references public.performance_dimensions(id) on delete restrict,
  weight numeric(6,4) not null check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now(),
  primary key (profile_id, dimension_id)
);

-- --------------------------------------------------------------------------
-- Weights within a profile must sum to 1.
--
-- Enforced by a DEFERRED constraint trigger so a profile can be edited row by
-- row inside a transaction and is only checked at commit. Without this a
-- profile could silently sum to 0.8 and every score computed from it would be
-- wrong in a way nothing surfaces.
-- --------------------------------------------------------------------------
create or replace function public.check_weight_profile_sums_to_one()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_total numeric;
  v_count integer;
begin
  v_profile := coalesce(new.profile_id, old.profile_id);

  select coalesce(sum(weight), 0), count(*)
    into v_total, v_count
  from public.performance_weight_profile_dimensions
  where profile_id = v_profile;

  -- An empty profile is allowed to exist while being assembled.
  if v_count = 0 then
    return null;
  end if;

  if abs(v_total - 1) > 0.0001 then
    raise exception
      'Weight profile % must sum to 1.0000, got %', v_profile, v_total
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists weight_profile_dimensions_sum_check
  on public.performance_weight_profile_dimensions;
create constraint trigger weight_profile_dimensions_sum_check
  after insert or update or delete
  on public.performance_weight_profile_dimensions
  deferrable initially deferred
  for each row execute function public.check_weight_profile_sums_to_one();

drop trigger if exists performance_dimensions_set_updated_at on public.performance_dimensions;
create trigger performance_dimensions_set_updated_at
  before update on public.performance_dimensions
  for each row execute function public.set_updated_at();

drop trigger if exists performance_weight_profiles_set_updated_at on public.performance_weight_profiles;
create trigger performance_weight_profiles_set_updated_at
  before update on public.performance_weight_profiles
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------
alter table public.performance_dimensions enable row level security;
grant select, insert, update, delete on public.performance_dimensions to authenticated;

drop policy if exists performance_dimensions_read on public.performance_dimensions;
create policy performance_dimensions_read on public.performance_dimensions
  for select to authenticated using (true);

drop policy if exists performance_dimensions_admin on public.performance_dimensions;
create policy performance_dimensions_admin on public.performance_dimensions
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));

alter table public.performance_weight_profiles enable row level security;
grant select, insert, update, delete on public.performance_weight_profiles to authenticated;

drop policy if exists performance_weight_profiles_read on public.performance_weight_profiles;
create policy performance_weight_profiles_read on public.performance_weight_profiles
  for select to authenticated
  using (
    public.has_permission('performance.read')
    and (
      organization_id is null
      or organization_id in (select public.user_org_ids())
      or public.has_role('SUPER_ADMIN')
    )
  );

-- Changing how people are rated is an administrative act, not a manager one.
drop policy if exists performance_weight_profiles_admin on public.performance_weight_profiles;
create policy performance_weight_profiles_admin on public.performance_weight_profiles
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'));

alter table public.performance_weight_profile_dimensions enable row level security;
grant select, insert, update, delete on public.performance_weight_profile_dimensions to authenticated;

drop policy if exists weight_profile_dimensions_read on public.performance_weight_profile_dimensions;
create policy weight_profile_dimensions_read on public.performance_weight_profile_dimensions
  for select to authenticated
  using (public.has_permission('performance.read'));

drop policy if exists weight_profile_dimensions_admin on public.performance_weight_profile_dimensions;
create policy weight_profile_dimensions_admin on public.performance_weight_profile_dimensions
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'));

-- AI identities may not write any of this.
drop policy if exists ai_no_insert_performance_dimensions on public.performance_dimensions;
create policy ai_no_insert_performance_dimensions on public.performance_dimensions
  as restrictive for insert to authenticated with check (not public.is_ai_service());
drop policy if exists ai_no_update_performance_dimensions on public.performance_dimensions;
create policy ai_no_update_performance_dimensions on public.performance_dimensions
  as restrictive for update to authenticated
  using (not public.is_ai_service()) with check (not public.is_ai_service());

drop policy if exists ai_no_insert_weight_profiles on public.performance_weight_profiles;
create policy ai_no_insert_weight_profiles on public.performance_weight_profiles
  as restrictive for insert to authenticated with check (not public.is_ai_service());
drop policy if exists ai_no_update_weight_profiles on public.performance_weight_profiles;
create policy ai_no_update_weight_profiles on public.performance_weight_profiles
  as restrictive for update to authenticated
  using (not public.is_ai_service()) with check (not public.is_ai_service());

drop policy if exists ai_no_insert_weight_dimensions on public.performance_weight_profile_dimensions;
create policy ai_no_insert_weight_dimensions on public.performance_weight_profile_dimensions
  as restrictive for insert to authenticated with check (not public.is_ai_service());
drop policy if exists ai_no_update_weight_dimensions on public.performance_weight_profile_dimensions;
create policy ai_no_update_weight_dimensions on public.performance_weight_profile_dimensions
  as restrictive for update to authenticated
  using (not public.is_ai_service()) with check (not public.is_ai_service());

-- Indexes
create index if not exists performance_weight_profiles_organization_id_idx
  on public.performance_weight_profiles (organization_id);
create index if not exists performance_weight_profiles_period_id_idx
  on public.performance_weight_profiles (period_id);
create index if not exists weight_profile_dimensions_dimension_id_idx
  on public.performance_weight_profile_dimensions (dimension_id);
