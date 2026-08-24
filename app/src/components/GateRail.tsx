"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DOT_CLASS: Record<string, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  risk: "bg-risk",
  accent: "bg-accent",
  muted: "bg-rule",
};

/**
 * The dashboard's gate switcher — a persistent side rail instead of the
 * old scroll-past-every-gate accordion. The only client-side piece of
 * the whole project dashboard: everything else stays server-rendered,
 * this just needs usePathname() to know which link is "active".
 *
 * prefetch={false} on every link here (24 Aug 2026): Next's default
 * prefetch-on-viewport fires one background RSC fetch per visible
 * Link, so a project with 8 gates was firing 8 simultaneous requests
 * the instant its page loaded — each one running the same heavy
 * dashboard layout query. Confirmed live: about half of those bursts
 * came back 503 (works fine for a single request in isolation), which
 * is what made clicking a gate look broken — the click reused an
 * already-failed prefetch instead of firing a fresh request. Real
 * navigation is still one request at a time, so this only removes the
 * self-inflicted burst, not real functionality.
 */
export function GateRail({
  projectNumber,
  gates,
}: {
  projectNumber: string;
  gates: { id: string; name: string; dot: string }[];
}) {
  const pathname = usePathname();
  const overviewHref = `/projects/${projectNumber}`;

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-6 md:flex-col md:self-start md:overflow-visible md:pb-0">
      <Link
        href={overviewHref}
        prefetch={false}
        className={`flex shrink-0 items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm font-semibold md:shrink ${
          pathname === overviewHref
            ? "border-accent bg-surface"
            : "border-transparent text-ink hover:bg-accentsoft"
        }`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-rule" />
        Team &amp; scope
      </Link>
      <div className="mx-1 my-0 w-px shrink-0 self-stretch bg-rule md:mx-0 md:my-1.5 md:h-px md:w-auto md:self-auto" />
      {gates.map((g) => {
        const href = `/projects/${projectNumber}/gates/${g.id}`;
        const active = pathname === href;
        return (
          <Link
            key={g.id}
            href={href}
            prefetch={false}
            className={`flex shrink-0 items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm font-semibold md:shrink ${
              active ? "border-accent bg-surface" : "border-transparent text-ink hover:bg-accentsoft"
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[g.dot] ?? "bg-rule"}`} />
            <span className="max-w-[9rem] truncate md:max-w-none">{g.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
