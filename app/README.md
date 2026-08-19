# StageForge — Phase 1 scaffold

A working scaffold of the StageForge Phase 1 MVP, built directly on the
decisions in `../PRD.html`, `../DataModel.html`, and `../ConfigSchema.html`.
Next.js (App Router) + PostgreSQL + Prisma, TypeScript throughout.

## What's actually built

- **Prisma schema** (`prisma/schema.prisma`) — tenancy (`Company` →
  `Department` → `ProjectRoleAssignment`, never a direct link to
  `Project`), the template hierarchy (`Template` → `StageTemplate` →
  `GateTemplate` → `DeliverableTemplate`), the compliance corpus
  (`ComplianceRuleSet` → `ComplianceRuleTemplate` →
  `ComplianceRequirement` → `ComplianceOverride`), AI-assisted
  provisioning (`Project.status` DRAFT/ACTIVE, `ProvisioningReview`),
  and the live instances (`Project` → `Stage` → `Gate` → `Deliverable`
  / `ComplianceRequirement` → their evidence/bypass/override rows),
  plus `GateSignOff` and an append-only `AuditLogEntry`.
- **Governance logic** (`src/lib/permissions.ts`) — pure functions, no DB
  dependency: the tiered bypass-authority ladder (PM → Compliance Officer
  → SRO), the Sponsor-only gate decision rule, and the gate-closure AND
  condition (every blocking deliverable *and* every blocking compliance
  requirement evidenced/bypassed/overridden).
- **Server actions** (`src/lib/actions.ts`) — bypass a deliverable, upload
  or replace evidence (delivery and compliance both), submit/approve/reject
  a gate, an SRO override that clears every outstanding compliance
  requirement on a gate in one action, reinstate a previously-excluded
  stage, and the full AI-assisted provisioning flow (`createProvisioningDraft`
  → `reviseProvisioningBrief` / `updateProvisioningDraft` /
  `requestProvisioningRevision` → `approveProvisioning`).
- **AI-assisted provisioning** (`src/lib/provisioning.ts`) — a free-text
  project description is matched against the `Template` library via
  Claude Opus 5 with Zod-enum-constrained structured outputs (the
  templateId/tags enums are built fresh from the database at call
  time, so an invalid pick is structurally impossible, not just
  discouraged). See `../ProvisioningModel.html` for the full design.
  Requires `ANTHROPIC_API_KEY` — see Setup below.
- **Screens** — a project's gate overview (`/projects/[projectNumber]`),
  `/projects/new` (provisioning entry) and
  `/projects/[projectNumber]/provisioning` (match review). The gate
  overview expands every gate's full delivery + compliance checklist,
  actions, decision history, and append-only activity log inline — no
  page navigation to work a gate. Shared via `src/components/GateDetail.tsx`,
  also used by a standalone `/projects/[projectNumber]/gates/[gateId]`
  route. All wired to the real database, not mock data.
- **Seed data** (`prisma/seed.ts`) — two RIBA-aligned Templates
  (M&E Systems Replacement, Water Systems Replacement) and two demo
  projects for Serco Health : FVRH Scotland delivering work for FVRH
  NHS: **#20456**, UPS Systems Replacement — left mid-flight on Gate 3
  (Spatial Coordination) with delivery and compliance items both
  outstanding, so you can exercise the bypass/override flow — and
  **#20777**, Ward 6-8 Calorifier Replacement, created live through
  the AI-assisted provisioning flow and kept as a permanent second
  example (real Claude Opus 5 match/reasoning, replayed here so the
  demo works without an API key).
- **CI** (`../.github/workflows/ci.yml`) — typecheck and `next build`
  on every push and PR. No database service required: every route is
  dynamic (cookies()-based session), so the build never queries one.

## What's deliberately stubbed, not built

- **Authentication.** `src/lib/session.ts` is a dev-only "act as" cookie,
  set by the switcher in the header — trusts whatever it's told. Replace
  entirely before this is near a second real user.
- **Evidence storage.** Uploads record a file *name* against a
  deliverable, not an actual file — there's no object storage wired up.
- **Resource/Capacity view, Financial view.** Phase 2–3 per the PRD
  roadmap. No `ResourceAllocation` / `SpendRecord` tables yet.
- **Template authoring UI.** Both Templates are hand-authored in
  `seed.ts`. The Compliance Rule Set editor sketched in the design
  screens has no backing code yet — the compliance corpus is
  hand-authored in `seed.ts` too.
- **Provisioning role assignment.** `createProvisioningDraft` only
  settles the creator as PM — assigning the rest of a project's roles
  (Sponsor, SRO, FM Contractor, Client Authority) isn't wired into the
  flow yet (`ProvisioningModel.html` §05/§08 open question).

## Setup

Requires Node 20+ and a local PostgreSQL instance.

```bash
cd app
npm install
cp .env.example .env   # adjust DATABASE_URL if your Postgres differs
npm run db:migrate     # creates the schema
npm run db:seed        # loads the two Templates and two demo projects
npm run dev
```

Prisma config lives in `prisma.config.ts`, not `package.json` — it loads
`.env` itself via `dotenv/config`, since Prisma skips its own env-file
loading once a config file is present.

For AI-assisted provisioning (`/projects/new`) specifically, also add an
`ANTHROPIC_API_KEY` to `.env` (get one from console.anthropic.com — see
`.env.example`). Everything else in the app works without it; only
creating/revising a provisioning draft needs it.

Open http://localhost:3000. Use the "Acting as" switcher in the header to
flip between Derek Gibb (PM), David Mackay (Sponsor), Gary Grant (Compliance
Officer), and Mark O'Hear (SRO) — the same names used in the PRD and
design screens — and watch what each one can and can't do, right there
in the expanded gate row, no navigation.

Things worth trying, on **#20456** (UPS Systems Replacement, Gate 3 —
Spatial Coordination):

- As **Derek Gibb (PM)**: try to bypass the "Fire compartmentation" deliverable
  or upload evidence for the compliance requirements — the bypass action isn't
  offered at all for the deliverable, because it requires SRO authority; you
  can still upload evidence for it, and you can evidence compliance items
  directly since PM has that authority.
- As **Mark O'Hear (SRO)**: bypass the deliverable, and use "Override all
  outstanding" on the compliance section — one action clears every
  outstanding compliance requirement on the gate at once, not item by item.
  Neither can be undone from the UI (no "undo" concept, matching the
  audit-trail requirement) — check the activity log at the bottom, every
  action is recorded there, append-only.
- As **Derek Gibb (PM)**, once the gate is fully clear (delivery *and*
  compliance): submit for Sponsor approval.
- As **David Mackay (Sponsor)**: approve, or reject with a reason and watch
  the gate return to `IN_PROGRESS` with that reason attached.
- As **Derek Gibb (PM)**, on the project overview: reinstate Gate 7 (Use),
  excluded from this project by default — it appears at the bottom, after
  every other gate, not back in its original template position.

And with an `ANTHROPIC_API_KEY` configured, try **AI-assisted
provisioning** end to end: click "+ New project" in the header, describe
a piece of Hard FM work (e.g. an air handling unit or lift replacement),
and watch it match against the Template library. Then, as **Gary Grant
(Compliance Officer)**, review the proposed match/tags/reasoning on the
review page — override the template or tags directly, send it back for
revision with a reason, or approve to instantiate the project for real.

## Design reference

The visual design (colors, layout, the exact screens this scaffold's UI
is a plainer version of) lives in the published design canvas from this
project — ask for the link if you don't have it handy. This scaffold
prioritises correct data flow over matching that design pixel-for-pixel.
