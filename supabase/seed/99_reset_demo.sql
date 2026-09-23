-- 99_reset_demo.sql
-- Removes the TANIA demo dataset. Removes nothing else.
--
-- Every row 03_demo_dataset.sql writes has a primary key beginning
-- `decafbad`, so this removes rows by that prefix rather than guessing at
-- names, dates or codes. That is the reason the seed hard-codes its keys: a
-- reset matching on anything looser is a reset that can take a real row with
-- it.
--
-- Order matters. Several foreign keys are ON DELETE RESTRICT — squads and
-- projects both restrict against organizations — so children are removed
-- before parents rather than relying on cascade.
--
--   psql "$DATABASE_URL" -v tania_allow_sample_data=1 -f 99_reset_demo.sql
--
-- Use `npm run db:reset`, which adds the environment checks.

\set ON_ERROR_STOP on
\if :{?tania_allow_sample_data}
\else
\echo 'REFUSED: set -v tania_allow_sample_data=1 to reset the demo dataset.'
\quit
\endif

begin;

-- Leaves first: evidence and telemetry.
delete from public.learning_evidence       where id::text like 'decafbad-%';
delete from public.learning_activities     where id::text like 'decafbad-%';
delete from public.learning_paths          where id::text like 'decafbad-%';
delete from public.development_plans       where id::text like 'decafbad-%';

delete from public.business_impacts        where id::text like 'decafbad-%';
delete from public.ai_usage                where id::text like 'decafbad-%';

delete from public.performance_reviews     where id::text like 'decafbad-%';
delete from public.performance_evidence    where id::text like 'decafbad-%';
delete from public.performance_metrics     where id::text like 'decafbad-%';
delete from public.performance_periods     where id::text like 'decafbad-%';

delete from public.assignments             where id::text like 'decafbad-%';
delete from public.projects                where id::text like 'decafbad-%';

delete from public.capability_evidence     where id::text like 'decafbad-%';
delete from public.talent_capabilities     where id::text like 'decafbad-%';
delete from public.capability_requirements where id::text like 'decafbad-%';
delete from public.capabilities            where id::text like 'decafbad-%';

delete from public.talent_profiles         where id::text like 'decafbad-%';

-- Squads reference profiles as manager, and profiles reference squads. The
-- manager link is cleared first, or whichever of the two is removed first
-- fails against the other.
update public.squads set manager_id = null where id::text like 'decafbad-%';

delete from public.organization_memberships
  where user_id::text like 'decafbad-%'
     or organization_id::text like 'decafbad-%';

delete from public.profiles                where id::text like 'decafbad-%';
delete from public.squads                  where id::text like 'decafbad-%';
delete from public.organizations           where id::text like 'decafbad-%';

-- The demo identities, last. profiles cascades from auth.users, so removing
-- these first would take the profile rows with them and leave every statement
-- above matching nothing — which looks exactly like success.
do $$
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users is absent; no demo identities to remove.';
    return;
  end if;
  delete from auth.users where id::text like 'decafbad-%';
end;
$$;

commit;

-- Confirms the reset rather than assuming it. A demo row left behind is a row
-- that will later be mistaken for real data.
do $$
declare
  v_remaining integer;
begin
  select count(*) into v_remaining
  from public.organizations
  where id::text like 'decafbad-%';

  if v_remaining > 0 then
    raise exception 'RESET INCOMPLETE: % demo organization(s) remain.', v_remaining;
  end if;

  raise notice 'Demo dataset removed.';
end;
$$;
