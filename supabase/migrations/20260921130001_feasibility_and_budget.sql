-- 20260921130001_feasibility_and_budget.sql
-- Phase 12 — project feasibility and budget.
--
-- TWO PRINCIPLES SHAPE THIS MIGRATION
--
-- 1. Financial values are never fabricated. Committed and realized amounts
--    originate in SAP. TANIA stores what it is TOLD, alongside the source and
--    the time it was told, and stores nothing when it has not been told. There
--    is no default of zero: zero spend and unknown spend are different facts
--    and conflating them misstates a budget.
--
-- 2. Feasibility weights and thresholds are configuration. Scoring a business
--    case decides whether work happens; hard-coding the weights would make one
--    team's judgement the organization's policy (same reasoning as PRD §6.1
--    for performance weights).

-- ==========================================================================
-- Feasibility criteria and weighting
-- ==========================================================================
create table if not exists public.feasibility_criteria (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[a-z_]+$'),
  name text not null check (length(trim(name)) > 0),
  description text,
  -- Higher score is better for most criteria; for risk-style criteria a high
  -- raw score is bad, so the direction must be explicit.
  higher_is_better boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feasibility_weight_profiles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  organization_id uuid references public.organizations(id) on delete cascade,
  -- Decision thresholds, configurable per profile.
  approve_threshold numeric(6,2) not null default 70
    check (approve_threshold >= 0 and approve_threshold <= 100),
  review_threshold numeric(6,2) not null default 50
    check (review_threshold >= 0 and review_threshold <= 100),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feasibility_thresholds_ordered check (approve_threshold >= review_threshold),
  constraint feasibility_profile_approval_pairing check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);

create table if not exists public.feasibility_weight_profile_criteria (
  profile_id uuid not null
    references public.feasibility_weight_profiles(id) on delete cascade,
  criterion_id uuid not null
    references public.feasibility_criteria(id) on delete restrict,
  weight numeric(6,4) not null check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now(),
  primary key (profile_id, criterion_id)
);

create or replace function public.check_feasibility_weights_sum_to_one()
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
  select coalesce(sum(weight), 0), count(*) into v_total, v_count
  from public.feasibility_weight_profile_criteria where profile_id = v_profile;

  if v_count = 0 then return null; end if;

  if abs(v_total - 1) > 0.0001 then
    raise exception 'Feasibility profile % must sum to 1.0000, got %', v_profile, v_total
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists feasibility_weights_sum_check
  on public.feasibility_weight_profile_criteria;
create constraint trigger feasibility_weights_sum_check
  after insert or update or delete
  on public.feasibility_weight_profile_criteria
  deferrable initially deferred
  for each row execute function public.check_feasibility_weights_sum_to_one();

-- ==========================================================================
-- Feasibility assessments — intake through decision
-- ==========================================================================
create table if not exists public.feasibility_assessments (
  id uuid primary key default gen_random_uuid(),
  -- A feasibility case may precede a project existing.
  project_id uuid references public.projects(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  summary text,
  requester_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  weight_profile_id uuid
    references public.feasibility_weight_profiles(id) on delete restrict,
  -- Pipeline stage (PRD §35 intake → decision → post-delivery review).
  stage text not null default 'intake'
    check (stage in ('intake', 'scoring', 'resource_check', 'business_case',
                     'decision', 'approved', 'rejected', 'delivered', 'reviewed')),
  -- Computed by lib/calculations/feasibility.ts and stored for audit, so a
  -- decision can be re-examined against the score it was actually made on.
  total_score numeric(6,2) check (total_score is null or (total_score >= 0 and total_score <= 100)),
  score_coverage numeric(6,2),
  scored_at timestamptz,
  -- Decision is a consequential human action.
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feasibility_decision_pairing check (
    stage not in ('approved', 'rejected')
    or (decided_by is not null and decided_at is not null)
  )
);

comment on column public.feasibility_assessments.total_score is
  'Score at the time of decision, retained so a past decision can be reviewed against the evidence it rested on.';

create table if not exists public.feasibility_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null
    references public.feasibility_assessments(id) on delete cascade,
  criterion_id uuid not null references public.feasibility_criteria(id) on delete restrict,
  score numeric(6,2) check (score is null or (score >= 0 and score <= 100)),
  rationale text,
  scored_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, criterion_id)
);

-- Post-delivery review closes the loop: what was predicted vs what happened.
create table if not exists public.feasibility_reviews (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null
    references public.feasibility_assessments(id) on delete cascade,
  delivered_on_time boolean,
  delivered_in_budget boolean,
  predicted_score numeric(6,2),
  actual_outcome text,
  lessons text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================================================
-- Budget
--
-- Plan is owned by TANIA. Commitment and realization are owned by SAP, and
-- every such row records where the figure came from and when. A NULL amount
-- means "not known", never "zero".
-- ==========================================================================
create table if not exists public.project_budgets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  currency text not null default 'IDR',
  -- Planned internally.
  planned_amount numeric(18,2) check (planned_amount is null or planned_amount >= 0),
  -- Sourced externally. Null means unknown.
  committed_amount numeric(18,2) check (committed_amount is null or committed_amount >= 0),
  realized_amount numeric(18,2) check (realized_amount is null or realized_amount >= 0),
  -- Provenance for the external figures. Required whenever one is present.
  external_source text,
  external_reference text,
  external_synced_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, fiscal_year),
  -- A financial figure without a stated source is unattributable, which for
  -- money is indistinguishable from fabricated.
  constraint budget_external_requires_provenance check (
    (committed_amount is null and realized_amount is null)
    or (external_source is not null and external_synced_at is not null)
  )
);

comment on constraint budget_external_requires_provenance on public.project_budgets is
  'Committed and realized amounts originate in an external system. Storing one without naming its source and sync time would make a fabricated figure indistinguishable from a real one.';

create table if not exists public.budget_thresholds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  -- Percentage of plan at which the alert fires.
  threshold_pct numeric(6,2) not null check (threshold_pct > 0),
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'critical')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

-- Reallocation is a consequential financial action and is recorded, never
-- applied silently.
create table if not exists public.budget_reallocations (
  id uuid primary key default gen_random_uuid(),
  from_project_id uuid not null references public.projects(id) on delete restrict,
  to_project_id uuid not null references public.projects(id) on delete restrict,
  fiscal_year integer not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'IDR',
  rationale text,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'applied')),
  requested_by uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reallocation_distinct_projects check (from_project_id <> to_project_id),
  constraint reallocation_decision_pairing check (
    status in ('proposed')
    or (decided_by is not null and decided_at is not null)
  )
);

-- ==========================================================================
-- Audit on consequential approvals
--
-- Phase 2 created record_audit_event() and nothing called it. These triggers
-- make auditing a property of the data rather than something application code
-- must remember: a decision recorded by any path is logged.
--
-- SECURITY DEFINER so the insert into audit_logs succeeds even though direct
-- INSERT on that table is revoked from `authenticated`.
-- ==========================================================================
create or replace function public.audit_decision_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  -- Only log an actual decision transition, not every edit.
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.decided_by is not distinct from old.decided_by then
    return new;
  end if;

  v_action := tg_table_name || '.' || coalesce(new.status, 'changed');

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, before_data, after_data
  ) values (
    auth.uid(),
    v_action,
    tg_table_name,
    new.id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

comment on function public.audit_decision_change is
  'Audits consequential decision transitions. Attached by trigger so a decision made by any path is logged, not only those that remember to call record_audit_event().';

drop trigger if exists feasibility_assessments_audit on public.feasibility_assessments;
create trigger feasibility_assessments_audit
  after insert or update on public.feasibility_assessments
  for each row when (new.stage in ('approved', 'rejected'))
  execute function public.audit_decision_change();

drop trigger if exists budget_reallocations_audit on public.budget_reallocations;
create trigger budget_reallocations_audit
  after insert or update on public.budget_reallocations
  for each row when (new.status in ('approved', 'rejected', 'applied'))
  execute function public.audit_decision_change();

-- Timestamps
do $$
declare t text;
begin
  foreach t in array array[
    'feasibility_criteria','feasibility_weight_profiles','feasibility_assessments',
    'feasibility_scores','feasibility_reviews','project_budgets',
    'budget_thresholds','budget_reallocations'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;

-- ==========================================================================
-- RLS
--
-- Budget figures are CONFIDENTIAL and scoped to the project. Feasibility
-- cases are readable with project.read but decidable only with
-- project.update — scoring a case and deciding one are different acts.
-- ==========================================================================

-- Feasibility configuration: readable, administered centrally.
alter table public.feasibility_criteria enable row level security;
grant select, insert, update, delete on public.feasibility_criteria to authenticated;
drop policy if exists feasibility_criteria_read on public.feasibility_criteria;
create policy feasibility_criteria_read on public.feasibility_criteria
  for select to authenticated using (public.has_permission('project.read'));
drop policy if exists feasibility_criteria_admin on public.feasibility_criteria;
create policy feasibility_criteria_admin on public.feasibility_criteria
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'));

alter table public.feasibility_weight_profiles enable row level security;
grant select, insert, update, delete on public.feasibility_weight_profiles to authenticated;
drop policy if exists feasibility_profiles_read on public.feasibility_weight_profiles;
create policy feasibility_profiles_read on public.feasibility_weight_profiles
  for select to authenticated
  using (
    public.has_permission('project.read')
    and (organization_id is null
         or organization_id in (select public.user_org_ids())
         or public.has_role('SUPER_ADMIN'))
  );
drop policy if exists feasibility_profiles_admin on public.feasibility_weight_profiles;
create policy feasibility_profiles_admin on public.feasibility_weight_profiles
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'));

alter table public.feasibility_weight_profile_criteria enable row level security;
grant select, insert, update, delete on public.feasibility_weight_profile_criteria to authenticated;
drop policy if exists feasibility_profile_criteria_read on public.feasibility_weight_profile_criteria;
create policy feasibility_profile_criteria_read on public.feasibility_weight_profile_criteria
  for select to authenticated using (public.has_permission('project.read'));
drop policy if exists feasibility_profile_criteria_admin on public.feasibility_weight_profile_criteria;
create policy feasibility_profile_criteria_admin on public.feasibility_weight_profile_criteria
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'));

-- Assessments.
alter table public.feasibility_assessments enable row level security;
grant select, insert, update on public.feasibility_assessments to authenticated;
revoke delete on public.feasibility_assessments from authenticated;

drop policy if exists feasibility_assessments_select on public.feasibility_assessments;
create policy feasibility_assessments_select on public.feasibility_assessments
  for select to authenticated
  using (
    public.has_permission('project.read')
    and (organization_id in (select public.user_org_ids()) or public.has_role('SUPER_ADMIN'))
  );

drop policy if exists feasibility_assessments_insert on public.feasibility_assessments;
create policy feasibility_assessments_insert on public.feasibility_assessments
  for insert to authenticated
  with check (
    public.has_permission('project.create')
    and organization_id in (select public.user_org_ids())
  );

drop policy if exists feasibility_assessments_update on public.feasibility_assessments;
create policy feasibility_assessments_update on public.feasibility_assessments
  for update to authenticated
  using (public.has_permission('project.update')
         and organization_id in (select public.user_org_ids()))
  with check (public.has_permission('project.update')
              and organization_id in (select public.user_org_ids()));

alter table public.feasibility_scores enable row level security;
grant select, insert, update on public.feasibility_scores to authenticated;
drop policy if exists feasibility_scores_all on public.feasibility_scores;
create policy feasibility_scores_all on public.feasibility_scores
  for all to authenticated
  using (exists (select 1 from public.feasibility_assessments a
                 where a.id = assessment_id
                   and a.organization_id in (select public.user_org_ids())))
  with check (exists (select 1 from public.feasibility_assessments a
                      where a.id = assessment_id
                        and a.organization_id in (select public.user_org_ids())));

alter table public.feasibility_reviews enable row level security;
grant select, insert, update on public.feasibility_reviews to authenticated;
drop policy if exists feasibility_reviews_all on public.feasibility_reviews;
create policy feasibility_reviews_all on public.feasibility_reviews
  for all to authenticated
  using (exists (select 1 from public.feasibility_assessments a
                 where a.id = assessment_id
                   and a.organization_id in (select public.user_org_ids())))
  with check (exists (select 1 from public.feasibility_assessments a
                      where a.id = assessment_id
                        and a.organization_id in (select public.user_org_ids())));

-- Budget. Scoped through the project, so project visibility governs it.
alter table public.project_budgets enable row level security;
grant select, insert, update on public.project_budgets to authenticated;
revoke delete on public.project_budgets from authenticated;

drop policy if exists project_budgets_select on public.project_budgets;
create policy project_budgets_select on public.project_budgets
  for select to authenticated
  using (public.can_access_project(project_id) and public.has_permission('project.read'));

drop policy if exists project_budgets_write on public.project_budgets;
create policy project_budgets_write on public.project_budgets
  for all to authenticated
  using (public.can_access_project(project_id) and public.has_permission('project.update'))
  with check (public.can_access_project(project_id) and public.has_permission('project.update'));

alter table public.budget_thresholds enable row level security;
grant select, insert, update, delete on public.budget_thresholds to authenticated;
drop policy if exists budget_thresholds_read on public.budget_thresholds;
create policy budget_thresholds_read on public.budget_thresholds
  for select to authenticated
  using (organization_id is null or organization_id in (select public.user_org_ids()));
drop policy if exists budget_thresholds_admin on public.budget_thresholds;
create policy budget_thresholds_admin on public.budget_thresholds
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'));

alter table public.budget_reallocations enable row level security;
grant select, insert, update on public.budget_reallocations to authenticated;
revoke delete on public.budget_reallocations from authenticated;

drop policy if exists budget_reallocations_select on public.budget_reallocations;
create policy budget_reallocations_select on public.budget_reallocations
  for select to authenticated
  using (public.can_access_project(from_project_id) or public.can_access_project(to_project_id));

drop policy if exists budget_reallocations_insert on public.budget_reallocations;
create policy budget_reallocations_insert on public.budget_reallocations
  for insert to authenticated
  with check (public.has_permission('project.update') and public.can_access_project(from_project_id));

-- Deciding a reallocation moves money and requires business_impact.validate,
-- which is a distinct, higher permission than editing a project.
drop policy if exists budget_reallocations_decide on public.budget_reallocations;
create policy budget_reallocations_decide on public.budget_reallocations
  for update to authenticated
  using (public.has_permission('business_impact.validate'))
  with check (public.has_permission('business_impact.validate'));

-- AI may never decide a feasibility case or move budget.
do $$
declare t text;
begin
  foreach t in array array[
    'feasibility_criteria','feasibility_weight_profiles','feasibility_weight_profile_criteria',
    'feasibility_assessments','feasibility_scores','feasibility_reviews',
    'project_budgets','budget_thresholds','budget_reallocations'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'ai_no_insert_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (not public.is_ai_service())', 'ai_no_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'ai_no_update_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (not public.is_ai_service()) with check (not public.is_ai_service())',
      'ai_no_update_' || t, t);
  end loop;
end;
$$;

-- Indexes
create index if not exists feasibility_assessments_org_idx
  on public.feasibility_assessments (organization_id);
create index if not exists feasibility_assessments_stage_idx
  on public.feasibility_assessments (stage);
create index if not exists feasibility_assessments_project_idx
  on public.feasibility_assessments (project_id);
create index if not exists feasibility_scores_assessment_idx
  on public.feasibility_scores (assessment_id);
create index if not exists feasibility_reviews_assessment_idx
  on public.feasibility_reviews (assessment_id);
create index if not exists project_budgets_project_idx
  on public.project_budgets (project_id);
create index if not exists budget_reallocations_from_idx
  on public.budget_reallocations (from_project_id);
create index if not exists budget_reallocations_to_idx
  on public.budget_reallocations (to_project_id);
create index if not exists budget_reallocations_status_idx
  on public.budget_reallocations (status) where status = 'proposed';
