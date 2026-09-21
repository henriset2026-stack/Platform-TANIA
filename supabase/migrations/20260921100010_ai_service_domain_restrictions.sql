-- 20260921100010_ai_service_domain_restrictions.sql
-- Extends the Phase 3 AI write ban to every Phase 4 table.
--
-- Without this, each new table would silently reopen the hole Phase 3 closed:
-- an AI identity granted a write permission through misconfiguration could
-- mutate domain data. RESTRICTIVE policies only subtract, so this cannot
-- widen access.
--
-- DELIBERATE EXCEPTIONS — tables an agent must be able to append to in order
-- to work at all, and which are themselves the record of what it did:
--   agent_runs, agent_tool_calls, recommendations, ai_assessments,
--   ai_augmentation, ai_interactions
-- These are proposals and execution records, never domain facts. An agent
-- writing a recommendation is not the agent acting; a human still decides
-- (AGENTS.md §9). Updates and deletes stay banned even there, so an agent
-- cannot revise or erase its own history.

do $$
declare
  t text;
  write_banned text[] := array[
    'talent_profiles','projects','assignments','deliverables',
    'capability_domains','capabilities','capability_levels',
    'capability_requirements','talent_capabilities','capability_evidence',
    'performance_periods','performance_metrics','performance_evidence','performance_reviews',
    'development_plans','learning_paths','learning_activities','learning_evidence',
    'business_impacts','knowledge_documents','ai_usage'
  ];
  append_only text[] := array[
    'agent_runs','agent_tool_calls','recommendations',
    'ai_assessments','ai_augmentation','ai_interactions'
  ];
begin
  -- Full write ban: insert, update and delete.
  foreach t in array write_banned loop
    execute format('drop policy if exists %I on public.%I', 'ai_no_insert_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (not public.is_ai_service())', 'ai_no_insert_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'ai_no_update_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (not public.is_ai_service()) with check (not public.is_ai_service())',
      'ai_no_update_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'ai_no_delete_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
         using (not public.is_ai_service())', 'ai_no_delete_' || t, t);
  end loop;

  -- Append-only: an agent may insert its own record, never revise it.
  foreach t in array append_only loop
    execute format('drop policy if exists %I on public.%I', 'ai_no_update_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (not public.is_ai_service()) with check (not public.is_ai_service())',
      'ai_no_update_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'ai_no_delete_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
         using (not public.is_ai_service())', 'ai_no_delete_' || t, t);
  end loop;
end;
$$;

-- An AI identity may never record an approval, on any table that has one.
-- This is the database-level counterpart to HUMAN_APPROVAL_REQUIRED in
-- lib/auth/policy.ts (TANIA_PRD_v2.0.md §58).
drop policy if exists ai_no_approval_performance_reviews on public.performance_reviews;
create policy ai_no_approval_performance_reviews on public.performance_reviews
  as restrictive for update to authenticated
  with check (not public.is_ai_service() or approved_by is null);

drop policy if exists ai_no_approval_agent_runs on public.agent_runs;
create policy ai_no_approval_agent_runs on public.agent_runs
  as restrictive for update to authenticated
  with check (not public.is_ai_service() or not human_approved);
