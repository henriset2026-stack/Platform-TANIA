-- 20260921100009_domain_indexes.sql
-- Indexes for Phase 4. Two categories:
--   1. Every foreign key (Postgres does not index FKs automatically, and an
--      unindexed FK makes both joins and cascading deletes slow).
--   2. Every column an RLS policy reads, since policy predicates run per row.

-- talent / work
create index if not exists talent_profiles_profile_id_idx on public.talent_profiles (profile_id);
create index if not exists projects_organization_id_idx on public.projects (organization_id);
create index if not exists projects_created_by_idx on public.projects (created_by);
create index if not exists projects_status_idx on public.projects (status);
create index if not exists assignments_project_id_idx on public.assignments (project_id);
create index if not exists assignments_profile_id_idx on public.assignments (profile_id);
-- can_access_project() probes (project_id, profile_id) together.
create index if not exists assignments_project_profile_idx on public.assignments (project_id, profile_id);
create index if not exists deliverables_project_id_idx on public.deliverables (project_id);
create index if not exists deliverables_owner_id_idx on public.deliverables (owner_id);

-- capability
create index if not exists capabilities_domain_id_idx on public.capabilities (domain_id);
create index if not exists capabilities_active_idx on public.capabilities (active) where active;
create index if not exists capability_requirements_capability_id_idx on public.capability_requirements (capability_id);
create index if not exists capability_requirements_organization_id_idx on public.capability_requirements (organization_id);
create index if not exists capability_requirements_squad_id_idx on public.capability_requirements (squad_id);
create index if not exists capability_requirements_project_id_idx on public.capability_requirements (project_id);
create index if not exists talent_capabilities_profile_id_idx on public.talent_capabilities (profile_id);
create index if not exists talent_capabilities_capability_id_idx on public.talent_capabilities (capability_id);
-- Gap engine reads current level per capability across a population.
create index if not exists talent_capabilities_capability_level_idx
  on public.talent_capabilities (capability_id, current_level);
create index if not exists capability_evidence_talent_capability_id_idx
  on public.capability_evidence (talent_capability_id) where deleted_at is null;
create index if not exists capability_evidence_validation_status_idx
  on public.capability_evidence (validation_status) where deleted_at is null;

-- performance
create index if not exists performance_metrics_profile_period_idx
  on public.performance_metrics (profile_id, period_id);
create index if not exists performance_metrics_period_id_idx on public.performance_metrics (period_id);
create index if not exists performance_evidence_profile_id_idx
  on public.performance_evidence (profile_id) where deleted_at is null;
create index if not exists performance_evidence_period_id_idx
  on public.performance_evidence (period_id) where deleted_at is null;
create index if not exists performance_evidence_validation_idx
  on public.performance_evidence (validation_status) where deleted_at is null;
create index if not exists performance_reviews_profile_id_idx on public.performance_reviews (profile_id);
create index if not exists performance_reviews_reviewer_id_idx on public.performance_reviews (reviewer_id);
create index if not exists performance_reviews_period_id_idx on public.performance_reviews (period_id);

-- development
create index if not exists development_plans_profile_id_idx on public.development_plans (profile_id);
create index if not exists development_plans_capability_id_idx on public.development_plans (capability_id);
create index if not exists development_plans_status_idx on public.development_plans (status);
create index if not exists learning_paths_development_plan_id_idx on public.learning_paths (development_plan_id);
create index if not exists learning_activities_learning_path_id_idx on public.learning_activities (learning_path_id);
create index if not exists learning_evidence_activity_id_idx
  on public.learning_evidence (activity_id) where deleted_at is null;
create index if not exists learning_evidence_profile_id_idx
  on public.learning_evidence (profile_id) where deleted_at is null;

-- ai / agents
create index if not exists ai_usage_profile_id_idx on public.ai_usage (profile_id);
create index if not exists ai_assessments_profile_id_idx on public.ai_assessments (profile_id);
create index if not exists ai_assessments_capability_id_idx on public.ai_assessments (capability_id);
create index if not exists ai_augmentation_profile_period_idx on public.ai_augmentation (profile_id, period_id);
create index if not exists ai_interactions_user_id_created_idx
  on public.ai_interactions (user_id, created_at desc);
create index if not exists ai_interactions_session_id_idx on public.ai_interactions (session_id);
create index if not exists ai_interactions_request_id_idx
  on public.ai_interactions (request_id) where request_id is not null;
create index if not exists agent_runs_user_id_idx on public.agent_runs (user_id);
create index if not exists agent_runs_status_idx on public.agent_runs (status);
-- Finding runs stuck awaiting a human decision.
create index if not exists agent_runs_awaiting_approval_idx
  on public.agent_runs (started_at desc)
  where human_approval_required and not human_approved;
create index if not exists agent_runs_request_id_idx
  on public.agent_runs (request_id) where request_id is not null;
create index if not exists agent_tool_calls_agent_run_id_idx on public.agent_tool_calls (agent_run_id);
create index if not exists recommendations_profile_id_idx on public.recommendations (profile_id);
create index if not exists recommendations_status_idx on public.recommendations (status) where status = 'open';
create index if not exists recommendations_agent_run_id_idx on public.recommendations (agent_run_id);

-- business impact
create index if not exists business_impacts_project_id_idx
  on public.business_impacts (project_id) where deleted_at is null;
create index if not exists business_impacts_profile_id_idx
  on public.business_impacts (profile_id) where deleted_at is null;
create index if not exists business_impacts_capability_id_idx
  on public.business_impacts (capability_id) where deleted_at is null;

-- knowledge
create index if not exists knowledge_documents_organization_id_idx
  on public.knowledge_documents (organization_id) where deleted_at is null;
create index if not exists knowledge_documents_sensitivity_idx
  on public.knowledge_documents (sensitivity) where deleted_at is null;

-- NOTE: no vector index (ivfflat/hnsw) is created here. Both require tuning
-- against real data volume and a chosen embedding model, and ivfflat built on
-- an empty table produces a useless index. Deferred to Phase 14.
