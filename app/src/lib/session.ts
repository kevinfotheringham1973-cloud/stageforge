// Real session, backed by Auth.js (auth.ts) -- replaces the old dev-only
// cookie stub that trusted a raw User.id with no identity check. Kept
// the same 4 exported function signatures on purpose: every call site
// across the app (10 files, all going through these) needed zero
// changes when this swapped from "trust the cookie" to "read the real
// session."
import { cookies } from "next/headers";
import { auth } from "./auth";
import { db } from "./db";

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
  if (!realUserId) return null;

  const store = await cookies();
  const viewAsId = store.get(VIEW_AS_COOKIE_NAME)?.value;
  if (!viewAsId) return realUserId;

  const realUser = await db.user.findUnique({ where: { id: realUserId }, select: { isPlatformAdmin: true } });
  return realUser?.isPlatformAdmin ? viewAsId : realUserId;
}

export async function getCurrentUser() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return db.user.findUnique({ where: { id: userId } });
}

/** Role keys the current user holds on a specific project. */
export async function getCurrentUserRoleKeysForProject(
  projectId: string
): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
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
  const assignments = await db.projectRoleAssignment.findMany({
    where: { userId },
    include: { role: true },
  });
  return Array.from(new Set(assignments.map((a) => a.role.key)));
}
