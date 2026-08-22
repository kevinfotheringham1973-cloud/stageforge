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
  `ResourceAllocation` (% FTE per delivery-facing role holder), gate-level
  `SpendRecord` / `SpendApproval` (Financial View), `Gate.targetStartDate`
  / `targetEndDate` / `actualStartDate` / `actualEndDate` (Timeline —
  target dates are PM-set planning input, actual dates are stamped
  automatically the moment a gate really starts/finishes, never
  user-entered), and the live instances (`Project` → `Stage` → `Gate` →
  `Deliverable` / `ComplianceRequirement` / `SpendRecord` → their
  evidence/bypass/override/approval rows), plus `GateSignOff` and an
  append-only `AuditLogEntry`.
- **Governance logic** (`src/lib/permissions.ts`) — pure functions, no DB
  dependency: bypass/override authority, the Sponsor-only gate decision
  rule, the gate-closure AND condition (every blocking deliverable, every
  blocking compliance requirement, *and* every blocking spend record —
  evidenced/bypassed/overridden/approved as applicable), and
  `gateTimelineStatus` — planned-vs-actual health per gate (on track /
  overdue / completed on time or late), colour-coded consistently
  everywhere it's shown. Authority isn't a single PM → Compliance Officer
  → SRO ladder: SRO is the one apex that can act at any lower tier, but
  every other named authority — Fire Officer, each discipline's
  Authorised Person (Electrical/Water/Ventilation/Medical Gases),
  Clinical Safety Officer, Information Governance Officer — is an
  *exact-match* requirement even Compliance Officer doesn't inherit into
  (`EXACT_MATCH_AUTHORITIES`). A fire-safety item needs the Fire Officer
  specifically; an isolation/permit item needs the relevant discipline AP
  specifically.
- **Server actions** (`src/lib/actions.ts`) — bypass a deliverable, upload
  or replace evidence (delivery and compliance both), submit/approve/reject
  a gate, an SRO override that clears every outstanding compliance
  requirement on a gate in one action, reinstate a previously-excluded
  stage, set a team member's % FTE allocation, record/approve/reject
  gate-level spend, set a gate's target start/end dates, and the full
  AI-assisted provisioning flow
  (`createProvisioningDraft` → `reviseProvisioningBrief` /
  `updateProvisioningDraft` / `requestProvisioningRevision` →
  `approveProvisioning`).
- **AI-assisted provisioning** (`src/lib/provisioning.ts`) — `/projects/new`
  has an explicit "System / Template" dropdown (`listMatchableTemplates`):
  the PM picks the discipline directly rather than an LLM guessing it
  from free text, which real usage showed getting it wrong on ambiguous
  briefs. The LLM's role narrows to `matchComplianceTags` — proposing
  which compliance tags apply (occupied/live site, National Treatment
  Centre, etc.) for the already-chosen template — via Claude Opus 5 with
  a Zod-enum-constrained structured output (the tag enum is built fresh
  from the database at call time, so an invalid pick is structurally
  impossible, not just discouraged). A Compliance Officer's review
  correspondingly narrows to "are these tags right," not "is this the
  right template." See `../ProvisioningModel.html` for the original
  design and `../PRD.html` §10 for why the template-matching step was
  superseded. Requires `ANTHROPIC_API_KEY` — see Setup below.
- **Works Packages** (`src/lib/worksPackages.ts`, `WorksPackage` model) —
  a hospital runs 24/7, so a disruption window is precious; extra
  opportunistic work often bundles into it rather than disrupting the
  same space twice (e.g. redesigning the kitchen drainage while it's
  cleared out is reason enough to also upgrade the ventilation and
  relamp the lighting). A `WorksPackage` is purely an organisational
  label linking otherwise-independent, discipline-pure projects — never
  a merge of their checklists, which stay exactly as correct and
  discipline-specific as a solo project's. Set on `/projects/new` (an
  existing-package dropdown or a new-package name field) — a solo
  project can't currently be reassigned to a package after creation.
  Shown as a small badge on the portfolio and each project's dashboard,
  cross-linking to sibling projects, with a "+ Add a system" shortcut
  straight into `/projects/new` with that package pre-selected
  (`?worksPackageId=`) — no re-finding it in the dropdown. The package
  name links to `/works-packages/[id]`, a combined overview rolling up
  spend and outstanding deliverables/compliance across every project in
  the package alongside each one's own row — "assess the full project"
  as one disruption window, not just its pieces one dashboard at a time.
  No effect on instantiation, tags, or bypass/override authority. The
  works-package box on `/projects/new` itself is also where you start
  several systems at once — the actual point behind the requirement (21 Aug
  2026): "there are times when multiple systems... required," and a
  first cut that hid the multi-system checkboxes in a separate,
  disconnected accordion below the package box was "useless... unless
  it adds additional system packages." One form now: pick the primary
  system up top as always, then in the works-package box check off
  whichever other systems ride along in the same disruption window — a
  package name (existing or new) becomes required the moment anything
  extra is checked, since that's what links them. `createProvisioningDraft`
  creates the primary project plus one DRAFT sibling per additional
  system checked, all in the same submission and the same package.
  Each still needs its own Compliance Officer review before going live
  — bundling several systems only replaces re-filling the form once
  per system, not the review step.
- **Screens** — the portfolio (`/`, current gate/cost/outstanding per
  project, plus scheduled-report management), a project dashboard
  (`/projects/[projectNumber]`), a portfolio-wide Resource/Capacity view
  (`/resources`, stacked-bar allocation with a 100%-capacity marker), a
  portfolio-wide Finance view (`/finance`, spend total/approved/pending
  per project and per bucket), a portfolio-wide Lessons Learned library
  (`/lessons-learned`, grouped by gate so a recurring mistake at the same
  lifecycle point is visible across projects), `/projects/new`
  (provisioning entry, System/Template dropdown), `/projects/[projectNumber]/provisioning` (match review), and
  `/works-packages/[id]` (combined view across a Works Package's member
  projects). Every screen has real heading structure (`h1`→`h2`/`h3`) and every form
  control a genuine programmatic label — see "Accessibility" below.
  The project dashboard (confirmed 19 Aug
  2026, after comparing a mockup against the original scrolling
  accordion) is a persistent shell — `(dashboard)/layout.tsx` — with
  three KPI cards (Cost, Gate Activity, Timeline headline) and a
  full-width Gantt-style chart (target vs. actual per gate, colour-coded,
  a "today" marker) always visible, and a side rail (colour-dot per
  gate's timeline/status health) that switches the panel below between
  "Team & scope" and each gate's full detail — real routes
  (`/projects/[projectNumber]/gates/[gateId]`), not client tab state, so
  every panel is its own bookmarkable/shareable URL and only that
  panel's data is fetched. `GateRail.tsx` is the one client component in
  the whole dashboard (just enough to highlight the active link via
  `usePathname()`); everything else — the layout, the KPI math, the gate
  panel itself (`src/components/GateDetail.tsx`, showing timeline +
  delivery + compliance + spend checklists, actions, decision history,
  append-only activity log) — is server-rendered. All wired to the real
  database, not mock data.
- **Seed data** (`prisma/seed.ts`) — 17 RIBA-aligned Templates covering
  the Health reference implementation's Hard FM systems (Boiler, Steam,
  Compressed Air, Ventilation, Medical Gases, Fire Alarm & Detection,
  Fire Suppression, Lifts, Electrical Services, Lighting, Domestic Hot &
  Cold Water, Chilled Water/Cooling, Above-Ground Drainage, BMS,
  Security, Pneumatic Tube, Nurse Call), each built from the
  RIBA/SHTM-aligned source documents (kept in the repo root for
  traceability), plus one retired Template (Cold Water Storage &
  Distribution, merged into Domestic Hot & Cold Water — `matchKeywords`
  cleared so it can't be selected again, row kept since a live project
  still references it) and five demo projects for Serco Health : FVRH
  Scotland delivering work for FVRH NHS: **#20456**, UPS Systems
  Replacement — left mid-flight on Gate 3 (Spatial Coordination) with
  delivery, compliance, and spend items outstanding, so you can exercise
  the bypass/override/approve flow; **#20777**, Ward 6-8 Calorifier
  Replacement (now on the merged Domestic Hot & Cold Water template),
  created live through the AI-assisted provisioning flow and kept as a
  permanent example; **#55998**, Main Kitchen Drainage Replacement;
  **#30001**, Main Water Tank Replacement; and **#30002**, LED Upgrade
  Throughout Hospital Corridors and Avenues.
- **Financial View — Finance role screens** (`src/app/finance/page.tsx`,
  `reviseSpend`, `deleteSpendRecord`) — a portfolio-wide `/finance` route,
  Finance's read-only equivalent of the Resource Manager's `/resources`:
  every live project's spend total/approved/pending and per-bucket split
  in one place, with a direct link to wherever a pending record is
  actually approved (this page never records or approves spend itself).
  A PM can revise a `PENDING` record's bucket/amount/description/invoice
  reference before approval, or delete one outright if it was logged in
  error — no more forcing a reject-then-record-again for a mistaken
  entry.
- **CI** (`../.github/workflows/ci.yml`) — typecheck and `next build`
  on every push and PR. No database service required: every route is
  dynamic (cookies()-based session), so the build never queries one.
- **Accessibility.** WCAG contrast measured against the actual token
  palette and corrected (`tailwind.config.ts`), every form label given a
  real `for`/`id` (or `aria-label` on repeated per-item fields, e.g. each
  deliverable's evidence/bypass inputs) rather than relying on
  placeholder text or visual proximity alone, and heading structure
  (`h1`→`h2`/`h3`) added across every screen. Verified against the live
  Windows UI Automation tree (the actual API Narrator/NVDA/JAWS consume),
  not just DOM inspection — see git history for the specific commit if
  you want the measurements. A follow-up demo-readiness pass (22 Aug
  2026) added plain-language guidance on top for less computer-confident
  users: the new-project form states up front that submitting creates a
  draft needing Compliance Officer (and possibly other role) approval
  before it goes live; the gate detail screen gained a plain
  Upload/Bypass/Override/Reject glossary and a spend-bucket explainer; a
  messaging bug was fixed where Gate 0 wrongly claimed earlier gates
  needed finishing first; and the Acting-as switcher and portfolio
  homepage both got added explanatory copy.

## What's deliberately stubbed, not built

- **Authentication.** `src/lib/session.ts` is a dev-only "act as" cookie,
  set by the switcher in the header — trusts whatever it's told. Replace
  entirely before this is near a second real user.
- **Evidence storage.** Uploads record a file *name* against a
  deliverable, not an actual file — there's no object storage wired up.
- **Template authoring UI.** All 17 Templates are hand-authored in
  `seed.ts`. The Compliance Rule Set editor sketched in the design
  screens has no backing code yet — the compliance corpus is
  hand-authored in `seed.ts` too.
- **Discipline-specific role assignment.** The hospital-wide standing
  team (PM, FM Contractor, Sponsor, Client Authority, Compliance
  Officer, SRO, Finance, Fire Officer) is auto-assigned to every project
  on creation (`assignStandardTeam`) — resolves the open question
  `ProvisioningModel.html` §05/§08 originally left open. Discipline-
  specific roles (Authorised Person per system, Authorising Engineer,
  Principal Designer) stay a manual per-project decision, deliberately —
  which discipline applies depends on what the project actually is.
  Four authorities used across the Template library — AP (Ventilation:
  Fiona Wallace), AP (Medical Gases: Graeme Paterson), Clinical Safety
  Officer (Sarah Chen), Information Governance Officer (Neil Forsyth) —
  now have a named holder in the seed cast, but none of the five fixed
  demo projects happen to gate anything on those authorities, so they
  won't show a role label in the Acting-as dropdown (same "manual
  per-project, only when relevant" pattern Bob/Claire/Ross already
  follow) or have anything to bypass/override until assigned to a
  project that actually needs them — e.g. provision one from the
  Ventilation, Medical Gases, Nurse Call, or Security template.

## Setup

Requires Node 20+ and a local PostgreSQL instance.

```bash
cd app
npm install
cp .env.example .env   # adjust DATABASE_URL if your Postgres differs
npm run db:migrate     # creates the schema
npm run db:seed        # loads the 17 Templates and five demo projects
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
flip between Derek Gibb (PM), David Mackay (Sponsor · Client Authority),
Gary Grant (Compliance Officer), Mark O'Hear (SRO), Alan McGeachie (Fire
Officer), Bob Smith (AP Electrical), Claire Duncan (AP Water), and Andrea
(Finance) — the same standing hospital team every project gets, plus
Dennis Kelly (a second PM), Ross Blair (Principal Designer), and Callum
Reid (platform admin, no delivery role — can delete a project) — and
watch what each one can and can't do, right there in the expanded gate
row, no navigation.

**Roles are per-project, not global.** The dropdown label next to each
name (e.g. "PM") is a deduped summary of every role that person holds
*anywhere*, not a guarantee they hold it on the project you're
currently looking at. Derek Gibb is PM on most demo projects, but
**#30002 (LED Upgrade) was actually created live by Dennis Kelly, so
Dennis is PM there and Derek only holds FM Contractor** — acting as
Derek on #30002 will look broken (no bypass, no upload, nothing
actionable) until you switch to Dennis. The app now states this
outright wherever it applies (a banner if you hold no role at all on a
project, inline notes like "Only the PM can..." next to anything
role-gated), so if something looks unavailable, look for that text
first — it's there, not a bug.

Fiona Wallace (AP Heating & Ventilation), Graeme
Paterson (AP Medical Gases), Sarah Chen (Clinical Safety Officer), and
Neil Forsyth (Information Governance Officer) are also in the cast, but
show no role label until assigned to a project that needs them — see
"Discipline-specific role assignment" above.

Things worth trying, on **#20456** (UPS Systems Replacement, Gate 3 —
Spatial Coordination):

- As **Derek Gibb (PM)**: try to bypass the "Fire compartmentation and
  ventilation impact assessment" deliverable — the bypass action isn't
  offered at all, because it requires Fire Officer authority specifically,
  not SRO (a real correctness fix: an SRO has no legal standing over fire
  compliance). You can still upload evidence for it, and you can evidence
  most other compliance items directly since PM has that authority.
- As **Mark O'Hear (SRO)**: try "Override all outstanding" on the
  compliance section — it clears the HAI-SCRIBE check (SRO authority) but
  can't clear the fire risk assessment, because that one's Fire-Officer-only
  and SRO doesn't inherit into it. This is deliberate, not a bug: SRO is the
  one apex authority that reaches every *other* tier, but Fire Officer,
  each discipline's Authorised Person, Clinical Safety Officer, and
  Information Governance Officer are exact-match requirements even SRO
  can't act through.
- As **Alan McGeachie (Fire Officer)**: bypass the fire compartmentation
  deliverable and evidence/override the fire risk assessment compliance
  item — only role in the cast that can. Nothing here can be undone from
  the UI (no "undo" concept, matching the audit-trail requirement) — check
  the activity log at the bottom, every action is recorded there,
  append-only.
- As **Derek Gibb (PM)**, once the gate is fully clear (delivery *and*
  compliance): submit for Sponsor approval.
- As **David Mackay (Sponsor)**: approve, or reject with a reason and watch
  the gate return to `IN_PROGRESS` with that reason attached.
- As **Derek Gibb (PM)**, on the project overview: reinstate Gate 7 (Use),
  excluded from this project by default — it appears at the bottom, after
  every other gate, not back in its original template position.
- As **Andrea (Finance)**: record a spend entry against Gate 3 — bucket,
  amount, description — and watch it show up as an outstanding item blocking
  that gate's submission, alongside the delivery and compliance checklists.
- As **David Mackay (Sponsor)** or **Mark O'Hear (SRO)**: approve or reject
  Andrea's spend entry. Rejecting requires a reason and leaves the record
  `PENDING`, editable — same "no dead ends" pattern as everywhere else.

And with an `ANTHROPIC_API_KEY` configured, try **AI-assisted
provisioning** end to end: click "+ New project" in the header, pick a
system from the dropdown (e.g. Ventilation & Air Handling), describe the
works (e.g. "replace 4 AHUs serving theatres, live occupied site,
phased weekends"), and watch the LLM propose compliance tags for it —
`occupied_during_works` in that example. Then, as **Gary Grant
(Compliance Officer)**, review the proposed tags on the review page —
override the template or tags directly, send it back for revision with a
reason, or approve to instantiate the project for real. As the drafting
PM, you can also self-service a wrong template pick via the "Revise
system, description & re-match tags" form, without needing the
Compliance Officer to catch it.

## Design reference

The visual design (colors, layout, the exact screens this scaffold's UI
is a plainer version of) lives in the published design canvas from this
project — ask for the link if you don't have it handy. This scaffold
prioritises correct data flow over matching that design pixel-for-pixel.
