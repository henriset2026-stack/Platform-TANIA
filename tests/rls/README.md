# RLS test suite

**Status: 57/57 passing** against project `hcyaqbgbwfxzutamceoq`
(2026-09-24): all **15** rows of TANIA_RBAC_RLS_MATRIX.md §9.

- *Executive → aggregate* goes through `chapter_summary()` and
  `chapter_capability_summary()`. The tests also check that a figure over
  fewer than five people is withheld, and that talents, other chapters' leads
  and AI identities get nothing.
- *Manager → approve subordinate review* is tested as development-plan
  approval, the approval §4 gives MANAGER. That MANAGER cannot approve a
  performance review is tested too.

Cite this suite only for the rows it exercises.

Rules the suite now holds itself to, each learned from the first live run:

- A denial asserts SQLSTATE `42501`, not "some error". A foreign-key failure is
  not an RLS denial.
- No test returns early for lack of data. Fixtures are created in `beforeAll`.
- A denial that depends on one specific policy has a control proving the same
  actor is otherwise allowed. See the SUPER_ADMIN self-grant pair.
- `afterAll` throws on any cleanup error. Squads are deleted before
  organizations (`ON DELETE RESTRICT`).

These tests cannot be mocked. The subject under test is PostgreSQL's own row
filtering, so they require a real database and real `authenticated` JWTs.

## Running

Requires a Supabase project with the Phase 2 migrations applied:

```bash
# .env.local holds the three variables; vitest does not load it itself.
set -a; . ./.env.local; set +a
npm run test:rls
```

`SUPABASE_SERVICE_ROLE_KEY` is for test fixtures only, never app code.

They are excluded from `npm test` by `vitest.config.mts` so the unit suite
stays hermetic.

## Coverage target

Every row of `TANIA_RBAC_RLS_MATRIX.md` §9, plus the escalation path recorded
in `TANIA_IMPLEMENTATION_BASELINE.md` §7.1.

## Warning

These tests create and delete users and organizations. Point them at a
disposable project, never at production.
