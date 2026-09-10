# Lighting & Electrical Distribution Replacement — PM Guidance Audit (2026-09-10)

## Source: seed.ts only (`app/prisma/seed.ts`, `lightingTemplate`, line ~1002) — no docx counterpart exists

## Verdict: Clean

## Completeness findings
None found. Emergency/escape lighting continuity during works is captured at Gate 1 (briefing) as well as tested/certified at Gates 5–6, not left as a single late checkpoint. Circuit-capacity confirmation before design proceeds (Gate 3) correctly precedes the technical design package. EIC certification under BS 7671 present at handover.

## Redundancy / unnecessary-step findings
None found. Description correctly delineates scope from Electrical Services Replacement (standby power/UPS/generators/switchgear resilience) even though both templates touch emergency lighting — Electrical Services covers emergency lighting *design as part of overall resilience*, this template covers the *luminaire/circuit retrofit* itself; the split is real, not arbitrary, and the two descriptions cross-reference each other correctly.

## Citations checked
- BS 7671 (IET Wiring Regulations), BS 5266 (emergency lighting), BS EN 12464-1 (lighting of workplaces) — all standard, current, correctly applied.

## Cross-cutting rule verification
Confirmed true, same mechanism as verified for Drainage & Foul Water: PVG/DSEAR/RPA are matched by generic stage key + tag, not per-template, so they apply here automatically with no special-casing required. DSEAR does not apply (no dangerous-substance angle in a lighting retrofit) — correct exclusion.
