import type { Metadata } from "next";
import "./globals.css";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { setActingUser } from "@/lib/actions";

export const metadata: Metadata = {
  title: "StageForge (dev scaffold)",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [users, currentUser] = await Promise.all([
    db.user.findMany({ orderBy: { name: "asc" } }),
    getCurrentUser(),
  ]);

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
            <a href="/lessons-learned" className="text-sm font-semibold text-accent hover:underline">
              Lessons learned
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              Acting as
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {users.map((u) => (
                <form key={u.id} action={setActingUser.bind(null, u.id)}>
                  <button
                    type="submit"
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      currentUser?.id === u.id
                        ? "border-accent bg-accentsoft text-accent"
                        : "border-rule text-inkmuted hover:bg-surface2"
                    }`}
                  >
                    {u.name}
                  </button>
                </form>
              ))}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
