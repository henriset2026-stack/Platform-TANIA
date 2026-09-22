# TANIA test strategy

Five suites. Three run in `npm test`; two are run deliberately, because a
suite that silently skips inside the default run reports green for assertions
that never executed.

| Suite | Runs in `npm test` | Needs | Proves |
|---|---|---|---|
| `tests/unit/` | yes | nothing | calculation engines, contracts, pure domain logic |
| `tests/integration/` | yes | nothing | route handlers, the data-access boundary, screen contracts |
| `tests/security/` | yes | nothing | the policy gate, route guards, secret handling |
| `tests/ai/` | yes | nothing | injection defences, claim discipline, tool authorization |
| `tests/rls/` | **no** | a live Postgres | that the database enforces what the gate decides |
| `tests/e2e/` | **no** | a running server | route protection as a client sees it |

```bash
npm test                 # unit + integration + security + ai
npm run test:security    # the security suite alone
npm run test:ai          # the AI suite alone
npm run test:rls         # needs NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
npm run test:e2e         # needs E2E_BASE_URL against a running server
npm run verify           # typecheck + lint + npm test
```

## What a green run does not prove

Two gaps matter more than the rest, and both are structural rather than
oversights:

**RLS has never executed.** `tests/security/` proves `lib/auth/policy.ts`
decides correctly. It cannot prove PostgreSQL agrees, and the policy layer is
explicitly *not* the enforcement boundary (CLAUDE.md §2d). `tests/rls/` is the
half that would prove it, it needs a real database with real `authenticated`
JWTs, and no TANIA Supabase project exists. **Nothing in this repository
should be cited as evidence that RLS works.**

**No browser runs.** Screen flows S01–S13 have no automated coverage.
`tests/integration/pages.integration.test.ts` reads each screen's source and
checks what source analysis can honestly establish — that a page reads through
the authorized query layer, hands `DataPoint`s to components, and captions its
tables. It cannot establish that the rendered output is correct or accessible.
See `tests/e2e/README.md`.

Smaller ones: there is no LLM provider, so no agent runs end to end; there is
no embedding provider, so retrieval always reports not-integrated; and the
observability recorder is tested but not yet called from the pipeline.

## Negative tests are the point

`TANIA_RBAC_RLS_MATRIX.md` §9 is a matrix of ALLOW and DENY rows. A security
feature whose happy path works is not done, so every DENY row has a test in
`tests/security/` and a matching one in `tests/rls/`.
