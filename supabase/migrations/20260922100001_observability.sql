-- 20260922100001_observability.sql
-- Phase 20: observability and audit.
--
-- The agent tables were created in 20260921100005 with the columns the PRD
-- §57 AgentRun type named. Running six agents against them showed what an
-- audit trail actually needs and they do not carry: the session, a text
-- correlation id, latency, the authorization DECISION (as opposed to the
-- outcome), the risk level the decision was made against, and the evidence a
-- run produced.
--
-- A new migration rather than an edit to a historical one (CLAUDE.md §13).

-- --------------------------------------------------------------------------
-- agent_runs
-- --------------------------------------------------------------------------
alter table public.agent_runs
  add column if not exists session_id text,
  add column if not exists correlation_id text,
  add column if not exists latency_ms integer,
  add column if not exists evidence_refs jsonb not null default '[]'::jsonb;

alter table public.agent_runs
  drop constraint if exists agent_runs_latency_nonnegative;
alter table public.agent_runs
  add constraint agent_runs_latency_nonnegative
  check (latency_ms is null or latency_ms >= 0);

-- A finished run must say how long it took. Latency that is optional on a
-- completed run is latency nobody records, and "the assistant feels slow"
-- then has no data behind it.
alter table public.agent_runs
  drop constraint if exists agent_runs_completed_has_latency;
alter table public.agent_runs
  add constraint agent_runs_completed_has_latency
  check (status not in ('completed', 'failed') or latency_ms is not null);

comment on column public.agent_runs.correlation_id is
  'Text correlation id tying run, tool calls, audit events and RAG retrievals together. Separate from request_id, which is uuid-typed and cannot hold every correlation format.';

-- --------------------------------------------------------------------------
-- agent_tool_calls
--
-- agent_run_id becomes NULLABLE, deliberately.
--
-- The most security-relevant call is the one refused before a run was ever
-- established: an unknown tool name, an AI identity reaching for something it
-- may not have, a call denied on permissions. Under a NOT NULL foreign key
-- those rows cannot be written at all, so the audit trail silently omits
-- exactly the events it exists to capture.
--
-- user_id is added for the same reason. With no run to join to, it is the
-- only anchor RLS can use to decide who may read the row, so the policies
-- below are rewritten to fall back to it.
-- --------------------------------------------------------------------------
alter table public.agent_tool_calls
  alter column agent_run_id drop not null;

alter table public.agent_tool_calls
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists agent_name text,
  add column if not exists correlation_id text,
  add column if not exists session_id text,
  add column if not exists risk_level text,
  add column if not exists authorization_decision text,
  add column if not exists denial_reason text,
  add column if not exists evidence_refs jsonb not null default '[]'::jsonb,
  add column if not exists audited boolean not null default true;

alter table public.agent_tool_calls
  drop constraint if exists agent_tool_calls_risk_level;
alter table public.agent_tool_calls
  add constraint agent_tool_calls_risk_level
  check (risk_level is null or risk_level in ('LOW', 'MEDIUM', 'HIGH'));

alter table public.agent_tool_calls
  drop constraint if exists agent_tool_calls_authorization_decision;
alter table public.agent_tool_calls
  add constraint agent_tool_calls_authorization_decision
  check (
    authorization_decision is null
    or authorization_decision in (
      'allowed',
      'denied_unknown_tool',
      'denied_out_of_scope',
      'denied_ai_identity',
      'denied_schema',
      'denied_permission',
      'denied_unauditable',
      'awaiting_confirmation'
    )
  );

-- A denial must say why. A refused call with no reason is a row that records
-- that something was stopped without recording what, which is not an audit
-- trail but a count.
alter table public.agent_tool_calls
  drop constraint if exists agent_tool_calls_denial_has_reason;
alter table public.agent_tool_calls
  add constraint agent_tool_calls_denial_has_reason
  check (status <> 'denied' or denial_reason is not null);

-- Every row must be attributable to someone, through its run or directly.
alter table public.agent_tool_calls
  drop constraint if exists agent_tool_calls_attributable;
alter table public.agent_tool_calls
  add constraint agent_tool_calls_attributable
  check (agent_run_id is not null or user_id is not null);

comment on column public.agent_tool_calls.audited is
  'False when the call completed but its audit write failed. A LOW-risk read may proceed unaudited; a consequential tool is refused instead (agents/core/audit.ts).';
comment on column public.agent_tool_calls.authorization_decision is
  'The decision, not the outcome. status says what happened; this says which gate made it happen.';

-- --------------------------------------------------------------------------
-- rag_retrievals
--
-- NO QUERY TEXT IS STORED.
--
-- A retrieval query on this platform routinely contains a person's name and
-- the concern being raised about them ("why is Budi's delivery score
-- falling"). Storing it would put sensitive employee data into a telemetry
-- table read by anyone holding ai.view_audit, for the sake of debugging.
-- The hash supports "this same query was run 40 times"; the length supports
-- "queries got longer after the release"; neither reconstructs the sentence.
-- --------------------------------------------------------------------------
create table if not exists public.rag_retrievals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  correlation_id text,
  session_id text,
  query_hash text not null check (length(trim(query_hash)) > 0),
  query_length integer not null check (query_length >= 0),
  requested_match_count integer not null check (requested_match_count >= 0),
  returned_chunk_count integer not null check (returned_chunk_count >= 0),
  min_similarity numeric(6,4),
  top_similarity numeric(6,4),
  document_ids jsonb not null default '[]'::jsonb,
  -- Prompt-injection attempts seen in retrieved documents. Counted here so
  -- they are observable rather than only handled.
  injection_signal_count integer not null default 0 check (injection_signal_count >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

comment on table public.rag_retrievals is
  'RAG retrieval telemetry. Deliberately stores a query hash and length, never the query text: a retrieval query routinely contains employee names and the concern raised about them.';

-- --------------------------------------------------------------------------
-- RLS
--
-- Written out per table rather than generated in a DO loop: the guard tests
-- read migration text, so loop-generated DDL is invisible to them
-- (CLAUDE.md §2e).
-- --------------------------------------------------------------------------
alter table public.rag_retrievals enable row level security;
grant select, insert on public.rag_retrievals to authenticated;
revoke update, delete on public.rag_retrievals from authenticated;

drop policy if exists rag_retrievals_select on public.rag_retrievals;
create policy rag_retrievals_select on public.rag_retrievals
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission('ai.view_audit')
    or public.has_permission('admin.audit')
  );

drop policy if exists rag_retrievals_insert on public.rag_retrievals;
create policy rag_retrievals_insert on public.rag_retrievals
  for insert to authenticated
  with check (user_id = auth.uid());

-- Rewritten to survive a null agent_run_id. Without this the orphan denial
-- rows the schema change allows would be readable by nobody, which is the
-- same as not recording them.
drop policy if exists agent_tool_calls_select on public.agent_tool_calls;
create policy agent_tool_calls_select on public.agent_tool_calls
  for select to authenticated
  using (
    public.has_permission('admin.audit')
    or public.has_permission('ai.view_audit')
    or user_id = auth.uid()
    or exists (
      select 1 from public.agent_runs ar
      where ar.id = agent_run_id and ar.user_id = auth.uid()
    )
  );

drop policy if exists agent_tool_calls_insert on public.agent_tool_calls;
create policy agent_tool_calls_insert on public.agent_tool_calls
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.agent_runs ar
      where ar.id = agent_run_id and ar.user_id = auth.uid()
    )
    or public.has_permission('ai.execute')
  );

-- --------------------------------------------------------------------------
-- Indexes
--
-- Every column an RLS policy reads, every foreign key, and the orderings the
-- audit viewer uses. An audit table without a created_at index is one that
-- becomes unusable exactly when it matters.
-- --------------------------------------------------------------------------
create index if not exists idx_agent_runs_correlation on public.agent_runs (correlation_id);
create index if not exists idx_agent_runs_session on public.agent_runs (session_id);
create index if not exists idx_agent_runs_started_desc on public.agent_runs (started_at desc);
create index if not exists idx_agent_runs_status on public.agent_runs (status);

create index if not exists idx_agent_tool_calls_user on public.agent_tool_calls (user_id);
create index if not exists idx_agent_tool_calls_correlation on public.agent_tool_calls (correlation_id);
create index if not exists idx_agent_tool_calls_created_desc on public.agent_tool_calls (created_at desc);
create index if not exists idx_agent_tool_calls_status on public.agent_tool_calls (status);
create index if not exists idx_agent_tool_calls_tool on public.agent_tool_calls (tool_name);

create index if not exists idx_rag_retrievals_user on public.rag_retrievals (user_id);
create index if not exists idx_rag_retrievals_correlation on public.rag_retrievals (correlation_id);
create index if not exists idx_rag_retrievals_created_desc on public.rag_retrievals (created_at desc);

create index if not exists idx_audit_logs_created_desc on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_user on public.audit_logs (user_id);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_request on public.audit_logs (request_id);
