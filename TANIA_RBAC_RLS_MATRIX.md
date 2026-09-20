# TANIA_RBAC_RLS_MATRIX.md

## 1. Security Model

TANIA uses **RBAC + organizational/resource scope + PostgreSQL RLS**.

```text
Entra ID → Supabase Auth → Identity → Role → Permission → Scope → RLS → ALLOW/DENY
```

The browser UI is never the security boundary.

## 2. Roles

| Role | Primary scope |
|---|---|
| SUPER_ADMIN | Platform/technical administration |
| EXECUTIVE | Aggregated chapter/enterprise intelligence |
| CHAPTER_LEAD | Chapter |
| MANAGER | Squad/team |
| PROJECT_MANAGER | Assigned projects |
| TALENT | Own records + assigned work |
| HR | Authorized people-governance scope |
| AI_SERVICE | Explicitly delegated service scope |

## 3. Permission Catalog

```text
talent.read/create/update/delete/export
performance.read/create_evidence/update_evidence/submit_review/approve_review/export
capability.read/create/update/assess/validate_evidence
development.read/create/update/approve/submit_evidence
assignment.read/recommend/create/update/approve
project.read/create/update/delete/manage_team
business_impact.read/create/update/validate
ai.use/analyze/recommend/execute/view_audit
report.read/export
admin.users/roles/capabilities/organizations/integrations/audit
```

## 4. Role × Permission Baseline

| Domain | SUPER_ADMIN | EXECUTIVE | CHAPTER_LEAD | MANAGER | PM | TALENT | HR | AI_SERVICE |
|---|---|---|---|---|---|---|---|---|
| Talent | Full | R | R/U | R/U | R | R/U own | R/C/U | Scoped R |
| Performance | Full | R | R/C/U/A | R/C/U | R | R own/C evidence | R/C/U/A | Scoped analyze |
| Capability | Full | R | R/C/U/A | R/C/U | R | R own/evidence | R/C/U/A | Scoped analyze |
| Development | Full | R | R/C/U/A | R/C/U/A | R | R/C/U own | R/C/U/A | Scoped draft |
| Assignment | Full | R | R/C/U/A | R/C/U | R/C/U | R own | R | Scoped recommend |
| Project | Full | R | R/C/U | R/C/U | R/C/U | R assigned | R | Scoped R |
| Business Impact | Full | R | R/C/U/A | R/C/U | R/C/U | R assigned | R | Scoped analyze |
| AI | Full | Use | Use/X | Use/X | Use | Use | Use | X |
| Reports | Full | R/E | R/E | R/E | R/E | R own | R/E | — |
| Administration | Full | — | Capability config | — | — | — | People scope | — |
| Audit | Full | Aggregate | Chapter | Squad | Project | Own AI | People scope | Own runs |

Legend: R=read, C=create, U=update, D=delete, A=approve/validate, E=export, X=execute.

## 5. Scope Rules

### TALENT

Own profile, capability, evidence, performance, development, AI interactions and assigned projects. No access to other talent's private performance/development/AI conversations.

### MANAGER

Own + managed squad. A MANAGER role alone never grants access to every squad.

### CHAPTER_LEAD

Authorized chapter talent, performance, capability, development, projects, assignments and business impact. Individual sensitive records remain policy-controlled.

### EXECUTIVE

Default is aggregated intelligence. Individual sensitive records require explicit authorization.

### PROJECT_MANAGER

Assigned/managed projects, project team, deliverables, staffing, requirements and project business impact.

### HR

People-governance scope only; HR access does not imply unrestricted project/technical access.

### AI_SERVICE

Never equivalent to unrestricted database access. AI runs under the requesting user's authorization context.

## 6. Data Sensitivity

| Class | Examples | Default |
|---|---|---|
| Internal | Capability definitions, generic learning | Broad authenticated read |
| Confidential | Talent profile, assignment | Scope-based |
| Sensitive | Performance evidence, development | Strict scope |
| Restricted | Private HR data, private AI conversations | Owner + explicit authority |

## 7. Approval Boundary

AI may analyze/recommend/draft. Human approval is required for:

```text
performance.approve_review
assignment.approve
development.approve
business_impact.validate
sensitive export
consequential HR actions
```

## 8. AI Authorization Contract

Every AI request carries server-derived context:

```json
{
  "userId": "uuid",
  "organizationIds": ["uuid"],
  "squadIds": ["uuid"],
  "roles": ["CHAPTER_LEAD"],
  "permissions": ["talent.read", "capability.read"],
  "sessionId": "uuid"
}
```

The model cannot broaden this context. PostgreSQL remains the final enforcement layer.

## 9. RLS Test Matrix

| Scenario | Expected |
|---|---|
| Anonymous → talent | DENY |
| Talent → own profile | ALLOW |
| Talent → another private profile/performance | DENY |
| Manager → managed squad | ALLOW |
| Manager → other squad | DENY |
| Chapter Lead → own chapter | ALLOW |
| Chapter Lead → outside chapter | DENY |
| PM → assigned project | ALLOW |
| PM → unrelated project | DENY |
| Executive → aggregate | ALLOW |
| Executive → restricted individual record | DENY |
| HR → authorized people scope | ALLOW |
| AI → outside delegated scope | DENY |
| AI → approve performance | DENY |
| Manager → approve authorized subordinate review | ALLOW |

## 10. Engineering Rules

1. Enable RLS on every TANIA business table.
2. Deny-by-default.
3. Do not rely on client-side role checks.
4. Keep `service_role` server-only.
5. Use `SECURITY DEFINER` helper functions with fixed `search_path`.
6. Separate read/write/approve permissions.
7. Test RLS with real role/scope combinations in CI.
8. Audit sensitive mutations, exports and AI tool calls.

## 11. Implementation Order

```text
Identity → Organization/Squad → Roles → Permissions → Helper Functions → RLS → RLS Tests → API Auth → Next.js Route Guards → AI/Agent Tool Auth
```

> **RBAC defines what a role may do. Scope defines where it may do it. RLS enforces which rows it can actually touch.**
