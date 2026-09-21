-- 20260921120001_development_templates.sql
-- Phase 10 — configurable development templates.
--
-- PRD §8.2 defines the DPS 20-Hour Capability Sprint framework
-- (DEFINE → DECONSTRUCT → LEARN → PRACTICE → FEEDBACK → BUILD → ASSESS →
-- DEPLOY) and then gives a 20-hour activity breakdown for ONE role, AI
-- Product Manager, as an example.
--
-- The framework is structure; the breakdown is an example. Hard-coding that
-- eight-row table would make one role's curriculum the universal shape of
-- development, which is the same error as hard-coding performance weights
-- (PRD §6.1, CLAUDE.md §16). Templates therefore live in data, scoped by
-- organization and optionally targeted at a capability.

create table if not exists public.development_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null check (length(trim(name)) > 0),
  description text,
  -- The methodology this template implements, e.g. 'dps_20_hour_sprint'.
  methodology text not null default 'dps_20_hour_sprint',
  -- Declared total. A trigger checks the activities add up to it.
  total_hours numeric(8,2) not null check (total_hours > 0),
  -- Optional targeting. A template may be generic or aimed at one capability.
  capability_id uuid references public.capabilities(id) on delete set null,
  target_level integer check (target_level is null or target_level between 1 and 5),
  role_name text,
  organization_id uuid references public.organizations(id) on delete cascade,
  active boolean not null default true,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_templates_approval_pairing check (
    (approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null)
  )
);

comment on table public.development_templates is
  'Configurable development curricula. The 20-hour sprint is a methodology; its activity breakdown is per template, never universal.';

-- --------------------------------------------------------------------------
-- Template activities, ordered, each belonging to a sprint phase.
-- --------------------------------------------------------------------------
create table if not exists public.development_template_activities (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.development_templates(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  -- PRD §8.2 framework phases.
  phase text not null check (phase in (
    'define', 'deconstruct', 'learn', 'practice',
    'feedback', 'build', 'assess', 'deploy'
  )),
  title text not null check (length(trim(title)) > 0),
  -- Mirrors learning_activities.activity_type (PRD §8.1 loop).
  activity_type text not null check (activity_type in (
    'learn', 'practice', 'coaching', 'assignment', 'challenge', 'assessment'
  )),
  estimated_hours numeric(8,2) not null check (estimated_hours >= 0),
  -- Whether completing this activity must produce evidence.
  requires_evidence boolean not null default false,
  created_at timestamptz not null default now(),
  unique (template_id, sequence_no)
);

comment on column public.development_template_activities.requires_evidence is
  'Activities that must produce evidence. A capability cannot be upgraded without validated evidence of application (PRD §7.1).';

-- --------------------------------------------------------------------------
-- A template's activity hours must equal its declared total.
--
-- Deferred so a template can be assembled row by row inside a transaction.
-- A "20-hour sprint" whose activities total 14 hours is a broken curriculum
-- that nothing would otherwise surface.
-- --------------------------------------------------------------------------
create or replace function public.check_template_hours_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template uuid;
  v_declared numeric;
  v_actual numeric;
  v_count integer;
begin
  v_template := coalesce(new.template_id, old.template_id);

  select total_hours into v_declared
  from public.development_templates where id = v_template;

  -- Template deleted in the same transaction; nothing to check.
  if v_declared is null then
    return null;
  end if;

  select coalesce(sum(estimated_hours), 0), count(*)
    into v_actual, v_count
  from public.development_template_activities
  where template_id = v_template;

  if v_count = 0 then
    return null;
  end if;

  if abs(v_actual - v_declared) > 0.01 then
    raise exception
      'Template % declares % hours but its activities total %',
      v_template, v_declared, v_actual
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists development_template_activities_hours_check
  on public.development_template_activities;
create constraint trigger development_template_activities_hours_check
  after insert or update or delete
  on public.development_template_activities
  deferrable initially deferred
  for each row execute function public.check_template_hours_match();

-- --------------------------------------------------------------------------
-- Link a development plan to the template it was generated from, and record
-- the capability upgrade proposal separately from any actual upgrade.
-- --------------------------------------------------------------------------
alter table public.development_plans
  add column if not exists template_id uuid
    references public.development_templates(id) on delete set null;

-- --------------------------------------------------------------------------
-- capability_upgrade_proposals
--
-- THE CENTRAL SAFEGUARD. A completed development plan does NOT raise a
-- capability level. It produces a PROPOSAL that a human must approve, and the
-- proposal records the evidence it rests on.
--
-- Without this the loop in PRD §8.1 would end in an automatic write to
-- talent_capabilities, which is exactly the "certification equals capability"
-- failure in a different costume: completing a course would become proof of
-- capability.
-- --------------------------------------------------------------------------
create table if not exists public.capability_upgrade_proposals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability_id uuid not null references public.capabilities(id) on delete cascade,
  development_plan_id uuid
    references public.development_plans(id) on delete set null,
  from_level integer not null check (from_level between 1 and 5),
  to_level integer not null check (to_level between 1 and 5),
  rationale text,
  -- Evidence the proposal rests on. Empty is not acceptable.
  evidence_ids jsonb not null default '[]'::jsonb,
  -- Who proposed it: a human, or an agent acting as a recommender.
  proposed_by uuid references public.profiles(id) on delete set null,
  proposed_by_agent text,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'withdrawn')),
  -- Approval is a consequential human act.
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upgrade_proposal_raises_level check (to_level > from_level),
  constraint upgrade_proposal_decision_pairing check (
    status in ('proposed', 'withdrawn')
    or (decided_by is not null and decided_at is not null)
  ),
  constraint upgrade_proposal_requires_evidence check (
    jsonb_array_length(evidence_ids) > 0
  )
);

comment on table public.capability_upgrade_proposals is
  'A completed development plan proposes a capability upgrade; it never performs one. Approval is a human decision and the proposal must cite evidence.';
comment on constraint upgrade_proposal_requires_evidence on public.capability_upgrade_proposals is
  'A proposal with no evidence cannot exist. Capability requires evidence of application (PRD §7.1).';

drop trigger if exists development_templates_set_updated_at on public.development_templates;
create trigger development_templates_set_updated_at
  before update on public.development_templates
  for each row execute function public.set_updated_at();

drop trigger if exists capability_upgrade_proposals_set_updated_at on public.capability_upgrade_proposals;
create trigger capability_upgrade_proposals_set_updated_at
  before update on public.capability_upgrade_proposals
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------
alter table public.development_templates enable row level security;
grant select, insert, update, delete on public.development_templates to authenticated;

drop policy if exists development_templates_read on public.development_templates;
create policy development_templates_read on public.development_templates
  for select to authenticated
  using (
    public.has_permission('development.read')
    and (
      organization_id is null
      or organization_id in (select public.user_org_ids())
      or public.has_role('SUPER_ADMIN')
    )
  );

drop policy if exists development_templates_admin on public.development_templates;
create policy development_templates_admin on public.development_templates
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));

alter table public.development_template_activities enable row level security;
grant select, insert, update, delete on public.development_template_activities to authenticated;

drop policy if exists template_activities_read on public.development_template_activities;
create policy template_activities_read on public.development_template_activities
  for select to authenticated using (public.has_permission('development.read'));

drop policy if exists template_activities_admin on public.development_template_activities;
create policy template_activities_admin on public.development_template_activities
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));

alter table public.capability_upgrade_proposals enable row level security;
grant select, insert, update on public.capability_upgrade_proposals to authenticated;
revoke delete on public.capability_upgrade_proposals from authenticated;

drop policy if exists upgrade_proposals_select on public.capability_upgrade_proposals;
create policy upgrade_proposals_select on public.capability_upgrade_proposals
  for select to authenticated
  using (profile_id = auth.uid() or public.can_access_profile(profile_id));

-- An agent MAY propose — that is recommendation, which AGENTS.md §9 permits.
drop policy if exists upgrade_proposals_insert on public.capability_upgrade_proposals;
create policy upgrade_proposals_insert on public.capability_upgrade_proposals
  for insert to authenticated
  with check (
    public.can_access_profile(profile_id)
    and (public.has_permission('development.update') or public.has_permission('ai.recommend'))
  );

-- Deciding requires capability.assess and is denied to AI outright below.
drop policy if exists upgrade_proposals_decide on public.capability_upgrade_proposals;
create policy upgrade_proposals_decide on public.capability_upgrade_proposals
  for update to authenticated
  using (public.can_access_profile(profile_id) and public.has_permission('capability.assess'))
  with check (public.can_access_profile(profile_id) and public.has_permission('capability.assess'));

-- AI may insert a proposal but may never decide one, and may never touch
-- templates. This is the database-level counterpart to the rule that a
-- capability upgrade is a human decision.
drop policy if exists ai_no_decide_upgrade_proposals on public.capability_upgrade_proposals;
create policy ai_no_decide_upgrade_proposals on public.capability_upgrade_proposals
  as restrictive for update to authenticated
  using (not public.is_ai_service())
  with check (not public.is_ai_service());

drop policy if exists ai_no_insert_development_templates on public.development_templates;
create policy ai_no_insert_development_templates on public.development_templates
  as restrictive for insert to authenticated with check (not public.is_ai_service());
drop policy if exists ai_no_update_development_templates on public.development_templates;
create policy ai_no_update_development_templates on public.development_templates
  as restrictive for update to authenticated
  using (not public.is_ai_service()) with check (not public.is_ai_service());

drop policy if exists ai_no_insert_template_activities on public.development_template_activities;
create policy ai_no_insert_template_activities on public.development_template_activities
  as restrictive for insert to authenticated with check (not public.is_ai_service());
drop policy if exists ai_no_update_template_activities on public.development_template_activities;
create policy ai_no_update_template_activities on public.development_template_activities
  as restrictive for update to authenticated
  using (not public.is_ai_service()) with check (not public.is_ai_service());

-- Indexes
create index if not exists development_templates_capability_id_idx
  on public.development_templates (capability_id);
create index if not exists development_templates_organization_id_idx
  on public.development_templates (organization_id);
create index if not exists template_activities_template_id_idx
  on public.development_template_activities (template_id);
create index if not exists upgrade_proposals_profile_id_idx
  on public.capability_upgrade_proposals (profile_id);
create index if not exists upgrade_proposals_capability_id_idx
  on public.capability_upgrade_proposals (capability_id);
create index if not exists upgrade_proposals_status_idx
  on public.capability_upgrade_proposals (status) where status = 'proposed';
create index if not exists development_plans_template_id_idx
  on public.development_plans (template_id);
