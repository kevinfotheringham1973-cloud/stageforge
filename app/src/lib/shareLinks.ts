// Read-only demo share links (25 Aug 2026) -- see prisma/schema.prisma's
// ShareLink model comment for the security reasoning. This is the one
// place that validates a share token, used by both proxy.ts (routing) and
// session.ts (identity resolution) so the "not revoked, not expired" check
// only lives in one place.
import { cookies } from "next/headers";
import { db } from "./db";

export const SHARE_LINK_COOKIE_NAME = "sf_share_token";

// Seeded in prisma/seed.ts: a real User row with no ProjectRoleAssignment
// and isPlatformAdmin: false, so every existing write Server Action
// rejects it exactly like it would reject anyone else holding no role.
export const DEMO_VIEWER_EMAIL = "demo-viewer@stageforge.example";

export function isShareLinkViewerEmail(email: string | null | undefined): boolean {
  return email === DEMO_VIEWER_EMAIL;
}

/**
 * Gate for the handful of admin-only *reference* pages (Regulatory
 * reference, Compliance rule approvals) that a demo viewer should be able
 * to browse read-only -- unlike Team/About, which stay admin-only outright
 * because they carry real people's contact details / deployment internals.
 * Any actual edit form on those pages still needs no separate check here:
 * its own Server Action already requires isPlatformAdmin (see actions.ts),
 * so a demo viewer seeing the form still can't submit it.
 */
export function canViewAdminReferencePage(user: { isPlatformAdmin: boolean; email: string } | null | undefined): boolean {
  return Boolean(user?.isPlatformAdmin) || isShareLinkViewerEmail(user?.email);
}

/**
 * Resolves a share token to the Demo Viewer's user id, re-checking the DB
 * every call (not trusting a self-contained cookie) so revoking a link
 * from /share-links takes effect on the visitor's very next request.
 */
export async function resolveShareLinkViewerUserId(
  token: string | undefined
): Promise<string | null> {
  if (!token) return null;

  const link = await db.shareLink.findUnique({ where: { token } });
  if (!link || link.revokedAt || link.expiresAt <= new Date()) return null;

  const viewer = await db.user.findUnique({ where: { email: DEMO_VIEWER_EMAIL } });
  return viewer?.id ?? null;
}

/**
 * The active ShareLink behind the current request's cookie, if any --
 * used only by layout.tsx to show the expiry in the read-only banner. Not
 * used for the actual authorization decision (see the two functions
 * above); this can return null even for a currently-valid demo session if
 * called somewhere the cookie isn't readable, so callers should treat it
 * as display-only.
 */
export async function getActiveShareLinkFromCookie() {
  const store = await cookies();
  const token = store.get(SHARE_LINK_COOKIE_NAME)?.value;
  if (!token) return null;

  const link = await db.shareLink.findUnique({ where: { token } });
  if (!link || link.revokedAt || link.expiresAt <= new Date()) return null;
  return link;
}
