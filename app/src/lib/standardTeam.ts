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

// PM is deliberately NOT in this list (26 Aug 2026) — it's assigned
// below from the project's own createdById instead, which is what
// "as a PM, [whoever created it] should have an auto role" actually
// needs, and is immune to the exact bug this comment is next to: a
// hardcoded email going stale the moment that person's contact
// details are edited (see updateUser, #98) is a silent, easy-to-miss
// failure mode -- Derek Gibb's PM/FM_CONTRACTOR entries here quietly
// stopped resolving the moment his seed .example address was changed
// to a real inbox, and every project created since then got no PM at
// all with no error anywhere. createdById is a real foreign key, not
// a string that can drift out of sync with itself.
const STANDARD_TEAM: { email: string; roleKey: string }[] = [
  { email: "derek.g999@outlook.com", roleKey: "FM_CONTRACTOR" },
  // Real address (not .example) — see prisma/seed.ts, David is the one
  // demo persona pointed at a real inbox so scheduled-report emails
  // have somewhere to actually land.
  { email: "kevinfotheringham1973@gmail.com", roleKey: "SPONSOR" },
  { email: "kevinfotheringham1973@gmail.com", roleKey: "CLIENT_AUTHORITY" },
  { email: "gary.grant@buildcare.example", roleKey: "COMPLIANCE_OFFICER" },
  { email: "gaz808@gmail.com", roleKey: "SRO" },
  { email: "andrea@buildcare.example", roleKey: "FINANCE" },
  // Fire safety oversight applies hospital-wide, same as the rest of
  // this standing team — not discipline-specific like AP/AE/Principal
  // Designer, which stay a manual per-project decision (see comment above).
  { email: "alan.mcgeachie@staldwyn.example", roleKey: "FIRE_OFFICER" },
];

async function assignOne(projectId: string, userId: string, roleKey: string, context: string): Promise<void> {
  const [user, role] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.role.findUnique({ where: { key: roleKey } }),
  ]);
  if (!user || !role || !user.homeDepartmentId) {
    // Never fail silently again — this exact silence (an email no
    // longer matching anyone) is what let every new project go
    // without a PM for however long it took someone to notice.
    console.error(
      `[standardTeam] could not assign ${roleKey} on project ${projectId} (${context}): ` +
        `${!user ? "user not found" : !role ? "role not found" : "user has no home department"}`
    );
    return;
  }
  await db.projectRoleAssignment.upsert({
    where: { projectId_userId_roleId: { projectId, userId: user.id, roleId: role.id } },
    update: {},
    create: { projectId, userId: user.id, departmentId: user.homeDepartmentId, roleId: role.id },
  });
}

/**
 * Assigns the standing hospital team to a newly-created project, plus
 * PM from whoever actually created it (createdByUserId — always
 * project.createdById at the call site).
 */
export async function assignStandardTeam(projectId: string, createdByUserId: string): Promise<void> {
  await assignOne(projectId, createdByUserId, "PM", "project creator");
  for (const member of STANDARD_TEAM) {
    const user = await db.user.findUnique({ where: { email: member.email } });
    if (!user) {
      console.error(`[standardTeam] could not assign ${member.roleKey} on project ${projectId}: no user with email ${member.email}`);
      continue;
    }
    await assignOne(projectId, user.id, member.roleKey, `standing team, ${member.email}`);
  }
}
