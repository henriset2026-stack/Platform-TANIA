# TANIA Threat Model — Security Gate #1

**Date:** 2026-09-24. Scope: the authentication, authorization and data
boundary built so far. Business modules added later must extend this model,
not assume it covers them.

## 1. Assets

| Asset | Why it matters |
|---|---|
| Performance reviews, ratings, evidence | Consequential for people's careers; must be attributable and unforgeable |
| Capability levels and evidence | "Certification is not capability": a self-asserted level is a false fact |
| Development plans, learning evidence | Commitments of time and money; approval is a human boundary |
| Assignments | Staffing decisions |
| Business impact | Monetary claims; validation is a human boundary |
| Private AI conversations | Restricted: private by default |
| Memberships, roles, permissions | The authorization root: whoever writes these writes everything |
| Audit log | The record that the rest was done legitimately |
| Service-role key | Bypasses every control above |

## 2. Actors

| Actor | Capability assumed |
|---|---|
| Anonymous internet user | Knows the URL and the publishable key (public by design) |
| Authenticated insider | Any role; holds a valid session; can call the Data API directly, not just the UI |
| Colluding insiders | Two accounts cooperating (e.g. a grantor and a grantee) |
| Compromised or manipulated AI agent | Prompt-injected; issues any tool call it can |
| Operator with the service role | Trusted, but mistakes must be visible |

**Key assumption:** every authenticated user can craft arbitrary PostgREST
requests with their own JWT. The UI grants nothing a request cannot bypass.

## 3. Trust boundaries

```text
Browser ──(HTTPS, session cookie)──▶ Next.js server ──(user JWT)──▶ PostgREST ──▶ Postgres (RLS + triggers)
   │                                     │
   └──(publishable key + user JWT)───────┴──────────────▶ PostgREST directly   ◀── the real boundary
Entra ID ──▶ Supabase Auth ──▶ JWT (signed; roles NOT taken from it)
LLM provider ◀── gateway (server) — never sees the service role or SQL
```

## 4. Threats and controls

| # | Threat (STRIDE) | Scenario | Control | Test | Status |
|---|---|---|---|---|---|
| T1 | Spoofing | Forged or tampered JWT, or forged session cookie | PostgREST signature check; `getUser()` server-side | AUTH-003 | Mitigated |
| T2 | Spoofing | Request body claims another user's id | No entry point reads identity from a request; `auth.uid()` only | static guard | Mitigated |
| T3 | Elevation | HR grants SUPER_ADMIN / EXECUTIVE / roles in other chapters | grant ceiling: `user_admin_org_ids()` + protected roles | PRIV-001 | **Found live (SG-01), fixed** |
| T4 | Elevation | User grants themselves a role | RESTRICTIVE no-self-grant | escalation, matrix | Mitigated |
| T5 | Elevation | Manager edits own `squad_id` into another chapter's squad | profile scope-field guard | PRIV-003 | **Found live (SG-02), fixed** |
| T6 | Information disclosure | Cross-chapter / cross-squad read of Sensitive data | RLS via `can_access_profile` | RLS-001/003 | Mitigated |
| T7 | Tampering | Cross-chapter update or delete | RLS; DELETE revoked on evidence tables | RLS-002/004 | Mitigated |
| T8 | Tampering / Repudiation | Reviewer approves own submission; approval under another's name | decision guards | matrix-extended | **Found live, fixed (100001/100002)** |
| T9 | Tampering | Evidence created pre-validated; creator validates own; self-certified capability; self-graded learning | validation, assessment and evaluation guards | SEC-003 | **Found live (SG-04), fixed** |
| T10 | Tampering | Self-scored AI augmentation; AI usage in another's name | RESTRICTIVE no-self policy; `profile_id = auth.uid()` | SEC-003 | **Found live (SG-05/09), fixed** |
| T11 | Repudiation | Role grant, approval or validation with no trace | audit triggers, tracked columns only, `via` request role | AUDIT-001 | **Found (SG-06), fixed** |
| T12 | Tampering | `TRUNCATE` on the audit log or role catalog (ignores RLS) | privileges revoked, default privileges too | catalog query | **Found (SG-07), fixed** |
| T13 | Information disclosure | Service-role key or secrets in the browser bundle | `server-only`, lint allowlist, bundle scan | SEC-001/002 | Mitigated |
| T14 | Information disclosure | Internal notes (incl. defect descriptions) in the bundle | availability computed server-side | static guard, bundle scan | **Found (SG-08), fixed** |
| T15 | Elevation | AI agent approves, writes, or reads beyond scope | AI allowlist in policy layer; RESTRICTIVE AI write and approval denials | AI-001/002 | Mitigated |
| T16 | Information disclosure | Prompt injection exfiltrates data | tools re-authorize per call against the user's context; RLS applies to every tool query | tests/ai | Mitigated (defence in depth) |
| T17 | Information disclosure | Executive aggregate identifies individuals | counts only; suppressed below 5 people | matrix-extended | Mitigated |
| T18 | Information disclosure | Bulk export of Sensitive data | no export surface exists; static guard | API-003 | Mitigated by absence |
| T19 | Denial of service | AI endpoint cost exhaustion | per-user token bucket (per instance) | hardening | Partially mitigated (R-6) |
| T20 | Tampering | XSS injects script that acts with the user's session | React escaping; no `dangerouslySetInnerHTML` of user data | — | **Open: no CSP (H-1)** |

## 5. Residual threats

Tracked in [SECURITY_GATE_1_REPORT.md](SECURITY_GATE_1_REPORT.md) §20: CSP,
denial events not audited, same-chapter project visibility, chapter-lead access
to private AI conversations, self-reported AI usage quality, logout CSRF, and
per-instance rate limiting.
