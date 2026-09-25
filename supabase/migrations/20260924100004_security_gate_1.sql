-- ==========================================================================
-- SECURITY GATE #1 remediation (docs/security/SECURITY_GATE_1_REPORT.md).
--
-- Every change here closes an attack that tests/rls/security-gate.rls.test.ts
-- executed successfully against the live staging database on 2026-09-24:
--
--   SG-01 CRITICAL  HR (admin.users) granted SUPER_ADMIN, EXECUTIVE, and roles
--                   in chapters it has no authority over.
--   SG-02 CRITICAL  A MANAGER moved their own profile into another chapter's
--                   squad; user_squad_ids() trusts profiles.squad_id, so they
--                   immediately read that chapter's people and evidence.
--   SG-03 HIGH      A talent changed their own chapter.
--   SG-04 HIGH      Evidence arrived pre-validated, with a forged created_by;
--                   the creator validated their own evidence later; a talent
--                   certified their own capability; a talent graded their own
--                   learning; business_impact.update validated impact.
--   SG-05 MEDIUM    ai_usage could be recorded in another person's name.
--   SG-06 HIGH      None of role grants, approvals or validations was audited.
--   SG-07 MEDIUM    TRUNCATE (which ignores RLS), REFERENCES and TRIGGER were
--                   still granted to `authenticated` on eight Phase 2 tables.
--
-- Nothing is loosened. RLS stays enabled everywhere; no service-role path is
-- added. Guards constrain callers acting as `authenticated` only —
-- service_role and postgres bypass RLS by design and are audited instead.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- SG-07  No RLS-bypassing privileges for API roles.
-- --------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- --------------------------------------------------------------------------
-- SG-01  Membership grants are bounded by the grantor's own authority.
--
-- A policy on organization_memberships cannot query that table (infinite
-- recursion), so the grantor's admin organizations come from a definer
-- helper. It takes no parameters: the subject is always auth.uid().
-- --------------------------------------------------------------------------
create or replace function public.user_admin_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct om.organization_id
  from public.organization_memberships om
  join public.role_permissions rp on rp.role_id = om.role_id
  join public.permissions p on p.id = rp.permission_id
  where om.user_id = auth.uid()
    and p.code = 'admin.users';
$$;

comment on function public.user_admin_org_ids is
  'Organizations in which the current user holds admin.users. Subject is auth.uid(); never a parameter.';

revoke all on function public.user_admin_org_ids() from public, anon;
grant execute on function public.user_admin_org_ids() to authenticated;

-- Roles only a SUPER_ADMIN may grant or revoke: platform administration,
-- cross-chapter reach (EXECUTIVE), and service identities (AI_SERVICE).
create or replace function public.is_protected_role(target_role uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roles r
    where r.id = target_role and r.code in ('SUPER_ADMIN', 'EXECUTIVE', 'AI_SERVICE')
  );
$$;

comment on function public.is_protected_role is
  'True for roles only a SUPER_ADMIN may grant: SUPER_ADMIN, EXECUTIVE, AI_SERVICE. Reads the catalog only; grants nothing.';

revoke all on function public.is_protected_role(uuid) from public, anon;
grant execute on function public.is_protected_role(uuid) to authenticated;

drop policy if exists memberships_grant_ceiling_insert on public.organization_memberships;
create policy memberships_grant_ceiling_insert on public.organization_memberships
  as restrictive for insert to authenticated
  with check (
    public.has_role('SUPER_ADMIN')
    or (
      organization_id in (select public.user_admin_org_ids())
      and not public.is_protected_role(role_id)
    )
  );

drop policy if exists memberships_grant_ceiling_update on public.organization_memberships;
create policy memberships_grant_ceiling_update on public.organization_memberships
  as restrictive for update to authenticated
  using (
    public.has_role('SUPER_ADMIN')
    or (
      organization_id in (select public.user_admin_org_ids())
      and not public.is_protected_role(role_id)
    )
  )
  with check (
    public.has_role('SUPER_ADMIN')
    or (
      organization_id in (select public.user_admin_org_ids())
      and not public.is_protected_role(role_id)
    )
  );

drop policy if exists memberships_grant_ceiling_delete on public.organization_memberships;
create policy memberships_grant_ceiling_delete on public.organization_memberships
  as restrictive for delete to authenticated
  using (
    public.has_role('SUPER_ADMIN')
    or (
      organization_id in (select public.user_admin_org_ids())
      and not public.is_protected_role(role_id)
    )
  );

-- --------------------------------------------------------------------------
-- SG-02 / SG-03  Scope-defining profile fields.
--
-- chapter_id and squad_id decide who can see a person (can_access_profile)
-- and, through user_squad_ids(), what a MANAGER can see. Nobody changes them
-- on their own profile, and an editor may only place someone inside
-- organizations the editor belongs to.
-- --------------------------------------------------------------------------
create or replace function public.guard_profile_scope_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or public.has_role('SUPER_ADMIN') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.chapter_id is not distinct from old.chapter_id
       and new.squad_id is not distinct from old.squad_id
       and new.manager_id is not distinct from old.manager_id
       and new.status is not distinct from old.status then
      return new;
    end if;

    if new.id = auth.uid() then
      raise exception 'chapter, squad, manager and status are not self-editable'
        using errcode = '42501';
    end if;
  end if;

  if new.chapter_id is not null
     and new.chapter_id not in (select public.user_org_ids()) then
    raise exception 'a profile may only be placed in the editor''s own organizations'
      using errcode = '42501';
  end if;

  if new.squad_id is not null and not exists (
    select 1 from public.squads s
    where s.id = new.squad_id and s.organization_id in (select public.user_org_ids())
  ) then
    raise exception 'a profile may only be placed in a squad of the editor''s own organizations'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_scope_fields() from public, anon;

drop trigger if exists profiles_guard_scope_fields on public.profiles;
create trigger profiles_guard_scope_fields
  before insert or update on public.profiles
  for each row execute function public.guard_profile_scope_fields();

-- --------------------------------------------------------------------------
-- SG-04  Validation of evidence and impact.
--
-- One guard for every table whose rows carry validation_status /
-- validated_by / validated_at. tg_argv[0] is the permission that validates.
--
--   * a row cannot be created already decided; created_by is the caller;
--   * deciding (validated / rejected, or touching validated_*) needs that
--     permission, the subject in scope, validated_by = the caller, and the
--     caller is neither the subject nor the row's creator;
--   * a decided row is frozen for anyone without the permission, except
--     that it may be withdrawn (evidence is withdrawn, never erased);
--   * created_by never changes.
-- --------------------------------------------------------------------------
create or replace function public.guard_validation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_permission constant text := tg_argv[0];
  v_decided constant text[] := array['validated', 'rejected'];
  v_frozen_exempt constant text[] :=
    array['validation_status', 'validated_by', 'validated_at', 'updated_at', 'deleted_at', 'deleted_by'];
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_subject uuid;
  v_in_scope boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_new->>'validation_status' = any(v_decided)
       or v_new->>'validated_by' is not null
       or v_new->>'validated_at' is not null then
      raise exception 'a record cannot be created already validated'
        using errcode = '42501';
    end if;
    if v_new ? 'created_by' then
      if new.created_by is not null and new.created_by <> auth.uid() then
        raise exception 'created_by must be the caller'
          using errcode = '42501';
      end if;
      new.created_by := auth.uid();
    end if;
    return new;
  end if;

  v_old := to_jsonb(old);

  if (v_new->'created_by') is distinct from (v_old->'created_by') then
    raise exception 'created_by cannot change'
      using errcode = '42501';
  end if;

  -- The person the record is about.
  v_subject := coalesce(
    (v_new->>'profile_id')::uuid,
    (select tc.profile_id from public.talent_capabilities tc
      where tc.id = (v_new->>'talent_capability_id')::uuid)
  );

  if v_old->>'validation_status' = any(v_decided)
     and not public.has_permission(v_permission) then
    if not (v_new->>'validation_status' = 'withdrawn'
            and (v_new - v_frozen_exempt) = (v_old - v_frozen_exempt)) then
      raise exception 'a decided record can only be withdrawn by someone without %', v_permission
        using errcode = '42501';
    end if;
    return new;
  end if;

  if ((v_new->>'validation_status') is distinct from (v_old->>'validation_status')
        and v_new->>'validation_status' = any(v_decided))
     or (v_new->'validated_by') is distinct from (v_old->'validated_by')
     or (v_new->'validated_at') is distinct from (v_old->'validated_at') then

    if not public.has_permission(v_permission) then
      raise exception 'validating requires %', v_permission
        using errcode = '42501';
    end if;

    v_in_scope := case
      when v_subject is not null then public.can_access_profile(v_subject)
      when v_new ? 'project_id' and v_new->>'project_id' is not null
        then public.can_access_project((v_new->>'project_id')::uuid)
      else public.has_role('SUPER_ADMIN')
    end;
    if not v_in_scope then
      raise exception 'the record is outside the validator''s scope'
        using errcode = '42501';
    end if;

    if new.validated_by is not null and new.validated_by <> auth.uid() then
      raise exception 'a validation must be recorded under the validator''s own identity'
        using errcode = '42501';
    end if;

    if v_subject = auth.uid() or (v_old->>'created_by')::uuid = auth.uid() then
      raise exception 'nobody validates a record about themselves or of their own making'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_validation is
  'Validation requires the table''s validate permission (tg_argv[0]), in scope, as oneself, never for one''s own record or submission; decided rows are frozen except for withdrawal.';

revoke all on function public.guard_validation() from public, anon;

drop trigger if exists performance_evidence_guard_validation on public.performance_evidence;
create trigger performance_evidence_guard_validation
  before insert or update on public.performance_evidence
  for each row execute function public.guard_validation('performance.update_evidence');

drop trigger if exists capability_evidence_guard_validation on public.capability_evidence;
create trigger capability_evidence_guard_validation
  before insert or update on public.capability_evidence
  for each row execute function public.guard_validation('capability.validate_evidence');

drop trigger if exists business_impacts_guard_validation on public.business_impacts;
create trigger business_impacts_guard_validation
  before insert or update on public.business_impacts
  for each row execute function public.guard_validation('business_impact.validate');

drop trigger if exists ai_assessments_guard_validation on public.ai_assessments;
create trigger ai_assessments_guard_validation
  before insert or update on public.ai_assessments
  for each row execute function public.guard_validation('capability.validate_evidence');

-- ai_assessments_validate had no scope clause.
drop policy if exists ai_assessments_validate on public.ai_assessments;
create policy ai_assessments_validate on public.ai_assessments
  for update to authenticated
  using (public.has_permission('capability.validate_evidence') and public.can_access_profile(profile_id))
  with check (public.has_permission('capability.validate_evidence') and public.can_access_profile(profile_id));

-- --------------------------------------------------------------------------
-- SG-04  Capability assessment. "Certification is not capability": the
-- subject may self-assess, never certify. A self-edit of the level demotes
-- the row to self_assessed, so a validated label cannot outlive the level it
-- validated.
-- --------------------------------------------------------------------------
create or replace function public.guard_capability_assessment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessed constant text[] := array['manager_assessed', 'evidence_validated'];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.profile_id = auth.uid() then
    if new.assessment_status = any(v_assessed)
       and (tg_op = 'INSERT' or new.assessment_status is distinct from old.assessment_status) then
      raise exception 'nobody assesses their own capability'
        using errcode = '42501';
    end if;
    if new.assessed_by is not null and new.assessed_by <> auth.uid()
       and (tg_op = 'INSERT' or new.assessed_by is distinct from old.assessed_by) then
      raise exception 'assessed_by must be the caller'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.current_level is distinct from old.current_level then
      new.assessment_status := 'self_assessed';
      new.assessed_by := auth.uid();
      new.assessed_at := now();
    end if;
    return new;
  end if;

  if new.assessment_status = any(v_assessed)
     and (tg_op = 'INSERT'
          or new.assessment_status is distinct from old.assessment_status
          or new.current_level is distinct from old.current_level
          or new.assessed_by is distinct from old.assessed_by) then
    if not public.has_permission('capability.assess') then
      raise exception 'assessing a capability requires capability.assess'
        using errcode = '42501';
    end if;
    if new.assessed_by is distinct from auth.uid() then
      raise exception 'an assessment must be recorded under the assessor''s own identity'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_capability_assessment() from public, anon;

drop trigger if exists talent_capabilities_guard_assessment on public.talent_capabilities;
create trigger talent_capabilities_guard_assessment
  before insert or update on public.talent_capabilities
  for each row execute function public.guard_capability_assessment();

-- --------------------------------------------------------------------------
-- SG-04  Learning evidence evaluation (score / evaluator_id / evaluated_at).
-- Evaluating learning is an assessment of capability, so capability.assess.
-- --------------------------------------------------------------------------
create or replace function public.guard_learning_evaluation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.score is not null or new.evaluator_id is not null or new.evaluated_at is not null then
      raise exception 'learning evidence cannot be submitted already evaluated'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.score is distinct from old.score
     or new.evaluator_id is distinct from old.evaluator_id
     or new.evaluated_at is distinct from old.evaluated_at then
    if not public.has_permission('capability.assess') then
      raise exception 'evaluating learning evidence requires capability.assess'
        using errcode = '42501';
    end if;
    if new.profile_id = auth.uid() then
      raise exception 'nobody evaluates their own learning evidence'
        using errcode = '42501';
    end if;
    if new.evaluator_id is not null and new.evaluator_id <> auth.uid() then
      raise exception 'an evaluation must be recorded under the evaluator''s own identity'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_learning_evaluation() from public, anon;

drop trigger if exists learning_evidence_guard_evaluation on public.learning_evidence;
create trigger learning_evidence_guard_evaluation
  before insert or update on public.learning_evidence
  for each row execute function public.guard_learning_evaluation();

-- --------------------------------------------------------------------------
-- SG-05  AI usage is recorded by the person who used AI, for themselves.
-- It feeds the AI-augmentation performance dimension.
-- --------------------------------------------------------------------------
drop policy if exists ai_usage_write on public.ai_usage;
create policy ai_usage_write on public.ai_usage
  for insert to authenticated
  with check (profile_id = auth.uid());

-- --------------------------------------------------------------------------
-- Agent runs: a human approval is recorded under the approver's own name.
-- --------------------------------------------------------------------------
create or replace function public.guard_agent_run_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.human_approved or new.approved_by is not null))
     or (tg_op = 'UPDATE'
         and (new.human_approved is distinct from old.human_approved
              or new.approved_by is distinct from old.approved_by)) then
    if new.human_approved and new.approved_by is distinct from auth.uid() then
      raise exception 'a human approval must be recorded under the approver''s own identity'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_agent_run_approval() from public, anon;

drop trigger if exists agent_runs_guard_approval on public.agent_runs;
create trigger agent_runs_guard_approval
  before insert or update on public.agent_runs
  for each row execute function public.guard_agent_run_approval();

-- --------------------------------------------------------------------------
-- SG-06  Audit trail for security-relevant changes.
--
-- tg_argv[0] = 'all'     log INSERT, UPDATE and DELETE
--              'changes' log UPDATE only, and only when a tracked column moved
-- tg_argv[1..] = the tracked columns.
--
-- Only tracked columns are written, never the whole row: a performance
-- review's narrative or a profile's personal fields stay out of the log.
-- after_data.via is the request role (PostgREST's SET ROLE), so a
-- service-role change is visible as one — user_id is then null — rather than
-- silently unattributed. current_user cannot be used: this function runs as
-- its owner.
-- --------------------------------------------------------------------------
create or replace function public.audit_security_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode constant text := tg_argv[0];
  v_columns text[] := tg_argv[1:];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_changed boolean := false;
  c text;
begin
  if v_mode = 'changes' and tg_op <> 'UPDATE' then
    return coalesce(new, old);
  end if;

  foreach c in array v_columns loop
    if v_old is not null then v_before := v_before || jsonb_build_object(c, v_old->c); end if;
    if v_new is not null then v_after := v_after || jsonb_build_object(c, v_new->c); end if;
    if tg_op = 'UPDATE' and (v_old->c) is distinct from (v_new->c) then v_changed := true; end if;
  end loop;

  if tg_op = 'UPDATE' and not v_changed then
    return new;
  end if;

  insert into public.audit_logs (user_id, action, resource_type, resource_id, before_data, after_data)
  values (
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_new->>'id', v_old->>'id'),
    case when v_old is null then null else v_before end,
    case when v_new is null then jsonb_build_object('via', coalesce(current_setting('role', true), 'none'))
         else v_after || jsonb_build_object('via', coalesce(current_setting('role', true), 'none')) end
  );

  return coalesce(new, old);
end;
$$;

comment on function public.audit_security_change is
  'Appends an audit_logs row for security-relevant changes: tracked columns only, actor from auth.uid(), request role in after_data.via.';

revoke all on function public.audit_security_change() from public, anon;

drop trigger if exists organization_memberships_audit on public.organization_memberships;
create trigger organization_memberships_audit
  after insert or update or delete on public.organization_memberships
  for each row execute function public.audit_security_change('all', 'user_id', 'organization_id', 'role_id');

drop trigger if exists role_permissions_audit on public.role_permissions;
create trigger role_permissions_audit
  after insert or update or delete on public.role_permissions
  for each row execute function public.audit_security_change('all', 'role_id', 'permission_id');

drop trigger if exists roles_audit on public.roles;
create trigger roles_audit
  after insert or update or delete on public.roles
  for each row execute function public.audit_security_change('all', 'code');

drop trigger if exists permissions_audit on public.permissions;
create trigger permissions_audit
  after insert or update or delete on public.permissions
  for each row execute function public.audit_security_change('all', 'code');

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.audit_security_change('changes', 'chapter_id', 'squad_id', 'manager_id', 'status');

drop trigger if exists performance_reviews_audit on public.performance_reviews;
create trigger performance_reviews_audit
  after update on public.performance_reviews
  for each row execute function public.audit_security_change('changes', 'status', 'approved_by', 'approved_at');

drop trigger if exists development_plans_audit on public.development_plans;
create trigger development_plans_audit
  after update on public.development_plans
  for each row execute function public.audit_security_change('changes', 'status', 'approved_by', 'approved_at');

drop trigger if exists assignments_audit on public.assignments;
create trigger assignments_audit
  after update on public.assignments
  for each row execute function public.audit_security_change('changes', 'status', 'approved_by', 'approved_at');

drop trigger if exists business_impacts_audit on public.business_impacts;
create trigger business_impacts_audit
  after update on public.business_impacts
  for each row execute function public.audit_security_change('changes', 'validation_status', 'validated_by', 'validated_at');

drop trigger if exists performance_evidence_audit on public.performance_evidence;
create trigger performance_evidence_audit
  after update on public.performance_evidence
  for each row execute function public.audit_security_change('changes', 'validation_status', 'validated_by', 'validated_at');

drop trigger if exists capability_evidence_audit on public.capability_evidence;
create trigger capability_evidence_audit
  after update on public.capability_evidence
  for each row execute function public.audit_security_change('changes', 'validation_status', 'validated_by', 'validated_at');

drop trigger if exists talent_capabilities_audit on public.talent_capabilities;
create trigger talent_capabilities_audit
  after update on public.talent_capabilities
  for each row execute function public.audit_security_change('changes', 'assessment_status', 'current_level', 'assessed_by');

drop trigger if exists learning_evidence_audit on public.learning_evidence;
create trigger learning_evidence_audit
  after update on public.learning_evidence
  for each row execute function public.audit_security_change('changes', 'score', 'evaluator_id', 'evaluated_at');

drop trigger if exists agent_runs_audit on public.agent_runs;
create trigger agent_runs_audit
  after update on public.agent_runs
  for each row execute function public.audit_security_change('changes', 'human_approved', 'approved_by');
