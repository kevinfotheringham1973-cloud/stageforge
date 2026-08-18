# StageForge

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
| [`PRD.html`](PRD.html) | Product requirements — vision, roles, roadmap, competitive landscape, governance rules. (draft v0.8) |
| [`DataModel.html`](DataModel.html) | Entity model — tenancy/access resolution, the gate-closure mechanism, tiered bypass/override authority. (draft v0.5) |
| [`ConfigSchema.html`](ConfigSchema.html) | Config schema for Stage/Gate/Deliverable templates and Compliance rule sets. (draft v0.4) |
| [`design/`](design) | Design canvas source — screens for every role (PM, Sponsor, Compliance Officer, Finance, Resource Manager) as Design Component artboards. |
| [`app/`](app) | Working Phase 1 MVP scaffold — Next.js, PostgreSQL, Prisma, TypeScript. See [`app/README.md`](app/README.md) for setup and what's actually built vs. stubbed. |

The HTML documents are self-contained — open any of them directly in a
browser to read.

## Status

Every open question from the original concept note has been resolved and
is reflected in the PRD. Phase 1 (Stage-Gate Engine, Deliverable/Evidence,
tiered bypass authority, Sponsor sign-off, audit trail, multi-tenancy) has
a working scaffold, verified end-to-end against a real database and a
live browser session — see `app/README.md` for how to run it yourself.

Compliance Module, Resource/Capacity view, and Financial view are
Phase 2–3 per the PRD roadmap and are designed (in `PRD.html`,
`DataModel.html`, and the design screens) but not yet built in `app/`.

## Configuration

The scaffold needs a `DATABASE_URL`. Copy [`app/.env.example`](app/.env.example)
to `app/.env` and point it at your own PostgreSQL instance — `.env` is
gitignored and never committed. Full setup steps are in
[`app/README.md`](app/README.md).

## License

Proprietary — see [`LICENSE`](LICENSE).
