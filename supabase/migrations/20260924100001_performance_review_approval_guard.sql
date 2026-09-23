-- ==========================================================================
-- Performance review approval guard.
--
-- Found by tests/rls/matrix-extended.rls.test.ts on its first live run
-- (2026-09-24): performance_reviews_update admits a reviewer holding only
-- performance.submit_review, and a policy cannot tell which columns changed.
-- So the reviewer could
--
--   1. set status = 'approved' on their own submission without holding
--      performance.approve_review (MANAGER, TALENT), and
--   2. record the approval under someone else's name — approved_by accepted
--      any profile id, so the approval-pairing CHECK was satisfied by a
--      forged approver.
--
-- A trigger is required because only a trigger sees OLD and NEW together.
-- It constrains the decision fields; every other column stays governed by
-- the existing policies, which are unchanged.
--
-- Rules for a caller acting as an end user (`authenticated`):
--   * a review cannot be created already decided;
--   * changing status to or from approved/rejected, or touching approved_by /
--     approved_at, requires performance.approve_review for a subject within
--     the caller's scope (can_access_profile);
--   * approved_by, when set by that change, must be the caller;
--   * nobody decides their own review.
--
-- service_role and postgres bypass RLS by design and are not constrained
-- here; they are maintenance paths, never the application's.
-- ==========================================================================

create or replace function public.guard_performance_review_decision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  decided constant text[] := array['approved', 'rejected'];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = any(decided) or new.approved_by is not null or new.approved_at is not null then
      raise exception 'a performance review cannot be created already decided'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.status is distinct from old.status
        and (new.status = any(decided) or old.status = any(decided)))
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at then

    if not public.has_permission('performance.approve_review') then
      raise exception 'deciding a performance review requires performance.approve_review'
        using errcode = '42501';
    end if;

    if not public.can_access_profile(new.profile_id) then
      raise exception 'the review is outside the approver''s scope'
        using errcode = '42501';
    end if;

    if new.approved_by is not null and new.approved_by is distinct from auth.uid() then
      raise exception 'an approval must be recorded under the approver''s own identity'
        using errcode = '42501';
    end if;

    if new.profile_id = auth.uid() then
      raise exception 'nobody decides their own performance review'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_performance_review_decision is
  'Approval of a performance review requires performance.approve_review, in scope, recorded under the caller''s own identity, never on one''s own review.';

revoke all on function public.guard_performance_review_decision() from public, anon;

drop trigger if exists performance_reviews_guard_decision on public.performance_reviews;
create trigger performance_reviews_guard_decision
  before insert or update on public.performance_reviews
  for each row execute function public.guard_performance_review_decision();
