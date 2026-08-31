"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * The app's persistent primary navigation (31 Aug 2026, replacing the
 * old horizontal top-nav header per group layout feedback) -- same
 * client-side active-link pattern as GateRail.tsx, one level up: this
 * is the whole app's nav, GateRail is a project's own secondary nav
 * nested inside the content area on project pages.
 *
 * Collapses to a compact "Menu"/"Close" toggle below md: (1 Sep 2026)
 * -- the full link list (primary + admin sections) was rendering as a
 * 600-700px tall block above every page's actual content on a phone.
 * Plain text button, not an icon, per the over-65s accessibility
 * target this app is built for -- no hamburger glyph to guess at.
 */
type NavItem = { href: string; label: string; badge?: number };

function NavLink({ href, label, badge, onNavigate }: NavItem & { onNavigate: () => void }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onNavigate}
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <aside className="w-full shrink-0 bg-sidebar px-3 py-3 md:flex md:w-60 md:min-h-screen md:flex-col md:gap-1 md:py-4">
      <div className="flex items-center justify-between md:mb-4 md:block">
        <Link href="/" className="flex flex-col leading-[0.95] md:items-center" onClick={closeMobile}>
          <span className="font-serif text-lg font-bold text-white md:text-xl">StageForge</span>
          <span className="font-serif text-lg font-bold text-sidebarActive md:text-xl">Health</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-semibold text-white md:hidden"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </div>

      <div className={`${mobileOpen ? "flex" : "hidden"} flex-col gap-1 pt-3 md:flex md:pt-0`}>
        <Link
          href="/projects/new"
          onClick={closeMobile}
          className="mb-3 rounded-md bg-sidebarActive px-3 py-2.5 text-center text-sm font-bold text-sidebar hover:opacity-90"
        >
          + New project
        </Link>

        <nav className="flex flex-col gap-0.5">
          {primaryLinks.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={closeMobile} />
          ))}
        </nav>

        {adminLinks.length > 0 && (
          <>
            <div className="mx-3 my-3 h-px bg-white/10" />
            <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-wide text-white/40">Admin</div>
            <nav className="flex flex-col gap-0.5">
              {adminLinks.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  badge={item.href === "/access-requests" ? accessRequestCount : undefined}
                  onNavigate={closeMobile}
                />
              ))}
            </nav>
          </>
        )}

        {demoViewerLinks.length > 0 && (
          <>
            <div className="mx-3 my-3 h-px bg-white/10" />
            <nav className="flex flex-col gap-0.5">
              {demoViewerLinks.map((item) => (
                <NavLink key={item.href} {...item} onNavigate={closeMobile} />
              ))}
            </nav>
          </>
        )}
      </div>
    </aside>
  );
}
