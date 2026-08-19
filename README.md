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
| [`PRD.html`](PRD.html) | Product requirements — vision, roles, roadmap, competitive landscape, governance rules. (draft v0.10) |
| [`DataModel.html`](DataModel.html) | Entity model — tenancy/access resolution, the gate-closure mechanism, tiered bypass/override authority. (draft v0.5) |
| [`ConfigSchema.html`](ConfigSchema.html) | Config schema for Stage/Gate/Deliverable templates and Compliance rule sets. (draft v0.4) |
| [`ProvisioningModel.html`](ProvisioningModel.html) | Design for AI-assisted project provisioning — template-library matching, the draft/review/activate flow, and the LLM call itself (structured-output enforcement, model/prompt-caching design). (draft v0.3 — built in `app/`, see Status below) |
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

AI-assisted project provisioning (`ProvisioningModel.html`) is also
built and verified live: a free-text project description matched via
Claude Opus 5 against the Template library, reviewed and approved by
a Compliance Officer, instantiating a real project — see
`app/README.md` for how to run any of this yourself.

Resource/Capacity view and Financial view remain Phase 2–3 per the PRD
roadmap, designed (in `PRD.html`, `DataModel.html`, and the design
screens) but not yet built in `app/`.

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
