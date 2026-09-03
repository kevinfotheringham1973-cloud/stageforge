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
// If a third hospital/site/region is ever added, this needs to become
// a proper per-site standing roster lookup rather than a two-way
// if/else — this is the minimal version for "there are currently
// exactly two" (28 Aug 2026, once the England demo tenant existed
// alongside Scotland and a project created under an England template
// was still getting Scotland's Derek Gibb/Gary Grant/etc. assigned to
// it, found live right after the two tenants first coexisted).

import { db } from "./db";
import { ENGLAND_SECTOR_VARIANT_KEY } from "./englandConversion";

// PM is deliberately NOT in either list below (26 Aug 2026) — it's
// assigned below from the project's own createdById instead, which is
// what "as a PM, [whoever created it] should have an auto role"
// actually needs, and is immune to the exact bug this comment is next
// to: a hardcoded lookup key going stale the moment that person's
// contact details are edited (see updateUser, #98) is a silent,
// easy-to-miss failure mode -- Derek Gibb's PM/FM_CONTRACTOR entries
// here quietly stopped resolving once, the moment his seed .example
// address was changed to a real inbox, and every project created since
// then got no PM at all with no error anywhere. createdById is a real
// foreign key, not a string that can drift out of sync with itself --
// the same reasoning is why every entry below keys off User.seedKey now,
// not email (29 Aug 2026: the desktop build's anonymize-local-demo-names.ts
// rewriting every seeded user's email broke every single one of these
// lookups the exact same way, see User.seedKey's own schema comment).
const STANDARD_TEAM_SCOTLAND: { seedKey: string; roleKey: string }[] = [
  { seedKey: "fm_contractor_scotland", roleKey: "FM_CONTRACTOR" },
  { seedKey: "sponsor_client_authority_scotland", roleKey: "SPONSOR" },
  { seedKey: "sponsor_client_authority_scotland", roleKey: "CLIENT_AUTHORITY" },
  { seedKey: "compliance_officer_scotland", roleKey: "COMPLIANCE_OFFICER" },
  { seedKey: "sro_scotland", roleKey: "SRO" },
  { seedKey: "finance_scotland", roleKey: "FINANCE" },
  // Fire safety oversight applies hospital-wide, same as the rest of
  // this standing team — not discipline-specific like AP/AE/Principal
  // Designer, which stay a manual per-project decision (see comment above).
  { seedKey: "fire_officer_scotland", roleKey: "FIRE_OFFICER" },
];

// England's own standing roster (28 Aug 2026) — the same cast
// seedEnglandDemo assigns directly to its one seeded project, reused
// here so every OTHER England-template project gets it too. No
// FIRE_OFFICER entry: seedEnglandDemo never created a dedicated
// England fire-safety persona, so this role is simply left unassigned
// on an England project until one exists, same graceful no-op
// assignOne already does for any role with nobody to assign.
const STANDARD_TEAM_ENGLAND: { seedKey: string; roleKey: string }[] = [
  { seedKey: "fm_contractor_england", roleKey: "FM_CONTRACTOR" },
  { seedKey: "sponsor_client_authority_england", roleKey: "SPONSOR" },
  { seedKey: "sponsor_client_authority_england", roleKey: "CLIENT_AUTHORITY" },
  { seedKey: "compliance_officer_england", roleKey: "COMPLIANCE_OFFICER" },
  { seedKey: "sro_england", roleKey: "SRO" },
  { seedKey: "finance_england", roleKey: "FINANCE" },
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

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { template: { select: { sectorVariant: { select: { key: true } } } } },
  });
  const standardTeam =
    project.template.sectorVariant.key === ENGLAND_SECTOR_VARIANT_KEY ? STANDARD_TEAM_ENGLAND : STANDARD_TEAM_SCOTLAND;

  for (const member of standardTeam) {
    const user = await db.user.findUnique({ where: { seedKey: member.seedKey } });
    if (!user) {
      console.error(`[standardTeam] could not assign ${member.roleKey} on project ${projectId}: no user with seedKey ${member.seedKey}`);
      continue;
    }
    await assignOne(projectId, user.id, member.roleKey, `standing team, ${member.seedKey}`);
  }
}
