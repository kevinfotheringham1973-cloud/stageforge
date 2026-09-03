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

// Inline SVGs, not an icon library -- nothing else in this codebase
// pulls in a third-party icon set, and this is a fixed, small list of
// glyphs. Keyed by href so the pages building primaryLinks/adminLinks
// (layout.tsx) don't each need to know which icon goes with which
// link. A href with no entry here just renders without one.
const ICON_PATHS: Record<string, string> = {
  "/": "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z",
  "/resources": "M4 7l8-4 8 4-8 4-8-4Zm0 5l8 4 8-4M4 12v5l8 4 8-4v-5",
  "/finance": "M12 3v18M17 7.5c0-1.66-2.24-3-5-3s-5 1.34-5 3 2.24 3 5 3 5 1.34 5 3-2.24 3-5 3-5-1.34-5-3",
  "/lessons-learned": "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.2 11.1c.5.32.7.9.7 1.5v.4h5v-.4c0-.6.2-1.18.7-1.5A6 6 0 0 0 12 3Z",
  "/document-templates": "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6M9 17h6",
  "/whats-new": "M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4",
  "/team": "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3 2.7-5 6-5s6 2 6 5M14 15.2c2.9.4 5 2.2 5 4.8",
  "/access-requests": "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z",
  "/compliance-rules": "M9 12l2 2 4-4M5 4h14v16l-7-3-7 3V4Z",
  "/regulatory-reference": "M4 5c2.5-1 5.5-1 8 0 2.5-1 5.5-1 8 0v13c-2.5-1-5.5-1-8 0-2.5-1-5.5-1-8 0V5Zm8 0v13",
  "/about": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 8v.01",
  "/share-links": "M8.5 15.5l7-7M9 6a3 3 0 1 0 0 6M15 12a3 3 0 1 0 0 6M9 9l-2.5-.5A3 3 0 1 0 9 12M15 15l2.5.5a3 3 0 1 0-2.5-3.5",
  "/support": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 1.8-2.5 3.5M12 16.5v.01",
  "/documentation": "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Zm0 0V19M8 8h8M8 12h8",
};

function NavIcon({ href }: { href: string }) {
  const d = ICON_PATHS[href];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

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
      <span className="flex items-center gap-2.5">
        <NavIcon href={href} />
        {label}
      </span>
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

      <div className={`${mobileOpen ? "flex" : "hidden"} flex-col gap-1 pt-3 md:flex md:flex-1 md:pt-0`}>
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

        {/* Pinned to the bottom on desktop via the flex-1 spacer above
            this block and md:flex-1 on the wrapper -- always visible,
            not role-gated, same as the reference mockup. Content is a
            deliberate stub (1 Sep 2026): no real support channel or
            user guide exists yet, so the pages say so honestly rather
            than inventing a contact address or documentation. */}
        <div className="flex-1 md:block" />
        <div className="mx-3 my-3 h-px bg-white/10" />
        <nav className="flex flex-col gap-0.5">
          <NavLink href="/support" label="Support" onNavigate={closeMobile} />
          <NavLink href="/documentation" label="Documentation" onNavigate={closeMobile} />
        </nav>
      </div>
    </aside>
  );
}
