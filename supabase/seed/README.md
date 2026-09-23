# Seed data

Three kinds of data live here, and the difference matters.

| File | What it is | Safe in production |
|---|---|---|
| `01_reference.sql` | PRD framework data — capability levels, capability domains | **yes** |
| `02_dev_sample.sql` | A minimal fictional skeleton, no people | no |
| `03_demo_dataset.sql` | The full demo dataset, including demo talent | **no** |
| `99_reset_demo.sql` | Removes `03` and nothing else | n/a |

`01_reference.sql` is framework definitions rather than business records, so
it is idempotent and safe anywhere. The other two are fiction.

## Using it

```bash
export DATABASE_URL='postgresql://postgres:postgres@localhost:54322/postgres'

npm run db:seed              # reference data + demo dataset
npm run db:reset -- --yes    # removes the demo dataset
```

`--yes` is required for the reset. The one thing worse than having no demo
data is running a reset against the wrong database.

## What the demo dataset contains

One DEMO chapter, four squads, 24 demo talents, 12 capabilities with required
levels, capability evidence, three projects with assignments, two performance
periods with metrics, evidence and reviews, development plans with 20-hour
sprint paths, AI usage, and business impact records.

It is built to **show the product's distinctions, not to look tidy**:

- every third capability evidence record is a **certification and nothing
  else**, so those people are capped at L2 however high they claim — which is
  the point PRD §7.1 makes, and a dataset where everyone has neat applied
  evidence would demonstrate nothing;
- every fifth performance evidence record is `ai_generated` and left
  `pending`, because an AI-generated claim is not a performance fact until a
  human validates it;
- most business impacts are unvalidated, because an unvalidated impact claim
  is a claim.

## Four properties, each load-bearing

**Synthetic.** Every person is invented. Emails use `@demo.invalid` — RFC 2606
reserved, so the domain cannot resolve and no message can reach a real inbox.
No figure describes a real person.

**Marked.** Every primary key begins `decafbad`, every code begins `DEMO-`,
the organization is "DEMO Chapter". A demo row is recognisable in a query
result, a log line or a screenshot without consulting anything.

**Deterministic.** No `gen_random_uuid()`, no `now()`, no `random()`. Two runs
produce byte-identical data, so a screenshot taken today matches one taken
next month.

**Resettable.** Because every key begins `decafbad`, `99_reset_demo.sql`
removes exactly this dataset and can touch nothing else. That precision is the
entire reason the keys are hard-coded.

## The demo people cannot log in

`profiles` is keyed to `auth.users`, so demo talent requires demo auth rows —
and a fictional account that can authenticate is a real account nobody owns.
Each is disabled four independent ways:

| Control | Effect |
|---|---|
| `banned_until = 'infinity'` | GoTrue refuses the sign-in outright |
| `encrypted_password` is a marker string | not a bcrypt hash, so no password compares equal |
| `email_confirmed_at = null` | unconfirmed accounts cannot sign in |
| `@demo.invalid` | password reset cannot deliver, so the account cannot be claimed |

Removing any one leaves the other three. The failure being guarded against is
a demo database later exposed to a network.

## Why it cannot reach production

Four layers, none sufficient alone:

1. The SQL refuses without `-v tania_allow_sample_data=1`.
2. The SQL refuses if the database holds any organization that is not `DEMO-`
   or `SAMPLE-` — the signal that this is a real environment.
3. `scripts/db.mjs` refuses if `TANIA_ENV`/`NODE_ENV` is `production`.
4. `scripts/db.mjs` refuses a connection string containing `prod`, `live` or
   `prd` unless `TANIA_DEMO_I_UNDERSTAND=yes` is set deliberately.

Together they mean seeding a production database takes several deliberate acts
rather than one mistyped variable.

## Status

**This has never been executed.** No TANIA Supabase project exists
(CLAUDE.md §2c), so the SQL here has not run against a database.
`tests/unit/seed.test.ts` checks it against the migration text — every table
exists, every column exists, the reset clears every table the seed writes —
which is the strongest verification available without a server, and is not the
same as having run it.
