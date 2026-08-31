import type { Metadata } from "next";
import "./globals.css";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser, getRealCurrentUserId } from "@/lib/session";
import { setViewAsUser, clearViewAsUser, exitShareLinkView } from "@/lib/actions";
import { signOut } from "@/lib/auth";
import { ActingAsSwitcher } from "@/components/ActingAsSwitcher";
import { Sidebar } from "@/components/Sidebar";
import { isShareLinkViewerEmail, getActiveShareLinkFromCookie } from "@/lib/shareLinks";

export const metadata: Metadata = {
  title: "StageForge Health",
};

// Ownership attribution, not access control -- this is the one piece of
// UI that renders identically on every page, cloud or desktop build,
// signed in or not (see both return branches below), so it's the one
// place guaranteed to reach every viewer regardless of role.
function CompanyFooter() {
  return (
    <footer className="flex items-center justify-center gap-2 border-t border-rule px-4 py-4 text-xs text-inkmuted">
      <img src="/tip-logo.png" alt="" className="h-5 w-5" />
      <span>StageForge Health is built and owned by Transition Insight Partners Ltd</span>
    </footer>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [usersWithRoles, currentUser, realUserId] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      include: { roleAssignments: { include: { role: true } } },
    }),
    getCurrentUser(),
    getRealCurrentUserId(),
  ]);

  // Only ever queried for a platform admin -- the nav link (and this
  // count) don't render at all otherwise. Cheap enough to run on every
  // request, same tradeoff as the usersWithRoles fetch above.
  const accessRequestCount = currentUser?.isPlatformAdmin
    ? await db.rejectedSignInAttempt.count()
    : 0;

  // proxy.ts already redirects every route but /login to /login when
  // nobody's signed in, so this only renders bare chrome for the login
  // page itself (currentUser null there) rather than the full header.
  if (!currentUser) {
    // realUserId truthy here means auth() found a real, validly-signed
    // session token -- but it decodes user info straight from the token
    // itself, never re-checking the database, so a token can "look"
    // valid forever even after its user row is gone (a local-mode
    // database reset while an old token was still cached in the
    // browser, an archived user, etc. -- found live, 27 Aug 2026).
    // Left alone this is a dead end: no header, no sign-out button,
    // nothing to click. Recovering means clearing that stale cookie,
    // which needs a Route Handler (recover-session/route.ts) -- the
    // same "cookies can only change in a Server Action/Route Handler"
    // rule this file can't work around just by rendering differently.
    if (realUserId) {
      redirect("/api/recover-session");
    }
    return (
      <html lang="en">
        <body className="flex min-h-screen flex-col font-sans" suppressHydrationWarning>
          <main className="flex-1">{children}</main>
          <CompanyFooter />
        </body>
      </html>
    );
  }

  // realUser, not currentUser, decides who gets the view-as switcher --
  // currentUser reflects whichever identity a view-as override has put
  // in effect (session.ts), and a non-admin being viewed shouldn't
  // inherit the switcher just because an admin is currently viewing
  // as them.
  const realUser = realUserId ? await db.user.findUnique({ where: { id: realUserId } }) : null;
  // A share-link visitor has no real Auth.js session at all (realUserId is
  // null), which would otherwise make the "viewing as" math below think an
  // admin is previewing nobody -- this has to be checked first and handled
  // as its own case, not folded into isViewingAs.
  const isDemoViewer = isShareLinkViewerEmail(currentUser.email);
  const activeShareLink = isDemoViewer ? await getActiveShareLinkFromCookie() : null;
  const isViewingAs = !isDemoViewer && realUserId !== currentUser.id;

  // The "view as" switcher used to be genuinely project-agnostic here —
  // every role a user held anywhere, deduped, regardless of which
  // project you were currently looking at. That stopped being safe once
  // a second demo tenant existed on the same platform-wide user list
  // (England/Meadowbrook NHS alongside Scotland/FVRH, 28 Aug 2026):
  // browsing the England project still surfaced every FVRH persona's
  // real name in the dropdown. proxy.ts now forwards the current
  // project's number (parsed straight from the URL) as a request
  // header when you're on a /projects/[projectNumber] route, so this
  // can scope the list to just that project's own team -- everywhere
  // else (dashboard, /resources) there's no project to scope to, so it
  // still falls back to showing everyone, same as before.
  // NB: this header is set by proxy.ts from the URL, but the App
  // Router doesn't re-invoke a shared layout like this one on a
  // client-side navigation unless its own segment/params changed --
  // navigating from a project page to a project-less route (the
  // portfolio, /resources, ...) via a sidebar <Link> reuses the
  // previous render rather than re-reading this header, which is why
  // the project name/timeline/CDM badges live in the project layout
  // itself (app/projects/[projectNumber]/(dashboard)/layout.tsx) and
  // not here -- that layout's own params genuinely change (or the
  // whole segment unmounts) on every navigation into/out of a project,
  // so it can't go stale the way this one would. currentProjectUserIds
  // below is scoping-only (narrows a dropdown's options, not a visible
  // fact about "which project am I on"), so a stale value there is a
  // much smaller problem and is left as-is.
  const currentProjectNumber = (await headers()).get("x-current-project-number");
  const currentProjectUserIds = currentProjectNumber
    ? await db.projectRoleAssignment
        .findMany({
          where: { project: { projectNumber: currentProjectNumber } },
          select: { userId: true },
        })
        .then((rows) => new Set(rows.map((a) => a.userId)))
    : null;

  // ActingAsSwitcher leads with the role (not the name) in the dropdown
  // label, since an admin previewing a persona cares which role they're
  // watching, not who Derek Gibb is (confirmed 24 Aug 2026, from back
  // when this switcher was the entire login model). isPlatformAdmin is
  // a standing authority outside the Role/ProjectRoleAssignment model
  // entirely (confirmed 20 Aug 2026 — Callum Reid is deliberately
  // outside the company/department structure), so it needs its own
  // label here (25 Aug 2026 — showing him as "no role assigned" was
  // actively wrong for the one person who can delete a project) and
  // always stays in the list regardless of project scoping.
  // People genuinely holding no role anywhere (an Authorised Person
  // seeded but not yet assigned to a project — see disciplineTeam.ts)
  // are filtered out of the switcher entirely (25 Aug 2026): there's
  // nothing to preview by viewing as someone who can't do anything
  // yet, so rather than list them with a "no role assigned" caveat,
  // they just don't appear until a project actually assigns them one.
  const users = usersWithRoles
    .filter((u) => !u.archivedAt)
    .filter((u) => u.isPlatformAdmin || u.roleAssignments.length > 0)
    // currentUser.id is always kept in too, even if project-scoped and
    // not actually on this project -- otherwise navigating onto a
    // project outside your currently-acted-as persona's team would
    // silently drop that persona from its own dropdown mid-preview,
    // desyncing the <select>'s value from its own options.
    .filter((u) => !currentProjectUserIds || u.isPlatformAdmin || currentProjectUserIds.has(u.id) || u.id === currentUser.id)
    .map((u) => ({
      id: u.id,
      name: u.name,
      roleLabel: u.isPlatformAdmin
        ? "Platform Admin"
        : Array.from(new Set(u.roleAssignments.map((a) => a.role.name))).join(" · "),
    }));

  // Single-user desktop build only. Briefly (28 Aug 2026) made
  // role-specific actions non-actionable here entirely, to preserve the
  // cloud version's real, enforced role separation as a reason to want
  // it -- reversed 29 Aug 2026 (session.ts's getCurrentUserRoleKeysForProject/
  // getCurrentUserGlobalRoleKeys) after that left a real single-user
  // trial permanently stuck on a sign-off nobody else on the machine
  // could ever give. This banner now describes that corrected
  // behaviour: the Local Admin can act as every role so nothing gets
  // stuck, but every "Requires {role}" badge stays exactly as visible
  // as it always was, so it's still obvious which of those approvals
  // would be a named specialist's call in real use.
  const isLocalMode = process.env.STAGEFORGE_LOCAL_MODE === "1";

  // Desktop build: the whole admin surface stays hidden, not just
  // /team -- see each page's own STAGEFORGE_LOCAL_MODE forbidden()
  // guard. This build is scoped to a PM creating a project from the
  // template library and working through its gates/deliverables,
  // nothing administrative.
  const adminLinks =
    currentUser?.isPlatformAdmin && !isLocalMode
      ? [
          { href: "/team", label: "Team" },
          { href: "/access-requests", label: "Access requests" },
          { href: "/compliance-rules", label: "Compliance rules" },
          { href: "/regulatory-reference", label: "Regulatory reference" },
          { href: "/about", label: "About" },
          { href: "/share-links", label: "Share links" },
        ]
      : [];
  const demoViewerLinks = isDemoViewer
    ? [
        { href: "/compliance-rules", label: "Compliance rules" },
        { href: "/regulatory-reference", label: "Regulatory reference" },
      ]
    : [];

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans md:flex-row" suppressHydrationWarning>
        <Sidebar
          primaryLinks={[
            { href: "/", label: "Dashboard" },
            { href: "/resources", label: "Resources" },
            { href: "/finance", label: "Finance" },
            { href: "/lessons-learned", label: "Lessons learned" },
            { href: "/document-templates", label: "Document templates" },
            { href: "/whats-new", label: "What's new" },
          ]}
          adminLinks={adminLinks}
          demoViewerLinks={demoViewerLinks}
          accessRequestCount={accessRequestCount}
        />
        <div className="flex min-h-screen flex-1 flex-col">
          {isLocalMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-accentsoft px-4 py-2 text-xs text-accent sm:px-6 md:px-10">
              <span>
                Single-user preview — you can create and work through a project's full lifecycle, including
                role-specific decisions (compliance sign-off, Authorised Person sign-off, SRO/Sponsor decisions) that a
                named specialist would give in real use — every "Requires {"{role}"}" badge still shows who that would
                be. The cloud version enforces that separation for real, with a full team each signing off their own.
              </span>
            </div>
          )}
          {isDemoViewer && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-accentsoft px-4 py-2 text-xs text-accent sm:px-6 md:px-10">
              <span>
                Read-only demo view
                {activeShareLink?.expiresAt && ` — expires ${activeShareLink.expiresAt.toLocaleString("en-GB")}`}.
              </span>
              <form action={exitShareLinkView}>
                <button type="submit" className="font-semibold underline">
                  Exit demo view
                </button>
              </form>
            </div>
          )}
          {isViewingAs && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-warn/15 px-4 py-2 text-xs text-warn sm:px-6 md:px-10">
              <span>
                Viewing as <strong>{currentUser.name}</strong> — you&rsquo;re really signed in as {realUser?.name}.
              </span>
              <form action={clearViewAsUser}>
                <button type="submit" className="font-semibold underline">
                  Stop viewing as
                </button>
              </form>
            </div>
          )}
          {accessRequestCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-risk/15 px-4 py-2 text-xs text-risk sm:px-6 md:px-10">
              <span>
                ⚠ {accessRequestCount} {accessRequestCount === 1 ? "person" : "people"} tried to sign in without
                access.
              </span>
              <a href="/access-requests" className="font-semibold underline">
                Review access requests
              </a>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-4 bg-surface px-4 py-2 sm:px-6 md:px-10">
            {realUser?.isPlatformAdmin && !isLocalMode && (
              <ActingAsSwitcher action={setViewAsUser} users={users} currentUserId={currentUser.id} />
            )}
            {isDemoViewer ? (
              <form action={exitShareLinkView}>
                <button type="submit" className="text-sm font-semibold text-accent hover:underline">
                  Exit demo view
                </button>
              </form>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button type="submit" className="text-sm font-semibold text-accent hover:underline">
                  Sign out ({realUser?.name ?? currentUser.name})
                </button>
              </form>
            )}
          </div>
          <main className="flex-1">{children}</main>
          <CompanyFooter />
        </div>
      </body>
    </html>
  );
}
