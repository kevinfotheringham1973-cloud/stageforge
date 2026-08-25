import type { Metadata } from "next";
import "./globals.css";
import { db } from "@/lib/db";
import { getCurrentUser, getRealCurrentUserId } from "@/lib/session";
import { setViewAsUser, clearViewAsUser, exitShareLinkView } from "@/lib/actions";
import { signOut } from "@/lib/auth";
import { ActingAsSwitcher } from "@/components/ActingAsSwitcher";
import { isShareLinkViewerEmail, getActiveShareLinkFromCookie } from "@/lib/shareLinks";

export const metadata: Metadata = {
  title: "StageForge (dev scaffold)",
};

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

  // proxy.ts already redirects every route but /login to /login when
  // nobody's signed in, so this only renders bare chrome for the login
  // page itself (currentUser null there) rather than the full header.
  if (!currentUser) {
    return (
      <html lang="en">
        <body className="font-sans" suppressHydrationWarning>
          <main>{children}</main>
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

  // The "view as" switcher is project-agnostic (root layout), so this
  // is every role a user holds anywhere, deduped — not one project's
  // view of them. ActingAsSwitcher leads with this (not the name) in
  // the dropdown label, since an admin previewing a persona cares which
  // role they're watching, not who Derek Gibb is (confirmed 24 Aug
  // 2026, from back when this switcher was the entire login model).
  // isPlatformAdmin is a standing authority outside the Role/
  // ProjectRoleAssignment model entirely (confirmed 20 Aug 2026 —
  // Callum Reid is deliberately outside the company/department
  // structure), so it needs its own label here (25 Aug 2026 — showing
  // him as "no role assigned" was actively wrong for the one person
  // who can delete a project).
  // People genuinely holding no role anywhere (an Authorised Person
  // seeded but not yet assigned to a project — see disciplineTeam.ts)
  // are filtered out of the switcher entirely (25 Aug 2026): there's
  // nothing to preview by viewing as someone who can't do anything
  // yet, so rather than list them with a "no role assigned" caveat,
  // they just don't appear until a project actually assigns them one.
  const users = usersWithRoles
    .filter((u) => u.isPlatformAdmin || u.roleAssignments.length > 0)
    .map((u) => ({
      id: u.id,
      name: u.name,
      roleLabel: u.isPlatformAdmin
        ? "Platform Admin"
        : Array.from(new Set(u.roleAssignments.map((a) => a.role.name))).join(" · "),
    }));

  return (
    <html lang="en">
      <body className="font-sans" suppressHydrationWarning>
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
        <header className="flex flex-col gap-3 border-b border-rule bg-surface px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between md:px-10">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href="/" className="flex flex-col items-center leading-[0.95]">
              <span className="font-serif text-xl font-bold text-wordmarkBlue">StageForge</span>
              <span className="font-serif text-xl font-bold text-wordmarkTeal">Health</span>
            </a>
            <a href="/projects/new" className="text-sm font-semibold text-accent hover:underline">
              + New project
            </a>
            <a href="/resources" className="text-sm font-semibold text-accent hover:underline">
              Resources
            </a>
            <a href="/finance" className="text-sm font-semibold text-accent hover:underline">
              Finance
            </a>
            <a href="/lessons-learned" className="text-sm font-semibold text-accent hover:underline">
              Lessons learned
            </a>
            <a href="/whats-new" className="text-sm font-semibold text-accent hover:underline">
              What&rsquo;s new
            </a>
            {currentUser?.isPlatformAdmin && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l border-rule pl-5">
                <span className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Admin</span>
                <a href="/team" className="text-sm font-semibold text-accent hover:underline">
                  Team
                </a>
                <a href="/compliance-rules" className="text-sm font-semibold text-accent hover:underline">
                  Compliance rules
                </a>
                <a href="/regulatory-reference" className="text-sm font-semibold text-accent hover:underline">
                  Regulatory reference
                </a>
                <a href="/about" className="text-sm font-semibold text-accent hover:underline">
                  About
                </a>
                <a href="/share-links" className="text-sm font-semibold text-accent hover:underline">
                  Share links
                </a>
              </div>
            )}
            {isDemoViewer && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l border-rule pl-5">
                <a href="/compliance-rules" className="text-sm font-semibold text-accent hover:underline">
                  Compliance rules
                </a>
                <a href="/regulatory-reference" className="text-sm font-semibold text-accent hover:underline">
                  Regulatory reference
                </a>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {realUser?.isPlatformAdmin && (
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
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
