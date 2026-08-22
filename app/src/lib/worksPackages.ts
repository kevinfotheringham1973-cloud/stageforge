// A hospital runs 24/7, so a disruption window is precious — extra
// opportunistic work often bundles into it (21 Aug 2026: kitchen
// drainage redesign is reason enough to also do the ventilation and
// lighting while it's cleared). A Works Package is purely an
// organisational label linking otherwise-independent, discipline-pure
// Projects — see schema.prisma's WorksPackage comment.

import type { PrismaClient } from "@prisma/client";

/**
 * Existing-vs-auto resolution used by createProvisioningDraft — a
 * package is optional for the primary system, but becomes mandatory
 * the moment additionalTemplateIds bundles other systems in alongside
 * it, since the package is what links them together. An explicit
 * existing-package pick always wins; autoCreateName (passed only when
 * bundling is happening) is the fallback that guarantees a package
 * still gets created even though the form no longer asks the PM to
 * name one (confirmed 22 Aug 2026: the name is just a
 * portfolio label, not worth a form field — reuses the project's own
 * name instead). Returns null when there's no existing pick and no
 * autoCreateName (the plain solo-project case).
 */
export async function resolveWorksPackageId(
  db: PrismaClient,
  userId: string,
  formData: FormData,
  autoCreateName?: string
): Promise<{ id: string; name: string } | null> {
  const worksPackageId = String(formData.get("worksPackageId") ?? "").trim();

  if (worksPackageId) {
    const wp = await db.worksPackage.findUniqueOrThrow({ where: { id: worksPackageId } });
    return { id: wp.id, name: wp.name };
  }
  if (autoCreateName) {
    // Reuse an existing package with the same name (case-insensitive)
    // rather than silently creating a duplicate — found the hard way,
    // 21 Aug 2026, back when this name came from a free-text field
    // instead of the project name: typing the same name twice created
    // a second, identically-named WorksPackage row, and the dropdown
    // had no way to tell them apart. Same risk exists auto-naming from
    // the project name, so the same guard stays.
    const existing = await db.worksPackage.findFirst({
      where: { name: { equals: autoCreateName, mode: "insensitive" } },
    });
    if (existing) return { id: existing.id, name: existing.name };

    const created = await db.worksPackage.create({
      data: { name: autoCreateName, createdById: userId },
    });
    return { id: created.id, name: created.name };
  }
  return null;
}

/**
 * Every Works Package, for a "link to an existing package" dropdown —
 * deliberately unfiltered (21 Aug 2026: "I expect all the other
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
