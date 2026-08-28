import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createShareLink, revokeShareLink } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { forbidden } from "next/navigation";
import { ENGLAND_SECTOR_VARIANT_KEY } from "@/lib/englandConversion";

const EXPIRY_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 24 * 7, label: "7 days" },
  { hours: 24 * 30, label: "30 days" },
];

/**
 * Platform-admin-only. Creates/revokes read-only demo links -- see
 * shareLinks.ts and ShareLink's schema comment for how a link resolves to
 * the role-less Demo Viewer at /share/[token], and proxy.ts for the
 * denylist that keeps a viewer off admin/write-only pages.
 */
export default async function ShareLinksPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isPlatformAdmin) forbidden();
  // Desktop build only -- see layout.tsx's admin-nav block for why.
  if (process.env.STAGEFORGE_LOCAL_MODE === "1") forbidden();

  const links = await db.shareLink.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } }, project: { select: { name: true, projectNumber: true } } },
  });

  // Only the England demo tenant's projects are offered here (28 Aug
  // 2026) -- a share link is a public, no-login credential, so it must
  // never be scopable to a project holding real people's personal data.
  // isDemoProject (the fast-forward-gate flag) isn't the right filter: it's
  // true on the real Scotland projects too. sectorVariant is: every
  // England-tenant persona is a *.example address (see
  // standardTeam.ts/disciplineTeam.ts's STANDARD_TEAM_ENGLAND/
  // CANDIDATES_ENGLAND), so it's the only tenant safe to expose publicly.
  // See shareLinks.ts's resolveShareLinkProject and the
  // gdpr_sharelink_scoping memory.
  const shareableProjects = await db.project.findMany({
    where: { template: { sectorVariant: { key: ENGLAND_SECTOR_VARIANT_KEY } } },
    orderBy: { projectNumber: "asc" },
    select: { id: true, name: true, projectNumber: true },
  });

  const now = Date.now();
  const rows = links.map((link) => {
    const status = link.revokedAt ? "Revoked" : link.expiresAt.getTime() <= now ? "Expired" : "Active";
    return { ...link, status };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Share links</h1>
      <p className="mb-8 text-sm text-inkmuted">
        A read-only, no-login link for showing the demo to someone without giving them a real account. Anyone who
        opens it can browse but not change anything, until it expires or you revoke it. Platform admin only.
      </p>

      <div className="mb-8 rounded-lg border border-rule bg-surface p-5">
        <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-wide text-accent">+ Create link</h2>
        {shareableProjects.length === 0 && (
          <p className="mb-3 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
            No England-tenant project exists yet to link to. Share links can only point at that tenant, since every
            other project has real people&rsquo;s names on it.
          </p>
        )}
        <form action={createShareLink} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">Project</label>
            <select
              name="projectId"
              required
              defaultValue=""
              className="w-56 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            >
              <option value="" disabled>
                Select a project…
              </option>
              {shareableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.projectNumber} {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              Label (optional)
            </label>
            <input
              name="label"
              placeholder="e.g. Trade show demo"
              className="w-56 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              Expires after
            </label>
            <select
              name="expiresInHours"
              defaultValue="24"
              className="w-40 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.hours} value={o.hours}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton pendingText="Creating…" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">
            Create link
          </SubmitButton>
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        {rows.length === 0 && <p className="px-4 py-4 text-sm text-inkmuted">No share links yet.</p>}
        {rows.map((link, i) => (
          <div
            key={link.id}
            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm ${
              i > 0 ? "border-t border-rule" : ""
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{link.label ?? "(no label)"}</span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                    link.status === "Active"
                      ? "bg-ok/15 text-ok"
                      : link.status === "Expired"
                        ? "bg-inkmuted/15 text-inkmuted"
                        : "bg-danger/15 text-danger"
                  }`}
                >
                  {link.status}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-inkmuted">
                #{link.project.projectNumber} {link.project.name} · created by {link.createdBy.name} on{" "}
                {link.createdAt.toLocaleString("en-GB")} · expires {link.expiresAt.toLocaleString("en-GB")}
              </p>
              {link.status === "Active" && (
                <p className="mt-1 truncate font-mono text-xs text-accent">
                  {`${process.env.APP_BASE_URL ?? ""}/share/${link.token}`}
                </p>
              )}
            </div>
            {link.status === "Active" && (
              <form action={revokeShareLink.bind(null, link.id)}>
                <SubmitButton pendingText="Revoking…" className="text-sm font-semibold text-danger hover:underline">
                  Revoke
                </SubmitButton>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
