import type { Metadata } from "next";
import "./globals.css";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { setActingUser } from "@/lib/actions";
import { ActingAsSwitcher } from "@/components/ActingAsSwitcher";

export const metadata: Metadata = {
  title: "StageForge (dev scaffold)",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [usersWithRoles, currentUser] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      include: { roleAssignments: { include: { role: true } } },
    }),
    getCurrentUser(),
  ]);
  // The "Acting as" switcher is project-agnostic (root layout), so this
  // is every role a user holds anywhere, deduped — not one project's
  // view of them. ActingAsSwitcher leads with this (not the name) in
  // the dropdown label, since a demo audience cares which role they're
  // watching, not who Derek Gibb is (confirmed 24 Aug 2026) — an empty
  // roleLabel means the person holds no role anywhere yet (e.g. an
  // Authorised Person seeded but not yet assigned to a project).
  // isPlatformAdmin is a standing authority outside the Role/
  // ProjectRoleAssignment model entirely (confirmed 20 Aug 2026 —
  // Callum Reid is deliberately outside the company/department
  // structure), so it needs its own label here rather than falling
  // through to ActingAsSwitcher's "no role assigned" fallback, which
  // would be actively wrong for the one person who can delete a
  // project (25 Aug 2026 — flagged as misleading).
  const users = usersWithRoles.map((u) => ({
    id: u.id,
    name: u.name,
    roleLabel: u.isPlatformAdmin
      ? "Platform Admin"
      : Array.from(new Set(u.roleAssignments.map((a) => a.role.name))).join(" · "),
  }));

  return (
    <html lang="en">
      <body className="font-sans" suppressHydrationWarning>
        <header className="flex flex-col gap-3 border-b border-rule bg-surface px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between md:px-10">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href="/" className="flex items-center gap-2.5">
              <img src="/nhs-forth-valley-logo.jpeg" alt="NHS Forth Valley" className="h-9 w-auto rounded-sm" />
              <span className="font-serif text-xl font-bold text-accent">StageForge</span>
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
            {currentUser?.isPlatformAdmin && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l border-rule pl-5">
                <span className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Admin</span>
                <a href="/team" className="text-sm font-semibold text-accent hover:underline">
                  Team
                </a>
                <a href="/compliance-rules" className="text-sm font-semibold text-accent hover:underline">
                  Compliance rules
                </a>
              </div>
            )}
          </div>
          <ActingAsSwitcher action={setActingUser} users={users} currentUserId={currentUser?.id} />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
