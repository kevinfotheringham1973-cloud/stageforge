# Fire Alarm & Detection Systems — PM Guidance Audit (2026-09-10)

## Verdict: Needs fixes (minor)

## Completeness findings
- **Missing SHTM 85 reference.** The guidance table cites SHTM 81 (design of NEW healthcare premises), 83, 86 and 00 as supporting Firecode, but omits **SHTM 85 — "Fire precautions in existing healthcare premises"**. Confirmed current (not archived) via direct fetch of nss.nhs.scot. Since virtually every StageForge project is a replacement/upgrade in an *existing, occupied* hospital (not new-build), SHTM 85 is arguably more directly applicable than SHTM 81 for this checklist's actual use case. Recommend adding SHTM 85 to the guidance table and to Stage 1 (existing system condition survey) and Stage 4 (Building Regulations/statutory compliance) rows.

## Redundancy / unnecessary-step findings
None found. The Stage 0–7 sequencing is logical (business case → survey → concept → coordination → technical design incl. cause & effect matrix → installation → commissioning/cause & effect testing → soft landings/UFAS monitoring), and the fire damper drop-test row is correctly scoped ("where dampers fall within this system's interface scope"), not a blanket duplicate of the Heating & Ventilation checklist's own damper row.

## Citations checked
- **SHTM 83 — re-verified, confirmed CORRECT, not an error.** A prior project memory (from the sister Group Discussion project's SFG20 research, 2026-09-06) claimed "there is no SHTM 83 in the current Scottish suite." Direct fetch of `nss.nhs.scot/publications/general-fire-precautions-shtm-83` today confirms SHTM 83 ("General Fire Precautions and Training") is real and still live on NHSScotland Assure's own publications list. **The earlier memory's claim was wrong** — flag this to the parent/user so that older claim doesn't get relied on again elsewhere.
- **Current Scottish Firecode suite confirmed via primary source search**: 00, 81, 82, 83, 85, 86 are live; **84 (fire risk assessment in residential care premises) is archived** — this file correctly does not cite 84.
- BS 5839-1 (fire detection/alarm systems) — no supersession found, appears current.
