# Mental Health Unit Ligature & Room Refresh — PM Guidance Audit (2026-09-10)

## Source: seed.ts only (`app/prisma/seed.ts`, `mhuLigatureTemplate`, line ~3218) — no docx counterpart exists

## Verdict: Needs fixes

## Completeness findings
**Real citation gap found**: the Gate 1 deliverable `del.mhu_ligature_risk_assessment` cites only "Design guidance for Mental Health environments and anti-ligature product standards" — this is vague and doesn't name an actual source document, unlike every other citation in this template (which correctly name SHTM 00, HAI-SCRIBE stages, CDM 2015, etc.). Verified via WebSearch that a real, current, Scotland-specific primary source exists and should be cited instead: **HBN 03-01 "Mental Health – Adult Acute Units"** (published via NHS National Services Scotland/Health Facilities Scotland), which itself is required to incorporate the **NHSScotland Mental Health Built Environment (mHBE) Quality and Safety Policy Letter and Assessment Toolkit**. Recommend updating the citation on this deliverable (and the Key Principles/guidance text, if any exists at the docx-authoring stage for this system in future) to name HBN 03-01 and the mHBE Quality and Safety Policy Letter specifically, rather than the generic unsourced phrase currently used.

No other completeness gaps found — tool control/room security (`del.mhu_tool_control_room_security`) is a genuinely distinct, well-justified deliverable given the sharps/self-harm risk profile, and ligature safety verification at handover is correctly marked non-bypassable.

## Redundancy / unnecessary-step findings
None found. Checked directly against both `Room,Ward or Theatre Refresh.docx` (docx) and `theatreRefreshTemplate` (seed.ts, same lineage) — MHU Ligature is properly differentiated, not a near-duplicate: it has genuinely distinct content (ligature risk assessment, anti-ligature ironmongery, tool/sharps control during construction) that neither of the other two templates carries, and it correctly omits Theatre-specific content (ultra-clean ventilation validation) that wouldn't apply to a ward setting.

## Citations checked
- SHTM 00, HAI-SCRIBE Stages 1–4, CDM 2015, Building (Scotland) Regulations, Firecode — all standard, current, correctly applied.
- The one gap is documented above under Completeness findings.

## Cross-cutting rule verification
Confirmed true, same mechanism verified for the other seed-only templates: PVG/DSEAR/RPA apply via generic stage-key + tag matching, not per-template — no special-casing needed or missing here.
