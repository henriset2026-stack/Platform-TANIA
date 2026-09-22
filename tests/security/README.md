# Security suite

Runs in `npm test`. These assertions are **hermetic** — they exercise the
policy layer, the route guard and the source tree, none of which need a
database.

## What this suite can and cannot prove

`lib/auth/policy.ts` is a **gate**: it fails a request fast, with a reason,
instead of returning an empty result that reads like "no data". PostgreSQL RLS
is the **enforcement**. If the two ever disagree, RLS wins and the policy layer
is the bug.

So a green run here proves the gate decides correctly. It does **not** prove
the database agrees, and the two are independently necessary — a passing gate
with a missing policy is an open table.

The enforcement half lives in `tests/rls/`, needs a real Postgres instance and
real `authenticated` JWTs, and **has never run**, because no TANIA Supabase
project exists (CLAUDE.md §2c). Nothing in this directory should be cited as
evidence that RLS works.

| Question | Answered by | Status |
|---|---|---|
| Does the gate decide correctly? | `tests/security/` | runs in `npm test` |
| Does the database enforce it? | `tests/rls/` | **never run** |
| Do route guards deny by default? | `tests/security/` | runs in `npm test` |
| Are secrets kept server-side? | `tests/security/` + `npm run build` | runs |

## Negative tests are the point

`TANIA_RBAC_RLS_MATRIX.md` §9 is a matrix of ALLOW and DENY rows. A security
feature whose happy path works is not done, so every DENY row has a test here
and a corresponding one in `tests/rls/`.
