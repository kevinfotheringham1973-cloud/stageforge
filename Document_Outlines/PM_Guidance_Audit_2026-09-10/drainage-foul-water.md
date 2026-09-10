# Drainage & Foul Water System Replacement — PM Guidance Audit (2026-09-10)

## Source: seed.ts only (`app/prisma/seed.ts`, `drainageTemplate`, line ~773) — no docx counterpart exists

## Verdict: Clean

## Completeness findings
None found. Full 8-gate sequencing present (Strategic Definition through Use), including a real Pre-Contract Hold Point at Gate 4, drain testing/CCTV verification before backfill at Gate 5 (correctly flagged as non-bypassable at PM level), and a trade-effluent/grease-management handover step at Gate 6. Correctly scoped against BS EN 12056, Building (Scotland) Regulations Section 3, SHTM 64, and the Water Environment (Controlled Activities) (Scotland) Regulations 2011.

## Redundancy / unnecessary-step findings
None found. Description correctly delineates scope from both Domestic Hot & Cold Water (supply, not drainage) and Above-ground Drainage & Public Health Systems (in-building stacks, not below-ground). No overlap with the new Catering Kitchen Equipment or Waste Management Systems checklists built tonight — this template's kitchen-drainage content (grease trap, trade effluent) is specifically about the drainage/consent process, not the kitchen equipment or clinical-waste-handling plant those new checklists cover.

## Citations checked
- BS EN 12056, SHTM 64, Building (Scotland) Regulations 2004 Section 3, Water Environment (Controlled Activities) (Scotland) Regulations 2011 — all standard, current, correctly applied; no changes found.

## Cross-cutting rule verification
Confirmed true: `comp.pvg_scheme_membership` (`appliesToStageKeys: ["stage.manufacturing_construction"], appliesIfTags: []`) is matched purely by stage key with an empty tag requirement, and `createStageAndGateTemplates(drainageTemplate.id)` generates the same generic `stage.manufacturing_construction` key as every other template — so PVG applies automatically here with zero special-casing needed, verified directly in `app/src/lib/provisioning.ts`'s `matchComplianceTags`, not assumed. DSEAR (`appliesIfTags: ["dsear_dangerous_substances_affected"]`) correctly does NOT apply by default, since drainage work has no genuine dangerous-substance/explosive-atmosphere angle — consistent with this project's established "don't force-fit an irrelevant topic" discipline.
