-- 20260921100006_business_impact.sql
-- Business impact (TANIA_PRD_v2.0.md §11.26, §35).
--
-- SOFT DELETE. Validated impact is the end of the evidence chain the product
-- exists to produce; erasing it would break the loop back to capability.
--
-- Validation is a consequential human action (business_impact.validate,
-- TANIA_RBAC_RLS_MATRIX.md §7), so validated_by/validated_at are paired and a
-- row cannot claim validation without naming who performed it.

create table if not exists public.business_impacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  capability_id uuid references public.capabilities(id) on delete set null,
  impact_type text not null check (length(trim(impact_type)) > 0),
  metric_name text not null check (length(trim(metric_name)) > 0),
  baseline numeric(18,4),
  target numeric(18,4),
  actual numeric(18,4),
  unit text,
  monetary_value numeric(18,2),
  currency text default 'IDR',
  evidence_url text,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'validated', 'rejected', 'withdrawn')),
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  constraint business_impacts_validation_pairing check (
    validation_status <> 'validated'
    or (validated_by is not null and validated_at is not null)
  ),
  -- An impact attached to nothing cannot be traced back to work or capability.
  constraint business_impacts_has_subject check (
    project_id is not null or profile_id is not null or capability_id is not null
  )
);

drop trigger if exists business_impacts_set_updated_at on public.business_impacts;
create trigger business_impacts_set_updated_at before update on public.business_impacts
  for each row execute function public.set_updated_at();
