import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DELIVERY_FACING_ROLE_KEYS } from "@/lib/permissions";
import { getCurrentUserRoleKeysForProject } from "@/lib/session";
import { reinstateStage, setResourceAllocation } from "@/lib/actions";
import { neededDisciplineRoleKeys } from "@/lib/disciplineTeam";
import { constituentTemplateIds } from "@/lib/projectTemplates";
import { SubmitButton } from "@/components/SubmitButton";
import { RemoveRoleAssignmentButton } from "@/components/RemoveRoleAssignmentButton";

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
      additionalTemplates: {
        include: { template: { include: { stageTemplates: { orderBy: { order: "asc" } } } } },
      },
      stages: { orderBy: { order: "asc" } },
      roleAssignments: { include: { role: true, user: true } },
      resourceAllocations: true,
    },
  });
  if (!project) notFound();

  // A merged project (see ProjectAdditionalTemplate) is built from more
  // than just its primary template — every "systems covered" / "which
  // stages does this project's checklist define" computation below
  // needs the full constituent set, not just project.template.
  const constituentTemplates = [project.template, ...project.additionalTemplates.map((a) => a.template)];

  const roleKeys = await getCurrentUserRoleKeysForProject(project.id);
  const isPM = roleKeys.includes("PM");

  const allocationByUserId = new Map(project.resourceAllocations.map((a) => [a.userId, a.allocationPercent]));
  const seenTeamUserIds = new Set<string>();
  const teamRows = project.roleAssignments
    .filter((a) => DELIVERY_FACING_ROLE_KEYS.includes(a.role.key))
    // Someone who's left the company (archiveUser) drops out of the
    // active team list here too — their ProjectRoleAssignment row is
    // left untouched (still a real historical fact), just not shown.
    .filter((a) => !a.user.archivedAt)
    .filter((a) => {
      if (seenTeamUserIds.has(a.userId)) return false;
      seenTeamUserIds.add(a.userId);
      return true;
    })
    .map((a) => ({
      assignmentId: a.id,
      userId: a.userId,
      name: a.user.name,
      roleName: a.role.name,
      allocationPercent: allocationByUserId.get(a.userId) ?? null,
    }));

  const instantiatedKeys = new Set(project.stages.map((s) => s.key));
  // Deduped by stage key across every constituent template — a stage
  // key only one of two merged templates has excluded (already
  // instantiated via the other) shouldn't show as "excluded from scope"
  // just because it wasn't in the primary template's own list.
  const seenStageKeys = new Set<string>();
  const excludedTemplateStages = constituentTemplates
    .flatMap((t) => t.stageTemplates)
    .filter((st) => !instantiatedKeys.has(st.key))
    .filter((st) => {
      if (seenStageKeys.has(st.key)) return false;
      seenStageKeys.add(st.key);
      return true;
    });

  // Discipline role requirements this project calls out (lib/
  // disciplineTeam.ts) but nobody's actually assigned to yet — either
  // because no candidate is known for that role at all (e.g. AE Water),
  // or a suggested candidate couldn't be assigned (missing home
  // department). Surfaced even without a name to put against it
  // (confirmed 24 Aug 2026), so the gap doesn't just silently disappear.
  const assignedRoleKeys = new Set(project.roleAssignments.filter((a) => !a.user.archivedAt).map((a) => a.role.key));
  const neededRoleKeys = await neededDisciplineRoleKeys(constituentTemplateIds(project), project.worksType);
  const unfilledRoleKeys = Array.from(neededRoleKeys).filter((k) => !assignedRoleKeys.has(k));
  const unfilledRoles =
    unfilledRoleKeys.length > 0
      ? (await db.role.findMany({ where: { key: { in: unfilledRoleKeys } } })).sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      : [];

  return (
    <div className="flex flex-col gap-6">
      {constituentTemplates.length > 1 && (
        <div className="rounded-lg border border-rule bg-surface p-5">
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Systems covered</h2>
          <div className="flex flex-wrap gap-1.5">
            {constituentTemplates.map((t) => (
              <span
                key={t.id}
                className="rounded bg-accentsoft px-2 py-0.5 text-xs font-semibold text-accent"
              >
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-rule bg-surface p-5">
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Team &amp; capacity</h2>
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
                  <div className="flex items-center gap-2">
                    <form
                      action={setResourceAllocation.bind(null, project.id, row.userId, project.projectNumber)}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        name="allocationPercent"
                        aria-label={`${row.name}'s allocation, percent`}
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={row.allocationPercent ?? ""}
                        placeholder="%"
                        className="w-16 rounded border border-inkmuted bg-bg px-2 py-1 text-right text-sm"
                      />
                      <span className="text-xs text-inkmuted">%</span>
                      <SubmitButton
                        pendingText="…"
                        className="rounded border border-rule px-2 py-1 text-xs font-semibold text-accent hover:bg-surface2"
                      >
                        Set
                      </SubmitButton>
                    </form>
                    <RemoveRoleAssignmentButton
                      assignmentId={row.assignmentId}
                      projectId={project.id}
                      projectNumber={project.projectNumber}
                      personName={row.name}
                      roleName={row.roleName}
                    />
                  </div>
                ) : (
                  <span className="font-mono text-sm text-inkmuted">
                    {row.allocationPercent !== null ? `${row.allocationPercent}%` : "Not set"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {unfilledRoles.length > 0 && (
          <div className="mt-4 border-t border-dashed border-rule pt-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-warn">
              Still needs assignment
            </div>
            <p className="mb-2 text-xs text-inkmuted">
              This project&rsquo;s own checklist calls for these roles, but nobody&rsquo;s assigned to them yet —
              add a name on the{" "}
              <a href="/team" className="text-accent hover:underline">
                Team
              </a>{" "}
              page.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unfilledRoles.map((role) => (
                <span
                  key={role.id}
                  className="rounded bg-warn/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warn"
                >
                  {role.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {excludedTemplateStages.length > 0 && (
        <div>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Excluded from scope</h2>
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
                  <form action={reinstateStage.bind(null, project.id, st.key, project.projectNumber)}>
                    <SubmitButton
                      pendingText="Reinstating…"
                      className="rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-accent hover:bg-surface2"
                    >
                      + Reinstate
                    </SubmitButton>
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
