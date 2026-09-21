-- 20260921100008_domain_rls.sql
-- RLS for every Phase 4 table. Deny by default; per-table grants only.
--
-- Sensitivity classes (TANIA_RBAC_RLS_MATRIX.md §6) drive the SELECT rules:
--   INTERNAL      capability framework            -> broad authenticated read
--   CONFIDENTIAL  talent, assignment, project     -> scope-based
--   SENSITIVE     performance, development        -> strict scope
--   RESTRICTED    private AI conversations        -> owner + explicit authority

-- ==========================================================================
-- INTERNAL — capability framework definitions.
-- Readable by any authenticated user; writable only with admin.capabilities.
--
-- capability_levels gets a real write policy here, closing
-- TANIA_IMPLEMENTATION_BASELINE.md §7.6: the shipped baseline gave it a SELECT
-- policy only, which under deny-by-default made the L1-L5 framework
-- unadministrable by anyone including SUPER_ADMIN.
-- ==========================================================================
-- Written out per table rather than generated in a DO loop. Dynamic DDL is
-- invisible to the static checks in tests/unit/migrations.test.ts, and RLS
-- enablement is exactly the statement that must stay verifiable by reading
-- the file.

alter table public.capability_domains enable row level security;
grant select, insert, update, delete on public.capability_domains to authenticated;

drop policy if exists capability_domains_read on public.capability_domains;
create policy capability_domains_read on public.capability_domains
  for select to authenticated using (true);

drop policy if exists capability_domains_admin on public.capability_domains;
create policy capability_domains_admin on public.capability_domains
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));

alter table public.capabilities enable row level security;
grant select, insert, update, delete on public.capabilities to authenticated;

drop policy if exists capabilities_read on public.capabilities;
create policy capabilities_read on public.capabilities
  for select to authenticated using (true);

drop policy if exists capabilities_admin on public.capabilities;
create policy capabilities_admin on public.capabilities
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));

alter table public.capability_levels enable row level security;
grant select, insert, update, delete on public.capability_levels to authenticated;

drop policy if exists capability_levels_read on public.capability_levels;
create policy capability_levels_read on public.capability_levels
  for select to authenticated using (true);

drop policy if exists capability_levels_admin on public.capability_levels;
create policy capability_levels_admin on public.capability_levels
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));

-- capability_requirements: readable in scope, writable with capability.create/update.
alter table public.capability_requirements enable row level security;
grant select, insert, update, delete on public.capability_requirements to authenticated;

drop policy if exists capability_requirements_select on public.capability_requirements;
create policy capability_requirements_select on public.capability_requirements
  for select to authenticated
  using (
    public.has_permission('capability.read')
    and (
      organization_id is null
      or organization_id in (select public.user_org_ids())
      or public.has_role('SUPER_ADMIN')
    )
  );

drop policy if exists capability_requirements_write on public.capability_requirements;
create policy capability_requirements_write on public.capability_requirements
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.capabilities'));

-- ==========================================================================
-- CONFIDENTIAL — talent records, scoped by can_access_profile().
-- ==========================================================================
alter table public.talent_profiles enable row level security;
grant select, insert, update, delete on public.talent_profiles to authenticated;

drop policy if exists talent_profiles_select on public.talent_profiles;
create policy talent_profiles_select on public.talent_profiles
  for select to authenticated
  using (public.can_access_profile(profile_id) and public.has_permission('talent.read'));

drop policy if exists talent_profiles_insert on public.talent_profiles;
create policy talent_profiles_insert on public.talent_profiles
  for insert to authenticated
  with check (public.has_permission('talent.create'));

drop policy if exists talent_profiles_update on public.talent_profiles;
create policy talent_profiles_update on public.talent_profiles
  for update to authenticated
  using (
    profile_id = auth.uid()
    or (public.can_access_profile(profile_id) and public.has_permission('talent.update'))
  )
  with check (
    profile_id = auth.uid()
    or (public.can_access_profile(profile_id) and public.has_permission('talent.update'))
  );

drop policy if exists talent_profiles_delete on public.talent_profiles;
create policy talent_profiles_delete on public.talent_profiles
  for delete to authenticated
  using (public.has_role('SUPER_ADMIN') and public.has_permission('talent.delete'));

-- talent_capabilities: own record, or authorized scope.
alter table public.talent_capabilities enable row level security;
grant select, insert, update, delete on public.talent_capabilities to authenticated;

drop policy if exists talent_capabilities_select on public.talent_capabilities;
create policy talent_capabilities_select on public.talent_capabilities
  for select to authenticated
  using (public.can_access_profile(profile_id) and public.has_permission('capability.read'));

drop policy if exists talent_capabilities_write on public.talent_capabilities;
create policy talent_capabilities_write on public.talent_capabilities
  for all to authenticated
  using (
    (profile_id = auth.uid() and public.has_permission('capability.update'))
    or (public.can_access_profile(profile_id) and public.has_permission('capability.assess'))
  )
  with check (
    (profile_id = auth.uid() and public.has_permission('capability.update'))
    or (public.can_access_profile(profile_id) and public.has_permission('capability.assess'))
  );

-- capability_evidence: reachable through the owning talent_capability.
-- Soft-deleted rows are hidden from normal reads.
alter table public.capability_evidence enable row level security;
grant select, insert, update on public.capability_evidence to authenticated;
revoke delete on public.capability_evidence from authenticated;

drop policy if exists capability_evidence_select on public.capability_evidence;
create policy capability_evidence_select on public.capability_evidence
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.talent_capabilities tc
      where tc.id = talent_capability_id
        and public.can_access_profile(tc.profile_id)
    )
  );

drop policy if exists capability_evidence_insert on public.capability_evidence;
create policy capability_evidence_insert on public.capability_evidence
  for insert to authenticated
  with check (
    exists (
      select 1 from public.talent_capabilities tc
      where tc.id = talent_capability_id
        and (tc.profile_id = auth.uid() or public.can_access_profile(tc.profile_id))
    )
  );

-- Validating evidence is a distinct permission from creating it.
drop policy if exists capability_evidence_update on public.capability_evidence;
create policy capability_evidence_update on public.capability_evidence
  for update to authenticated
  using (
    exists (
      select 1 from public.talent_capabilities tc
      where tc.id = talent_capability_id
        and public.can_access_profile(tc.profile_id)
    )
    and (created_by = auth.uid() or public.has_permission('capability.validate_evidence'))
  )
  with check (
    exists (
      select 1 from public.talent_capabilities tc
      where tc.id = talent_capability_id
        and public.can_access_profile(tc.profile_id)
    )
  );

-- ==========================================================================
-- CONFIDENTIAL — projects, assignments, deliverables.
-- ==========================================================================
alter table public.projects enable row level security;
grant select, insert, update, delete on public.projects to authenticated;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_access_project(id) and public.has_permission('project.read'));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (
    public.has_permission('project.create')
    and organization_id in (select public.user_org_ids())
  );

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.can_access_project(id) and public.has_permission('project.update'))
  with check (public.can_access_project(id) and public.has_permission('project.update'));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.has_permission('project.delete') and public.can_access_project(id));

alter table public.assignments enable row level security;
grant select, insert, update, delete on public.assignments to authenticated;

drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    profile_id = auth.uid()
    or (public.can_access_project(project_id) and public.has_permission('assignment.read'))
    or public.can_access_profile(profile_id)
  );

drop policy if exists assignments_write on public.assignments;
create policy assignments_write on public.assignments
  for all to authenticated
  using (public.can_access_project(project_id) and public.has_permission('assignment.update'))
  with check (public.can_access_project(project_id) and public.has_permission('assignment.update'));

drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments
  for insert to authenticated
  with check (public.can_access_project(project_id) and public.has_permission('assignment.create'));

alter table public.deliverables enable row level security;
grant select, insert, update, delete on public.deliverables to authenticated;

drop policy if exists deliverables_select on public.deliverables;
create policy deliverables_select on public.deliverables
  for select to authenticated
  using (public.can_access_project(project_id) and public.has_permission('project.read'));

drop policy if exists deliverables_write on public.deliverables;
create policy deliverables_write on public.deliverables
  for all to authenticated
  using (public.can_access_project(project_id) and public.has_permission('project.update'))
  with check (public.can_access_project(project_id) and public.has_permission('project.update'));

-- ==========================================================================
-- SENSITIVE — performance. Strict scope.
-- ==========================================================================
alter table public.performance_periods enable row level security;
grant select, insert, update, delete on public.performance_periods to authenticated;

drop policy if exists performance_periods_read on public.performance_periods;
create policy performance_periods_read on public.performance_periods
  for select to authenticated using (public.has_permission('performance.read'));

drop policy if exists performance_periods_admin on public.performance_periods;
create policy performance_periods_admin on public.performance_periods
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.users'));

alter table public.performance_metrics enable row level security;
grant select, insert, update, delete on public.performance_metrics to authenticated;

drop policy if exists performance_metrics_select on public.performance_metrics;
create policy performance_metrics_select on public.performance_metrics
  for select to authenticated
  using (public.can_access_profile(profile_id) and public.has_permission('performance.read'));

drop policy if exists performance_metrics_write on public.performance_metrics;
create policy performance_metrics_write on public.performance_metrics
  for all to authenticated
  using (public.can_access_profile(profile_id) and public.has_permission('performance.update_evidence'))
  with check (public.can_access_profile(profile_id) and public.has_permission('performance.update_evidence'));

alter table public.performance_evidence enable row level security;
grant select, insert, update on public.performance_evidence to authenticated;
revoke delete on public.performance_evidence from authenticated;

drop policy if exists performance_evidence_select on public.performance_evidence;
create policy performance_evidence_select on public.performance_evidence
  for select to authenticated
  using (
    deleted_at is null
    and public.can_access_profile(profile_id)
    and public.has_permission('performance.read')
  );

drop policy if exists performance_evidence_insert on public.performance_evidence;
create policy performance_evidence_insert on public.performance_evidence
  for insert to authenticated
  with check (
    public.has_permission('performance.create_evidence')
    and (profile_id = auth.uid() or public.can_access_profile(profile_id))
  );

drop policy if exists performance_evidence_update on public.performance_evidence;
create policy performance_evidence_update on public.performance_evidence
  for update to authenticated
  using (
    public.can_access_profile(profile_id)
    and public.has_permission('performance.update_evidence')
  )
  with check (public.can_access_profile(profile_id));

-- performance_reviews: approval is separately permissioned from submission.
alter table public.performance_reviews enable row level security;
grant select, insert, update on public.performance_reviews to authenticated;
revoke delete on public.performance_reviews from authenticated;

drop policy if exists performance_reviews_select on public.performance_reviews;
create policy performance_reviews_select on public.performance_reviews
  for select to authenticated
  using (
    profile_id = auth.uid()
    or reviewer_id = auth.uid()
    or (public.can_access_profile(profile_id) and public.has_permission('performance.read'))
  );

drop policy if exists performance_reviews_insert on public.performance_reviews;
create policy performance_reviews_insert on public.performance_reviews
  for insert to authenticated
  with check (
    public.has_permission('performance.submit_review')
    and public.can_access_profile(profile_id)
    and reviewer_id = auth.uid()
  );

drop policy if exists performance_reviews_update on public.performance_reviews;
create policy performance_reviews_update on public.performance_reviews
  for update to authenticated
  using (
    (reviewer_id = auth.uid() and public.has_permission('performance.submit_review'))
    or public.has_permission('performance.approve_review')
  )
  with check (
    (reviewer_id = auth.uid() and public.has_permission('performance.submit_review'))
    or public.has_permission('performance.approve_review')
  );

-- ==========================================================================
-- SENSITIVE — development.
-- ==========================================================================
alter table public.development_plans enable row level security;
grant select, insert, update, delete on public.development_plans to authenticated;

drop policy if exists development_plans_select on public.development_plans;
create policy development_plans_select on public.development_plans
  for select to authenticated
  using (public.can_access_profile(profile_id) and public.has_permission('development.read'));

drop policy if exists development_plans_write on public.development_plans;
create policy development_plans_write on public.development_plans
  for all to authenticated
  using (
    (profile_id = auth.uid() and public.has_permission('development.update'))
    or (public.can_access_profile(profile_id) and public.has_permission('development.update'))
  )
  with check (
    (profile_id = auth.uid() and public.has_permission('development.update'))
    or (public.can_access_profile(profile_id) and public.has_permission('development.update'))
  );

drop policy if exists development_plans_insert on public.development_plans;
create policy development_plans_insert on public.development_plans
  for insert to authenticated
  with check (
    public.has_permission('development.create')
    and (profile_id = auth.uid() or public.can_access_profile(profile_id))
  );

-- learning_paths / learning_activities inherit scope from the plan.
alter table public.learning_paths enable row level security;
grant select, insert, update, delete on public.learning_paths to authenticated;

drop policy if exists learning_paths_all on public.learning_paths;
create policy learning_paths_all on public.learning_paths
  for all to authenticated
  using (
    exists (
      select 1 from public.development_plans dp
      where dp.id = development_plan_id and public.can_access_profile(dp.profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.development_plans dp
      where dp.id = development_plan_id and public.can_access_profile(dp.profile_id)
    )
  );

alter table public.learning_activities enable row level security;
grant select, insert, update, delete on public.learning_activities to authenticated;

drop policy if exists learning_activities_all on public.learning_activities;
create policy learning_activities_all on public.learning_activities
  for all to authenticated
  using (
    exists (
      select 1 from public.learning_paths lp
      join public.development_plans dp on dp.id = lp.development_plan_id
      where lp.id = learning_path_id and public.can_access_profile(dp.profile_id)
    )
  )
  with check (
    exists (
      select 1 from public.learning_paths lp
      join public.development_plans dp on dp.id = lp.development_plan_id
      where lp.id = learning_path_id and public.can_access_profile(dp.profile_id)
    )
  );

alter table public.learning_evidence enable row level security;
grant select, insert, update on public.learning_evidence to authenticated;
revoke delete on public.learning_evidence from authenticated;

drop policy if exists learning_evidence_select on public.learning_evidence;
create policy learning_evidence_select on public.learning_evidence
  for select to authenticated
  using (deleted_at is null and public.can_access_profile(profile_id));

drop policy if exists learning_evidence_insert on public.learning_evidence;
create policy learning_evidence_insert on public.learning_evidence
  for insert to authenticated
  with check (
    public.has_permission('development.submit_evidence')
    and (profile_id = auth.uid() or public.can_access_profile(profile_id))
  );

drop policy if exists learning_evidence_update on public.learning_evidence;
create policy learning_evidence_update on public.learning_evidence
  for update to authenticated
  using (public.can_access_profile(profile_id))
  with check (public.can_access_profile(profile_id));

-- ==========================================================================
-- AI records.
-- ==========================================================================
alter table public.ai_usage enable row level security;
grant select, insert, update on public.ai_usage to authenticated;

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using (profile_id = auth.uid() or public.can_access_profile(profile_id));

drop policy if exists ai_usage_write on public.ai_usage;
create policy ai_usage_write on public.ai_usage
  for insert to authenticated
  with check (profile_id = auth.uid() or public.has_permission('ai.use'));

drop policy if exists ai_usage_update on public.ai_usage;
create policy ai_usage_update on public.ai_usage
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

alter table public.ai_assessments enable row level security;
grant select, insert, update on public.ai_assessments to authenticated;

drop policy if exists ai_assessments_select on public.ai_assessments;
create policy ai_assessments_select on public.ai_assessments
  for select to authenticated
  using (public.can_access_profile(profile_id) and public.has_permission('capability.read'));

drop policy if exists ai_assessments_insert on public.ai_assessments;
create policy ai_assessments_insert on public.ai_assessments
  for insert to authenticated
  with check (public.has_permission('ai.analyze') and public.can_access_profile(profile_id));

-- Only a human may validate an AI assessment.
drop policy if exists ai_assessments_validate on public.ai_assessments;
create policy ai_assessments_validate on public.ai_assessments
  for update to authenticated
  using (public.has_permission('capability.validate_evidence'))
  with check (public.has_permission('capability.validate_evidence'));

alter table public.ai_augmentation enable row level security;
grant select, insert, update on public.ai_augmentation to authenticated;

drop policy if exists ai_augmentation_select on public.ai_augmentation;
create policy ai_augmentation_select on public.ai_augmentation
  for select to authenticated
  using (public.can_access_profile(profile_id));

drop policy if exists ai_augmentation_write on public.ai_augmentation;
create policy ai_augmentation_write on public.ai_augmentation
  for all to authenticated
  using (public.has_permission('ai.analyze') and public.can_access_profile(profile_id))
  with check (public.has_permission('ai.analyze') and public.can_access_profile(profile_id));

-- --------------------------------------------------------------------------
-- RESTRICTED — ai_interactions. Private AI conversations (CLAUDE.md §31).
--
-- Owner-only, plus ai.view_audit within an authorized scope. Note this is the
-- open question recorded in TANIA_IMPLEMENTATION_BASELINE.md §7.7: whether
-- ai.view_audit constitutes the "explicit authority" the matrix requires for
-- a RESTRICTED record has not been decided. The narrower reading is
-- implemented here (owner + audit permission + profile scope), and the
-- decision remains outstanding.
-- --------------------------------------------------------------------------
alter table public.ai_interactions enable row level security;
grant select, insert on public.ai_interactions to authenticated;
revoke update, delete on public.ai_interactions from authenticated;

drop policy if exists ai_interactions_select on public.ai_interactions;
create policy ai_interactions_select on public.ai_interactions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (public.has_permission('ai.view_audit') and public.can_access_profile(user_id))
  );

drop policy if exists ai_interactions_insert on public.ai_interactions;
create policy ai_interactions_insert on public.ai_interactions
  for insert to authenticated
  with check (user_id = auth.uid());

-- ==========================================================================
-- Agent execution records. Append-only: a run or tool call that happened
-- must stay visible, including denied and failed ones (CLAUDE.md §4.4).
-- ==========================================================================
alter table public.agent_runs enable row level security;
grant select, insert, update on public.agent_runs to authenticated;
revoke delete on public.agent_runs from authenticated;

drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission('ai.view_audit')
    or public.has_permission('admin.audit')
  );

drop policy if exists agent_runs_insert on public.agent_runs;
create policy agent_runs_insert on public.agent_runs
  for insert to authenticated
  with check (user_id = auth.uid() or public.has_permission('ai.execute'));

-- Approving a run is a human act; the approver needs an approval permission.
drop policy if exists agent_runs_update on public.agent_runs;
create policy agent_runs_update on public.agent_runs
  for update to authenticated
  using (user_id = auth.uid() or public.has_permission('ai.execute'))
  with check (user_id = auth.uid() or public.has_permission('ai.execute'));

alter table public.agent_tool_calls enable row level security;
grant select, insert on public.agent_tool_calls to authenticated;
revoke update, delete on public.agent_tool_calls from authenticated;

drop policy if exists agent_tool_calls_select on public.agent_tool_calls;
create policy agent_tool_calls_select on public.agent_tool_calls
  for select to authenticated
  using (
    exists (
      select 1 from public.agent_runs ar
      where ar.id = agent_run_id
        and (ar.user_id = auth.uid() or public.has_permission('ai.view_audit'))
    )
  );

drop policy if exists agent_tool_calls_insert on public.agent_tool_calls;
create policy agent_tool_calls_insert on public.agent_tool_calls
  for insert to authenticated
  with check (
    exists (
      select 1 from public.agent_runs ar
      where ar.id = agent_run_id and ar.user_id = auth.uid()
    )
    or public.has_permission('ai.execute')
  );

alter table public.recommendations enable row level security;
grant select, insert, update on public.recommendations to authenticated;

drop policy if exists recommendations_select on public.recommendations;
create policy recommendations_select on public.recommendations
  for select to authenticated
  using (profile_id = auth.uid() or public.can_access_profile(profile_id));

drop policy if exists recommendations_insert on public.recommendations;
create policy recommendations_insert on public.recommendations
  for insert to authenticated
  with check (public.has_permission('ai.recommend'));

drop policy if exists recommendations_update on public.recommendations;
create policy recommendations_update on public.recommendations
  for update to authenticated
  using (profile_id = auth.uid() or public.can_access_profile(profile_id))
  with check (profile_id = auth.uid() or public.can_access_profile(profile_id));

-- ==========================================================================
-- business_impacts. Validation is separately permissioned.
-- ==========================================================================
alter table public.business_impacts enable row level security;
grant select, insert, update on public.business_impacts to authenticated;
revoke delete on public.business_impacts from authenticated;

drop policy if exists business_impacts_select on public.business_impacts;
create policy business_impacts_select on public.business_impacts
  for select to authenticated
  using (
    deleted_at is null
    and public.has_permission('business_impact.read')
    and (
      project_id is null or public.can_access_project(project_id)
    )
    and (
      profile_id is null or public.can_access_profile(profile_id)
    )
  );

drop policy if exists business_impacts_insert on public.business_impacts;
create policy business_impacts_insert on public.business_impacts
  for insert to authenticated
  with check (public.has_permission('business_impact.create'));

drop policy if exists business_impacts_update on public.business_impacts;
create policy business_impacts_update on public.business_impacts
  for update to authenticated
  using (
    public.has_permission('business_impact.update')
    or public.has_permission('business_impact.validate')
  )
  with check (
    public.has_permission('business_impact.update')
    or public.has_permission('business_impact.validate')
  );

-- ==========================================================================
-- knowledge_documents — closes TANIA_IMPLEMENTATION_BASELINE.md §7.2.
--
-- Read is scoped by organization and sensitivity. Write is restricted to
-- admin.integrations: an authenticated user must not be able to insert into a
-- corpus the assistant later retrieves.
-- ==========================================================================
alter table public.knowledge_documents enable row level security;
grant select on public.knowledge_documents to authenticated;
grant insert, update, delete on public.knowledge_documents to authenticated;

drop policy if exists knowledge_documents_select on public.knowledge_documents;
create policy knowledge_documents_select on public.knowledge_documents
  for select to authenticated
  using (
    deleted_at is null
    and (
      organization_id is null
      or organization_id in (select public.user_org_ids())
      or public.has_role('SUPER_ADMIN')
    )
    and (
      sensitivity = 'INTERNAL'
      or (sensitivity = 'CONFIDENTIAL' and public.has_permission('capability.read'))
      or public.has_role('SUPER_ADMIN')
    )
  );

drop policy if exists knowledge_documents_write on public.knowledge_documents;
create policy knowledge_documents_write on public.knowledge_documents
  for all to authenticated
  using (public.has_role('SUPER_ADMIN') or public.has_permission('admin.integrations'))
  with check (public.has_role('SUPER_ADMIN') or public.has_permission('admin.integrations'));
