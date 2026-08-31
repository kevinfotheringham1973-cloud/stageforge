"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The app's persistent primary navigation (31 Aug 2026, replacing the
 * old horizontal top-nav header per group layout feedback) -- same
 * client-side active-link pattern as GateRail.tsx, one level up: this
 * is the whole app's nav, GateRail is a project's own secondary nav
 * nested inside the content area on project pages.
 */
type NavItem = { href: string; label: string; badge?: number };

function NavLink({ href, label, badge }: NavItem) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
        active ? "bg-sidebarActive/20 text-sidebarActive" : "text-white/80 hover:bg-sidebarHover hover:text-white"
      }`}
    >
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-risk px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  primaryLinks,
  adminLinks,
  demoViewerLinks,
  accessRequestCount,
}: {
  primaryLinks: NavItem[];
  adminLinks: NavItem[];
  demoViewerLinks: NavItem[];
  accessRequestCount: number;
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-1 bg-sidebar px-3 py-4 md:w-60 md:min-h-screen">
      <Link href="/" className="mb-4 flex flex-col items-center leading-[0.95] px-3">
        <span className="font-serif text-xl font-bold text-white">StageForge</span>
        <span className="font-serif text-xl font-bold text-sidebarActive">Health</span>
      </Link>

      <Link
        href="/projects/new"
        className="mb-3 rounded-md bg-sidebarActive px-3 py-2.5 text-center text-sm font-bold text-sidebar hover:opacity-90"
      >
        + New project
      </Link>

      <nav className="flex flex-col gap-0.5">
        {primaryLinks.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      {adminLinks.length > 0 && (
        <>
          <div className="mx-3 my-3 h-px bg-white/10" />
          <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-wide text-white/40">Admin</div>
          <nav className="flex flex-col gap-0.5">
            {adminLinks.map((item) => (
              <NavLink key={item.href} {...item} badge={item.href === "/access-requests" ? accessRequestCount : undefined} />
            ))}
          </nav>
        </>
      )}

      {demoViewerLinks.length > 0 && (
        <>
          <div className="mx-3 my-3 h-px bg-white/10" />
          <nav className="flex flex-col gap-0.5">
            {demoViewerLinks.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
        </>
      )}
    </aside>
  );
}
