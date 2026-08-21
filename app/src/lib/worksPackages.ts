// A hospital runs 24/7, so a disruption window is precious — extra
// opportunistic work often bundles into it (Kevin, 21 Aug 2026: kitchen
// drainage redesign is reason enough to also do the ventilation and
// lighting while it's cleared). A Works Package is purely an
// organisational label linking otherwise-independent, discipline-pure
// Projects — see schema.prisma's WorksPackage comment.

import type { PrismaClient } from "@prisma/client";
import { isProjectStillLive } from "./permissions";

/**
 * Works Packages worth offering in a "link to an existing package"
 * dropdown — ones with at least one project that isn't fully signed
 * off yet. A package where every project already closed out has nothing
 * left to bundle new work into.
 */
export async function listOpenWorksPackages(db: PrismaClient) {
  const packages = await db.worksPackage.findMany({
    orderBy: { name: "asc" },
    include: {
      projects: {
        select: {
          stages: { select: { gate: { select: { status: true } } } },
        },
      },
    },
  });

  return packages
    .filter((wp) =>
      wp.projects.some((p) =>
        isProjectStillLive(p.stages.map((s) => s.gate).filter((g): g is NonNullable<typeof g> => g !== null))
      )
    )
    .map((wp) => ({ id: wp.id, name: wp.name }));
}
