-- 20260920120005_auth_helpers.sql
-- Authorization helper functions (TANIA_PRD_v2.0.md §13.1, TANIA_SUPABASE_RLS.sql §2).
--
-- All are STABLE SECURITY DEFINER with a pinned empty search_path
-- (CLAUDE.md §10). SECURITY DEFINER is required: these read
-- organization_memberships, which is itself RLS-protected, and a policy that
-- had to read the table it protects would recurse.
--
-- Every function derives its subject from auth.uid(). None accepts a
-- caller-supplied user, role or scope — that would be privilege escalation by
-- parameter (CLAUDE.md §10).

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships om
    join public.roles r on r.id = om.role_id
    where om.user_id = auth.uid()
      and r.code = required_role
  );
$$;

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships om
    join public.role_permissions rp on rp.role_id = om.role_id
    join public.permissions p on p.id = rp.permission_id
    where om.user_id = auth.uid()
      and p.code = required_permission
  );
$$;

create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct om.organization_id
  from public.organization_memberships om
  where om.user_id = auth.uid();
$$;

create or replace function public.user_squad_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.squad_id
  from public.profiles p
  where p.id = auth.uid() and p.squad_id is not null
  union
  select s.id
  from public.squads s
  where s.manager_id = auth.uid();
$$;

create or replace function public.can_access_profile(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_id = auth.uid()
    or public.has_role('SUPER_ADMIN')
    or (
      public.has_role('CHAPTER_LEAD')
      and exists (
        select 1 from public.profiles p
        where p.id = target_id
          and p.chapter_id in (select public.user_org_ids())
      )
    )
    or (
      public.has_role('MANAGER')
      and exists (
        select 1 from public.profiles p
        where p.id = target_id
          and p.squad_id in (select public.user_squad_ids())
      )
    )
    or (
      public.has_role('HR')
      and exists (
        select 1 from public.profiles p
        where p.id = target_id
          and p.chapter_id in (select public.user_org_ids())
      )
    );
$$;

comment on function public.has_role is
  'True when the current user holds the role in any organization. Subject is auth.uid(); never a parameter.';
comment on function public.can_access_profile is
  'Scope check for a target person: self, SUPER_ADMIN, own chapter (CHAPTER_LEAD/HR) or managed squad (MANAGER).';

-- Helpers are called from policies by `authenticated`; nobody else needs them.
revoke all on function public.has_role(text) from public, anon;
revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.user_org_ids() from public, anon;
revoke all on function public.user_squad_ids() from public, anon;
revoke all on function public.can_access_profile(uuid) from public, anon;

grant execute on function public.has_role(text) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.user_org_ids() to authenticated;
grant execute on function public.user_squad_ids() to authenticated;
grant execute on function public.can_access_profile(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Context accessors for the application layer.
--
-- The app needs the caller's roles and permissions to gate server boundaries
-- and to build the AI authorization context (TANIA_RBAC_RLS_MATRIX.md §8).
-- Exposing them as set-returning functions keeps that a single round trip and
-- avoids the client assembling privilege data from joined tables.
--
-- Each returns data for auth.uid() only. There is deliberately no variant
-- taking a user id: that would let any caller enumerate another person's
-- privileges.
-- --------------------------------------------------------------------------
create or replace function public.current_user_roles()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.code
  from public.organization_memberships om
  join public.roles r on r.id = om.role_id
  where om.user_id = auth.uid();
$$;

create or replace function public.current_user_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.code
  from public.organization_memberships om
  join public.role_permissions rp on rp.role_id = om.role_id
  join public.permissions p on p.id = rp.permission_id
  where om.user_id = auth.uid();
$$;

revoke all on function public.current_user_roles() from public, anon;
revoke all on function public.current_user_permissions() from public, anon;
grant execute on function public.current_user_roles() to authenticated;
grant execute on function public.current_user_permissions() to authenticated;
