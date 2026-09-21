-- 20260921100003_performance.sql
-- Performance framework (TANIA_PRD_v2.0.md §11.15-§11.18, §6).
--
-- NO DEFAULT WEIGHTS ARE STORED. PRD §6.1 states weights are configuration,
-- not universal policy, and CLAUDE.md §16 forbids hard-coding them. `weight`
-- lives on performance_metrics per metric per period, and nothing is seeded.

create table if not exists public.performance_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  period_type text not null
    check (period_type in ('monthly', 'quarterly', 'semester', 'annual')),
  start_date date not null,
  end_date date not null,
  status text not null default 'open'
    check (status in ('planned', 'open', 'locked', 'closed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_periods_date_order check (end_date >= start_date)
);

create table if not exists public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid not null references public.performance_periods(id) on delete cascade,
  metric_code text not null,
  metric_name text not null,
  score numeric(8,2),
  weight numeric(8,4) check (weight is null or (weight >= 0 and weight <= 1)),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, period_id, metric_code)
);

comment on column public.performance_metrics.weight is
  'Per-metric weighting for this period. Weights are configuration, never universal policy (PRD §6.1).';

-- --------------------------------------------------------------------------
-- performance_evidence — SENSITIVE class, SOFT DELETE.
--
-- Carries the full provenance CLAUDE.md §16 requires: metric, value, period,
-- source, evidence, owner, validation status and confidence. An AI-generated
-- claim never becomes fact here without validation, which is why
-- validation_status defaults to 'pending' and records who validated it.
-- --------------------------------------------------------------------------
create table if not exists public.performance_evidence (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid references public.performance_periods(id) on delete set null,
  dimension text not null check (length(trim(dimension)) > 0),
  metric text,
  value numeric(18,4),
  unit text,
  source_type text not null check (length(trim(source_type)) > 0),
  source_reference text,
  evidence_text text,
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'validated', 'rejected', 'withdrawn')),
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  occurred_at timestamptz,
  -- Provenance: was this asserted by a person or produced by an agent?
  origin text not null default 'human'
    check (origin in ('human', 'system', 'ai_generated')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  constraint performance_evidence_validation_pairing check (
    (validated_by is null and validated_at is null)
    or (validated_by is not null and validated_at is not null)
  )
);

comment on column public.performance_evidence.origin is
  'Distinguishes human assertion from AI-generated claim. AI output is not a performance fact until validated (CLAUDE.md §16).';

-- --------------------------------------------------------------------------
-- performance_reviews — approval is a consequential, human-only action.
-- --------------------------------------------------------------------------
create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid not null references public.performance_periods(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  overall_score numeric(8,2),
  strengths text,
  development_areas text,
  manager_comment text,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, period_id),
  -- A review cannot be approved without recording who approved it and when.
  constraint performance_reviews_approval_pairing check (
    status <> 'approved'
    or (approved_by is not null and approved_at is not null)
  ),
  constraint performance_reviews_no_self_review check (reviewer_id <> profile_id)
);

comment on constraint performance_reviews_no_self_review on public.performance_reviews is
  'Separation of duties: a person cannot be their own reviewer.';

do $$
declare t text;
begin
  foreach t in array array[
    'performance_periods','performance_metrics','performance_evidence','performance_reviews'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;
