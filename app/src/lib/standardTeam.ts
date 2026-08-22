// The standing project team (confirmed 20 Aug 2026): this
// system currently models exactly one hospital relationship — Serco
// Health : FVRH Scotland delivering for FVRH NHS — and that team is
// consistent across every project at that hospital, not something a
// new project should start without. Previously only the creator got
// auto-assigned (as PM), which meant whoever happened to be "acting
// as" when a project was created became its permanent PM, and every
// other role (Sponsor, SRO, Compliance Officer, Finance, ...) was
// simply missing until someone noticed and added it by hand — the gap
// that made canSetGateTimeline look "broken" on a live project.
//
// Deliberately just the hospital-wide governance roles, not
// discipline-specific ones (AP/AE/Principal Designer) — those depend
// on what the project actually is (electrical vs. water vs. building
// modification) and stay a manual per-project decision.
//
// If a second hospital/site is ever added, this needs to become a
// per-site standing roster rather than one hardcoded list — this is
// the minimal version for "there's currently only one hospital."

import { db } from "./db";

const STANDARD_TEAM: { email: string; roleKey: string }[] = [
  { email: "derek.gibb@buildcare.example", roleKey: "PM" },
  { email: "derek.gibb@buildcare.example", roleKey: "FM_CONTRACTOR" },
  // Real address (not .example) — see prisma/seed.ts, David is the one
  // demo persona pointed at a real inbox so scheduled-report emails
  // have somewhere to actually land.
  { email: "kevinfotheringham1973@gmail.com", roleKey: "SPONSOR" },
  { email: "kevinfotheringham1973@gmail.com", roleKey: "CLIENT_AUTHORITY" },
  { email: "gary.grant@buildcare.example", roleKey: "COMPLIANCE_OFFICER" },
  { email: "mark.ohear@staldwyn.example", roleKey: "SRO" },
  { email: "andrea@buildcare.example", roleKey: "FINANCE" },
  // Fire safety oversight applies hospital-wide, same as the rest of
  // this standing team — not discipline-specific like AP/AE/Principal
  // Designer, which stay a manual per-project decision (see comment above).
  { email: "alan.mcgeachie@staldwyn.example", roleKey: "FIRE_OFFICER" },
];

/** Assigns the standing hospital team to a newly-created project. */
export async function assignStandardTeam(projectId: string): Promise<void> {
  for (const member of STANDARD_TEAM) {
    const user = await db.user.findUnique({ where: { email: member.email } });
    const role = await db.role.findUnique({ where: { key: member.roleKey } });
    if (!user || !role || !user.homeDepartmentId) continue;
    await db.projectRoleAssignment.upsert({
      where: { projectId_userId_roleId: { projectId, userId: user.id, roleId: role.id } },
      update: {},
      create: { projectId, userId: user.id, departmentId: user.homeDepartmentId, roleId: role.id },
    });
  }
}
