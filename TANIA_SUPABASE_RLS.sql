-- TANIA_SUPABASE_RLS.sql
-- Supabase/PostgreSQL security baseline for TANIA MVP.
-- Assumes the core tables from TANIA_PRD_v2.0.md already exist.
-- Fail closed: RLS is enabled and policies are explicit.

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- 1. RBAC catalog
-- ============================================================
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

insert into public.roles(code,name,description) values
('SUPER_ADMIN','Super Admin','Platform administrator'),
('EXECUTIVE','Executive','Aggregated executive intelligence'),
('CHAPTER_LEAD','Chapter Lead','Chapter management'),
('MANAGER','Manager','Squad/team management'),
('PROJECT_MANAGER','Project Manager','Project-scoped management'),
('TALENT','Talent','Individual self-service'),
('HR','HR','People governance'),
('AI_SERVICE','AI Service','Scoped AI service identity')
on conflict(code) do nothing;

insert into public.permissions(code,description) values
('talent.read','Read authorized talent'),('talent.create','Create talent'),('talent.update','Update talent'),('talent.delete','Delete talent'),('talent.export','Export talent'),
('performance.read','Read performance'),('performance.create_evidence','Create performance evidence'),('performance.update_evidence','Update performance evidence'),('performance.submit_review','Submit review'),('performance.approve_review','Approve review'),('performance.export','Export performance'),
('capability.read','Read capability'),('capability.create','Create capability'),('capability.update','Update capability'),('capability.assess','Assess capability'),('capability.validate_evidence','Validate capability evidence'),
('development.read','Read development'),('development.create','Create development'),('development.update','Update development'),('development.approve','Approve development'),('development.submit_evidence','Submit learning evidence'),
('assignment.read','Read assignments'),('assignment.recommend','Recommend assignment'),('assignment.create','Create assignment'),('assignment.update','Update assignment'),('assignment.approve','Approve assignment'),
('project.read','Read projects'),('project.create','Create project'),('project.update','Update project'),('project.delete','Delete project'),('project.manage_team','Manage project team'),
('business_impact.read','Read business impact'),('business_impact.create','Create business impact'),('business_impact.update','Update business impact'),('business_impact.validate','Validate business impact'),
('ai.use','Use AI'),('ai.analyze','Analyze with AI'),('ai.recommend','Generate AI recommendations'),('ai.execute','Execute AI tools'),('ai.view_audit','View AI audit'),
('report.read','Read reports'),('report.export','Export reports'),
('admin.users','Admin users'),('admin.roles','Admin roles'),('admin.capabilities','Admin capabilities'),('admin.organizations','Admin organizations'),('admin.integrations','Admin integrations'),('admin.audit','Admin audit')
on conflict(code) do nothing;

-- SUPER_ADMIN gets all permissions.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='SUPER_ADMIN' on conflict do nothing;

-- Helper to bulk grant permissions to a role.
create or replace function public.grant_permissions_to_role(role_code text, permission_codes text[])
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.role_permissions(role_id,permission_id)
  select r.id,p.id from public.roles r cross join public.permissions p
  where r.code=role_code and p.code=any(permission_codes)
  on conflict do nothing;
end; $$;

select public.grant_permissions_to_role('EXECUTIVE',array[
'talent.read','performance.read','capability.read','development.read','assignment.read','project.read','business_impact.read','ai.use','ai.analyze','ai.recommend','report.read','report.export']);
select public.grant_permissions_to_role('CHAPTER_LEAD',array[
'talent.read','talent.update','performance.read','performance.create_evidence','performance.update_evidence','performance.submit_review','performance.approve_review','performance.export','capability.read','capability.update','capability.assess','capability.validate_evidence','development.read','development.create','development.update','development.approve','development.submit_evidence','assignment.read','assignment.recommend','assignment.create','assignment.update','assignment.approve','project.read','project.create','project.update','project.manage_team','business_impact.read','business_impact.create','business_impact.update','business_impact.validate','ai.use','ai.analyze','ai.recommend','ai.execute','ai.view_audit','report.read','report.export','admin.capabilities']);
select public.grant_permissions_to_role('MANAGER',array[
'talent.read','talent.update','performance.read','performance.create_evidence','performance.update_evidence','performance.submit_review','capability.read','capability.update','capability.assess','capability.validate_evidence','development.read','development.create','development.update','development.approve','development.submit_evidence','assignment.read','assignment.recommend','assignment.create','assignment.update','project.read','project.update','project.manage_team','business_impact.read','business_impact.create','business_impact.update','ai.use','ai.analyze','ai.recommend','report.read','report.export']);
select public.grant_permissions_to_role('PROJECT_MANAGER',array[
'talent.read','performance.read','capability.read','development.read','assignment.read','assignment.recommend','assignment.create','assignment.update','project.read','project.create','project.update','project.manage_team','business_impact.read','business_impact.create','business_impact.update','ai.use','ai.analyze','ai.recommend','report.read','report.export']);
select public.grant_permissions_to_role('TALENT',array[
'talent.read','talent.update','performance.read','performance.create_evidence','performance.submit_review','capability.read','capability.update','development.read','development.create','development.update','development.submit_evidence','assignment.read','project.read','business_impact.read','ai.use','ai.analyze','ai.recommend','report.read']);
select public.grant_permissions_to_role('HR',array[
'talent.read','talent.create','talent.update','talent.export','performance.read','performance.create_evidence','performance.update_evidence','performance.approve_review','performance.export','capability.read','capability.update','capability.assess','capability.validate_evidence','development.read','development.create','development.update','development.approve','development.submit_evidence','assignment.read','project.read','business_impact.read','ai.use','ai.analyze','ai.recommend','report.read','report.export','admin.users','admin.capabilities','admin.audit']);
select public.grant_permissions_to_role('AI_SERVICE',array[
'talent.read','performance.read','capability.read','development.read','assignment.read','project.read','business_impact.read','ai.use','ai.analyze','ai.recommend']);

drop function if exists public.grant_permissions_to_role(text,text[]);

-- ============================================================
-- 2. Authorization helper functions
-- ============================================================
create or replace function public.has_role(required_role text)
returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.organization_memberships om join public.roles r on r.id=om.role_id where om.user_id=auth.uid() and r.code=required_role);
$$;

create or replace function public.has_permission(required_permission text)
returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.organization_memberships om join public.roles r on r.id=om.role_id join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id where om.user_id=auth.uid() and p.code=required_permission);
$$;

create or replace function public.user_org_ids()
returns setof uuid language sql stable security definer set search_path=public as $$
select distinct organization_id from public.organization_memberships where user_id=auth.uid();
$$;

create or replace function public.user_squad_ids()
returns setof uuid language sql stable security definer set search_path=public as $$
select squad_id from public.profiles where id=auth.uid() and squad_id is not null
union
select id from public.squads where manager_id=auth.uid();
$$;

create or replace function public.can_access_profile(target_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
select target_id=auth.uid()
or public.has_role('SUPER_ADMIN')
or (public.has_role('CHAPTER_LEAD') and exists(select 1 from public.profiles p where p.id=target_id and p.chapter_id in(select public.user_org_ids())))
or (public.has_role('MANAGER') and exists(select 1 from public.profiles p where p.id=target_id and p.squad_id in(select public.user_squad_ids())))
or (public.has_role('HR') and exists(select 1 from public.profiles p where p.id=target_id and p.chapter_id in(select public.user_org_ids())));
$$;

create or replace function public.can_access_project(target_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
select public.has_role('SUPER_ADMIN')
or exists(select 1 from public.projects p where p.id=target_id and (p.created_by=auth.uid() or p.organization_id in(select public.user_org_ids()) or exists(select 1 from public.assignments a where a.project_id=p.id and a.profile_id=auth.uid())));
$$;

-- ============================================================
-- 3. Generic RLS grants
-- ============================================================
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- ============================================================
-- 4. RLS policies
-- ============================================================

-- PROFILES
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
 id=auth.uid() or public.has_role('SUPER_ADMIN') or public.has_role('HR')
 or (public.has_role('CHAPTER_LEAD') and chapter_id in(select public.user_org_ids()))
 or (public.has_role('MANAGER') and squad_id in(select public.user_squad_ids()))
 or public.has_role('EXECUTIVE')
);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check(public.has_role('SUPER_ADMIN') or public.has_permission('talent.create'));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using(
 id=auth.uid() or public.has_role('SUPER_ADMIN') or public.has_role('HR')
 or (public.has_role('CHAPTER_LEAD') and chapter_id in(select public.user_org_ids()))
) with check(
 id=auth.uid() or public.has_role('SUPER_ADMIN') or public.has_role('HR')
 or (public.has_role('CHAPTER_LEAD') and chapter_id in(select public.user_org_ids()))
);
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated using(public.has_role('SUPER_ADMIN'));

-- ORGANIZATIONS
alter table public.organizations enable row level security;
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated using(id in(select public.user_org_ids()) or public.has_role('SUPER_ADMIN') or public.has_role('EXECUTIVE'));
drop policy if exists organizations_manage on public.organizations;
create policy organizations_manage on public.organizations for all to authenticated using(public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations')) with check(public.has_role('SUPER_ADMIN') or public.has_permission('admin.organizations'));

-- SQUADS
alter table public.squads enable row level security;
drop policy if exists squads_select on public.squads;
create policy squads_select on public.squads for select to authenticated using(id in(select public.user_squad_ids()) or organization_id in(select public.user_org_ids()) or public.has_role('SUPER_ADMIN') or public.has_role('EXECUTIVE'));
drop policy if exists squads_manage on public.squads;
create policy squads_manage on public.squads for all to authenticated using(public.has_role('SUPER_ADMIN') or (public.has_role('CHAPTER_LEAD') and organization_id in(select public.user_org_ids()))) with check(public.has_role('SUPER_ADMIN') or (public.has_role('CHAPTER_LEAD') and organization_id in(select public.user_org_ids())));

-- RBAC TABLES
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using(true);
drop policy if exists roles_admin on public.roles;
create policy roles_admin on public.roles for all to authenticated using(public.has_role('SUPER_ADMIN')) with check(public.has_role('SUPER_ADMIN'));
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using(true);
drop policy if exists permissions_admin on public.permissions;
create policy permissions_admin on public.permissions for all to authenticated using(public.has_role('SUPER_ADMIN')) with check(public.has_role('SUPER_ADMIN'));
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using(true);
drop policy if exists role_permissions_admin on public.role_permissions;
create policy role_permissions_admin on public.role_permissions for all to authenticated using(public.has_role('SUPER_ADMIN')) with check(public.has_role('SUPER_ADMIN'));

-- TALENT PROFILE
alter table public.talent_profiles enable row level security;
drop policy if exists talent_profiles_select on public.talent_profiles;
create policy talent_profiles_select on public.talent_profiles for select to authenticated using(public.can_access_profile(profile_id) or public.has_role('EXECUTIVE'));
drop policy if exists talent_profiles_insert on public.talent_profiles;
create policy talent_profiles_insert on public.talent_profiles for insert to authenticated with check(public.has_permission('talent.create'));
drop policy if exists talent_profiles_update on public.talent_profiles;
create policy talent_profiles_update on public.talent_profiles for update to authenticated using(public.can_access_profile(profile_id) and(profile_id=auth.uid() or public.has_permission('talent.update'))) with check(public.can_access_profile(profile_id));
drop policy if exists talent_profiles_delete on public.talent_profiles;
create policy talent_profiles_delete on public.talent_profiles for delete to authenticated using(public.has_role('SUPER_ADMIN'));

-- CAPABILITY FRAMEWORK
alter table public.capability_domains enable row level security;
alter table public.capabilities enable row level security;
alter table public.capability_levels enable row level security;
drop policy if exists capability_domains_read on public.capability_domains;
create policy capability_domains_read on public.capability_domains for select to authenticated using(true);
drop policy if exists capability_domains_admin on public.capability_domains;
create policy capability_domains_admin on public.capability_domains for all to authenticated using(public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities')) with check(public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));
drop policy if exists capabilities_read on public.capabilities;
create policy capabilities_read on public.capabilities for select to authenticated using(true);
drop policy if exists capabilities_admin on public.capabilities;
create policy capabilities_admin on public.capabilities for all to authenticated using(public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities')) with check(public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));
drop policy if exists capability_levels_read on public.capability_levels;
create policy capability_levels_read on public.capability_levels for select to authenticated using(true);

-- TALENT CAPABILITY + EVIDENCE
alter table public.talent_capabilities enable row level security;
drop policy if exists talent_capabilities_select on public.talent_capabilities;
create policy talent_capabilities_select on public.talent_capabilities for select to authenticated using(public.can_access_profile(profile_id) or public.has_role('EXECUTIVE'));
drop policy if exists talent_capabilities_insert on public.talent_capabilities;
create policy talent_capabilities_insert on public.talent_capabilities for insert to authenticated with check(public.can_access_profile(profile_id) and(profile_id=auth.uid() or public.has_permission('capability.assess')));
drop policy if exists talent_capabilities_update on public.talent_capabilities;
create policy talent_capabilities_update on public.talent_capabilities for update to authenticated using(public.can_access_profile(profile_id) and(profile_id=auth.uid() or public.has_permission('capability.assess'))) with check(public.can_access_profile(profile_id));
drop policy if exists talent_capabilities_delete on public.talent_capabilities;
create policy talent_capabilities_delete on public.talent_capabilities for delete to authenticated using(public.has_role('SUPER_ADMIN'));

alter table public.capability_evidence enable row level security;
drop policy if exists capability_evidence_select on public.capability_evidence;
create policy capability_evidence_select on public.capability_evidence for select to authenticated using(exists(select 1 from public.talent_capabilities tc where tc.id=talent_capability_id and public.can_access_profile(tc.profile_id)));
drop policy if exists capability_evidence_insert on public.capability_evidence;
create policy capability_evidence_insert on public.capability_evidence for insert to authenticated with check(exists(select 1 from public.talent_capabilities tc where tc.id=talent_capability_id and(tc.profile_id=auth.uid() or public.has_permission('capability.assess'))));
drop policy if exists capability_evidence_update on public.capability_evidence;
create policy capability_evidence_update on public.capability_evidence for update to authenticated using(exists(select 1 from public.talent_capabilities tc where tc.id=talent_capability_id and(tc.profile_id=auth.uid() or public.has_permission('capability.validate_evidence')))) with check(true);

-- PROJECTS
alter table public.projects enable row level security;
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using(public.can_access_project(id) or public.has_role('EXECUTIVE'));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check(public.has_permission('project.create') and(organization_id in(select public.user_org_ids()) or public.has_role('SUPER_ADMIN')));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated using(public.has_role('SUPER_ADMIN') or(public.has_permission('project.update') and organization_id in(select public.user_org_ids()))) with check(public.has_role('SUPER_ADMIN') or(public.has_permission('project.update') and organization_id in(select public.user_org_ids())));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated using(public.has_role('SUPER_ADMIN') or(public.has_permission('project.delete') and organization_id in(select public.user_org_ids())));

-- ASSIGNMENTS
alter table public.assignments enable row level security;
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments for select to authenticated using(profile_id=auth.uid() or public.can_access_project(project_id) or public.has_role('EXECUTIVE'));
drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments for insert to authenticated with check(public.has_permission('assignment.create') and public.can_access_project(project_id));
drop policy if exists assignments_update on public.assignments;
create policy assignments_update on public.assignments for update to authenticated using(public.can_access_project(project_id) and(public.has_permission('assignment.update') or public.has_permission('assignment.approve'))) with check(public.can_access_project(project_id));
drop policy if exists assignments_delete on public.assignments;
create policy assignments_delete on public.assignments for delete to authenticated using(public.has_role('SUPER_ADMIN') or(public.has_permission('assignment.update') and public.can_access_project(project_id)));

-- DELIVERABLES
alter table public.deliverables enable row level security;
drop policy if exists deliverables_select on public.deliverables;
create policy deliverables_select on public.deliverables for select to authenticated using(owner_id=auth.uid() or public.can_access_project(project_id) or public.has_role('EXECUTIVE'));
drop policy if exists deliverables_insert on public.deliverables;
create policy deliverables_insert on public.deliverables for insert to authenticated with check(public.can_access_project(project_id) and(owner_id=auth.uid() or public.has_permission('project.manage_team')));
drop policy if exists deliverables_update on public.deliverables;
create policy deliverables_update on public.deliverables for update to authenticated using(owner_id=auth.uid() or(public.has_permission('project.manage_team') and public.can_access_project(project_id))) with check(public.can_access_project(project_id));

-- PERFORMANCE
alter table public.performance_periods enable row level security;
drop policy if exists performance_periods_select on public.performance_periods;
create policy performance_periods_select on public.performance_periods for select to authenticated using(true);
drop policy if exists performance_periods_manage on public.performance_periods;
create policy performance_periods_manage on public.performance_periods for all to authenticated using(public.has_role('SUPER_ADMIN') or public.has_role('HR') or public.has_role('CHAPTER_LEAD')) with check(public.has_role('SUPER_ADMIN') or public.has_role('HR') or public.has_role('CHAPTER_LEAD'));

alter table public.performance_metrics enable row level security;
drop policy if exists performance_metrics_select on public.performance_metrics;
create policy performance_metrics_select on public.performance_metrics for select to authenticated using(public.can_access_profile(profile_id) or public.has_role('EXECUTIVE'));
drop policy if exists performance_metrics_insert on public.performance_metrics;
create policy performance_metrics_insert on public.performance_metrics for insert to authenticated with check(public.has_permission('performance.create_evidence') and public.can_access_profile(profile_id));
drop policy if exists performance_metrics_update on public.performance_metrics;
create policy performance_metrics_update on public.performance_metrics for update to authenticated using(public.has_permission('performance.update_evidence') and public.can_access_profile(profile_id)) with check(public.has_permission('performance.update_evidence') and public.can_access_profile(profile_id));

alter table public.performance_evidence enable row level security;
drop policy if exists performance_evidence_select on public.performance_evidence;
create policy performance_evidence_select on public.performance_evidence for select to authenticated using(public.can_access_profile(profile_id) or public.has_role('EXECUTIVE'));
drop policy if exists performance_evidence_insert on public.performance_evidence;
create policy performance_evidence_insert on public.performance_evidence for insert to authenticated with check(public.has_permission('performance.create_evidence') and public.can_access_profile(profile_id));
drop policy if exists performance_evidence_update on public.performance_evidence;
create policy performance_evidence_update on public.performance_evidence for update to authenticated using(public.has_permission('performance.update_evidence') and public.can_access_profile(profile_id)) with check(public.has_permission('performance.update_evidence') and public.can_access_profile(profile_id));

alter table public.performance_reviews enable row level security;
drop policy if exists performance_reviews_select on public.performance_reviews;
create policy performance_reviews_select on public.performance_reviews for select to authenticated using(public.can_access_profile(profile_id) or reviewer_id=auth.uid() or public.has_role('EXECUTIVE'));
drop policy if exists performance_reviews_insert on public.performance_reviews;
create policy performance_reviews_insert on public.performance_reviews for insert to authenticated with check(public.has_permission('performance.submit_review') and reviewer_id=auth.uid() and public.can_access_profile(profile_id));
drop policy if exists performance_reviews_update on public.performance_reviews;
create policy performance_reviews_update on public.performance_reviews for update to authenticated using((reviewer_id=auth.uid() and public.has_permission('performance.submit_review')) or(public.has_permission('performance.approve_review') and public.can_access_profile(profile_id))) with check((reviewer_id=auth.uid() and public.has_permission('performance.submit_review')) or(public.has_permission('performance.approve_review') and public.can_access_profile(profile_id)));

-- DEVELOPMENT / LEARNING
alter table public.development_plans enable row level security;
drop policy if exists development_plans_select on public.development_plans;
create policy development_plans_select on public.development_plans for select to authenticated using(public.can_access_profile(profile_id) or public.has_role('EXECUTIVE'));
drop policy if exists development_plans_insert on public.development_plans;
create policy development_plans_insert on public.development_plans for insert to authenticated with check(public.has_permission('development.create') and public.can_access_profile(profile_id));
drop policy if exists development_plans_update on public.development_plans;
create policy development_plans_update on public.development_plans for update to authenticated using(public.can_access_profile(profile_id) and(profile_id=auth.uid() or public.has_permission('development.update') or public.has_permission('development.approve'))) with check(public.can_access_profile(profile_id));

alter table public.learning_paths enable row level security;
create policy learning_paths_select on public.learning_paths for select to authenticated using(exists(select 1 from public.development_plans dp where dp.id=development_plan_id and public.can_access_profile(dp.profile_id)));
create policy learning_paths_manage on public.learning_paths for all to authenticated using(exists(select 1 from public.development_plans dp where dp.id=development_plan_id and public.can_access_profile(dp.profile_id) and(dp.profile_id=auth.uid() or public.has_permission('development.update')))) with check(exists(select 1 from public.development_plans dp where dp.id=development_plan_id and public.can_access_profile(dp.profile_id)));

alter table public.learning_activities enable row level security;
create policy learning_activities_select on public.learning_activities for select to authenticated using(exists(select 1 from public.learning_paths lp join public.development_plans dp on dp.id=lp.development_plan_id where lp.id=learning_path_id and public.can_access_profile(dp.profile_id)));
create policy learning_activities_manage on public.learning_activities for all to authenticated using(exists(select 1 from public.learning_paths lp join public.development_plans dp on dp.id=lp.development_plan_id where lp.id=learning_path_id and public.can_access_profile(dp.profile_id) and(dp.profile_id=auth.uid() or public.has_permission('development.update')))) with check(exists(select 1 from public.learning_paths lp join public.development_plans dp on dp.id=lp.development_plan_id where lp.id=learning_path_id and public.can_access_profile(dp.profile_id)));

alter table public.learning_evidence enable row level security;
create policy learning_evidence_select on public.learning_evidence for select to authenticated using(profile_id=auth.uid() or public.can_access_profile(profile_id));
create policy learning_evidence_insert on public.learning_evidence for insert to authenticated with check(profile_id=auth.uid() or public.has_permission('development.submit_evidence'));
create policy learning_evidence_update on public.learning_evidence for update to authenticated using(profile_id=auth.uid() or public.has_permission('development.approve')) with check(profile_id=auth.uid() or public.has_permission('development.approve'));

-- AI
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated using(profile_id=auth.uid() or(public.has_permission('ai.view_audit') and public.can_access_profile(profile_id)));
create policy ai_usage_insert on public.ai_usage for insert to authenticated with check(profile_id=auth.uid() or public.has_role('AI_SERVICE'));
create policy ai_usage_update on public.ai_usage for update to authenticated using(profile_id=auth.uid() or public.has_role('AI_SERVICE')) with check(profile_id=auth.uid() or public.has_role('AI_SERVICE'));

alter table public.ai_assessments enable row level security;
create policy ai_assessments_select on public.ai_assessments for select to authenticated using(public.can_access_profile(profile_id) or public.has_role('EXECUTIVE'));
create policy ai_assessments_insert on public.ai_assessments for insert to authenticated with check(public.has_permission('ai.analyze') and public.can_access_profile(profile_id));

alter table public.ai_augmentation enable row level security;
create policy ai_augmentation_select on public.ai_augmentation for select to authenticated using(public.can_access_profile(profile_id) or public.has_role('EXECUTIVE'));
create policy ai_augmentation_manage on public.ai_augmentation for all to authenticated using(public.has_permission('ai.analyze') and public.can_access_profile(profile_id)) with check(public.has_permission('ai.analyze') and public.can_access_profile(profile_id));

-- BUSINESS IMPACT
alter table public.business_impacts enable row level security;
create policy business_impacts_select on public.business_impacts for select to authenticated using((profile_id is not null and public.can_access_profile(profile_id)) or(project_id is not null and public.can_access_project(project_id)) or public.has_role('EXECUTIVE'));
create policy business_impacts_insert on public.business_impacts for insert to authenticated with check(public.has_permission('business_impact.create') and(profile_id is null or public.can_access_profile(profile_id)) and(project_id is null or public.can_access_project(project_id)));
create policy business_impacts_update on public.business_impacts for update to authenticated using(public.has_permission('business_impact.update') and(profile_id is null or public.can_access_profile(profile_id))) with check(public.has_permission('business_impact.update'));

-- AI INTERACTIONS: private by default
alter table public.ai_interactions enable row level security;
create policy ai_interactions_select on public.ai_interactions for select to authenticated using(user_id=auth.uid() or(public.has_permission('ai.view_audit') and public.can_access_profile(user_id)));
create policy ai_interactions_insert on public.ai_interactions for insert to authenticated with check(user_id=auth.uid() or public.has_role('AI_SERVICE'));
create policy ai_interactions_update on public.ai_interactions for update to authenticated using(public.has_role('SUPER_ADMIN')) with check(public.has_role('SUPER_ADMIN'));
create policy ai_interactions_delete on public.ai_interactions for delete to authenticated using(public.has_role('SUPER_ADMIN'));

-- AGENT RUNS / TOOL CALLS
alter table public.agent_runs enable row level security;
create policy agent_runs_select on public.agent_runs for select to authenticated using(user_id=auth.uid() or(public.has_permission('ai.view_audit') and(user_id is null or public.can_access_profile(user_id))));
create policy agent_runs_insert on public.agent_runs for insert to authenticated with check(user_id=auth.uid() or public.has_role('AI_SERVICE'));
create policy agent_runs_update on public.agent_runs for update to authenticated using(user_id=auth.uid() or public.has_role('AI_SERVICE')) with check(user_id=auth.uid() or public.has_role('AI_SERVICE'));

alter table public.agent_tool_calls enable row level security;
create policy agent_tool_calls_select on public.agent_tool_calls for select to authenticated using(exists(select 1 from public.agent_runs ar where ar.id=agent_run_id and(ar.user_id=auth.uid() or(public.has_permission('ai.view_audit') and(ar.user_id is null or public.can_access_profile(ar.user_id))))));
create policy agent_tool_calls_insert on public.agent_tool_calls for insert to authenticated with check(exists(select 1 from public.agent_runs ar where ar.id=agent_run_id and(ar.user_id=auth.uid() or public.has_role('AI_SERVICE'))));

-- RECOMMENDATIONS
alter table public.recommendations enable row level security;
create policy recommendations_select on public.recommendations for select to authenticated using(profile_id=auth.uid() or(profile_id is not null and public.can_access_profile(profile_id)) or public.has_role('EXECUTIVE'));
create policy recommendations_insert on public.recommendations for insert to authenticated with check((profile_id is null or public.can_access_profile(profile_id)) and(public.has_permission('ai.recommend') or public.has_role('AI_SERVICE')));
create policy recommendations_update on public.recommendations for update to authenticated using(profile_id=auth.uid() or public.has_permission('ai.recommend')) with check(profile_id=auth.uid() or public.has_permission('ai.recommend'));

-- AUDIT LOGS: append-only for normal users
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated using(public.has_permission('admin.audit') or(user_id=auth.uid() and public.has_permission('ai.view_audit')));
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check(user_id=auth.uid() or public.has_role('AI_SERVICE') or public.has_role('SUPER_ADMIN'));
create policy audit_logs_update on public.audit_logs for update to authenticated using(public.has_role('SUPER_ADMIN')) with check(public.has_role('SUPER_ADMIN'));
create policy audit_logs_delete on public.audit_logs for delete to authenticated using(public.has_role('SUPER_ADMIN'));

commit;

-- Verification:
-- select schemaname,tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
-- select schemaname,tablename,policyname,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
-- select r.code role,p.code permission from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id order by r.code,p.code;
