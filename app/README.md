# StageForge — Phase 1 scaffold

A working scaffold of the StageForge Phase 1 MVP, built directly on the
decisions in `../PRD.html`, `../DataModel.html`, and `../ConfigSchema.html`.
Next.js (App Router) + PostgreSQL + Prisma, TypeScript throughout.

## What's actually built

- **Prisma schema** (`prisma/schema.prisma`) — the Phase 1 subset of the
  data model: tenancy (`Company` → `Department` → `ProjectRoleAssignment`,
  never a direct link to `Project`), the template hierarchy
  (`Template` → `StageTemplate` → `GateTemplate` → `DeliverableTemplate`),
  and the live instances (`Project` → `Stage` → `Gate` → `Deliverable` →
  `EvidenceFile` / `DeliverableBypass`), plus `GateSignOff` and an
  append-only `AuditLogEntry`.
- **Governance logic** (`src/lib/permissions.ts`) — pure functions, no DB
  dependency: the tiered bypass-authority ladder (PM → Compliance Officer
  → SRO), the Sponsor-only gate decision rule, and the gate-closure AND
  condition (every blocking deliverable evidenced or bypassed).
- **Server actions** (`src/lib/actions.ts`) — bypass a deliverable
  (reason required, authority checked against the ladder), upload or
  replace evidence (versioned, replacement locked once a gate is
  `SIGNED_OFF`), submit a gate for approval, approve, reject (reason
  required, returns the gate to `IN_PROGRESS` rather than a terminal
  state), and reinstate a stage a PM had previously excluded (appends
  after the project's current point, never reinserts into template
  order).
- **Screens** — a project's gate overview (`/projects/[projectNumber]`)
  with every gate's full checklist, actions, decision history, and
  append-only activity log expanding inline in an accordion row — no
  page navigation to work a gate. The rendering is shared via
  `src/components/GateDetail.tsx`, also used by a standalone
  `/projects/[projectNumber]/gates/[gateId]` route kept for direct
  linking. All wired to the real database, not mock data.
- **Seed data** (`prisma/seed.ts`) — the same running example used
  throughout every other document: BuildCare FM Ltd delivering Ward 12
  HVAC Replacement (`#20456`) for St Aldwyn NHS Trust, with Gate 5
  (Operations Review) excluded from scope to prove that mechanic, and
  Gate 2 left mid-flight — two deliverables evidenced, one legally
  significant deliverable (asbestos survey, CAR 2012) still pending, so
  you can actually exercise the bypass flow.
- **CI** (`../.github/workflows/ci.yml`) — typecheck and `next build`
  on every push and PR. No database service required: every route is
  dynamic (cookies()-based session), so the build never queries one.

## What's deliberately stubbed, not built

- **Authentication.** `src/lib/session.ts` is a dev-only "act as" cookie,
  set by the switcher in the header — trusts whatever it's told. Replace
  entirely before this is near a second real user.
- **Evidence storage.** Uploads record a file *name* against a
  deliverable, not an actual file — there's no object storage wired up.
- **Compliance Module, Resource/Capacity view, Financial view.** Phase 2–3
  per the PRD roadmap. The schema has no `ComplianceRuleSet` /
  `ComplianceRequirement` / `ComplianceOverride` / `ResourceAllocation` /
  `SpendRecord` tables yet — adding them is additive, not a rewrite, since
  they reuse the same checklist-item shape already in `DeliverableTemplate`.
- **Template authoring UI.** Phase 1 ships with one hardcoded template,
  seeded directly. The Compliance Rule Set editor sketched in the design
  screens has no backing code yet.

## Setup

Requires Node 20+ and a local PostgreSQL instance.

```bash
cd app
npm install
cp .env.example .env   # adjust DATABASE_URL if your Postgres differs
npm run db:migrate     # creates the schema
npm run db:seed        # loads the BuildCare / St Aldwyn example
npm run dev
```

Prisma config lives in `prisma.config.ts`, not `package.json` — it loads
`.env` itself via `dotenv/config`, since Prisma skips its own env-file
loading once a config file is present.

Open http://localhost:3000. Use the "Acting as" switcher in the header to
flip between Derek Gibb (PM), David Mackay (Sponsor), Gary Grant (Compliance
Officer), and Mark O'Hear (SRO) — the same names used in the PRD and
design screens — and watch what each one can and can't do on Gate 2,
right there in the expanded row, no navigation.

Things worth trying:

- As **Derek Gibb (PM)**: try to bypass the asbestos survey deliverable —
  the action isn't offered at all, because it requires SRO authority. You
  can still upload evidence for it, though — PM can supply evidence on
  any item, just not wave it through.
- As **Gary Grant (Compliance Officer)** or **Mark O'Hear (SRO)**:
  bypass it, with a reason — then note it can't be un-bypassed from the
  UI (there's no "undo" concept in the model, matching the audit-trail
  requirement). Check the activity log at the bottom of the gate — every
  action is recorded there, append-only.
- As **Derek Gibb (PM)** again, once Gate 2 is fully clear: submit for
  Sponsor approval.
- As **David Mackay (Sponsor)**: approve, or reject with a reason and watch
  the gate return to `IN_PROGRESS` with that reason attached.
- As **Derek Gibb (PM)**, on the project overview: reinstate Gate 5
  (Operations Review), excluded from this project by default — it
  appears at the bottom, after every other gate, not back in its
  original template position.

## Design reference

The visual design (colors, layout, the exact screens this scaffold's UI
is a plainer version of) lives in the published design canvas from this
project — ask for the link if you don't have it handy. This scaffold
prioritises correct data flow over matching that design pixel-for-pixel.
