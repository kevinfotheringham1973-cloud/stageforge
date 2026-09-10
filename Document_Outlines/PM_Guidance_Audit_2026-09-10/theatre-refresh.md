# Theatre Refresh — PM Guidance Audit (2026-09-10)

## Source: seed.ts only (`app/prisma/seed.ts`, `theatreRefreshTemplate`, line ~3331) — no docx counterpart exists

## Verdict: Clean

## Completeness findings
None found. Correctly adds an ultra-clean ventilation validation deliverable at Gate 6 (`del.theatrerefresh_ventilation_validation`, SHTM 03-01 Part B, `AUTHORISED_PERSON_VENTILATION` bypass authority) specifically because finishes/ceiling works can disturb the theatre's ventilation canopy or envelope — a genuinely theatre-specific risk that the generic Room or Ward Refresh template correctly does not carry.

## Redundancy / unnecessary-step findings
None found. Checked directly against both `Room,Ward or Theatre Refresh.docx` (docx) and `mhuLigatureTemplate` (seed.ts, same lineage) — Theatre Refresh is properly differentiated, not a near-duplicate of either: it omits MHU-specific ligature/tool-control content and adds the theatre-specific ventilation validation neither of the other two carries.

## Citations checked
- SHTM 00, SHTM 03-01 Part B, HAI-SCRIBE Stages 1–4, CDM 2015, Firecode — all standard, current, correctly applied.

## Cross-cutting rule verification
Confirmed true, same mechanism verified for the other seed-only templates: PVG/DSEAR/RPA apply via generic stage-key + tag matching, not per-template.
