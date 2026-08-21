# StageForge

[![CI](https://github.com/kevinfotheringham1973-cloud/stageforge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kevinfotheringham1973-cloud/stageforge/actions/workflows/ci.yml)

A cloud platform giving regulated Hard FM programmes a single system of
record for stage-gate delivery: every stage carries a deliverables
checklist, every deliverable needs uploaded evidence, and a gate can't
close without a Sponsor's sign-off against that evidence. Compliance runs
as a concurrent, config-driven module alongside delivery, with a tiered
override ladder (PM → Compliance Officer → SRO) for anything that carries
legal weight.

Initial target: Hard FM maintenance in hospitals, starting with a single
NHS Trust programme. Built to re-skin for other regulated Hard FM sectors
(defence, justice, transport) once Health is proven.

## What's in this repo

| Path | What it is |
| --- | --- |
| [`Overview.docx`](Overview.docx) | The original one-page concept note this whole project expands from. |
| [`PRD.html`](PRD.html) | Product requirements — vision, roles, roadmap, competitive landscape, governance rules. (draft v0.11) |
| [`DataModel.html`](DataModel.html) | Entity model — tenancy/access resolution, the gate-closure mechanism, tiered bypass/override authority. (draft v0.5) |
| [`ConfigSchema.html`](ConfigSchema.html) | Config schema for Stage/Gate/Deliverable templates and Compliance rule sets. (draft v0.4) |
| [`ProvisioningModel.html`](ProvisioningModel.html) | Design for AI-assisted project provisioning — the draft/review/activate flow and the LLM call itself (structured-output enforcement, model/prompt-caching design). (draft v0.3 — built in `app/`, see Status below; its template-matching step has since been superseded by a deterministic dropdown, per `PRD.html` §10) |
| [`ResourceCapacityModel.html`](ResourceCapacityModel.html) | Design for the Resource/Capacity view — % FTE allocation per delivery-facing role holder, current-state only, no forecasting. (draft v0.1 — built in `app/`, see Status below) |
| [`FinancialModel.html`](FinancialModel.html) | Design for the Financial View — invoice-level spend checked and approved at each gate, classified into three Hard FM approval buckets, with a Sponsor/SRO approval step. (draft v0.2 — gate-level record/approve loop built in `app/`, see Status below) |
| [`Complaince and Regulations.docx`](Complaince%20and%20Regulations.docx), [`Maintenance schedule - SHTM.docx`](Maintenance%20schedule%20-%20SHTM.docx), [`Example_Overview_Plan.docx`](Example_Overview_Plan.docx) | Domain reference material for Scottish NHS Hard FM — the compliance/regulatory stack, an SHTM-mapped PPM schedule by plant category, and a full worked example (Forth Valley Royal Hospital UPS replacement) the current seed data is built from. |
| [`design/`](design) | Design canvas source — screens for every role (PM, Sponsor, Compliance Officer, Finance, Resource Manager) as Design Component artboards. |
| [`app/`](app) | Working Phase 1 MVP scaffold — Next.js, PostgreSQL, Prisma, TypeScript. See [`app/README.md`](app/README.md) for setup and what's actually built vs. stubbed. |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | CI — typecheck and build `app/` on every push and PR to `main`. |

The HTML documents are self-contained — open any of them directly in a
browser to read.

## Status

Every open question from the original concept note has been resolved and
is reflected in the PRD. Phase 1 (Stage-Gate Engine, Deliverable/Evidence,
tiered bypass authority, Sponsor sign-off, audit trail, multi-tenancy) and
Phase 2's Compliance Module (config-driven rule sets, live gate-closure
enforcement, SRO override) both have a working scaffold, verified
end-to-end against a real database and a live browser session.

The Template library now covers 17 Hard FM systems for the Health
reference implementation (Boiler, Steam, Compressed Air, Ventilation,
Medical Gases, Fire Alarm & Detection, Fire Suppression, Lifts,
Electrical Services, Lighting, Domestic Hot & Cold Water, Chilled
Water/Cooling, Above-Ground Drainage, BMS, Security, Pneumatic Tube,
Nurse Call), each mapped from a real RIBA/SHTM-aligned source document.
Building it out surfaced real authority-modelling gaps, now fixed:
isolation/permit deliverables require the relevant discipline
Authorised Person rather than a generic SRO sign-off, Compliance
Officer bypass authority no longer inherits down into ordinary PM-tier
deliverables outside its own remit, and fire-safety items require a
dedicated Fire Officer authority tier — an SRO has no legal standing
over fire compliance.

AI-assisted project provisioning (`ProvisioningModel.html`) is built
and verified live, though its original template-matching design has
since been revised (`PRD.html` §10): real usage showed the LLM
occasionally guessing the wrong discipline from an ambiguous
description, so `/projects/new` now has an explicit Template dropdown
— the PM picks the system directly — and the LLM's role narrows to
proposing the compliance-tag set for it. A Compliance Officer still
reviews and approves before the project goes live. Kevin's HAI-SCRIBE
involvement-intensity matrix is also operational: five systems rated
sustained High infection-control involvement get extra compliance
checkpoints across the project lifecycle, driven by which Template
matched rather than left to the LLM. The Resource/Capacity view
(`ResourceCapacityModel.html`) is built too — % FTE allocation per
delivery-facing role holder, with a portfolio-wide over-allocation view
— see `app/README.md` for how to run any of this yourself.

A screen-by-screen UX audit (benchmarked against Linear, Asana/Monday,
and enterprise PPM tools) drove several rounds of fixes, ending at
8.1/10 — including an accessibility pass verified against the live
Windows accessibility tree (the same API screen readers consume, not
just code inspection): every form label given a real programmatic
association with its field, WCAG contrast measured and corrected, and
heading structure added across every screen.

Financial View (`FinancialModel.html`) is built too, gate-level: spend is
recorded, checked, and approved at each gate rather than just logged
against the project, folding into the same closure check as the delivery
and compliance checklists, with a project-level roll-up visible at a
glance on the project overview. The portfolio-wide `/finance` route
remains unbuilt.

A Timeline is built alongside it: PM-set target start/end dates per
gate, actual dates stamped automatically the moment a gate really
starts or finishes, and a colour-coded planned-vs-actual health status
(on track / overdue / completed on time or late) — both as a Gantt-style
high-level chart on the project overview and a per-gate breakdown.

## Contributing

`main` is protected: every change goes through a pull request, and the
CI check above must pass before it can merge — no direct pushes, no
exceptions (applies to admins too).

```bash
git checkout -b your-branch-name
# make changes
git push -u origin your-branch-name
gh pr create
```

## Configuration

The scaffold needs a `DATABASE_URL`. Copy [`app/.env.example`](app/.env.example)
to `app/.env` and point it at your own PostgreSQL instance — `.env` is
gitignored and never committed. AI-assisted provisioning additionally
needs an `ANTHROPIC_API_KEY` (get one from console.anthropic.com) —
everything else in the app works without it. Full setup steps are in
[`app/README.md`](app/README.md).

## License

Proprietary — see [`LICENSE`](LICENSE).
