// DEV-ONLY STUB. There is no real authentication here — this reads a
// cookie set by the "act as" switcher in the header and trusts it
// completely. Replace with real auth (and a real session store)
// before this goes anywhere near a second person.

import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE_NAME = "sf_user_id";

export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  const rawId = store.get(COOKIE_NAME)?.value ?? null;
  if (!rawId) return null;

  const exists = await db.user.findUnique({ where: { id: rawId }, select: { id: true } });
  if (!exists) {
    // Stale cookie pointing at a user id that no longer exists (e.g.
    // left over from a `prisma migrate reset` that regenerated every
    // user's id) — treat it the same as signed-out instead of letting
    // it flow into a raw FK-violation crash wherever this id gets used.
    try {
      store.delete(COOKIE_NAME);
    } catch {
      // Cookies are read-only during a Server Component render; only
      // Server Actions/Route Handlers can clear it. Safe to ignore —
      // the stale value gets re-checked (and cleared) on the next one.
    }
    return null;
  }

  return rawId;
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

export const SESSION_COOKIE_NAME = COOKIE_NAME;
