import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DELIVERY_FACING_ROLE_KEYS, outstandingComplianceCount, outstandingDeliverableCount } from "@/lib/permissions";
import { getCurrentUserRoleKeysForProject } from "@/lib/session";
import { reinstateStage, setResourceAllocation } from "@/lib/actions";
import { GateAccordionRow } from "@/components/GateAccordionRow";
import { GateDetail } from "@/components/GateDetail";

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  AWAITING_SPONSOR: "Awaiting Sponsor",
  SIGNED_OFF: "Signed off",
};

const STATUS_CLASS: Record<string, string> = {
  NOT_STARTED: "bg-surface2 text-inkmuted",
  IN_PROGRESS: "bg-accent text-white",
  AWAITING_SPONSOR: "bg-accent text-white",
  SIGNED_OFF: "bg-accentsoft text-ok",
};

export default async function ProjectGateOverviewPage({
  params,
}: {
  params: Promise<{ projectNumber: string }>;
}) {
  const { projectNumber } = await params;

  const project = await db.project.findUnique({
    where: { projectNumber },
    include: {
      template: { include: { stageTemplates: { orderBy: { order: "asc" } } } },
      stages: {
        orderBy: { order: "asc" },
        include: { gate: { include: { deliverables: true, complianceRequirements: true, signOffs: true } } },
      },
      roleAssignments: { include: { role: true, department: { include: { company: true } }, user: true } },
      resourceAllocations: true,
    },
  });
  if (!project) notFound();

  const roleKeys = await getCurrentUserRoleKeysForProject(project.id);
  const isPM = roleKeys.includes("PM");

  const contractorAssignment = project.roleAssignments.find((a) => a.role.key === "FM_CONTRACTOR");
  const authorityAssignment = project.roleAssignments.find((a) => a.role.key === "CLIENT_AUTHORITY");

  // Resource/Capacity view (ResourceCapacityModel.html §05) — one row per
  // delivery-facing person, deduped in case someone holds two such roles
  // on this project (their allocation is one number, not one per hat).
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
  const excludedTemplateStages = project.template.stageTemplates.filter(
    (st) => !instantiatedKeys.has(st.key)
  );

  return (
    <div>
      {(contractorAssignment || authorityAssignment) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-rule bg-surface2 px-10 py-4">
          {contractorAssignment && (
            <div className="rounded-lg border border-rule bg-surface px-3.5 py-2">
              <div className="font-mono text-[9px] uppercase tracking-wide text-inkmuted">
                FM Contractor
              </div>
              <div className="text-sm font-semibold">
                {contractorAssignment.department.company.name}
              </div>
            </div>
          )}
          {contractorAssignment && authorityAssignment && (
            <span className="text-inkmuted">&rarr;</span>
          )}
          {authorityAssignment && (
            <div className="rounded-lg border border-rule bg-surface px-3.5 py-2">
              <div className="font-mono text-[9px] uppercase tracking-wide text-inkmuted">
                Client Authority
              </div>
              <div className="text-sm font-semibold">
                {authorityAssignment.department.company.name} -{" "}
                {authorityAssignment.department.name}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-10 py-10">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="font-mono text-xs uppercase tracking-wide text-inkmuted">
            Project No. {project.projectNumber} &middot; {project.template.name}
          </div>
        </div>

        {teamRows.length > 0 && (
          <div className="rounded-lg border border-rule bg-surface p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              Team &amp; capacity
            </div>
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
          </div>
        )}

        <div className="flex flex-col gap-3">
          {project.stages.map((stage) => {
            const gate = stage.gate;
            if (!gate) return null;
            const outstanding = outstandingDeliverableCount(gate.deliverables);
            const outstandingCompliance = outstandingComplianceCount(gate.complianceRequirements);
            const isCurrent = gate.status === "IN_PROGRESS" || gate.status === "AWAITING_SPONSOR";
            return (
              <GateAccordionRow
                key={stage.id}
                highlight={isCurrent}
                defaultExpanded={isCurrent}
                summary={
                  <>
                    <div className="flex-1">
                      <div className="text-base font-semibold">{gate.name}</div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-inkmuted">
                        <span>{gate.deliverables.length} deliverable(s)</span>
                        {outstanding > 0 && <span>{outstanding} delivery outstanding</span>}
                        {gate.complianceRequirements.length > 0 && (
                          <span>{gate.complianceRequirements.length} compliance requirement(s)</span>
                        )}
                        {outstandingCompliance > 0 && <span>{outstandingCompliance} compliance outstanding</span>}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide ${STATUS_CLASS[gate.status]}`}
                    >
                      {STATUS_LABEL[gate.status]}
                    </span>
                  </>
                }
              >
                <GateDetail projectNumber={project.projectNumber} gateId={gate.id} />
              </GateAccordionRow>
            );
          })}

          {excludedTemplateStages.map((st) => (
            <div
              key={st.id}
              className="flex items-center gap-5 rounded-lg border border-dashed border-rule px-6 py-5 opacity-70"
            >
              <div className="flex-1">
                <div className="text-base font-semibold">{st.name}</div>
                <div className="mt-1 text-sm text-inkmuted">
                  Excluded from this project&rsquo;s scope
                </div>
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
    </div>
  );
}
