// Real session, backed by Auth.js (auth.ts) -- replaces the old dev-only
// cookie stub that trusted a raw User.id with no identity check. Kept
// the same 4 exported function signatures on purpose: every call site
// across the app (10 files, all going through these) needed zero
// changes when this swapped from "trust the cookie" to "read the real
// session."
import { cookies } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";
import { SHARE_LINK_COOKIE_NAME, resolveShareLinkViewerUserId } from "./shareLinks";

export const VIEW_AS_COOKIE_NAME = "sf_view_as_user_id";

/**
 * The real, actually-authenticated user id -- ignores the "view as"
 * cookie entirely. Only used by actions.ts's view-as gate itself, so
 * that gate always checks the real admin's identity, never whichever
 * person they're currently previewing as.
 */
export async function getRealCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * The effective current user id for everything else in the app:
 * usually the real signed-in user, but overridden by the "view as"
 * cookie when the real signed-in user is a platform admin (set via
 * actions.ts's setViewAsUser). Ignored for anyone else -- a non-admin
 * can't grant themselves another identity just by holding the cookie.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const realUserId = await getRealCurrentUserId();
  const store = await cookies();

  if (!realUserId) {
    // No real Auth.js session -- the one other way to have an identity at
    // all is a valid, unexpired, unrevoked /share/<token> link (see
    // shareLinks.ts). Resolves to the role-less Demo Viewer, so every
    // write Server Action's existing role/admin check rejects it same as
    // it would anyone else holding no role.
    const shareToken = store.get(SHARE_LINK_COOKIE_NAME)?.value;
    return resolveShareLinkViewerUserId(shareToken);
  }

  // Desktop build only: "view as" has no meaning here -- there is only
  // ever one real identity in local mode (the auto-signed-in Local
  // Admin), and getCurrentUserRoleKeysForProject/getCurrentUserGlobalRoleKeys
  // below already grant that one identity every role outright (see
  // their own comment, reversed 29 Aug 2026), so there's no second
  // persona for this cookie to usefully switch to or away from.
  if (process.env.STAGEFORGE_LOCAL_MODE === "1") return realUserId;

  const viewAsId = store.get(VIEW_AS_COOKIE_NAME)?.value;
  if (!viewAsId) return realUserId;

  const realUser = await db.user.findUnique({ where: { id: realUserId }, select: { isPlatformAdmin: true } });
  if (!realUser?.isPlatformAdmin) return realUserId;

  // The view-as target must still exist -- a stale cookie pointing at a
  // since-deleted/re-seeded user (found live, 27 Aug 2026, in the local
  // desktop build after a database reset left an old view-as cookie
  // dangling) must not silently take down the real admin's own session:
  // getCurrentUser() would resolve to null, hiding the header entirely --
  // including the "Stop viewing as" control that would otherwise clear
  // this exact cookie, a dead end with no way back. Falling back to the
  // real user here instead makes that self-healing.
  const viewAsUserExists = await db.user.findUnique({ where: { id: viewAsId }, select: { id: true } });
  return viewAsUserExists ? viewAsId : realUserId;
}

export async function getCurrentUser() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return db.user.findUnique({ where: { id: userId } });
}

// Desktop build only. Reversed 29 Aug 2026 from the 28 Aug 2026 change
// that made the Local Admin hold no roles at all (see getCurrentUserId's
// own comment on that): real end users hit it immediately -- a project
// stuck forever "still waiting for Compliance Officer review" with no
// second person on the machine who could ever hold that role. There is
// only ever one real identity in local mode (getCurrentUserId above
// ignores "view as" entirely), so there is no one else this could ever
// be granted to by mistake, and every role-gated screen already shows
// the real "Requires {role}" badge regardless (that label comes from
// the deliverable/requirement's own bypassAuthority/overrideAuthority
// field, not from whether the current user can act) -- so the warning
// Kevin asked to keep is already there. This just stops it from also
// being a dead end: the Local Admin can act as every role, the same way
// a real single-person trial of the tool would need to, instead of
// getting permanently stuck on a sign-off nobody else can ever give.
async function allRoleKeys(): Promise<string[]> {
  const roles = await db.role.findMany({ select: { key: true } });
  return roles.map((r) => r.key);
}

/** Role keys the current user holds on a specific project. */
export async function getCurrentUserRoleKeysForProject(
  projectId: string
): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  if (process.env.STAGEFORGE_LOCAL_MODE === "1") return allRoleKeys();
  const assignments = await db.projectRoleAssignment.findMany({
    where: { userId, projectId },
    include: { role: true },
  });
  return assignments.map((a) => a.role.key);
}

/**
 * Role keys the current user holds on ANY project, deduped. A draft
 * project from AI-assisted provisioning has no role assignments yet
 * (ProvisioningModel.html §05 open question — full per-project role
 * assignment at draft time isn't solved), so "is this person a
 * Compliance Officer anywhere" is the interim stand-in for reviewer
 * authority on a project that doesn't have one assigned yet.
 */
export async function getCurrentUserGlobalRoleKeys(): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  // See getCurrentUserRoleKeysForProject's comment above -- same reasoning,
  // same single-identity guarantee in local mode.
  if (process.env.STAGEFORGE_LOCAL_MODE === "1") return allRoleKeys();
  const assignments = await db.projectRoleAssignment.findMany({
    where: { userId },
    include: { role: true },
  });
  return Array.from(new Set(assignments.map((a) => a.role.key)));
}
