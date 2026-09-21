-- 02_dev_sample.sql
-- DEVELOPMENT SAMPLE DATA. NOT FOR PRODUCTION.
--
-- Every person, squad and project below is fictional and is labelled as such
-- in the data itself: organizations use the code prefix 'SAMPLE-', people use
-- @sample.invalid addresses (RFC 2606 reserved, cannot route), and names are
-- obviously placeholder. Nothing here is real talent data, and none of it is
-- performance or capability evidence about a real person.
--
-- GUARD: this script refuses to run unless explicitly enabled. Seeding a
-- production database with fictional talent records would corrupt exactly the
-- evidence base TANIA exists to protect.
--
--   psql "$DATABASE_URL" -v tania_allow_sample_data=1 -f 02_dev_sample.sql
--
-- It also refuses if any non-sample organization already exists, which is the
-- signal that the database holds real data.

\set ON_ERROR_STOP on
\if :{?tania_allow_sample_data}
\else
\echo 'REFUSED: set -v tania_allow_sample_data=1 to load development sample data.'
\quit
\endif

do $$
begin
  if exists (select 1 from public.organizations where code not like 'SAMPLE-%') then
    raise exception 'REFUSED: database contains non-sample organizations; this looks like a real environment.';
  end if;
end;
$$;

-- Fictional organization and squads.
insert into public.organizations (code, name, type) values
  ('SAMPLE-DPS', 'Sample Chapter DPS', 'chapter')
on conflict (code) do nothing;

insert into public.squads (organization_id, code, name)
select o.id, v.code, v.name
from public.organizations o,
     (values ('SAMPLE-SQ-A', 'Sample Squad Alpha'),
             ('SAMPLE-SQ-B', 'Sample Squad Bravo')) as v(code, name)
where o.code = 'SAMPLE-DPS'
on conflict (organization_id, code) do nothing;

-- Fictional capabilities, so the capability screens have structure to render.
insert into public.capabilities (domain_id, code, name, criticality, description)
select d.id, v.code, v.name, v.criticality, 'Sample capability for development only.'
from public.capability_domains d,
     (values ('ai',       'SAMPLE-AI-PROMPT',  'Prompt Engineering',        'high'),
             ('ai',       'SAMPLE-AI-AGENT',   'Agent Design',              'critical'),
             ('product',  'SAMPLE-PRD-DISC',   'Product Discovery',         'high'),
             ('solution', 'SAMPLE-SOL-ARCH',   'Solution Architecture',     'high'),
             ('data',     'SAMPLE-DATA-MODEL', 'Data Modelling',            'medium')
     ) as v(domain_code, code, name, criticality)
where d.code = v.domain_code
on conflict (code) do nothing;

-- A fictional project.
insert into public.projects (organization_id, code, name, status, description)
select o.id, 'SAMPLE-PRJ-1', 'Sample Platform Initiative', 'active',
       'Fictional project for development only.'
from public.organizations o
where o.code = 'SAMPLE-DPS'
on conflict (code) do nothing;

-- Capability requirements, so the gap engine has a "required" side to read.
insert into public.capability_requirements
  (capability_id, organization_id, required_level, headcount_required, business_criticality, time_urgency)
select c.id, o.id, v.required_level, v.headcount, v.criticality, v.urgency
from public.capabilities c
join public.organizations o on o.code = 'SAMPLE-DPS',
     (values ('SAMPLE-AI-AGENT',   4, 6, 'critical', 'immediate'),
             ('SAMPLE-AI-PROMPT',  3, 12, 'high',    'high'),
             ('SAMPLE-SOL-ARCH',   4, 4, 'high',     'medium')
     ) as v(code, required_level, headcount, criticality, urgency)
where c.code = v.code;

-- NO PEOPLE ARE SEEDED.
--
-- profiles is keyed to auth.users, so inserting fictional talent would mean
-- creating fictional auth accounts. Those would be real, loginable identities
-- in the auth system. Sample people are created by the RLS test fixtures,
-- which clean up after themselves, rather than left behind by a seed script.
