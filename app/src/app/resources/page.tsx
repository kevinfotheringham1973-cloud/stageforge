import { db } from "@/lib/db";
import { DELIVERY_FACING_ROLE_KEYS, isProjectStillLive } from "@/lib/permissions";

/**
 * Resource / Portfolio Manager view (ResourceCapacityModel.html §05) —
 * read-only, portfolio-wide: one row per delivery-facing person across
 * every still-live project, their summed % allocation, and a per-project
 * breakdown. Over 100% is the over-allocation signal this view exists to
 * surface; it doesn't resolve it.
 */
export default async function ResourcesPage() {
  const projects = await db.project.findMany({
    where: { status: "ACTIVE" },
    include: {
      stages: { include: { gate: true } },
      roleAssignments: { include: { role: true, user: true } },
      resourceAllocations: true,
    },
  });

  const liveProjects = projects.filter((p) =>
    isProjectStillLive(p.stages.map((s) => s.gate).filter((g): g is NonNullable<typeof g> => g !== null))
  );

  type ProjectRow = { projectNumber: string; projectName: string; roleName: string; allocationPercent: number };
  const byUser = new Map<string, { name: string; total: number; projects: ProjectRow[] }>();

  for (const project of liveProjects) {
    const allocationByUserId = new Map(project.resourceAllocations.map((a) => [a.userId, a.allocationPercent]));
    const seenUserIds = new Set<string>();
    for (const a of project.roleAssignments) {
      if (!DELIVERY_FACING_ROLE_KEYS.includes(a.role.key)) continue;
      if (seenUserIds.has(a.userId)) continue;
      seenUserIds.add(a.userId);

      const allocationPercent = allocationByUserId.get(a.userId) ?? 0;
      const entry = byUser.get(a.userId) ?? { name: a.user.name, total: 0, projects: [] };
      entry.total += allocationPercent;
      entry.projects.push({
        projectNumber: project.projectNumber,
        projectName: project.name,
        roleName: a.role.name,
        allocationPercent,
      });
      byUser.set(a.userId, entry);
    }
  }

  const rows = Array.from(byUser.values()).sort((a, b) => b.total - a.total);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Resource &amp; capacity</h1>
      <p className="mb-8 text-sm text-inkmuted">
        Delivery-facing team members across every live project — % FTE, current state only, no
        forecasting. A project drops out once every one of its gates is signed off.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-inkmuted">No delivery-facing role holders on any live project yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const overAllocated = row.total > 100;
            return (
              <div
                key={row.name}
                className={`rounded-lg border bg-surface p-5 ${overAllocated ? "border-dashed border-risk" : "border-rule"}`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{row.name}</span>
                  <span
                    className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide ${
                      overAllocated ? "bg-risk text-white" : "bg-accentsoft text-ok"
                    }`}
                  >
                    {row.total}% allocated
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {row.projects.map((p) => (
                    <div key={p.projectNumber} className="font-mono text-xs text-inkmuted">
                      {p.allocationPercent}% &middot; {p.projectName} (#{p.projectNumber}) &middot; {p.roleName}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
