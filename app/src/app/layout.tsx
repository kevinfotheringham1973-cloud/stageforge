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
        <header className="flex items-center justify-between border-b border-rule bg-surface px-10 py-4">
          <div className="flex items-center gap-5">
            <a href="/" className="font-serif text-xl font-bold text-accent">
              StageForge
            </a>
            <a href="/projects/new" className="text-sm font-semibold text-accent hover:underline">
              + New project
            </a>
            <a href="/resources" className="text-sm font-semibold text-accent hover:underline">
              Resources
            </a>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              Acting as
            </span>
            <div className="flex items-center gap-1">
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
