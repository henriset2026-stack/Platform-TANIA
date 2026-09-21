-- 20260921100002_capability.sql
-- Capability framework (TANIA_PRD_v2.0.md §11.7-§11.11, §7.1-§7.3).
--
-- capability_requirements is NOT defined in PRD §11. It appears only in the
-- ERD at §10.2 and is implied by the gap formula in §7.3. It is modelled here
-- from those two sources: a required level attached to a scope, plus the two
-- factors §7.3 multiplies into Gap Priority (business criticality and time
-- urgency). Flagged in the Phase 4 report as designed rather than specified.

create table if not exists public.capability_domains (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  code text unique not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capabilities (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.capability_domains(id) on delete restrict,
  code text unique not null,
  name text not null check (length(trim(name)) > 0),
  description text,
  criticality text not null default 'medium'
    check (criticality in ('low', 'medium', 'high', 'critical')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- L1 Awareness .. L5 Expert/Mentor (§7.1). Reference data, seeded separately.
create table if not exists public.capability_levels (
  id uuid primary key default gen_random_uuid(),
  level integer unique not null check (level between 1 and 5),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- capability_requirements — "Required Capability Level" in the gap formula.
--
-- Scope is exactly one of organization, squad, project or role_name, enforced
-- by a CHECK. A requirement with no scope, or with several, would make the gap
-- calculation ambiguous.
-- --------------------------------------------------------------------------
create table if not exists public.capability_requirements (
  id uuid primary key default gen_random_uuid(),
  capability_id uuid not null references public.capabilities(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  squad_id uuid references public.squads(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  role_name text,
  required_level integer not null check (required_level between 1 and 5),
  headcount_required integer check (headcount_required is null or headcount_required > 0),
  -- Gap Priority = business_criticality x gap magnitude x time_urgency (§7.3).
  business_criticality text not null default 'medium'
    check (business_criticality in ('low', 'medium', 'high', 'critical')),
  time_urgency text not null default 'medium'
    check (time_urgency in ('low', 'medium', 'high', 'immediate')),
  effective_from date,
  effective_to date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capability_requirements_one_scope check (
    (organization_id is not null)::int
    + (squad_id is not null)::int
    + (project_id is not null)::int
    + (role_name is not null)::int = 1
  ),
  constraint capability_requirements_date_order check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

-- --------------------------------------------------------------------------
-- talent_capabilities — current proven level per person per capability.
--
-- assessment_status defaults to 'provisional': a level is a claim until
-- evidence validates it. Certification is not capability (§7.1).
-- --------------------------------------------------------------------------
create table if not exists public.talent_capabilities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability_id uuid not null references public.capabilities(id) on delete cascade,
  current_level integer not null default 1 check (current_level between 1 and 5),
  target_level integer check (target_level between 1 and 5),
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  assessment_status text not null default 'provisional'
    check (assessment_status in ('provisional', 'self_assessed', 'manager_assessed', 'evidence_validated')),
  assessed_at timestamptz,
  assessed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, capability_id)
);

comment on column public.talent_capabilities.assessment_status is
  'A level is provisional until evidence validates it. Certification is not capability (PRD §7.1).';

-- --------------------------------------------------------------------------
-- capability_evidence — SOFT DELETE.
--
-- Justification: evidence substantiates a capability claim. Hard-deleting it
-- would silently invalidate the level it supports and destroy provenance
-- (rule 11, CLAUDE.md §16). Rows are withdrawn, never erased.
-- --------------------------------------------------------------------------
create table if not exists public.capability_evidence (
  id uuid primary key default gen_random_uuid(),
  talent_capability_id uuid not null references public.talent_capabilities(id) on delete cascade,
  source_type text not null check (length(trim(source_type)) > 0),
  source_reference text,
  title text not null check (length(trim(title)) > 0),
  description text,
  evidence_url text,
  evidence_score numeric(5,2) check (evidence_score is null or evidence_score between 0 and 100),
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'validated', 'rejected', 'withdrawn')),
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  occurred_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  constraint capability_evidence_validation_pairing check (
    (validated_by is null and validated_at is null)
    or (validated_by is not null and validated_at is not null)
  ),
  constraint capability_evidence_deletion_pairing check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  )
);

comment on table public.capability_evidence is
  'Soft delete: evidence is withdrawn via deleted_at, never erased, so a capability claim keeps its provenance.';

do $$
declare t text;
begin
  foreach t in array array[
    'capability_domains','capabilities','capability_levels',
    'capability_requirements','talent_capabilities','capability_evidence'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;
