# Building Management System (BMS) Replacement — PM Guidance Audit (2026-09-10)

## Source: `Building Management System Replacement.docx`

## Verdict: Needs fixes (two findings, otherwise strong)

## Completeness findings
1. **Stage 4 — same generic "Building Regulations / statutory compliance information" terminology issue found across this batch** (see `boiler-heating-plant.md` for the full reasoning). Should be Scotland's Building Warrant / Building (Scotland) Regulations 2004 / Schedule 3.
2. **Cybersecurity design references are vague — "Current NHS / national guidance" doesn't name an actual instrument.** A BMS/BEMS is an operational-technology (OT) network controlling critical plant (heating, ventilation, critical-environment monitoring) — this is a genuine, non-trivial risk area, not boilerplate. The UK's **Network and Information Systems (NIS) Regulations 2018** designate NHS bodies as Operators of Essential Services, and there are Scotland-specific NHS cyber resilience/assurance frameworks — recommend naming a specific instrument here (verify the current exact Scottish NHS cyber-assurance framework name via a fresh check before citing it, since this project's own discipline is never to assert a specific document title without verification) rather than leaving "current NHS / national guidance" as an unverifiable placeholder a PM can't actually action.

## Redundancy / unnecessary-step findings
None found. The file correctly notes that minor point-additions for new plant are covered within each system-specific checklist, not duplicated here — this is a deliberate, sensible scope boundary, not a gap.

## Citations checked
- "Building Regulations" — flagged above.
- SHTM 00/03-01/04-01/06 series/08-02/82, CIBSE Guide H, BSRIA BG1/2020 & BG9/2011, BS EN ISO 16484 — all current, correctly applied.
- "Cybersecurity standards and relevant SHTMs" (Cross-Stage) and "current NHS / national guidance" (Stage 4) — both too vague to action; flagged above.
