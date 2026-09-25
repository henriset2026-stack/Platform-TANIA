-- ==========================================================================
-- agent_tool_calls.authorization_decision: add 'denied_argument_scope'.
--
-- AI Gate #2 added a pipeline gate that refuses a tool call whose arguments
-- address an organization outside the caller's memberships
-- (agents/core/pipeline.ts, outOfScopeArgument). The recorder must be able to
-- store that decision as what it is; without this value it would be recorded
-- as a permission denial, which is a different incident.
--
-- Widens an enumeration only; every existing row remains valid.
-- ==========================================================================

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
      'denied_argument_scope',
      'denied_unauditable',
      'awaiting_confirmation'
    )
  );
