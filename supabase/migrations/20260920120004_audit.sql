-- 20260920120004_audit.sql
-- Audit infrastructure (TANIA_PRD_v2.0.md §11.31, CLAUDE.md §24).
--
-- Two departures from TANIA_SUPABASE_RLS.sql, both deliberate
-- (TANIA_IMPLEMENTATION_BASELINE.md §7.3):
--
-- 1. The shipped policy allows any authenticated user to INSERT a row whose
--    user_id is their own, which permits forged audit entries. Direct INSERT
--    is revoked here; rows are written only through record_audit_event(),
--    which stamps the actor from auth.uid() and cannot be spoofed.
-- 2. The shipped policy grants SUPER_ADMIN UPDATE and DELETE. An audit trail
--    the administrator can silently rewrite is not an audit trail. No UPDATE
--    or DELETE policy is created, so under deny-by-default the log is
--    append-only for everyone.

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null check (length(trim(action)) > 0),
  resource_type text not null check (length(trim(resource_type)) > 0),
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  user_agent text,
  request_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only audit trail. Written via record_audit_event() only; no UPDATE or DELETE policy exists.';
comment on column public.audit_logs.request_id is
  'Correlation id tying an audit event to an AI interaction, agent run and tool call (CLAUDE.md §24).';
comment on column public.audit_logs.ip_hash is
  'Hashed, never raw IP — data minimization (CLAUDE.md §31).';

-- --------------------------------------------------------------------------
-- record_audit_event
--
-- SECURITY DEFINER so callers may append without holding INSERT on the table.
-- The actor is taken from auth.uid() and is not a parameter, so it cannot be
-- forged by the caller.
-- --------------------------------------------------------------------------
create or replace function public.record_audit_event(
  p_action text,
  p_resource_type text,
  p_resource_id text default null,
  p_before_data jsonb default null,
  p_after_data jsonb default null,
  p_request_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'record_audit_event requires an authenticated session'
      using errcode = '28000';
  end if;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id,
    before_data, after_data, request_id
  )
  values (
    auth.uid(), p_action, p_resource_type, p_resource_id,
    p_before_data, p_after_data, p_request_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_audit_event is
  'Appends an audit event. Actor is derived from auth.uid() and cannot be supplied by the caller.';
