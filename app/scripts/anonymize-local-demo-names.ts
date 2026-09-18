/**
 * Desktop build only — run once after seed.ts, on first launch (see
 * localDb.js's migrateAndSeed). Replaces every seeded demo persona's
 * real-sounding name AND email with role-based, obviously-fake versions
 * of both, since this build is meant to be demoed to people outside
 * Kevin's own company (27 Aug 2026, Kevin's explicit call — "just the
 * role names, since this will demo to people outside one company") and
 * several of the seeded personas carry his real colleagues' actual
 * personal Gmail/Outlook/Hotmail addresses (see seed.ts's own "Real
 * address" comments on Derek/Kevin/Mark/Javier/James).
 *
 * Only the `name` field used to be touched here — found live, 29 Aug
 * 2026, from a real install: with `email` left alone, a real address
 * like gary.grant@buildcare.example was still fully visible (and, for
 * the small number of genuinely real personal addresses above, meant
 * every copy of this desktop build shipped real third parties' actual
 * personal email addresses -- a privacy problem regardless of whether
 * the display name next to it read "Compliance Officer"). Kevin's own
 * call, 29 Aug 2026: the desktop build should be "absolutely nameless".
 *
 * Company names were left alone by this script for three weeks after
 * that call — found live 18 Sep 2026: with `User.name`/`email`
 * anonymized but `Company.name` untouched, the real branding
 * ("Serco Health : FVRH Scotland" as FM_CONTRACTOR, "FVRH NHS" as
 * CLIENT_AUTHORITY) was still fully visible everywhere a deliverable's
 * home department or the /team roster shows "<department> (<company>)"
 * — the exact same "absolutely nameless" problem this script exists to
 * solve, just on the company axis instead of the person axis. Every
 * Company now gets the same type-based genericisation as a user gets a
 * role-based one, since a project's own standing-team auto-assignment
 * (standardTeam.ts) keeps pulling these same companies onto every new
 * project regardless of who creates it.
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
// nor "Demo Viewer" is a real person's name or address, so both are
// left untouched.
const SKIP_EMAILS = ["local-admin@stageforge.local", "demo-viewer@stageforge.example"];

// auth.ts's own local-mode Credentials.authorize() find-or-creates this
// exact company as Local Admin's own home — already generic/non-
// identifying (it names the desktop build itself, not a real
// organisation), so re-anonymizing it on every launch would just be
// pointless churn.
const SKIP_COMPANY_NAMES = ["Desktop Trial"];

const COMPANY_TYPE_LABEL: Record<string, string> = {
  FM_CONTRACTOR: "FM Contractor",
  CLIENT_AUTHORITY: "Client Authority",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const users = await db.user.findMany({
    where: { email: { notIn: SKIP_EMAILS } },
    include: { roleAssignments: { include: { role: true } } },
  });

  const updates = users.map((user) => {
    const roleNames = Array.from(new Set(user.roleAssignments.map((a) => a.role.name)));
    // Some seeded personas (discipline-team candidates not yet assigned
    // to a specific project — see disciplineTeam.ts) hold no
    // ProjectRoleAssignment at all; "Team Member" covers them so no real
    // name is ever left showing, not just the ones that already have a role.
    const displayName = roleNames.length > 0 ? roleNames.join(" · ") : user.isPlatformAdmin ? "Platform Admin" : "Team Member";
    return { user, displayName, slug: slugify(displayName) };
  });

  // Clean role-based local-part in the common case (compliance-officer@,
  // not a random-suffixed one) -- Kevin's own follow-up, 29 Aug 2026:
  // readable over merely-unique. Only the rare case where two people
  // land on the same slug (e.g. two people with no role both becoming
  // "Team Member", or two holders of the same role) gets a numeric
  // suffix, and only from the second one on -- .invalid is the
  // IANA-reserved TLD for addresses that must never resolve or be
  // mailed to (RFC 2606), stronger than reusing buildcare.example here,
  // since this address should never look like even a plausible fake
  // company domain.
  const slugCounts = new Map<string, number>();
  let renamed = 0;
  for (const { user, displayName, slug } of updates) {
    const seen = slugCounts.get(slug) ?? 0;
    slugCounts.set(slug, seen + 1);
    const displayEmail = `${slug}${seen > 0 ? `-${seen + 1}` : ""}@desktop.invalid`;
    if (displayName !== user.name || displayEmail !== user.email) {
      await db.user.update({ where: { id: user.id }, data: { name: displayName, email: displayEmail } });
      renamed += 1;
    }
  }

  console.log(`[anonymize] renamed ${renamed} of ${users.length} seeded users' name and email to role-based, non-identifying values.`);

  // Same treatment, one level up: a real organisation's name
  // (Serco Health : FVRH Scotland, FVRH NHS) is exactly as identifying
  // as a real person's, and standardTeam.ts keeps re-surfacing these
  // same companies on every new project regardless of who creates it —
  // so it's the company record itself that has to stop carrying real
  // branding, not just the people homed under it.
  const companies = await db.company.findMany({ where: { name: { notIn: SKIP_COMPANY_NAMES } } });
  const companySlugCounts = new Map<string, number>();
  let companiesRenamed = 0;
  for (const company of companies) {
    const baseLabel = COMPANY_TYPE_LABEL[company.type] ?? "Organisation";
    const slug = slugify(baseLabel);
    const seen = companySlugCounts.get(slug) ?? 0;
    companySlugCounts.set(slug, seen + 1);
    const displayName = seen > 0 ? `${baseLabel} ${seen + 1}` : baseLabel;
    if (displayName !== company.name) {
      await db.company.update({ where: { id: company.id }, data: { name: displayName } });
      companiesRenamed += 1;
    }
  }

  console.log(`[anonymize] renamed ${companiesRenamed} of ${companies.length} seeded companies' name to type-based, non-identifying values.`);
}

main()
  .catch((err) => {
    console.error("[anonymize] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
