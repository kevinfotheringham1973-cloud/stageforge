// DEV-ONLY STUB. There is no real authentication here — this reads a
// cookie set by the "act as" switcher in the header and trusts it
// completely. Replace with real auth (and a real session store)
// before this goes anywhere near a second person.

import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE_NAME = "sf_user_id";

export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
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

export const SESSION_COOKIE_NAME = COOKIE_NAME;
