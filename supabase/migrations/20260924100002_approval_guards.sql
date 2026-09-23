-- ==========================================================================
-- Approval guards for development plans and assignments.
--
-- The same defect 20260924100001 closed on performance_reviews, found on the
-- remaining approvable tables by tests/rls/matrix-extended.rls.test.ts
-- (2026-09-24). Each write policy checks the permission to EDIT the row, and
-- a policy cannot see which columns changed, so:
--
--   development_plans — a TALENT (development.update on their own plan)
--     approved their own plan, and a MANAGER recorded an approval under the
--     chapter lead's name;
--   assignments — a PROJECT_MANAGER (assignment.update, no assignment.approve)
--     approved an assignment.
--
-- Approval is a human-approval boundary (CLAUDE.md §7). Rules, for callers
-- acting as `authenticated`:
--   * a row cannot be created already approved;
--   * recording an approval (moving a plan INTO 'approved', or changing
--     approved_by / approved_at) requires the table's approve permission for
--     a subject in the caller's scope;
--   * approved_by, when set, must be the caller;
--   * nobody approves their own plan or assignment.
--
-- Deliberately NOT guarded: a development plan moving on from 'approved' to
-- in_progress / completed / cancelled. That is the plan being carried out,
-- and blocking it would break the Gap → Plan → … → Evidence loop.
-- ==========================================================================

create or replace function public.guard_development_plan_approval()
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
    if new.status = 'approved' or new.approved_by is not null or new.approved_at is not null then
      raise exception 'a development plan cannot be created already approved'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.status = 'approved' and old.status is distinct from 'approved')
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then

    if not public.has_permission('development.approve') then
      raise exception 'approving a development plan requires development.approve'
        using errcode = '42501';
    end if;

    if not public.can_access_profile(new.profile_id) then
      raise exception 'the development plan is outside the approver''s scope'
        using errcode = '42501';
    end if;

    if new.approved_by is not null and new.approved_by is distinct from auth.uid() then
      raise exception 'an approval must be recorded under the approver''s own identity'
        using errcode = '42501';
    end if;

    if new.profile_id = auth.uid() then
      raise exception 'nobody approves their own development plan'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_development_plan_approval is
  'Approving a development plan requires development.approve, in scope, under the caller''s own identity, never for one''s own plan.';

revoke all on function public.guard_development_plan_approval() from public, anon;

drop trigger if exists development_plans_guard_approval on public.development_plans;
create trigger development_plans_guard_approval
  before insert or update on public.development_plans
  for each row execute function public.guard_development_plan_approval();

create or replace function public.guard_assignment_approval()
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
    if new.approved_by is not null or new.approved_at is not null then
      raise exception 'an assignment cannot be created already approved'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then

    if not public.has_permission('assignment.approve') then
      raise exception 'approving an assignment requires assignment.approve'
        using errcode = '42501';
    end if;

    if not public.can_access_project(new.project_id) then
      raise exception 'the assignment is outside the approver''s scope'
        using errcode = '42501';
    end if;

    if new.approved_by is not null and new.approved_by is distinct from auth.uid() then
      raise exception 'an approval must be recorded under the approver''s own identity'
        using errcode = '42501';
    end if;

    if new.profile_id = auth.uid() then
      raise exception 'nobody approves their own assignment'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_assignment_approval is
  'Approving an assignment requires assignment.approve, in project scope, under the caller''s own identity, never for one''s own assignment.';

revoke all on function public.guard_assignment_approval() from public, anon;

drop trigger if exists assignments_guard_approval on public.assignments;
create trigger assignments_guard_approval
  before insert or update on public.assignments
  for each row execute function public.guard_assignment_approval();
