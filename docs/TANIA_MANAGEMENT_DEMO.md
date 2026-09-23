# TANIA — Management Demo Script

**Read this page before you schedule the demo.** Four of the fifteen steps
cannot be clicked today. They are narrated instead, and this script gives you
the words. Nobody should discover that live.

Everything on screen is **DEMO data**: a fictional chapter, twenty-four
invented people, synthetic evidence. Say so at the start and once in the
middle. If someone asks whether a number is real, the answer is always no.

---

## 1. What this demo can and cannot show

| # | Step | Status |
|---|---|---|
| 1 | Login | **Live** |
| 2 | Executive Dashboard | **Live** |
| 3 | Identify capability gap | **Live** |
| 4 | Open affected talent | **Live** |
| 5 | Inspect evidence | **Live** |
| 6 | Create development plan | **Narrate** — no save path exists |
| 7 | Identify suitable project | **Live** |
| 8 | Use TANIA AI Assistant | **Narrate** — opens, cannot answer |
| 9 | Ask Capability Agent | **Narrate** — engine runs, chat does not |
| 10 | Ask Development Agent | **Narrate** — engine runs, chat does not |
| 11 | Ask Assignment Agent | **Narrate** — this agent is not built |
| 12 | Evidence-backed recommendation | **Live**, as screen output, not chat |
| 13 | Approval boundary | **Live** |
| 14 | Audit trail | **Live**, and it will be empty — that is the point |
| 15 | Business impact | **Live** |

**Live** means you click it and it works.
**Narrate** means you show the surrounding screen and explain what will
connect to it. You do not click and hope.

### Why the four gaps exist

**No language model is connected.** TANIA is built so that the calculations —
capability gaps, proven levels, match scores, financial figures — are ordinary
deterministic code, not model output. Those run today. The model's job is to
*phrase* answers and route questions, and that part is unconnected, so the
assistant cannot reply. This is worth stating plainly, because it is the
opposite of the usual demo problem: the reasoning works and the chat does not.

**There is no Assignment Agent.** The matching engine behind it is built and
tested — it produces a match score, the evidence for it, the capability gap it
leaves, a confidence level and a recommended action. What does not exist is
the conversational agent that would front it. Three of the eleven specified
agents exist today (Capability, Development, Performance), plus three on the
JARVIS side.

**Nothing can be saved.** TANIA can draft a development plan. It has no path
to commit one, deliberately — committing a plan spends a person's time and the
chapter's budget, so it needs a human with the `development.approve`
permission, and that path is not built yet.

If you are asked "so what works?": **the intelligence works and the actions do
not.** TANIA can tell you the gap, who is affected, what evidence supports it
and what should happen. It cannot yet do the thing for you.

---

## 2. Pre-flight — 30 minutes before

Run these in order. If any step fails, you do not have a demo; do not
improvise.

```bash
# 1. A disposable database. NEVER a production connection string.
export DATABASE_URL='postgresql://postgres:postgres@localhost:54322/postgres'

# 2. Apply the schema, then load reference + DEMO data.
#    The seed refuses to run if the database holds any organization that is
#    not DEMO- or SAMPLE- prefixed — the signal that it is a real environment.
npm run db:seed

# 3. Build and start
npm run build && npm start
```

Then, in the browser:

- [ ] `/login` loads
- [ ] you can sign in with the presenter account (see §6)
- [ ] `/dashboard` shows numbers, not empty states
- [ ] `/capability` lists critical gaps
- [ ] `/audit` loads and says you are authorized

**The twenty-four demo people cannot log in.** Every demo account is banned at
the authentication layer on purpose — a fictional account that can
authenticate is a real account nobody owns. You need one real presenter
account; §6 has the recipe. Create it before the day, not during.

**Have a fallback.** Take screenshots of steps 2, 3, 4, 5, 7, 14 and 15 the
day before. If the environment misbehaves, present the screenshots and say so.

---

## 3. Opening — 60 seconds

> "What you'll see is a working system running on **demonstration data**. The
> chapter, the people, the evidence — all invented. The names are prefixed
> DEMO and the email addresses end in `.invalid`, which is a reserved domain
> that cannot exist. No real employee data is in this system.
>
> I'll walk one complete loop: a capability gap, the people it affects, the
> evidence behind it, what development would close it, which project would
> prove it, and what it's worth. I'll be explicit about what's built and what
> isn't."

That last sentence buys you everything later. Say it.

---

## 4. The loop

Times are estimates for a 20-minute slot. Cut steps 7 and 15 first if you run
long.

### Step 1 — Login · *1 min* · **Live**

Sign in at `/login`.

**Say:** "Authentication is Microsoft Entra ID in production. Every screen
after this is scoped to who I am — not hidden from me, scoped. The database
itself refuses rows I'm not entitled to, so the browser is never the security
boundary."

Do not linger. Nobody is impressed by a login form.

### Step 2 — Executive Dashboard · *2 min* · **Live**

Go to `/dashboard`. Show the metric tiles, then the **Capability Gaps**
section.

**Say:** "This is the chapter-leader view: talent health, capability coverage,
gaps, AI adoption, business impact. Every figure carries where it came from
and when. If a figure isn't available, the tile says so rather than showing a
zero — a zero and 'not connected' are different facts, and one of them gets
acted on wrongly."

**If a tile shows an empty state:** that is correct behaviour, not a fault.
Say: "That one has no data source connected yet, and it says so instead of
inventing a number."

### Step 3 — Identify a capability gap · *2 min* · **Live**

Go to `/capability`. Show **Critical capability gaps**.

**Say:** "Gap is Required level minus Current level. What matters is that
'current' means the level the evidence *proves*, not the level someone
claimed. And ranking isn't by gap size — it's business criticality times gap
size times time urgency, together. A one-level gap in something critical and
urgent outranks a three-level gap in something that isn't."

Pick the top gap. Note the capability name; you will use it for the rest.

### Step 4 — Open the affected talent · *2 min* · **Live**

Go to `/talent`, open a person, then their **Capabilities** tab.

**Say:** "Here's someone the gap affects. Two numbers: the level claimed, and
the level the evidence supports. They're usually not the same, and the
difference is the product."

**Point at the count on screen:** "And the number of people shown is everyone
*I* am allowed to see — it's a floor, not the chapter total. The system says
so rather than letting me assume."

### Step 5 — Inspect the evidence · *3 min* · **Live — the best moment in the demo**

Stay on the person. Open **Evidence**. Find a record whose only evidence is a
**certification**.

**Say:** "This person holds a certificate in this capability and claims level
four. The system reports them at level two, and it will not go higher. A
certificate proves someone learned something. It doesn't prove they've ever
applied it, and capability here means evidence of application.
>
> This is the most expensive mistake in capability management: a chapter
> counts certificates, believes it has the capability, staffs a project on it,
> and finds out during delivery."

Then show a record with a **project deliverable**, and point at its validation
status and origin.

**Say:** "Every piece of evidence carries its source, its date, whether a human
validated it, and whether it was generated by AI. An AI-generated claim is
never a performance fact until a person validates it."

If you show one thing in this demo, show this.

### Step 6 — Create a development plan · *2 min* · **Narrate**

Go to `/development`. Show **Development loop**, **Development templates** and
**Capability upgrade proposals**.

**Say:** "Closing the gap is a twenty-hour Capability Sprint: learn, practise,
apply on real work, assess, evidence. TANIA drafts that plan — it picks the
template, targets one level at a time, and lists the evidence the plan must
produce.
>
> What it does **not** do is save it. That's deliberate. Committing a plan
> commits a person's time and a budget, so it needs a human with approval
> authority. That commit path isn't built yet, so today you're seeing the
> framework and the templates, not a saved plan."

**Do not** click anything that looks like it saves. Nothing does.

### Step 7 — Identify a suitable project · *2 min* · **Live**

Go to `/workload`, then `/projects`.

**Say:** "Development ends in applied work, so the loop needs a real project.
The matching engine scores a person against a role on capability fit,
availability and development value, and returns the evidence for the score and
the gap it leaves. Its confidence comes from how much evidence it had, not
from how good the match looked — a confident score on thin evidence is exactly
the thing to avoid."

### Step 8 — TANIA AI Assistant · *1 min* · **Narrate**

Open the assistant from the bottom-right avatar.

**Say:** "The assistant is present on every screen and knows which page you're
on — on the capability page, 'why is this red?' means *this* capability, not a
general question. It's wired to the authorization layer, so it can only ever
see what you can see.
>
> It has no language model connected in this environment, so it won't answer
> today. I'd rather show you that than fake it."

**Do not type a question and let it fail on screen.** Open the panel, show it,
close it.

### Steps 9–11 — Capability, Development and Assignment Agents · *3 min* · **Narrate**

Stay where you are. This is a whiteboard moment, not a click.

**Say:** "Behind the assistant are specialist agents, each with a bounded job —
there's no single agent with access to everything.
>
> The **Capability Agent** answers 'where are we short, who's affected, what's
> the evidence' — and it's the engine you saw in steps 3 and 4. That arithmetic
> is ordinary deterministic code, not model output, because a capability gap
> drives real spend and has to be reproducible.
>
> The **Development Agent** drafts the plan from step 6.
>
> The **Assignment Agent** is the one that isn't built yet. The matching engine
> behind it is — that's what step 7 showed — but the conversational front for
> it doesn't exist."

**Expected question — "so what is the AI actually doing?"**

> "Two things, and it matters which. It routes your question to the right
> specialist, and it phrases the answer. It does *not* decide what the gap is
> or what someone's level is — that's deterministic code, so two people asking
> the same question get the same number, and you can audit how it was reached."

### Step 12 — Evidence-backed recommendation · *2 min* · **Live**

Return to `/capability` or `/development`.

**Say:** "Every recommendation comes with four things: the gap, who's affected,
the evidence behind it, and the priority factors — criticality, magnitude,
urgency, each shown separately rather than rolled into one score you'd have to
take on trust.
>
> And where there's no evidence, it says so. An unproven capability is a
> finding, not a blank. The system would rather tell you which four questions
> need answering than give you an answer built on three guesses."

### Step 13 — Approval boundary · *2 min* · **Live**

Stay on `/development`. Show **Capability upgrade proposals**.

**Say:** "This is where AI stops. TANIA can analyse, draft and recommend. It
cannot approve a performance review, commit a development plan, assign someone
to a project, or validate a business impact.
>
> That isn't a setting. The AI identity holds no write permission, the database
> has policies that refuse AI writes regardless of what permissions are
> configured, and no tool that performs these actions exists for it to call.
> Completing a sprint doesn't raise anyone's level either — it makes an upgrade
> *proposable*, and a human decides."

**Expected question — "could someone turn that off?"**

> "They'd have to change the application, the permission grants and the
> database policies, in three separate places, and the tests fail if any one of
> them changes."

### Step 14 — Audit trail · *2 min* · **Live, and probably empty**

Go to `/audit`. Show **Agent runs**, **Tool calls** and **Audit log**.

**Say:** "Every AI action is recorded: who asked, which agent, which tool, what
the authorization decision was, the risk level, how long it took, and whether
it succeeded — including the calls that were **refused**. A refused call is the
most interesting row in the log; a session where something repeatedly tried an
unauthorized action looks identical to a clean one if you throw denials away.
>
> It's empty here because no agent has run in this environment — there's no
> model connected. The recording is built; there's nothing to record yet."

**Do not** claim the audit trail has been proven in use. It has not.

### Step 15 — Expected business impact · *2 min* · **Live**

Open a talent record and scroll to **Business Impact** — that is where the
seeded impact records appear as a titled panel. The dashboard also carries a
business-impact tile as the aggregate view, gated on `business_impact.read`;
use the talent page if you want something definite on screen.

**Say:** "This closes the loop: gap, development, applied work, evidence,
impact. Note that most of these are **unvalidated**. That's on purpose — an
impact claim is a claim until someone validates it, and a dashboard where every
rupiah is pre-validated teaches people to believe the number."

**Close:**

> "That's the loop. Capability gap to development to work to evidence and back
> to capability. What you've seen working is the intelligence — the gaps, the
> evidence discipline, the scoping, the approval boundary. What isn't connected
> yet is the conversation and the actions."

---

## 5. Questions you will get

**"Is any of this real data?"**
No. Fictional chapter, invented people, synthetic evidence. Addresses end in
`.invalid`, a reserved domain that cannot exist. No real employee data has been
in this system.

**"Can it tell me who my best people are?"**
It can tell you who has *proven* a capability and what evidence supports it. It
won't rank people on a single score — that's a judgement, and the system is
built to give managers evidence rather than replace them.

**"What happens if the AI gets it wrong?"**
The numbers aren't AI output — they're deterministic calculations you can
reproduce and audit. Where the AI does interpret, the output is labelled as an
inference rather than a fact, and it can't act on it.

**"When can we use it?"**
Be honest and specific: no database is provisioned, no language model is
connected, and the security policies have never been executed against a real
database. Do not give a date. If pressed: "the intelligence layer is built and
tested; connecting it to a real environment is the next phase."

**"Can we see our own data in it?"**
Not yet, and not without a decision about what goes in. The capability
framework here is generic placeholder content — the real DPS catalogue is
chapter content and hasn't been loaded.

**"Why is the audit trail empty?"**
Because nothing has run. That's better than a demo trail full of invented
entries.

---

## 6. The presenter account

The twenty-four DEMO people cannot log in — banned at the authentication layer,
no usable password, unconfirmed, and on a domain that cannot receive mail. That
is deliberate and should not be worked around.

For the demo you need **one** real account:

1. Create a user through Supabase Auth on the demo project, with an address you
   control.
2. Insert a `profiles` row for it, with `chapter_id` set to the DEMO chapter.
3. Give it an `organization_memberships` row in the DEMO chapter with the
   `CHAPTER_LEAD` role.
4. **Delete it when the demo is over.** It is a real credential.

Do not reuse a password from anywhere else. Do not create it on any database
that holds real data — `npm run db:seed` refuses such a database, and so should
you.

---

## 7. Resetting

```bash
npm run db:reset -- --yes
```

Removes every demo row and nothing else — each carries a key beginning
`decafbad`, so the reset matches on that rather than guessing at names.

Re-seeding produces **identical** data: the dataset has no random values and no
timestamps taken from the clock. Your screenshots stay accurate.

---

## 8. Honesty rules for the presenter

1. Never present a demo figure as a real measurement.
2. Never say a step "works" when you are narrating it. Say what is built.
3. Never type into the assistant and let it fail in front of the room.
4. Never claim RLS, audit or the agents have been *verified* in use. They have
   been built and unit-tested; the database has never been provisioned.
5. If you don't know, say you'll find out. This audience will remember a
   confident wrong answer far longer than "I don't know."
