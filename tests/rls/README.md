# RLS test suite

**Status: NOT RUN.** No TANIA Supabase database exists yet, so none of these
assertions has ever executed. Nothing in this directory should be cited as
evidence that RLS works.

These tests cannot be mocked. The subject under test is PostgreSQL's own row
filtering, so they require a real database and real `authenticated` JWTs.

## Running

Requires a Supabase project with the Phase 2 migrations applied:

```bash
export NEXT_PUBLIC_SUPABASE_URL=...
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...        # test fixtures only, never app code
npm run test:rls
```

They are excluded from `npm test` by `vitest.config.mts` so the unit suite
stays hermetic.

## Coverage target

Every row of `TANIA_RBAC_RLS_MATRIX.md` §9, plus the escalation path recorded
in `TANIA_IMPLEMENTATION_BASELINE.md` §7.1.

## Warning

These tests create and delete users and organizations. Point them at a
disposable project, never at production.
