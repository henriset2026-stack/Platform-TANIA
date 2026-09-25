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
| T20 | Tampering | XSS injects script that acts with the user's session | React escaping; no `dangerouslySetInnerHTML`; nonce CSP; HttpOnly session cookies | hardening, browser check | **Mitigated in Security Gate #3 (H-1 closed)** |

## 5. Residual threats

Tracked in [SECURITY_GATE_1_REPORT.md](SECURITY_GATE_1_REPORT.md) §20: CSP,
denial events not audited, same-chapter project visibility, chapter-lead access
to private AI conversations, self-reported AI usage quality, logout CSRF, and
per-instance rate limiting.

## 6. Security Gate #3: production threats (2026-09-25)

The Gate #3 brief's threat list. The ids are prefixed **P** so they do not
collide with T1–T20 above, which remain valid. Status: **Mitigated** (control
implemented and tested), **Partial**, **Open**, or **N/A** (the surface does
not exist).

| ID | Threat | Asset | Attack vector | Control | Residual risk | Status |
|---|---|---|---|---|---|---|
| P1 | Authentication compromise | Sessions | Stolen or forged session | `getUser()` server validation; Entra ID via Supabase OIDC; HttpOnly, Secure, Lax cookies | Supabase Auth and Entra configuration NOT VERIFIED; token expiry not reviewed | Partial |
| P2 | Authorization bypass | All records | Calling a page, action or RPC outside one's permissions | Server gates (`authorize.ts`) and RLS on every read | Only the rows the RLS suite exercises are verified | Mitigated |
| P3 | RLS bypass | Database | Service-role misuse; a policy gap; a SECURITY DEFINER leak | Service role never at runtime; 21/21 definer functions pin `search_path`; 106 RLS tests | Vercel env not visible (service role presence NOT VERIFIED) | Partial |
| P4 | IDOR | Talent / performance records | Changing an id in a URL or tool argument | RLS by `auth.uid()`; `canAccessTalent`; argument organization check | none known | Mitigated |
| P5 | Secret exposure | Keys | Commit, bundle, logs | History scan 0; bundle scan 0; server-only allowlist; log redaction | Rotation never exercised | Partial |
| P6 | Supply-chain compromise | Build | Malicious dependency or action | Lockfile; `npm audit` 0; actions pinned by SHA; read-only CI token; 2 reviewed install scripts | No automated dependency alerts verified | Partial |
| P7 | XSS | Sessions, data | Injected HTML or script | React escaping; no raw HTML; nonce CSP (browser-verified); HttpOnly cookies | `style-src 'unsafe-inline'` exception | Mitigated |
| P8 | CSRF | State changes | Cross-site POST | SameSite=Lax cookies; server actions' origin check (Next.js); only POST mutates | none known | Mitigated |
| P9 | SSRF | Internal network | Server fetch of a user-supplied URL | No such fetch exists; provider URL is server config | none | N/A |
| P10 | File upload abuse | Storage | Malicious file | No upload surface | none | N/A |
| P11 | RAG data leakage | Knowledge base | Retrieval beyond scope | RLS inside the vector scan (8/8 live); `RAG_ENABLED` switch | No corpus or embedding model yet | Mitigated |
| P12 | Prompt injection | AI answers | Instructions in the message, tool data or documents | Fencing; step 2 offered no tools; instruction-like fields withheld (L11); output guard | A paraphrase that evades the detector reaches the model's copy (no action possible) | Partial |
| P13 | Tool abuse | Data via tools | Model proposes a forbidden call | Closed registry; all-permission check; argument scope; bound approvals; `TOOL_EXECUTION_ENABLED` | none known | Mitigated |
| P14 | Agent recursion | Cost, availability | Loop of model and tool calls | At most 2 model calls and 8 tool calls; deadlines | none | Mitigated |
| P15 | JARVIS unauthorized execution | Other system | Handoff used as a command channel | Context, not commands; scope ceiling; off by default; no transport | Handoffs unsigned (AG-07) before any transport | Mitigated (latent gap) |
| P16 | Data exfiltration | Sensitive records | Bulk reads or export | No export; RLS scope; `connect-src 'self'` | Page reads are not audited | Partial |
| P17 | Account takeover | A user's access | Credential theft at the IdP | Entra ID; session revocation available | Revocation never exercised | Partial |
| P18 | Database compromise | All data | Leaked DB credentials; loss | anon revoked; RLS | **No backups, no PITR, no restore test** | Open |
| P19 | Cloud misconfiguration | Deployments | Wrong env vars, preview reaching production data | Vercel SSO protection observed | **No production project; Vercel env NOT VERIFIED; no environment separation** | Open |
| P20 | Production deployment compromise | Production | Push to `main` deploys unreviewed code | `vercel.json` disables auto-deploy of `main` (once committed); CI added | **No branch protection** (free private plan) | Partial |
