-- 20260920120006_rls_core.sql
-- Row level security for the Phase 2 base schema.
--
-- GRANT POSTURE
-- TANIA_SUPABASE_RLS.sql line 127 issues:
--     grant select,insert,update,delete on all tables in schema public to authenticated;
-- That inverts the safe default: correctness then depends on every table
-- having complete policies, and the file omits two
-- (TANIA_IMPLEMENTATION_BASELINE.md §7.4). Grants here are per table, next to
-- the policies that constrain them, and default privileges for future tables
-- are revoked so a table added later is unreachable until granted explicitly.

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ==========================================================================
-- organizations
-- ==========================================================================
alter table public.organizations enable row level security;
grant select on public.organizations to authenticated;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (
    id in (select public.user_org_ids())
    or public.has_role('SUPER_ADMIN')
    or public.has_role('EXECUTIVE')
  );

drop policy if exists organizations_write on public.organizations;
create policy organizations_write on public.organizations
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'));
grant insert, update, delete on public.organizations to authenticated;

-- ==========================================================================
-- profiles
-- ==========================================================================
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.can_access_profile(id) or public.has_role('EXECUTIVE'));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('talent.create'));
grant insert on public.profiles to authenticated;

-- A person may edit their own profile; wider edits need talent.update within
-- an authorized scope. USING and WITH CHECK are both constrained so a row
-- cannot be moved out of the editor's scope.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or (public.can_access_profile(id) and public.has_permission('talent.update'))
  )
  with check (
    id = auth.uid()
    or (public.can_access_profile(id) and public.has_permission('talent.update'))
  );
grant update on public.profiles to authenticated;

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.has_role('SUPER_ADMIN') and public.has_permission('talent.delete'));
grant delete on public.profiles to authenticated;

-- ==========================================================================
-- squads
-- ==========================================================================
alter table public.squads enable row level security;
grant select on public.squads to authenticated;

drop policy if exists squads_select on public.squads;
create policy squads_select on public.squads
  for select to authenticated
  using (
    id in (select public.user_squad_ids())
    or organization_id in (select public.user_org_ids())
    or public.has_role('SUPER_ADMIN')
    or public.has_role('EXECUTIVE')
  );

drop policy if exists squads_write on public.squads;
create policy squads_write on public.squads
  for all to authenticated
  using (
    public.has_role('SUPER_ADMIN')
    or (public.has_role('CHAPTER_LEAD') and organization_id in (select public.user_org_ids()))
  )
  with check (
    public.has_role('SUPER_ADMIN')
    or (public.has_role('CHAPTER_LEAD') and organization_id in (select public.user_org_ids()))
  );
grant insert, update, delete on public.squads to authenticated;

-- ==========================================================================
-- RBAC catalog — readable by all authenticated, writable by SUPER_ADMIN only
-- ==========================================================================
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

grant select on public.roles to authenticated;
grant select on public.permissions to authenticated;
grant select on public.role_permissions to authenticated;

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);
drop policy if exists roles_admin on public.roles;
create policy roles_admin on public.roles for all to authenticated
  using (public.has_role('SUPER_ADMIN')) with check (public.has_role('SUPER_ADMIN'));

drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);
drop policy if exists permissions_admin on public.permissions;
create policy permissions_admin on public.permissions for all to authenticated
  using (public.has_role('SUPER_ADMIN')) with check (public.has_role('SUPER_ADMIN'));

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
drop policy if exists role_permissions_admin on public.role_permissions;
create policy role_permissions_admin on public.role_permissions for all to authenticated
  using (public.has_role('SUPER_ADMIN')) with check (public.has_role('SUPER_ADMIN'));

grant insert, update, delete on public.roles to authenticated;
grant insert, update, delete on public.permissions to authenticated;
grant insert, update, delete on public.role_permissions to authenticated;

-- ==========================================================================
-- organization_memberships — THE PRIVILEGE ESCALATION FIX
--
-- Closes TANIA_IMPLEMENTATION_BASELINE.md §7.1. Without RLS here, any
-- authenticated user could insert a row binding themselves to SUPER_ADMIN and
-- defeat every other policy in the database.
--
-- Reads: own memberships, or an authorized administrator within scope.
-- Writes: SUPER_ADMIN or admin.users only. Notably a CHAPTER_LEAD cannot
-- grant roles — CLAUDE.md §9 forbids inferring write capability from read.
-- ==========================================================================
alter table public.organization_memberships enable row level security;
grant select on public.organization_memberships to authenticated;

drop policy if exists organization_memberships_select on public.organization_memberships;
create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role('SUPER_ADMIN')
    or (
      public.has_permission('admin.users')
      and organization_id in (select public.user_org_ids())
    )
  );

drop policy if exists organization_memberships_insert on public.organization_memberships;
create policy organization_memberships_insert on public.organization_memberships
  for insert to authenticated
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'));

drop policy if exists organization_memberships_update on public.organization_memberships;
create policy organization_memberships_update on public.organization_memberships
  for update to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'));

drop policy if exists organization_memberships_delete on public.organization_memberships;
create policy organization_memberships_delete on public.organization_memberships
  for delete to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'));

grant insert, update, delete on public.organization_memberships to authenticated;

-- ==========================================================================
-- audit_logs — append-only
--
-- SELECT only; no INSERT/UPDATE/DELETE grant and no write policy. Rows are
-- appended exclusively through record_audit_event() (SECURITY DEFINER), so
-- entries cannot be forged, rewritten or erased — including by SUPER_ADMIN.
-- ==========================================================================
alter table public.audit_logs enable row level security;
grant select on public.audit_logs to authenticated;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    public.has_permission('admin.audit')
    or (user_id = auth.uid() and public.has_permission('ai.view_audit'))
  );

revoke insert, update, delete on public.audit_logs from authenticated;
grant execute on function public.record_audit_event(text, text, text, jsonb, jsonb, uuid) to authenticated;
revoke all on function public.record_audit_event(text, text, text, jsonb, jsonb, uuid) from public, anon;
