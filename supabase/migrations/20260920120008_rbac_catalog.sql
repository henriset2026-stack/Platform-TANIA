-- 20260920120008_rbac_catalog.sql
-- RBAC reference data: roles, the permission catalog, and role grants.
--
-- This is specification-defined reference data (TANIA_RBAC_RLS_MATRIX.md §2-§4,
-- TANIA_SUPABASE_RLS.sql §1), not business data. No person, organization,
-- squad or membership is seeded — those are real records and must not be
-- fabricated.
--
-- Idempotent: safe to re-run.

insert into public.roles (code, name, description) values
  ('SUPER_ADMIN',     'Super Admin',     'Platform administrator'),
  ('EXECUTIVE',       'Executive',       'Aggregated executive intelligence'),
  ('CHAPTER_LEAD',    'Chapter Lead',    'Chapter management'),
  ('MANAGER',         'Manager',         'Squad/team management'),
  ('PROJECT_MANAGER', 'Project Manager', 'Project-scoped management'),
  ('TALENT',          'Talent',          'Individual self-service'),
  ('HR',              'HR',              'People governance'),
  ('AI_SERVICE',      'AI Service',      'Scoped AI service identity')
on conflict (code) do nothing;

insert into public.permissions (code, description) values
  ('talent.read','Read authorized talent'),
  ('talent.create','Create talent'),
  ('talent.update','Update talent'),
  ('talent.delete','Delete talent'),
  ('talent.export','Export talent'),
  ('performance.read','Read performance'),
  ('performance.create_evidence','Create performance evidence'),
  ('performance.update_evidence','Update performance evidence'),
  ('performance.submit_review','Submit review'),
  ('performance.approve_review','Approve review'),
  ('performance.export','Export performance'),
  ('capability.read','Read capability'),
  ('capability.create','Create capability'),
  ('capability.update','Update capability'),
  ('capability.assess','Assess capability'),
  ('capability.validate_evidence','Validate capability evidence'),
  ('development.read','Read development'),
  ('development.create','Create development'),
  ('development.update','Update development'),
  ('development.approve','Approve development'),
  ('development.submit_evidence','Submit learning evidence'),
  ('assignment.read','Read assignments'),
  ('assignment.recommend','Recommend assignment'),
  ('assignment.create','Create assignment'),
  ('assignment.update','Update assignment'),
  ('assignment.approve','Approve assignment'),
  ('project.read','Read projects'),
  ('project.create','Create project'),
  ('project.update','Update project'),
  ('project.delete','Delete project'),
  ('project.manage_team','Manage project team'),
  ('business_impact.read','Read business impact'),
  ('business_impact.create','Create business impact'),
  ('business_impact.update','Update business impact'),
  ('business_impact.validate','Validate business impact'),
  ('ai.use','Use AI'),
  ('ai.analyze','Analyze with AI'),
  ('ai.recommend','Generate AI recommendations'),
  ('ai.execute','Execute AI tools'),
  ('ai.view_audit','View AI audit'),
  ('report.read','Read reports'),
  ('report.export','Export reports'),
  ('admin.users','Admin users'),
  ('admin.roles','Admin roles'),
  ('admin.capabilities','Admin capabilities'),
  ('admin.organizations','Admin organizations'),
  ('admin.integrations','Admin integrations'),
  ('admin.audit','Admin audit')
on conflict (code) do nothing;

-- SUPER_ADMIN holds everything.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.code = 'SUPER_ADMIN'
on conflict do nothing;

-- Transient helper; dropped at the end of this migration.
create or replace function pg_temp.grant_perms(role_code text, permission_codes text[])
returns void
language sql
as $$
  insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r cross join public.permissions p
  where r.code = role_code and p.code = any(permission_codes)
  on conflict do nothing;
$$;

select pg_temp.grant_perms('EXECUTIVE', array[
  'talent.read','performance.read','capability.read','development.read',
  'assignment.read','project.read','business_impact.read',
  'ai.use','ai.analyze','ai.recommend','report.read','report.export']);

select pg_temp.grant_perms('CHAPTER_LEAD', array[
  'talent.read','talent.update',
  'performance.read','performance.create_evidence','performance.update_evidence',
  'performance.submit_review','performance.approve_review','performance.export',
  'capability.read','capability.update','capability.assess','capability.validate_evidence',
  'development.read','development.create','development.update','development.approve','development.submit_evidence',
  'assignment.read','assignment.recommend','assignment.create','assignment.update','assignment.approve',
  'project.read','project.create','project.update','project.manage_team',
  'business_impact.read','business_impact.create','business_impact.update','business_impact.validate',
  'ai.use','ai.analyze','ai.recommend','ai.execute','ai.view_audit',
  'report.read','report.export','admin.capabilities']);

select pg_temp.grant_perms('MANAGER', array[
  'talent.read','talent.update',
  'performance.read','performance.create_evidence','performance.update_evidence','performance.submit_review',
  'capability.read','capability.update','capability.assess','capability.validate_evidence',
  'development.read','development.create','development.update','development.approve','development.submit_evidence',
  'assignment.read','assignment.recommend','assignment.create','assignment.update',
  'project.read','project.update','project.manage_team',
  'business_impact.read','business_impact.create','business_impact.update',
  'ai.use','ai.analyze','ai.recommend','report.read','report.export']);

select pg_temp.grant_perms('PROJECT_MANAGER', array[
  'talent.read','performance.read','capability.read','development.read',
  'assignment.read','assignment.recommend','assignment.create','assignment.update',
  'project.read','project.create','project.update','project.manage_team',
  'business_impact.read','business_impact.create','business_impact.update',
  'ai.use','ai.analyze','ai.recommend','report.read','report.export']);

select pg_temp.grant_perms('TALENT', array[
  'talent.read','talent.update',
  'performance.read','performance.create_evidence','performance.submit_review',
  'capability.read','capability.update',
  'development.read','development.create','development.update','development.submit_evidence',
  'assignment.read','project.read','business_impact.read',
  'ai.use','ai.analyze','ai.recommend','report.read']);

select pg_temp.grant_perms('HR', array[
  'talent.read','talent.create','talent.update','talent.export',
  'performance.read','performance.create_evidence','performance.update_evidence',
  'performance.approve_review','performance.export',
  'capability.read','capability.update','capability.assess','capability.validate_evidence',
  'development.read','development.create','development.update','development.approve','development.submit_evidence',
  'assignment.read','project.read','business_impact.read',
  'ai.use','ai.analyze','ai.recommend','report.read','report.export',
  'admin.users','admin.capabilities','admin.audit']);

-- AI_SERVICE is read + analyse only. No create, update, approve or export:
-- an agent proposes, a human commits (CLAUDE.md §4.5, AGENTS.md §9).
select pg_temp.grant_perms('AI_SERVICE', array[
  'talent.read','performance.read','capability.read','development.read',
  'assignment.read','project.read','business_impact.read',
  'ai.use','ai.analyze','ai.recommend']);

drop function pg_temp.grant_perms(text, text[]);
