# TANIA AI Tool Registry

**Status 2026-09-24 (AI Gate #2).** Every tool an agent can be given is listed
here. `tests/ai/tool-registry.ai.test.ts` registers every agent's tools and
fails if a registered tool is missing from the table below, or if the table
lists a tool that does not exist. **An undocumented tool cannot ship.**

## Production state

**Nine tools are wired to the assistant** (2026-09-25, "Wired" = Yes): the
capability, performance and development read tools. They are registered in the
gateway's process-wide registry and are the assistant agent's only tools
(`WIRED_TOOLS` in `lib/ai/gateway.ts`). The other five exist, are
contract-checked and tested, and are not reachable from the assistant.
`tests/ai/tool-registry.ai.test.ts` pins the wired set to this table.

Every tool's result is checked against its declared `outputSchema` before it
reaches the model or a person; a result with an undeclared field fails the call.

Tool output reaches the model only in the gateway's second step, fenced as
data in a user-role message, and that step is offered no tools.

## Tools

Type: R = read, A = analysis/calculation, D = draft (returned, never saved).

Scope: every tool reads through the caller's **RLS-scoped** session client,
so the database decides which rows it sees. Tools marked
`canAccessTalent(<class>)` also check the named person first, so an
out-of-scope id is an explicit denial rather than an empty result a model
could narrate as "nothing found". Organization arguments outside the caller's
memberships are refused by the pipeline before any tool runs.

| Tool | Agent | Type | Permission (all required) | Scope | Risk | Approval | Audit | Wired |
|------|-------|------|---------------------------|-------|------|----------|-------|-------|
| `retrieve_capability_requirements` | capability | R | capability.read | RLS | LOW | No | Yes | Yes |
| `retrieve_talent_capabilities` | capability | R | capability.read, talent.read | RLS + `canAccessTalent(CONFIDENTIAL)` | LOW | No | Yes | Yes |
| `analyze_capability_gaps` | capability | A | capability.read, talent.read | RLS | LOW | No | Yes | Yes |
| `retrieve_development_templates` | development | R | development.read | RLS | LOW | No | Yes | Yes |
| `retrieve_development_plans` | development | R | development.read, talent.read | RLS + `canAccessTalent(SENSITIVE)` | LOW | No | Yes | Yes |
| `draft_development_plan` | development | D | development.read, capability.read, talent.read | RLS + `canAccessTalent(SENSITIVE)` | LOW | No — the draft is not saved; committing a plan is `development.approve`, human only | Yes | Yes |
| `retrieve_performance_evidence` | performance | R | performance.read | RLS + `canAccessTalent(SENSITIVE)` | LOW | No | Yes | Yes |
| `calculate_performance_trend` | performance | A | performance.read | RLS + `canAccessTalent(SENSITIVE)` | LOW | No | Yes | Yes |
| `detect_performance_anomalies` | performance | A | performance.read | RLS + `canAccessTalent(SENSITIVE)` | LOW | No | Yes | Yes |
| `retrieve_product_context` | product | R | project.read | RLS | LOW | No | Yes | No |
| `search_product_knowledge` | product | R | ai.use | knowledge ACL (organization + sensitivity) inside the vector scan | LOW | No | Yes | No |
| `retrieve_capability_inventory` | solution | R | capability.read, talent.read | RLS | LOW | No | Yes | No |
| `search_solution_knowledge` | solution | R | ai.use | knowledge ACL inside the vector scan | LOW | No | Yes | No |
| `retrieve_financial_context` | business-case | R | project.read, business_impact.read | RLS | LOW | No | Yes | No |

"Audit: Yes" means every call, whether completed, denied or failed, is written
by the pipeline to the audit sink. As of AI Gate #2 the gateway sets that sink
to `audit_logs` via `record_audit_event`. If the log is unreachable, a
LOW-risk read still runs and is marked `audited: false`; any tool above LOW is
refused instead.

## Rules every future tool must meet

Enforced at registration (`ToolRegistry.register`), so a violating tool fails
to load rather than fails in production:

- lower_snake_case name, not a reserved execution primitive, unique;
- a description of at least 10 characters;
- `inputSchema.additionalProperties === false` — unknown arguments such as
  `role` or `permission` are rejected, not ignored;
- above LOW: at least one required permission;
- HIGH: `requiresConfirmation: true`;
- `allowedForAiService` only at LOW.

Enforced on every call, in this order (`agents/core/pipeline.ts`):

1. The tool is in the closed registry.
2. The agent declared it.
3. The AI-identity restriction applies.
4. The arguments pass the schema.
5. The caller holds **all** required permissions.
6. Organization arguments are within the caller's scope.
7. Human approval is bound to the tool, arguments and user.
8. An audit record is written before any consequential call.
9. Replays are blocked, keyed by the approval.
10. The call runs under a timeout.
11. The outcome is validated and audited.

A write tool proposed for this registry must also state:

- its approval permission
- the decision guard protecting the table it writes (docs/security/SECURITY_MODEL.md §5)
- how the database write itself refuses a replay arriving on another instance
