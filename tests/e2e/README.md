# End-to-end suite

**Status: never run in CI, and browser-level coverage does not exist.**

These drive a running TANIA server over HTTP:

```bash
npm run build && npm start
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

They are excluded from `npm test` by design. A suite that silently skips
inside the default run reports green for assertions that never executed, which
is the failure mode this repository avoids everywhere else.

## What these cover

Route protection and the HTTP contract as a real client sees them: an
unauthenticated request to a private route redirects to login, the AI endpoint
refuses GET, security headers are present, and no error body leaks internals.

That is genuinely end-to-end — middleware, route guards and handlers all run —
and it needs no browser.

## What is still missing

**Screen flows S01–S13 (PRD §25–§37) have no automated coverage.** Asserting
that the capability heatmap renders the right colours, that the assistant
opens and answers, or that a manager cannot see another squad's rows *in the
UI*, needs a real browser. That means adding Playwright and its browser
binaries, which is a dependency decision rather than a test-writing one.

`tests/integration/pages.integration.test.ts` reads each screen's source and
checks the contracts source analysis can honestly establish — that a page
reads through the authorized query layer, hands `DataPoint`s to components,
and captions its tables. It cannot establish that the rendered output is
correct or accessible, and nothing here should be read as if it does.

There is also no axe or visual-regression check. `npm run build` and the
design-system tests cover the token and focus-treatment rules statically.
