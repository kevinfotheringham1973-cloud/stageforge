// Auto-suggests the discipline-specific roster (AP/AE relevant to the
// SHTM involved, Clinical Safety/Information Governance officers,
// Principal Designer) that standardTeam.ts's standing hospital-wide
// team deliberately leaves out (confirmed 24 Aug 2026 — "the
// deliverables should allow an auto population to some extent" while
// staying editable, not final). Same non-final nature as
// assignStandardTeam: this only ever adds ProjectRoleAssignment rows
// (upsert, never removes), so a PM/platform admin can freely add more
// or correct a wrong suggestion afterward through the existing /team
// assignment flow — nothing here is a hard commitment.
//
// Two data problems this can only solve halfway, on purpose:
// 1. Which authorities does this project actually need? Answered by
//    scanning the matched Template's own DeliverableTemplate rows for
//    every bypassAuthority they use — the same signal that already
//    drives which "REQUIRES X" badge shows on a live gate, so a
//    project only gets suggested the disciplines its own checklist
//    will actually gate on, not a blanket "every AP in the building."
// 2. Who actually holds that authority? There's no queryable registry
//    for this (each Role can, in principle, have zero, one, or many
//    holders — nothing in the schema enforces "exactly one Fire
//    Officer"). CANDIDATES below is the same kind of hardcoded
//    single-hospital list standardTeam.ts uses, extended to the
//    discipline roles seed.ts already named specific holders for
//    (Bob Smith/Claire Duncan/Fiona Wallace/Graeme Paterson as the
//    four AP engineers, Sarah Chen/Neil Forsyth for the two Trust
//    governance roles, Ross Blair for Principal Designer, Dennis Kelly
//    for AE Electrical). Where seed.ts never named a holder (AE Water/
//    Medical Gases/Ventilation), there's deliberately no entry here —
//    suggesting nobody is more honest than guessing, and the gap is
//    exactly what a human reviewing the roster is for.
import { db } from "./db";

const CANDIDATES: Record<string, string[]> = {
  AUTHORISED_PERSON_WATER: ["claire.duncan@buildcare.example"],
  AUTHORISED_PERSON_ELECTRICAL: ["bob.smith@buildcare.example"],
  AUTHORISED_PERSON_VENTILATION: ["fiona.wallace@buildcare.example"],
  AUTHORISED_PERSON_MEDICAL_GASES: ["graeme.paterson@buildcare.example"],
  AUTHORISING_ENGINEER_ELECTRICAL: ["dennis.kelly@independent.example"],
  // Fiona Wallace holds both the AP and AE appointments for Heating &
  // Ventilation (confirmed 26 Aug 2026) — previously only her AP entry
  // was here, so a project needing both showed AE as "still needs
  // assignment" even though the same person already covers it.
  AUTHORISING_ENGINEER_VENTILATION: ["fiona.wallace@buildcare.example"],
  CLINICAL_SAFETY_OFFICER: ["sarah.chen@staldwyn.example"],
  INFORMATION_GOVERNANCE_OFFICER: ["neil.forsyth@staldwyn.example"],
  PRINCIPAL_DESIGNER: ["ross.blair@buildcare.example"],
};

// Every AP discipline's counterpart AE — real SHTM/HTM estates practice
// pairs an appointed Authorised Person with an Authorising Engineer who
// appoints/audits them, so a project that needs the AP plausibly needs
// the AE too, even though AE never appears as a deliverable's
// bypassAuthority (it's a standing appointment, not a gate authority —
// confirmed in the bypassAuthority survey, 24 Aug 2026).
const AP_TO_AE: Record<string, string> = {
  AUTHORISED_PERSON_WATER: "AUTHORISING_ENGINEER_WATER",
  AUTHORISED_PERSON_ELECTRICAL: "AUTHORISING_ENGINEER_ELECTRICAL",
  AUTHORISED_PERSON_VENTILATION: "AUTHORISING_ENGINEER_VENTILATION",
  AUTHORISED_PERSON_MEDICAL_GASES: "AUTHORISING_ENGINEER_MEDICAL_GASES",
};

// Already covered by the standing hospital-wide team (standardTeam.ts)
// — never worth re-suggesting here even if a deliverable happens to be
// tiered to one of them.
const STANDING_TEAM_AUTHORITIES = new Set(["PM", "SRO", "COMPLIANCE_OFFICER", "FIRE_OFFICER"]);

/**
 * Which discipline role keys a project needs, based on which
 * bypassAuthority values its matched Template's own deliverables
 * actually use (paired AEs included), plus Principal Designer when the
 * CDM 2015 works-type answer requires one. Pure/read-only — shared by
 * suggestDisciplineTeam (which acts on it) and the project overview
 * page (which shows any of these still unassigned, even the ones
 * CANDIDATES has no named holder for — Kevin's follow-up, 24 Aug 2026:
 * "the roles should be added if the project calls them out... at least
 * the role requirement" even without a name to put against it yet).
 */
export async function neededDisciplineRoleKeys(templateIds: string[], worksType: string): Promise<Set<string>> {
  const deliverableTemplates = await db.deliverableTemplate.findMany({
    where: { gateTemplate: { stageTemplate: { templateId: { in: templateIds } } } },
    select: { bypassAuthority: true },
  });

  const neededRoleKeys = new Set<string>();
  for (const d of deliverableTemplates) {
    if (STANDING_TEAM_AUTHORITIES.has(d.bypassAuthority)) continue;
    neededRoleKeys.add(d.bypassAuthority);
    const pairedAe = AP_TO_AE[d.bypassAuthority];
    if (pairedAe) neededRoleKeys.add(pairedAe);
  }

  if (worksType !== "DIRECT_REPLACEMENT_SINGLE_CONTRACTOR") {
    neededRoleKeys.add("PRINCIPAL_DESIGNER");
  }

  return neededRoleKeys;
}

/**
 * Suggests (upserts, never removes) discipline-specific roster members
 * for a project, for whichever of neededDisciplineRoleKeys() has a
 * known candidate. Safe to call more than once for the same project
 * (e.g. at draft creation and again at approval, in case the template
 * changed in between) — upserts are idempotent and this never touches
 * a row a human already added.
 */
export async function suggestDisciplineTeam(projectId: string, templateIds: string[], worksType: string): Promise<void> {
  const neededRoleKeys = await neededDisciplineRoleKeys(templateIds, worksType);

  for (const roleKey of neededRoleKeys) {
    const candidateEmails = CANDIDATES[roleKey];
    if (!candidateEmails) continue; // no known holder — leave for manual assignment

    const role = await db.role.findUnique({ where: { key: roleKey } });
    if (!role) continue;

    for (const email of candidateEmails) {
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.homeDepartmentId) continue;
      await db.projectRoleAssignment.upsert({
        where: { projectId_userId_roleId: { projectId, userId: user.id, roleId: role.id } },
        update: {},
        create: { projectId, userId: user.id, departmentId: user.homeDepartmentId, roleId: role.id },
      });
    }
  }
}
