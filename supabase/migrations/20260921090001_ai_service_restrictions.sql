-- 20260921090001_ai_service_restrictions.sql
-- Phase 3 — database-level guarantee that an AI identity cannot write.
--
-- WHY THIS EXISTS
-- lib/auth/policy.ts already refuses mutating permissions for AI_SERVICE, but
-- application-layer checks are not a control on their own (CLAUDE.md §4.1).
-- If an agent ever reached the database through a path that skipped that
-- layer — a new route, a tool, a misconfigured grant — nothing else would
-- stop it. These policies make the refusal a property of the database.
--
-- RESTRICTIVE policies are AND-ed with the permissive ones, so they can only
-- subtract. An AI_SERVICE session fails the write check no matter which
-- permissive policy would otherwise have allowed it, and no matter what
-- permissions the RBAC catalog has been configured to grant.

create or replace function public.is_ai_service()
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
      and r.code = 'AI_SERVICE'
  );
$$;

comment on function public.is_ai_service is
  'True when the current session belongs to an AI service identity. Used by RESTRICTIVE policies to deny writes.';

revoke all on function public.is_ai_service() from public, anon;
grant execute on function public.is_ai_service() to authenticated;

-- --------------------------------------------------------------------------
-- Deny all writes to an AI identity across every Phase 2 table.
--
-- Applied per command because a RESTRICTIVE policy `for all` does not cover
-- INSERT's WITH CHECK in the way these three separate policies do.
-- --------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations',
    'profiles',
    'squads',
    'roles',
    'permissions',
    'role_permissions',
    'organization_memberships'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I', 'ai_service_no_insert_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (not public.is_ai_service())',
      'ai_service_no_insert_' || t, t);

    execute format(
      'drop policy if exists %I on public.%I', 'ai_service_no_update_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (not public.is_ai_service())
         with check (not public.is_ai_service())',
      'ai_service_no_update_' || t, t);

    execute format(
      'drop policy if exists %I on public.%I', 'ai_service_no_delete_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
         using (not public.is_ai_service())',
      'ai_service_no_delete_' || t, t);
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- organization_memberships: nobody may grant themselves a role.
--
-- The permissive policy already limits writes to SUPER_ADMIN / admin.users.
-- This adds a separation-of-duties rule on top: even a legitimate
-- administrator cannot create or modify their OWN membership row. Privilege
-- changes always require a second person, which is what makes the audit trail
-- meaningful (TANIA_RBAC_RLS_MATRIX.md §7).
-- --------------------------------------------------------------------------
drop policy if exists memberships_no_self_grant_insert on public.organization_memberships;
create policy memberships_no_self_grant_insert on public.organization_memberships
  as restrictive for insert to authenticated
  with check (user_id <> auth.uid());

drop policy if exists memberships_no_self_grant_update on public.organization_memberships;
create policy memberships_no_self_grant_update on public.organization_memberships
  as restrictive for update to authenticated
  using (user_id <> auth.uid())
  with check (user_id <> auth.uid());

comment on table public.organization_memberships is
  'Authorization root. Writes restricted to SUPER_ADMIN / admin.users, denied to AI identities, and denied for the caller''s own row (no self-grant).';
