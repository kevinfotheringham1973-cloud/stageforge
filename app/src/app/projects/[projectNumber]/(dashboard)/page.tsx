import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DELIVERY_FACING_ROLE_KEYS } from "@/lib/permissions";
import { getCurrentUserRoleKeysForProject } from "@/lib/session";
import { reinstateStage, setResourceAllocation } from "@/lib/actions";

/**
 * The dashboard's default landing panel — everything that isn't about
 * one specific gate: who's on the team at what % FTE, and which
 * template stages this project excluded from scope (with a PM
 * reinstate control). Selected via the rail's "Team & scope" link.
 */
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectNumber: string }>;
}) {
  const { projectNumber } = await params;

  const project = await db.project.findUnique({
    where: { projectNumber },
    include: {
      template: { include: { stageTemplates: { orderBy: { order: "asc" } } } },
      stages: { orderBy: { order: "asc" } },
      roleAssignments: { include: { role: true, user: true } },
      resourceAllocations: true,
    },
  });
  if (!project) notFound();

  const roleKeys = await getCurrentUserRoleKeysForProject(project.id);
  const isPM = roleKeys.includes("PM");

  const allocationByUserId = new Map(project.resourceAllocations.map((a) => [a.userId, a.allocationPercent]));
  const seenTeamUserIds = new Set<string>();
  const teamRows = project.roleAssignments
    .filter((a) => DELIVERY_FACING_ROLE_KEYS.includes(a.role.key))
    .filter((a) => {
      if (seenTeamUserIds.has(a.userId)) return false;
      seenTeamUserIds.add(a.userId);
      return true;
    })
    .map((a) => ({
      userId: a.userId,
      name: a.user.name,
      roleName: a.role.name,
      allocationPercent: allocationByUserId.get(a.userId) ?? null,
    }));

  const instantiatedKeys = new Set(project.stages.map((s) => s.key));
  const excludedTemplateStages = project.template.stageTemplates.filter((st) => !instantiatedKeys.has(st.key));

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-rule bg-surface p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Team &amp; capacity</div>
        {teamRows.length === 0 ? (
          <p className="text-sm text-inkmuted">No delivery-facing roles assigned yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {teamRows.map((row) => (
              <div key={row.userId} className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-semibold">{row.name}</span>{" "}
                  <span className="text-inkmuted">&middot; {row.roleName}</span>
                </div>
                {isPM ? (
                  <form
                    action={setResourceAllocation.bind(null, project.id, row.userId, project.projectNumber)}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      name="allocationPercent"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={row.allocationPercent ?? ""}
                      placeholder="%"
                      className="w-16 rounded border border-rule bg-bg px-2 py-1 text-right text-sm"
                    />
                    <span className="text-xs text-inkmuted">%</span>
                    <button
                      type="submit"
                      className="rounded border border-rule px-2 py-1 text-xs font-semibold text-accent hover:bg-surface2"
                    >
                      Set
                    </button>
                  </form>
                ) : (
                  <span className="font-mono text-sm text-inkmuted">
                    {row.allocationPercent !== null ? `${row.allocationPercent}%` : "Not set"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {excludedTemplateStages.length > 0 && (
        <div>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Excluded from scope</div>
          <div className="flex flex-col gap-3">
            {excludedTemplateStages.map((st) => (
              <div
                key={st.id}
                className="flex items-center gap-5 rounded-lg border border-dashed border-rule px-6 py-5 opacity-70"
              >
                <div className="flex-1">
                  <div className="text-base font-semibold">{st.name}</div>
                  <div className="mt-1 text-sm text-inkmuted">Excluded from this project&rsquo;s scope</div>
                </div>
                {isPM ? (
                  <form action={reinstateStage.bind(null, project.id, st.id, project.projectNumber)}>
                    <button
                      type="submit"
                      className="rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-accent hover:bg-surface2"
                    >
                      + Reinstate
                    </button>
                  </form>
                ) : (
                  <span className="rounded-full border border-rule px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-inkmuted">
                    Not in scope
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
