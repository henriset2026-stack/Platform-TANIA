-- ==========================================================================
-- Chapter aggregates — TANIA_RBAC_RLS_MATRIX.md §9 "Executive → aggregate".
--
-- EXECUTIVE is "aggregated chapter/enterprise intelligence" (§2) and must not
-- reach individual sensitive records (§5, §9). RLS enforces the second half:
-- talent_capabilities, assignments and the rest are scoped by
-- can_access_profile, which grants EXECUTIVE nothing. That also left the
-- first half impossible — tests/rls/matrix-extended.rls.test.ts found an
-- executive's roll-up of chapter capabilities returning 0.
--
-- These functions are the aggregate path. They run as definer so they can
-- count rows the caller cannot read, and in exchange they return counts and
-- averages only — never an id, name or level of a person.
--
-- Access, derived from auth.uid() (no parameters, so no caller-supplied
-- scope — CLAUDE.md §6):
--   * report.read is required; AI identities get nothing (no report.read, and
--     is_ai_service() is checked explicitly as defence in depth);
--   * EXECUTIVE and SUPER_ADMIN: every chapter;
--   * CHAPTER_LEAD and HR: their own chapters;
--   * everyone else: no rows.
--
-- Small-group suppression: a figure describing fewer than 5 people is NULL
-- and the row says suppressed = true. An average level over two people, or an
-- over-allocation count in a three-person chapter, identifies individuals.
-- ==========================================================================

create or replace function public.chapter_summary()
returns table (
  organization_id uuid,
  organization_name text,
  suppressed boolean,
  active_headcount integer,
  talents_assessed integer,
  active_assignments integer,
  overallocated_people integer,
  active_projects integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized as (
    select o.id, o.name
    from public.organizations o
    where not public.is_ai_service()
      and public.has_permission('report.read')
      and (
        public.has_role('SUPER_ADMIN')
        or public.has_role('EXECUTIVE')
        or (
          (public.has_role('CHAPTER_LEAD') or public.has_role('HR'))
          and o.id in (select public.user_org_ids())
        )
      )
  ),
  people as (
    select p.id, p.chapter_id
    from public.profiles p
    join authorized a on a.id = p.chapter_id
    where p.status = 'active'
  ),
  allocation as (
    select pe.chapter_id, pe.id, sum(asg.allocation_pct) as total_pct, count(*) as n
    from people pe
    join public.assignments asg on asg.profile_id = pe.id and asg.status = 'active'
    group by pe.chapter_id, pe.id
  ),
  per_chapter as (
    select
      a.id as organization_id,
      a.name as organization_name,
      (select count(*) from people pe where pe.chapter_id = a.id)::integer as headcount,
      (select count(distinct tc.profile_id)
         from public.talent_capabilities tc
         join people pe on pe.id = tc.profile_id
        where pe.chapter_id = a.id)::integer as assessed,
      (select coalesce(sum(al.n), 0) from allocation al where al.chapter_id = a.id)::integer as assignments,
      (select count(*) from allocation al where al.chapter_id = a.id and al.total_pct > 100)::integer as overallocated,
      (select count(*)
         from public.projects pr
        where pr.organization_id = a.id and pr.status in ('planning', 'active'))::integer as projects
    from authorized a
  )
  select
    organization_id,
    organization_name,
    headcount < 5 as suppressed,
    headcount as active_headcount,
    case when headcount < 5 then null else assessed end as talents_assessed,
    case when headcount < 5 then null else assignments end as active_assignments,
    case when headcount < 5 then null else overallocated end as overallocated_people,
    projects as active_projects
  from per_chapter
  order by organization_name;
$$;

comment on function public.chapter_summary is
  'Per-chapter counts for EXECUTIVE/SUPER_ADMIN (all chapters) and CHAPTER_LEAD/HR (own). Person-derived figures are NULL below 5 active people.';

create or replace function public.chapter_capability_summary()
returns table (
  organization_id uuid,
  capability_id uuid,
  capability_name text,
  suppressed boolean,
  talents_assessed integer,
  average_level numeric,
  below_target integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized as (
    select o.id
    from public.organizations o
    where not public.is_ai_service()
      and public.has_permission('report.read')
      and (
        public.has_role('SUPER_ADMIN')
        or public.has_role('EXECUTIVE')
        or (
          (public.has_role('CHAPTER_LEAD') or public.has_role('HR'))
          and o.id in (select public.user_org_ids())
        )
      )
  ),
  grouped as (
    select
      p.chapter_id as organization_id,
      tc.capability_id,
      count(distinct tc.profile_id) as n,
      avg(tc.current_level) as avg_level,
      count(*) filter (where tc.target_level is not null and tc.current_level < tc.target_level) as below
    from public.talent_capabilities tc
    join public.profiles p on p.id = tc.profile_id and p.status = 'active'
    join authorized a on a.id = p.chapter_id
    group by p.chapter_id, tc.capability_id
  )
  select
    g.organization_id,
    g.capability_id,
    c.name as capability_name,
    g.n < 5 as suppressed,
    case when g.n < 5 then null else g.n::integer end as talents_assessed,
    case when g.n < 5 then null else round(g.avg_level, 1) end as average_level,
    case when g.n < 5 then null else g.below::integer end as below_target
  from grouped g
  join public.capabilities c on c.id = g.capability_id
  order by g.organization_id, c.name;
$$;

comment on function public.chapter_capability_summary is
  'Per-chapter, per-capability roll-up (count, average level, below target) for EXECUTIVE/SUPER_ADMIN and own-chapter CHAPTER_LEAD/HR. NULL below 5 people.';

revoke all on function public.chapter_summary() from public, anon;
revoke all on function public.chapter_capability_summary() from public, anon;
grant execute on function public.chapter_summary() to authenticated;
grant execute on function public.chapter_capability_summary() to authenticated;
