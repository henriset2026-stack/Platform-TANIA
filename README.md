# TANIA

> **Talent Intelligence, Analytics, Insight & Action**

AI-native Talent Performance & Capability Intelligence Platform for **Chapter Digital Product & Solution (DPS), Telkom Indonesia**.

## Product Vision

TANIA is designed to evolve from a management portal into an **AI-native DPS command center** connecting:

```text
Talent → Capability → Performance → Development
      → AI Augmentation → Work / Assignment
      → Business Impact → Evidence
```

Core questions:

- Who needs what capability?
- How are they performing?
- What capability gaps exist?
- How should capability be developed?
- How can AI augment the talent?
- Where should talent be deployed?
- What business impact is created?

### TANIA × JARVIS

> **TANIA = Who needs what?**  
> **JARVIS = How do we build and augment it?**

## Core Product Areas

```text
Executive Intelligence
Talent & Organization
Performance Intelligence
Capability Intelligence
Development & Learning
Work & Assignment Intelligence
AI Augmentation
Business Impact
TANIA AI Assistant
JARVIS Capability Coach
Knowledge / RAG
Reports & Analytics
```

## Homepage

The homepage is the AI-native command center for Chapter DPS.

```text
INTELLIGENCE
What is happening?

ACTION
What should I do next?

AI PARTNER
Ask TANIA.
```

A persistent interactive **TANIA Avatar** is placed in the lower-right corner.

States:

```text
Idle → Greeting → Listening → Thinking → Answering → Expanded
```

Contextual actions include:

- Critical capability gaps
- Find talent
- Performance
- Development
- Project matching
- Ask JARVIS

## Architecture

```text
                         TANIA PORTAL
                              │
                              ▼
                     TANIA AI ASSISTANT
                              │
                         AI Gateway
                              │
             ┌────────────────┴────────────────┐
             │                                 │
       TANIA Intelligence                JARVIS Execution
             │                                 │
   Talent / Performance / Capability     Product / Solution /
             │                           Business Case
             └──────────────┬──────────────────┘
                            ▼
                    Tool / Function Calling
                            │
                            ▼
                       Supabase
                Auth / PostgreSQL / RLS
                     pgvector / Storage
```

## Technology Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase
- PostgreSQL
- Supabase Auth
- PostgreSQL RLS
- pgvector
- Supabase Storage
- AI Gateway / LLM / RAG / Agents / Tool Calling
- GitHub
- Vercel
- CI/CD

Do not introduce a major framework without an explicit architectural reason.

## Security

TANIA uses:

```text
RBAC
+
Organization / Chapter / Squad Scope
+
Resource Authorization
+
Data Sensitivity
+
PostgreSQL RLS
```

Baseline roles:

```text
SUPER_ADMIN
EXECUTIVE
CHAPTER_LEAD
MANAGER
PROJECT_MANAGER
TALENT
HR
AI_SERVICE
```

**The frontend is not the security boundary. PostgreSQL RLS is.**

Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code. Never give an AI agent unrestricted SQL/database access. Never let an AI agent grant itself permissions.

## Security Documents

| Document | Purpose |
|---|---|
| `TANIA_PRD_v2.0.md` | Product and engineering requirements |
| `TANIA_RBAC_RLS_MATRIX.md` | RBAC, permissions and scope model |
| `TANIA_SUPABASE_RLS.sql` | Supabase/PostgreSQL RLS baseline |
| `CLAUDE.md` | Claude Code engineering instructions |
| `AGENTS.md` | Agent-specific engineering rules |

## Repository Structure

```text
TANIA/
├── CLAUDE.md
├── AGENTS.md
├── README.md
├── TANIA_PRD_v2.0.md
├── TANIA_RBAC_RLS_MATRIX.md
├── TANIA_SUPABASE_RLS.sql
├── ARCHITECTURE.md
├── app/
├── components/
├── lib/
├── agents/
├── supabase/
│   └── migrations/
├── tests/
└── public/
```

The actual repository structure takes precedence if implementation already exists.

## AI Agent Model

Do not create a single unrestricted "god agent".

```text
TANIA Assistant
      ↓
Agent Router
      ↓
Specialized Agent
      ↓
Authorized Tools
      ↓
RLS / Policy
      ↓
Execution
```

Initial agents:

```text
Talent Agent
Performance Agent
Capability Agent
Development Agent
Assignment Agent
JARVIS Capability Coach
Product Agent
Solution Agent
Business Case Agent
```

### TANIA → JARVIS

```text
Capability Gap
 ↓
Development Recommendation
 ↓
Ask JARVIS
 ↓
20-Hour Capability Sprint
 ↓
Learn / Practice / Challenge
 ↓
Evidence
 ↓
Assessment
 ↓
TANIA Capability Update
```

## Development

Inspect `package.json` before assuming scripts.

Typical commands:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
```

Use the repository's actual scripts when they differ.

## Environment

Secrets must never be committed.

Typical variables may include:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

LLM_API_KEY=
AI_GATEWAY_URL=

ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TENANT_ID=
```

Never expose service-role keys, provider secrets, Entra client secrets, or private certificates to client code.

## Testing

Security-critical changes require negative tests.

```text
Talent A → Talent A data       ALLOW
Talent A → Talent B data       DENY

Manager A → Squad A            ALLOW
Manager A → Squad B            DENY

Chapter Lead → own chapter     ALLOW
Chapter Lead → other chapter   DENY

PM → assigned project          ALLOW
PM → unrelated project         DENY

AI → authorized resource       ALLOW
AI → unauthorized resource     DENY
```

Every feature should consider:

- Unit tests
- Integration tests
- API tests
- RLS tests
- Agent/tool tests
- UI tests

## Definition of Done

- [ ] Requirement implemented
- [ ] Authorization defined
- [ ] RLS defined/verified
- [ ] API validation implemented
- [ ] Error handling implemented
- [ ] Audit requirements addressed
- [ ] Tests added
- [ ] Loading/empty/error UI states handled
- [ ] Documentation updated when architecture changes
- [ ] No secrets committed
- [ ] No unrelated regressions

## Engineering Workflow

```text
Inspect → Understand → Plan → Implement
        → Test → Security Review
        → Diff Review → Report
```

For schema changes:

```text
Inspect schema
 → Migration
 → Indexes
 → RLS
 → RLS tests
 → API verification
 → UI verification
```

## Strategic North Star

```text
                    AI-NATIVE DPS COMMAND CENTER
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
     PEOPLE              CAPABILITY              WORK
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                         PERFORMANCE
                              │
                              ▼
                       AI AUGMENTATION
                              │
                              ▼
                        BUSINESS IMPACT
                              │
                              ▼
                           EVIDENCE
                              │
                              ▼
                  Continuous Intelligence
```

The goal is a governed system where the right talent develops the right capability, uses AI effectively, is deployed to the right work, and produces measurable business impact with evidence and human accountability.

## Related Project

TANIA is part of **Project JARVIS & TANIA**.

```text
TANIA
Talent / Performance / Capability / Work / Impact Intelligence
                         │
                         ▼
JARVIS
AI Employee / Capability Coach / Product / Solution / Business Case
```

