// A hospital runs 24/7, so a disruption window is precious — extra
// opportunistic work often bundles into it (Kevin, 21 Aug 2026: kitchen
// drainage redesign is reason enough to also do the ventilation and
// lighting while it's cleared). A Works Package is purely an
// organisational label linking otherwise-independent, discipline-pure
// Projects — see schema.prisma's WorksPackage comment.

import type { PrismaClient } from "@prisma/client";

/**
 * Shared existing-vs-new resolution used by both createProvisioningDraft
 * (package optional) and createProvisioningDraftBatch (package
 * mandatory — the caller decides which, this just resolves whichever
 * fields are present). An existing pick takes priority over a new name
 * if a form somehow carries both. Returns null when neither field is
 * filled in.
 */
export async function resolveWorksPackageId(
  db: PrismaClient,
  userId: string,
  formData: FormData
): Promise<{ id: string; name: string } | null> {
  const worksPackageId = String(formData.get("worksPackageId") ?? "").trim();
  const newWorksPackageName = String(formData.get("newWorksPackageName") ?? "").trim();

  if (worksPackageId) {
    const wp = await db.worksPackage.findUniqueOrThrow({ where: { id: worksPackageId } });
    return { id: wp.id, name: wp.name };
  }
  if (newWorksPackageName) {
    // Reuse an existing package with the same name (case-insensitive)
    // rather than silently creating a duplicate — found the hard way,
    // 21 Aug 2026: typing "Main Kitchen Refit" into this field a second
    // time (instead of picking it from the existing-package dropdown)
    // created a second, identically-named WorksPackage row, and the
    // dropdown had no way to tell them apart.
    const existing = await db.worksPackage.findFirst({
      where: { name: { equals: newWorksPackageName, mode: "insensitive" } },
    });
    if (existing) return { id: existing.id, name: existing.name };

    const created = await db.worksPackage.create({
      data: { name: newWorksPackageName, createdById: userId },
    });
    return { id: created.id, name: created.name };
  }
  return null;
}

/**
 * Every Works Package, for a "link to an existing package" dropdown —
 * deliberately unfiltered (Kevin, 21 Aug 2026: "I expect all the other
 * packages to be available in that area"). An earlier version hid
 * packages whose every project had already signed off, on the theory
 * there was nothing left to bundle new work into — but that's a
 * judgement call the PM should get to make themselves, not one this
 * dropdown should make for them by hiding options.
 */
export async function listWorksPackages(db: PrismaClient) {
  return db.worksPackage.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
