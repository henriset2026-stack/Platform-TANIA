-- 20260920120007_indexes.sql
-- Indexes on every column an RLS policy path reads.
--
-- Neither TANIA_PRD_v2.0.md nor TANIA_SUPABASE_RLS.sql defines a single index
-- (TANIA_IMPLEMENTATION_BASELINE.md §7.5). can_access_profile() is correlated
-- — evaluated per candidate row — and joins organization_memberships,
-- profiles and squads each time. Unindexed, every policy check degrades to a
-- sequential scan, which is a denial of service on the authorization path
-- itself, not merely a slow page.

-- organization_memberships: read by has_role(), has_permission(), user_org_ids()
create index if not exists organization_memberships_user_id_idx
  on public.organization_memberships (user_id);
create index if not exists organization_memberships_organization_id_idx
  on public.organization_memberships (organization_id);
create index if not exists organization_memberships_role_id_idx
  on public.organization_memberships (role_id);
-- Covers the has_role()/has_permission() lookup in one index.
create index if not exists organization_memberships_user_role_idx
  on public.organization_memberships (user_id, role_id);

-- role_permissions: joined by has_permission()
create index if not exists role_permissions_role_id_idx
  on public.role_permissions (role_id);
create index if not exists role_permissions_permission_id_idx
  on public.role_permissions (permission_id);

-- profiles: scope columns read by can_access_profile() and user_squad_ids()
create index if not exists profiles_chapter_id_idx
  on public.profiles (chapter_id) where chapter_id is not null;
create index if not exists profiles_squad_id_idx
  on public.profiles (squad_id) where squad_id is not null;
create index if not exists profiles_manager_id_idx
  on public.profiles (manager_id) where manager_id is not null;
create index if not exists profiles_status_idx
  on public.profiles (status);

-- squads: manager_id drives user_squad_ids(); organization_id drives scope
create index if not exists squads_manager_id_idx
  on public.squads (manager_id) where manager_id is not null;
create index if not exists squads_organization_id_idx
  on public.squads (organization_id);

-- organizations: parent traversal
create index if not exists organizations_parent_id_idx
  on public.organizations (parent_id) where parent_id is not null;

-- audit_logs: the two query shapes the audit_logs_select policy produces
create index if not exists audit_logs_user_id_created_at_idx
  on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_resource_idx
  on public.audit_logs (resource_type, resource_id);
create index if not exists audit_logs_request_id_idx
  on public.audit_logs (request_id) where request_id is not null;
