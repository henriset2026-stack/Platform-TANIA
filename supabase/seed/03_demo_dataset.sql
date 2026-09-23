-- 03_demo_dataset.sql
-- TANIA DEMO DATASET. SYNTHETIC. NOT FOR PRODUCTION.
--
-- Populates every domain so the screens have something to render: chapter and
-- squads, talent, the capability framework with evidence, projects and
-- assignments, a performance period, development plans, AI usage and business
-- impact.
--
-- ============================================================================
-- FOUR PROPERTIES, EACH LOAD-BEARING
-- ============================================================================
--
-- SYNTHETIC. Every person is invented. Names are "Demo <Given> <Family>",
-- emails are @demo.invalid (RFC 2606 reserved — the domain cannot resolve, so
-- no message can ever reach a real inbox), and employee ids are DEMO-####.
-- No figure here describes a real person's performance or capability.
--
-- MARKED. Every row's primary key begins `decafbad`, every code begins DEMO-,
-- and the organization is "DEMO Chapter". A demo row is recognisable in a
-- query result, a log line or a screenshot without consulting anything.
--
-- DETERMINISTIC. No gen_random_uuid(), no now(), no random(). Every id and
-- timestamp is fixed, so two runs produce byte-identical data and a
-- screenshot taken today matches one taken next month.
--
-- RESETTABLE. Because every id begins `decafbad`, 99_reset_demo.sql removes
-- exactly this dataset and cannot touch anything else. That precision is the
-- whole reason for hard-coding the keys.
--
-- ============================================================================
-- THE DEMO PEOPLE CANNOT LOG IN
-- ============================================================================
--
-- profiles is keyed to auth.users, so demo talent requires demo auth rows.
-- Those are real rows in the authentication system, and a fictional account
-- that can authenticate is a real account nobody owns. Each is therefore
-- disabled four independent ways:
--
--   banned_until = 'infinity'   GoTrue refuses the sign-in outright
--   encrypted_password          a marker string, not a bcrypt hash, so no
--                               password can ever compare equal
--   email_confirmed_at = null   unconfirmed accounts cannot sign in
--   @demo.invalid               password reset cannot deliver, so the account
--                               cannot be claimed through recovery
--
-- Removing any one leaves the other three. This is deliberate: the failure
-- being guarded against is a demo database later exposed to a network.
--
-- ============================================================================
-- GUARD
-- ============================================================================
--
--   psql "$DATABASE_URL" -v tania_allow_sample_data=1 -f 03_demo_dataset.sql
--
-- Refuses without the flag, and refuses if the database holds any organization
-- that is not demo or sample data — the signal that this is a real
-- environment. Use `npm run db:seed`, which adds further checks.

\set ON_ERROR_STOP on
\if :{?tania_allow_sample_data}
\else
\echo 'REFUSED: set -v tania_allow_sample_data=1 to load the demo dataset.'
\quit
\endif

do $$
begin
  if exists (
    select 1 from public.organizations
    where code not like 'DEMO-%' and code not like 'SAMPLE-%'
  ) then
    raise exception 'REFUSED: this database contains non-demo organizations, so it looks like a real environment.';
  end if;
end;
$$;

begin;

-- ============================================================================
-- 1. Organization and squads
-- ============================================================================

insert into public.organizations (id, code, name, type) values
  ('decafbad-0001-4000-8000-000000000001', 'DEMO-DPS', 'DEMO Chapter Digital Product & Solution', 'chapter')
on conflict (id) do nothing;

insert into public.squads (id, organization_id, code, name) values
  ('decafbad-0002-4000-8000-000000000001', 'decafbad-0001-4000-8000-000000000001', 'DEMO-SQ-AI',   'DEMO Squad — AI Platform'),
  ('decafbad-0002-4000-8000-000000000002', 'decafbad-0001-4000-8000-000000000001', 'DEMO-SQ-DATA', 'DEMO Squad — Data Products'),
  ('decafbad-0002-4000-8000-000000000003', 'decafbad-0001-4000-8000-000000000001', 'DEMO-SQ-EXP',  'DEMO Squad — Experience'),
  ('decafbad-0002-4000-8000-000000000004', 'decafbad-0001-4000-8000-000000000001', 'DEMO-SQ-CORE', 'DEMO Squad — Core Services')
on conflict (id) do nothing;

-- ============================================================================
-- 2. Demo auth identities — disabled four ways, see the header
-- ============================================================================

do $$
declare
  v_index integer;
  v_id uuid;
  v_email text;
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users is absent; skipping demo identities. Talent rows will not be created.';
    return;
  end if;

  for v_index in 1..24 loop
    v_id := ('decafbad-0003-4000-8000-' || lpad(v_index::text, 12, '0'))::uuid;
    v_email := 'demo.talent' || lpad(v_index::text, 2, '0') || '@demo.invalid';

    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at, banned_until,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      -- Not a bcrypt hash. No password can compare equal to this.
      'DEMO-ACCOUNT-NO-PASSWORD-LOGIN-DISABLED',
      null,
      'infinity',
      '{"provider":"demo","providers":["demo"],"demo":true}'::jsonb,
      '{"demo":true,"note":"Synthetic TANIA demo account. Not a real person."}'::jsonb,
      timestamptz '2026-01-05 00:00:00+00',
      timestamptz '2026-01-05 00:00:00+00'
    )
    on conflict (id) do nothing;
  end loop;
end;
$$;

-- ============================================================================
-- 3. Talent
--
-- Names are drawn from fixed arrays by index, so the dataset is legible
-- without being a list of real people. Squad and role assignment is by
-- modulus rather than by hand: deterministic, and it spreads people across
-- squads so the dashboards are not degenerate.
-- ============================================================================

insert into public.profiles (id, employee_id, full_name, email, job_title, grade, department, chapter_id, squad_id, status)
select
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'DEMO-' || lpad(i::text, 4, '0'),
  'Demo ' ||
    (array['Arya','Bima','Citra','Dewi','Eko','Fitri','Gilang','Hana',
           'Indra','Jaya','Kirana','Laras','Maya','Nadia','Oka','Putri',
           'Rama','Sari','Tari','Umar','Vina','Wahyu','Yuda','Zahra'])[i] ||
    ' ' ||
    (array['Pratama','Santoso','Wijaya','Kusuma','Hartono','Saputra'])[1 + (i % 6)],
  'demo.talent' || lpad(i::text, 2, '0') || '@demo.invalid',
  (array['Product Manager','Solution Architect','Data Engineer','AI Engineer',
         'Experience Designer','Backend Engineer'])[1 + (i % 6)],
  'DEMO-G' || (3 + (i % 3))::text,
  'DEMO Chapter DPS',
  'decafbad-0001-4000-8000-000000000001',
  ('decafbad-0002-4000-8000-' || lpad((1 + (i % 4))::text, 12, '0'))::uuid,
  'active'
from generate_series(1, 24) as i
where to_regclass('auth.users') is not null
on conflict (id) do nothing;

-- Squad managers: the lowest-numbered person in each squad. Set after the
-- profiles exist, because squads.manager_id references profiles.
update public.squads s
set manager_id = (
  select p.id
  from public.profiles p
  where p.squad_id = s.id
  order by p.employee_id
  limit 1
)
where s.id::text like 'decafbad-0002-%'
  and s.manager_id is null;

insert into public.talent_profiles (id, profile_id, summary, years_experience, career_level, talent_status, potential_flag)
select
  ('decafbad-0009-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'Synthetic demo profile. Not a real person, and not a real performance record.',
  (3 + (i % 9))::numeric,
  (array['Associate','Professional','Senior','Lead'])[1 + (i % 4)],
  'active',
  (i % 7 = 0)
from generate_series(1, 24) as i
where exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (id) do nothing;

-- ============================================================================
-- 4. Capability framework
--
-- Capability LEVELS are not seeded here: 01_reference.sql owns them, because
-- the L1-L5 scale is PRD framework data rather than demo content.
--
-- These capability NAMES are plausible industry ones, deliberately not the
-- real DPS catalogue — that is real organizational content and is not
-- invented here (CLAUDE.md §2f). They carry the DEMO- prefix so nobody
-- mistakes them for the chapter's own framework.
-- ============================================================================

insert into public.capabilities (id, domain_id, code, name, criticality, description, active)
select
  ('decafbad-0004-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  d.id, v.code, v.name, v.criticality,
  'DEMO capability. Synthetic framework content for demonstration only.',
  true
from (values
  (1,  'ai',           'DEMO-CAP-AGENT',    'Agent Engineering',        'critical'),
  (2,  'ai',           'DEMO-CAP-PROMPT',   'Prompt & Context Design',  'high'),
  (3,  'ai',           'DEMO-CAP-EVAL',     'AI Evaluation',            'high'),
  (4,  'data',         'DEMO-CAP-PIPE',     'Data Pipeline Engineering','high'),
  (5,  'data',         'DEMO-CAP-MODEL',    'Data Modelling',           'medium'),
  (6,  'product',      'DEMO-CAP-DISC',     'Product Discovery',        'high'),
  (7,  'product',      'DEMO-CAP-PRD',      'Requirement Definition',   'medium'),
  (8,  'solution',     'DEMO-CAP-ARCH',     'Solution Architecture',    'critical'),
  (9,  'architecture', 'DEMO-CAP-CLOUD',    'Cloud Architecture',       'high'),
  (10, 'technology',   'DEMO-CAP-K8S',      'Container Platform',       'medium'),
  (11, 'leadership',   'DEMO-CAP-COACH',    'Technical Coaching',       'medium'),
  (12, 'commercial',   'DEMO-CAP-CASE',     'Business Case Development','high')
) as v(n, domain_code, code, name, criticality)
join public.capability_domains d on d.code = v.domain_code
on conflict (id) do nothing;

-- Required levels, so the gap engine has a "required" side to subtract from.
-- Scoped to the organization: capability_requirements enforces exactly one
-- scope, so a gap is never ambiguous about which population it describes.
insert into public.capability_requirements
  (id, capability_id, organization_id, required_level, headcount_required, business_criticality, time_urgency, effective_from)
select
  ('decafbad-000a-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  ('decafbad-0004-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  'decafbad-0001-4000-8000-000000000001',
  v.required_level, v.headcount, v.criticality, v.urgency,
  date '2026-01-01'
from (values
  (1,  4, 6,  'critical', 'immediate'),
  (2,  3, 14, 'high',     'high'),
  (3,  3, 6,  'high',     'high'),
  (4,  3, 8,  'high',     'medium'),
  (5,  3, 8,  'medium',   'medium'),
  (6,  4, 5,  'high',     'high'),
  (8,  4, 4,  'critical', 'high'),
  (9,  3, 6,  'high',     'medium'),
  (10, 3, 5,  'medium',   'low'),
  (12, 3, 4,  'high',     'medium')
) as v(n, required_level, headcount, criticality, urgency)
on conflict (id) do nothing;

-- ============================================================================
-- 5. Talent capabilities and evidence
--
-- Three capabilities per person, chosen by modulus. current_level is the
-- CLAIMED level; what the platform reports is the level the evidence below
-- proves, which is usually lower. That difference is the product, so the
-- demo data is built to show it rather than to look tidy.
-- ============================================================================

insert into public.talent_capabilities
  (id, profile_id, capability_id, current_level, target_level, confidence, assessment_status, assessed_at)
select
  ('decafbad-000b-4000-8000-' || lpad(((i - 1) * 3 + k)::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('decafbad-0004-4000-8000-' || lpad((1 + ((i * 3 + k) % 12))::text, 12, '0'))::uuid,
  2 + ((i + k) % 3),
  4,
  (60 + ((i * 7 + k * 11) % 35))::numeric,
  (array['provisional','self_assessed','manager_assessed','evidence_validated'])[1 + ((i + k) % 4)],
  timestamptz '2026-06-30 00:00:00+00'
from generate_series(1, 24) as i, generate_series(1, 3) as k
where exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (profile_id, capability_id) do nothing;

-- Evidence, deliberately mixed.
--
-- Every third record is a CERTIFICATION and nothing else. Those people hold a
-- certificate and no evidence of application, so the engine caps them at L2
-- however high they claim — which is the point PRD §7.1 makes and the single
-- most important thing this demo should show. A dataset where everyone has
-- tidy applied evidence would demonstrate nothing.
insert into public.capability_evidence
  (id, talent_capability_id, source_type, source_reference, title, description,
   evidence_score, validation_status, validated_by, validated_at, occurred_at, created_by)
select
  ('decafbad-000c-4000-8000-' || lpad(tc.n::text, 12, '0'))::uuid,
  tc.id,
  case when tc.n % 3 = 0 then 'certification' else
       (array['project_deliverable','peer_review','assessment','code_review'])[1 + (tc.n % 4)] end,
  'DEMO-EV-' || lpad(tc.n::text, 4, '0'),
  case when tc.n % 3 = 0
       then 'DEMO certificate of completion'
       else 'DEMO applied work artifact' end,
  'Synthetic demo evidence. Describes no real work by any real person.',
  (60 + (tc.n % 40))::numeric,
  case when tc.n % 5 = 0 then 'pending' else 'validated' end,
  case when tc.n % 5 = 0 then null else 'decafbad-0003-4000-8000-000000000001'::uuid end,
  case when tc.n % 5 = 0 then null else timestamptz '2026-07-15 00:00:00+00' end,
  timestamptz '2026-06-01 00:00:00+00',
  'decafbad-0003-4000-8000-000000000001'
from (
  select id, row_number() over (order by id) as n
  from public.talent_capabilities
  where id::text like 'decafbad-000b-%'
) as tc
on conflict (id) do nothing;

-- ============================================================================
-- 6. Projects and assignments
-- ============================================================================

insert into public.projects (id, organization_id, code, name, description, status, customer_name, start_date, end_date, budget)
values
  ('decafbad-0005-4000-8000-000000000001', 'decafbad-0001-4000-8000-000000000001',
   'DEMO-PRJ-AIOPS', 'DEMO AI Operations Platform',
   'Synthetic demo project.', 'active', 'DEMO Internal', date '2026-02-01', date '2026-12-31', 4200000000),
  ('decafbad-0005-4000-8000-000000000002', 'decafbad-0001-4000-8000-000000000001',
   'DEMO-PRJ-DATA', 'DEMO Customer Data Platform',
   'Synthetic demo project.', 'active', 'DEMO Enterprise Segment', date '2026-03-15', date '2026-11-30', 2800000000),
  ('decafbad-0005-4000-8000-000000000003', 'decafbad-0001-4000-8000-000000000001',
   'DEMO-PRJ-EXP', 'DEMO Digital Experience Refresh',
   'Synthetic demo project.', 'planning', 'DEMO Consumer Segment', date '2026-09-01', date '2027-03-31', 1500000000)
on conflict (id) do nothing;

insert into public.assignments
  (id, project_id, profile_id, role_name, allocation_pct, start_date, end_date, status, approved_by, approved_at, created_by)
select
  ('decafbad-0006-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('decafbad-0005-4000-8000-' || lpad((1 + (i % 3))::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  (array['Contributor','Lead','Reviewer','Architect'])[1 + (i % 4)],
  (array[40, 60, 80, 100])[1 + (i % 4)]::numeric,
  date '2026-03-01',
  date '2026-12-31',
  'active',
  -- approved_by and approved_at are set together; the CHECK requires it, so a
  -- row cannot claim approval without naming who gave it.
  'decafbad-0003-4000-8000-000000000001',
  timestamptz '2026-02-20 00:00:00+00',
  'decafbad-0003-4000-8000-000000000001'
from generate_series(1, 24) as i
where exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (id) do nothing;

-- ============================================================================
-- 7. Performance
--
-- Weights are set per metric per period, never globally: PRD §6.1 makes them
-- configuration rather than policy, so the demo shows a configured profile
-- rather than implying a universal one. The six weights below sum to 1.00.
-- ============================================================================

insert into public.performance_periods (id, name, period_type, start_date, end_date, status) values
  ('decafbad-0007-4000-8000-000000000001', 'DEMO H1 2026', 'semester', date '2026-01-01', date '2026-06-30', 'closed'),
  ('decafbad-0007-4000-8000-000000000002', 'DEMO H2 2026', 'semester', date '2026-07-01', date '2026-12-31', 'open')
on conflict (id) do nothing;

insert into public.performance_metrics
  (id, profile_id, period_id, metric_code, metric_name, score, weight, source)
select
  ('decafbad-000d-4000-8000-' || lpad(((i - 1) * 6 + m.n)::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'decafbad-0007-4000-8000-000000000001',
  m.code, m.name,
  (62 + ((i * 13 + m.n * 7) % 33))::numeric,
  m.weight,
  'DEMO seed'
from generate_series(1, 24) as i,
     (values
       (1, 'delivery',      'Delivery',              0.2500),
       (2, 'productivity',  'Productivity',          0.1500),
       (3, 'capability',    'Capability Application',0.2000),
       (4, 'collaboration', 'Collaboration',         0.1500),
       (5, 'innovation',    'Innovation',            0.1000),
       (6, 'ai_aug',        'AI Augmentation',       0.1500)
     ) as m(n, code, name, weight)
where exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (profile_id, period_id, metric_code) do nothing;

-- Evidence carries origin and validation_status. Every fifth record is
-- ai_generated and left pending, because an AI-generated claim is not a
-- performance fact until a human validates it (CLAUDE.md §16).
insert into public.performance_evidence
  (id, profile_id, period_id, dimension, metric, value, unit, source_type, source_reference,
   evidence_text, confidence, validation_status, validated_by, validated_at, occurred_at, origin, created_by)
select
  ('decafbad-000e-4000-8000-' || lpad(((i - 1) * 2 + k)::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'decafbad-0007-4000-8000-000000000001',
  (array['Delivery','Capability Application','Collaboration','AI Augmentation'])[1 + ((i + k) % 4)],
  (array['stories_completed','reviews_passed','sessions_led','ai_assisted_tasks'])[1 + ((i + k) % 4)],
  (8 + ((i * 5 + k) % 22))::numeric,
  'count',
  'DEMO delivery record',
  'DEMO-PERF-' || lpad(((i - 1) * 2 + k)::text, 4, '0'),
  'Synthetic demo evidence. Not a record of any real person''s work.',
  (70 + ((i + k) % 25))::numeric,
  case when ((i - 1) * 2 + k) % 5 = 0 then 'pending' else 'validated' end,
  case when ((i - 1) * 2 + k) % 5 = 0 then null else 'decafbad-0003-4000-8000-000000000001'::uuid end,
  case when ((i - 1) * 2 + k) % 5 = 0 then null else timestamptz '2026-07-05 00:00:00+00' end,
  timestamptz '2026-05-20 00:00:00+00',
  case when ((i - 1) * 2 + k) % 5 = 0 then 'ai_generated' else 'human' end,
  'decafbad-0003-4000-8000-000000000001'
from generate_series(1, 24) as i, generate_series(1, 2) as k
where exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (id) do nothing;

-- Reviews. The reviewer is the next person in sequence, never the subject:
-- performance_reviews has a CHECK forbidding self-review.
insert into public.performance_reviews
  (id, profile_id, period_id, reviewer_id, overall_score, strengths, development_areas,
   manager_comment, status, submitted_at, approved_by, approved_at)
select
  ('decafbad-000f-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'decafbad-0007-4000-8000-000000000001',
  ('decafbad-0003-4000-8000-' || lpad((1 + (i % 24))::text, 12, '0'))::uuid,
  (68 + ((i * 11) % 28))::numeric,
  'DEMO strengths narrative.',
  'DEMO development areas narrative.',
  'DEMO manager comment. Synthetic text about a synthetic person.',
  case when i % 4 = 0 then 'submitted' else 'approved' end,
  timestamptz '2026-07-10 00:00:00+00',
  case when i % 4 = 0 then null else 'decafbad-0003-4000-8000-000000000001'::uuid end,
  case when i % 4 = 0 then null else timestamptz '2026-07-20 00:00:00+00' end
from generate_series(1, 24) as i
where exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
  and (1 + (i % 24)) <> i
on conflict (profile_id, period_id) do nothing;

-- ============================================================================
-- 8. Development
--
-- One plan per person for every third person, following the loop:
-- Gap -> Plan -> Learning -> Practice -> Work Application -> Assessment ->
-- Evidence. Each path carries an applied activity and an assessment, because
-- a plan without either can be completed and can still never raise a
-- capability level.
-- ============================================================================

insert into public.development_plans
  (id, profile_id, title, objective, capability_id, status, start_date, target_date,
   completion_pct, owner_id, approved_by, approved_at, created_by)
select
  ('decafbad-0010-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'DEMO Capability Sprint — ' || c.name,
  'Close the demo capability gap from the proven level to the next level, evidenced by applied work.',
  c.id,
  (array['approved','in_progress','completed'])[1 + (i % 3)],
  date '2026-08-01',
  date '2026-10-31',
  (array[10, 55, 100])[1 + (i % 3)]::numeric,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'decafbad-0003-4000-8000-000000000001',
  timestamptz '2026-07-25 00:00:00+00',
  'decafbad-0003-4000-8000-000000000001'
from generate_series(1, 24) as i
join public.capabilities c
  on c.id = ('decafbad-0004-4000-8000-' || lpad((1 + (i % 12))::text, 12, '0'))::uuid
where i % 3 = 0
  and exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (id) do nothing;

insert into public.learning_paths (id, development_plan_id, title, total_hours, methodology)
select
  ('decafbad-0011-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('decafbad-0010-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'DEMO 20-hour Capability Sprint',
  20,
  'dps_20_hour_sprint'
from generate_series(1, 24) as i
where i % 3 = 0
  and exists (select 1 from public.development_plans where id = ('decafbad-0010-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (id) do nothing;

insert into public.learning_activities
  (id, learning_path_id, title, activity_type, sequence_no, estimated_hours, status, completed_at)
select
  ('decafbad-0012-4000-8000-' || lpad(((i - 1) * 4 + a.n)::text, 12, '0'))::uuid,
  ('decafbad-0011-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'DEMO ' || a.title,
  a.activity_type,
  a.n,
  a.hours,
  case when i % 3 = 0 and (i / 3) % 3 = 0 then 'completed' else a.default_status end,
  case when i % 3 = 0 and (i / 3) % 3 = 0 then timestamptz '2026-10-20 00:00:00+00' else null end
from generate_series(1, 24) as i,
     (values
       (1, 'Learn the concepts',            'learn',      5, 'completed'),
       (2, 'Guided practice',               'practice',   5, 'in_progress'),
       (3, 'Apply on real chapter work',    'assignment', 7, 'planned'),
       (4, 'Assess against level criteria', 'assessment', 3, 'planned')
     ) as a(n, title, activity_type, hours, default_status)
where i % 3 = 0
  and exists (select 1 from public.learning_paths where id = ('decafbad-0011-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (id) do nothing;

insert into public.learning_evidence
  (id, activity_id, profile_id, evidence_type, score, evaluator_id, evaluated_at, submitted_at)
select
  ('decafbad-0013-4000-8000-' || lpad(la.n::text, 12, '0'))::uuid,
  la.id,
  la.profile_id,
  'DEMO applied artifact',
  (70 + (la.n % 25))::numeric,
  'decafbad-0003-4000-8000-000000000001',
  timestamptz '2026-10-25 00:00:00+00',
  timestamptz '2026-10-22 00:00:00+00'
from (
  select a.id, p.profile_id, row_number() over (order by a.id) as n
  from public.learning_activities a
  join public.learning_paths lp on lp.id = a.learning_path_id
  join public.development_plans p on p.id = lp.development_plan_id
  where a.id::text like 'decafbad-0012-%'
    and a.status = 'completed'
) as la
on conflict (id) do nothing;

-- ============================================================================
-- 9. AI usage
-- ============================================================================

insert into public.ai_usage
  (id, profile_id, tool_name, use_case, task_type, started_at, completed_at,
   output_reference, productivity_delta, quality_score, approved_tool)
select
  ('decafbad-0014-4000-8000-' || lpad(((i - 1) * 2 + k)::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  (array['DEMO Assistant','DEMO Code Helper','DEMO Analysis Tool'])[1 + ((i + k) % 3)],
  (array['Drafting','Code review','Analysis','Research'])[1 + ((i + k) % 4)],
  (array['documentation','engineering','analysis'])[1 + ((i + k) % 3)],
  timestamptz '2026-08-01 09:00:00+00',
  timestamptz '2026-08-01 11:30:00+00',
  'DEMO-AI-' || lpad(((i - 1) * 2 + k)::text, 4, '0'),
  (5 + ((i * 3 + k) % 30))::numeric,
  (65 + ((i * 7 + k) % 30))::numeric,
  (((i + k) % 4) <> 0)
from generate_series(1, 24) as i, generate_series(1, 2) as k
where exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(i::text, 12, '0'))::uuid)
on conflict (id) do nothing;

-- ============================================================================
-- 10. Business impact
--
-- Left mostly pending validation. An unvalidated impact claim is a claim, and
-- a demo in which every rupiah of value is pre-validated teaches the wrong
-- habit about what this table means.
-- ============================================================================

insert into public.business_impacts
  (id, project_id, profile_id, capability_id, impact_type, metric_name,
   baseline, target, actual, unit, monetary_value, currency,
   validation_status, validated_by, validated_at, created_by)
select
  ('decafbad-0015-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  ('decafbad-0005-4000-8000-' || lpad(v.project::text, 12, '0'))::uuid,
  ('decafbad-0003-4000-8000-' || lpad(v.profile::text, 12, '0'))::uuid,
  ('decafbad-0004-4000-8000-' || lpad(v.capability::text, 12, '0'))::uuid,
  v.impact_type, v.metric_name,
  v.baseline, v.target, v.actual, v.unit, v.monetary, 'IDR',
  case when v.n % 3 = 0 then 'validated' else 'pending' end,
  case when v.n % 3 = 0 then 'decafbad-0003-4000-8000-000000000001'::uuid else null end,
  case when v.n % 3 = 0 then timestamptz '2026-09-01 00:00:00+00' else null end,
  'decafbad-0003-4000-8000-000000000001'
from (values
  (1, 1, 1,  1,  'cost_saving',      'Incident handling hours',   120.0, 60.0,  72.0,  'hours/month', 180000000.00),
  (2, 1, 4,  2,  'productivity',     'Stories per sprint',        18.0,  26.0,  24.0,  'stories',     95000000.00),
  (3, 2, 7,  4,  'revenue_enabled',  'Segment campaigns shipped', 2.0,   8.0,   6.0,   'campaigns',   640000000.00),
  (4, 2, 10, 5,  'quality',          'Data defects reported',     34.0,  10.0,  14.0,  'defects',     45000000.00),
  (5, 3, 13, 6,  'time_to_market',   'Concept to release',        180.0, 90.0,  110.0, 'days',        220000000.00),
  (6, 1, 16, 8,  'cost_avoidance',   'Unplanned rework',          25.0,  8.0,   11.0,  '%',           130000000.00)
) as v(n, project, profile, capability, impact_type, metric_name, baseline, target, actual, unit, monetary)
where exists (select 1 from public.profiles where id = ('decafbad-0003-4000-8000-' || lpad(v.profile::text, 12, '0'))::uuid)
on conflict (id) do nothing;

commit;

\echo 'DEMO dataset loaded. Every row carries a decafbad- primary key and a DEMO- code.'
\echo 'Reset with: psql "$DATABASE_URL" -v tania_allow_sample_data=1 -f 99_reset_demo.sql'
