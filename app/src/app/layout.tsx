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
  // view of them. Shown in the dropdown (open or closed) so a demo
  // audience can tell who's who without already knowing the cast.
  const users = usersWithRoles.map((u) => ({
    id: u.id,
    name: u.name,
    roleLabel: Array.from(new Set(u.roleAssignments.map((a) => a.role.name))).join(" · "),
  }));

  return (
    <html lang="en">
      <body className="font-sans">
        <header className="flex flex-col gap-3 border-b border-rule bg-surface px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between md:px-10">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href="/" className="font-serif text-xl font-bold text-accent">
              StageForge
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
          </div>
          <ActingAsSwitcher action={setActingUser} users={users} currentUserId={currentUser?.id} />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
