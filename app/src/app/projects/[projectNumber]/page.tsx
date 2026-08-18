import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { outstandingDeliverableCount } from "@/lib/permissions";
import { getCurrentUserRoleKeysForProject } from "@/lib/session";
import { reinstateStage } from "@/lib/actions";

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
        include: { gate: { include: { deliverables: true, signOffs: true } } },
      },
      roleAssignments: { include: { role: true, department: { include: { company: true } } } },
    },
  });
  if (!project) notFound();

  const roleKeys = await getCurrentUserRoleKeysForProject(project.id);
  const isPM = roleKeys.includes("PM");

  const contractorAssignment = project.roleAssignments.find((a) => a.role.key === "FM_CONTRACTOR");
  const authorityAssignment = project.roleAssignments.find((a) => a.role.key === "CLIENT_AUTHORITY");

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
                {contractorAssignment.department.company.name} &middot;{" "}
                {contractorAssignment.department.name}
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
                {authorityAssignment.department.company.name} &middot;{" "}
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

        <div className="flex flex-col gap-3">
          {project.stages.map((stage) => {
            const gate = stage.gate;
            if (!gate) return null;
            const outstanding = outstandingDeliverableCount(gate.deliverables);
            return (
              <Link
                key={stage.id}
                href={`/projects/${project.projectNumber}/gates/${gate.id}`}
                className={`flex items-center gap-5 rounded-lg border bg-surface px-6 py-5 ${
                  gate.status === "IN_PROGRESS" || gate.status === "AWAITING_SPONSOR"
                    ? "border-2 border-accent"
                    : "border-rule"
                }`}
              >
                <div className="flex-1">
                  <div className="text-base font-semibold">{gate.name}</div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-inkmuted">
                    <span>{gate.deliverables.length} deliverable(s)</span>
                    {outstanding > 0 && <span>{outstanding} outstanding</span>}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide ${STATUS_CLASS[gate.status]}`}
                >
                  {STATUS_LABEL[gate.status]}
                </span>
              </Link>
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
