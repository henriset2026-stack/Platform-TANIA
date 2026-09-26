# PRD v1.2 ↔ v2.0 Reconciliation

| Item | Value |
|---|---|
| Date | 2026-09-26 |
| Decided by | Product Owner (Chapter Leader DPS), 2026-09-26; item R-05 delegated to Claude Code |
| Sources | `PRD-TANIA.md` v1.2 (18 Sep 2026, portal product definition) · `TANIA_PRD_v2.0.md` (engineering baseline) |
| Status | Decisions recorded. Every implementation item below is **PLANNED** unless marked otherwise. |

## 1. Why this document exists

`PRD-TANIA.md` v1.2 is the product definition the Chapter works from: module IDs (ACC, TM, TP, TJ,
TC, WL, TS, PF, BC, ED, TD, AV), confirmed decisions C-01..C-05 and open decisions D-01..D-16.
`TANIA_PRD_v2.0.md` is the engineering baseline this repository is built on. They disagree in eleven
places. This file records how each conflict was ruled, so that neither document is silently
overridden (CLAUDE.md §3, "surface the conflict before making a high-impact architectural change").

**Precedence.** Where a row below rules on a conflict, the ruling wins over both PRDs. Where no row
rules, CLAUDE.md §3 applies unchanged: v2.0 is the engineering source; v1.2 supplies product scope and
requirement IDs.

## 2. Decisions

| # | Topic | v1.2 | v2.0 / code today | Ruling |
|---|---|---|---|---|
| R-01 | Roles | 6: Executive, Chapter Leader, Manager, Talent, Admin, Guest (§4) | 8 roles (`TANIA_RBAC_RLS_MATRIX.md` §2) | Keep v2.0's 8. Map v1.2 → v2.0 as in §3. **Guest is not implemented** until sharing is designed. |
| R-02 | Anonymisation by initials | D-08/D-09: negative findings in cross-unit views shown as initials | No rule. Small-group suppression only (`chapter_summary()`, < 5 people → NULL; migration `20260924100003`) | **Add** initials for named cross-unit views. **Keep** the < 5 suppression. Both apply. |
| R-03 | Login | ACC-02: email + password, magic link, invite-only | SSO only: `signInWithOAuth({ provider: "azure" })` in `app/(auth)/login/actions.ts` (§14.1) | Allow **invite-only** email / magic link for the pilot **until Entra ID is configured**. Open sign-up stays disabled. Entra remains the target (ACC-05). |
| R-04 | Server Actions | C-04: REST route handlers only, no Server Actions | Not forbidden. Login already uses one. | **C-04 is dropped.** Server Actions are allowed for UI mutations. REST `/api/v1` remains the external API (v2.0 §15). |
| R-05 | AI career-status recommendations | TJ-09/TJ-10/C-05: Stay / Promosi / Mutasi; contract extension; shown to the talent only after manager review | §14.4: AI must not decide promotion or termination | **Allowed as a recommendation, never a decision** — see §4. |
| R-06 | Hard-coded defaults | D-05 60/100, D-11 Monday 12:00, 10-working-day SLA, D-02 equal weights | Performance weights 25/15/20/10/10/10/10 (§6); utilisation bands are **constants** in `lib/calculations/workload.ts` (`UTILIZATION_BANDS`) | All approved **as configuration rows with a `calculation_version`**, never as code constants. See §5. |
| R-07 | Capability framework | "8 kompetensi", level 1–5 (TM-02, TC-06, TD-05) | 11 domains (§7), L1–L5 | v2.0's 11 domains stay. The DPS catalogue's 8 are **capabilities inside those domains**, not a parallel list. Catalogue to be supplied by the PO. |
| R-08 | Executive reading individual reviews | TP-05: Executive may see performance reviews | Executive sees aggregates; individual records need "explicit authorization", which is unspecified (`lib/status.ts` phase 3) | **Keep denying** until the RBAC matrix defines explicit authorization. |
| R-09 | Agent list | AV-07: 12 specialists (Knowledge, Proposal, Tender, …, Meeting) | 11 agents (§44–§55; CLAUDE.md §7) | **Stay with v2.0's 11.** AV-07 is roadmap text, not a requirement. |
| R-10 | UI language | Bahasa Indonesia default (§5.6, §7) | `<html lang="en">` in `app/layout.tsx`, English copy | **Indonesian is the default.** Technical terms stay English where usual. |
| R-11 | Budget actuals | BC-02: approved timesheet × rate card | SAP figures with provenance (`budget_external_requires_provenance`, migration `20260921130001`) | **Both.** SAP actuals stay the record; a timesheet-based estimate is shown alongside, labelled as an estimate. |

## 3. Role mapping (R-01)

| v1.2 role | v2.0 role | Note |
|---|---|---|
| Executive | `EXECUTIVE` | Aggregates only; see R-08 |
| Chapter Leader | `CHAPTER_LEAD` | |
| Manager | `MANAGER` | Own + managed squad (v1.2 "unit/tribe" ≈ v2.0 organization/squad) |
| Talent | `TALENT` | |
| Admin | `SUPER_ADMIN` | |
| Guest | — | Not implemented (R-01) |
| — | `PROJECT_MANAGER`, `HR`, `AI_SERVICE` | v2.0-only; kept |

## 4. Career-status recommendations (R-05)

§14.4 forbids AI from *deciding* promotion or termination; it explicitly allows AI to *recommend*.
TJ-10 already makes the flow a recommendation → manager review → Chapter Leader decision. The two are
compatible if the boundary is enforced by the database, not by the prompt:

1. The agent may only write a `recommendations` row with a career-status type and status `open`. It
   holds no permission to accept, resolve or act on it.
2. RLS hides an unreviewed career-status row from the talent it concerns. Only the reviewing manager,
   the Chapter Lead and (per R-08, aggregate only) the Executive see it before review.
3. Manager review and Chapter Lead decision are human approvals: a decision guard and an audit
   trigger in the migration that adds them (CLAUDE.md §2c), and a HIGH risk tier for any tool that
   touches them.
4. The review SLA (default 10 working days, a config row per R-06) escalates to the Chapter Lead. It
   never releases the raw recommendation to the talent.
5. Output always carries rationale, triggering data and confidence (TJ-09).

Before this is built, **update** `TANIA_PRD_v2.0.md` §14.4 (add "career-status recommendation, human
reviewed" under *AI may*) and `AGENTS.md` (agent contract and risk table). Implementation belongs to
the Talent Journey work, not to this document.

## 5. Configuration defaults (R-06)

Every value is seeded as a configuration row with `calculation_version = '1.0.0'` and is editable by
`SUPER_ADMIN`, with audited changes.

| Key | Default | Source | Where it lives today |
|---|---|---|---|
| Utilisation bands | under < 60, healthy 60–100, over > 100 (severe > 120 kept) | D-05 | Code constant `UTILIZATION_BANDS` — **must move** |
| Timesheet cut-off | Monday 12:00 for the previous week; lock after approve | D-11 | No timesheet module yet |
| Career-review SLA | 10 working days, escalate to Chapter Lead | C-05 | Not built |
| Performance weights | 25 / 15 / 20 / 10 / 10 / 10 / 10 (v2.0 §6) | v2.0 | `performance_weight_profiles` (table exists, **no profile seeded**) |
| Health-score / feasibility weights | Equal | D-02 | `feasibility_weight_profiles` (table exists) |
| Recommendation triggers | D-13 text | D-13 | Not built |

Where v1.2 D-02 (equal) and v2.0 (25/15/…) both give performance weights, the seed uses v2.0's values
as the default profile. Equal weights are the default only where v2.0 gives none (health score,
feasibility).

## 6. v1.2 scope with no counterpart in this repository

Not decisions — a gap list for planning. All **PLANNED**.

| v1.2 area | Gap |
|---|---|
| ACC-01 public HOME + LOGIN | Check against `app/page.tsx`; invite / magic-link login absent (R-03) |
| TS Project Timesheet | No `timesheet` / `timesheet_entry` tables; needed by WL-02 actuals and R-11 |
| Rate card (PF-03, BC-02) | No `rate_card` table |
| TP Talent Profile, AI CV Generator | No `talent_profile_item` versioning or `cv_document` |
| TJ Talent Journey | No `career_event`; recommendations table lacks career-status fields (R-05) |
| TC Talent Capability | `work_log`, repository artefacts, confidential flag (TC-08) not modelled as v1.2 defines |
| TD Talent Dashboard | No talent-role landing page |
| ED-03 weekly report | Not built; needs R-02 initials |
| REST `/api/v1` | Only `app/api/ai/chat` exists |

## 7. Follow-up work, in order

1. **R-10** Indonesian UI: `lang="id"` together with translating visible copy — flipping the attribute
   alone would make screen readers read English text with Indonesian pronunciation.
2. **R-06** Move `UTILIZATION_BANDS` to a configuration row; seed the default performance and
   feasibility weight profiles.
3. **R-03** Invite-only email / magic link behind a configuration flag that switches off once Entra
   is configured; negative tests that open sign-up is refused.
4. **R-02** Initials view for named cross-unit negative findings, with RLS tests.
5. Timesheet + rate card (unblocks WL-02 and **R-11**).
6. Talent Journey, including **R-05** after the §14.4 / `AGENTS.md` update.

Each step updates `lib/status.ts` in the same commit, as CLAUDE.md §1 requires.
