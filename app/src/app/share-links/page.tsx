import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createShareLink, revokeShareLink } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { forbidden } from "next/navigation";

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

  const links = await db.shareLink.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
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
        <form action={createShareLink} className="flex flex-wrap items-end gap-3">
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
                Created by {link.createdBy.name} on {link.createdAt.toLocaleString("en-GB")} · expires{" "}
                {link.expiresAt.toLocaleString("en-GB")}
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
