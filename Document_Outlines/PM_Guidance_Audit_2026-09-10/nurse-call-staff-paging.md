# Nurse Call & Staff Paging Systems Replacement — PM Guidance Audit (2026-09-10)

## Source: seed.ts only (`app/prisma/seed.ts`, `nurseCallTemplate`, line ~1887) — no docx counterpart exists (absorbed content from `Electronis communication systems.docx`)

## Verdict: Clean

## Completeness findings
None found. This template correctly uses a genuinely different governance model from every other checklist in the library — clinical sign-off (`CLINICAL_SAFETY_OFFICER`) rather than an engineering AP/AE — grounded in NHS Digital's DCB0129/DCB0160 clinical risk management standard for safety-related health IT, which is a real, distinct compliance regime, not an invented tier. Temporary system cover during works and final clinical acceptance are both correctly marked non-bypassable at PM level, reflecting genuine patient-safety risk if nurse call/staff-attack alerting is degraded.

## Redundancy / unnecessary-step findings
None found. Correctly scoped apart from Fire Alarm & Detection (integration only, not duplicated content) and from the wider Electrical Services template (power resilience referenced by SHTM 06 series, not re-specified).

## Citations checked
- SHTM 08-03 (Bedhead services), SHTM 08-01 (Acoustics), SHTM 06 series — standard, current, correctly applied.
- DCB0129/DCB0160 (NHS Digital clinical safety case standard) — real, current standard; correctly distinguished from a general engineering commissioning sign-off.

## Cross-cutting rule verification
Confirmed true, same mechanism verified for the other seed-only templates: PVG applies automatically via generic stage-key matching. DSEAR correctly does not apply (no dangerous-substance angle).
