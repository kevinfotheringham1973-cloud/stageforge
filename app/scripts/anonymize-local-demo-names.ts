/**
 * Desktop build only — run once after seed.ts, on first launch (see
 * localDb.js's migrateAndSeed). Replaces every seeded demo persona's
 * real-sounding name with their role name, since this build is meant to
 * be demoed to people outside Kevin's own company (27 Aug 2026, Kevin's
 * explicit call — "just the role names, since this will demo to people
 * outside one company") and a couple of the seeded personas use his own
 * real personal email addresses.
 *
 * Never run by `npm run db:seed` itself and never touches the cloud
 * instance's demo data (project #20777 etc.) — localDb.js is the only
 * caller, scoped to this build's own bundled local database.
 */
import "dotenv/config";
import { db } from "../src/lib/db";

// Matches auth.ts's LOCAL_ADMIN_EMAIL and shareLinks.ts's
// DEMO_VIEWER_EMAIL — hardcoded rather than imported, since both of
// those pull in more than's needed just for this. Neither "Local Admin"
// nor "Demo Viewer" is a real person's name, so both are left untouched.
const SKIP_EMAILS = ["local-admin@stageforge.local", "demo-viewer@stageforge.example"];

async function main() {
  const users = await db.user.findMany({
    where: { email: { notIn: SKIP_EMAILS } },
    include: { roleAssignments: { include: { role: true } } },
  });

  let renamed = 0;
  for (const user of users) {
    const roleNames = Array.from(new Set(user.roleAssignments.map((a) => a.role.name)));
    // Some seeded personas (discipline-team candidates not yet assigned
    // to a specific project — see disciplineTeam.ts) hold no
    // ProjectRoleAssignment at all; "Team Member" covers them so no real
    // name is ever left showing, not just the ones that already have a role.
    const displayName = roleNames.length > 0 ? roleNames.join(" · ") : user.isPlatformAdmin ? "Platform Admin" : "Team Member";
    if (displayName !== user.name) {
      await db.user.update({ where: { id: user.id }, data: { name: displayName } });
      renamed += 1;
    }
  }

  console.log(`[anonymize] renamed ${renamed} of ${users.length} seeded users to their role name(s).`);
}

main()
  .catch((err) => {
    console.error("[anonymize] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
