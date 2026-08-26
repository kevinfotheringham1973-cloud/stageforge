import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getMandatoryApprovalTracker, type ApprovalItemStatus } from "@/lib/approvalsTracker";
import { groupRolesByCategory } from "@/lib/roleCategories";
import { gateTimelineStatus, GATE_TIMELINE_LABELS, GATE_TIMELINE_TEXT_CLASS } from "@/lib/permissions";

const STATUS_LABEL: Record<ApprovalItemStatus, string> = {
  PENDING: "Outstanding",
  EVIDENCED: "Evidenced",
  BYPASSED: "Bypassed",
  OVERRIDDEN: "Overridden",
};

const STATUS_CLASS: Record<ApprovalItemStatus, string> = {
  PENDING: "text-warn",
  EVIDENCED: "text-ok",
  BYPASSED: "text-flag",
  OVERRIDDEN: "text-flag",
};

/**
 * The "Mandatory Approvals Tracker" (26 Aug 2026, per "Project Roles
 * and Responsibilities Template.docx") — every Safety Group/AE/AP/
 * statutory sign-off this project's own checklist calls for, whether
 * anyone's named against it yet, and whether it's actually been given.
 * Purely a read view: no new Server Actions — every status/evidence
 * change still happens on the gate itself (linked to from here).
 */
export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ projectNumber: string }>;
}) {
  const { projectNumber } = await params;

  const project = await db.project.findUnique({
    where: { projectNumber },
    include: {
      roleAssignments: { include: { role: true, user: true } },
      stages: {
        orderBy: { order: "asc" },
        include: {
          gate: {
            include: {
              deliverables: { select: { key: true, label: true, status: true, bypassAuthority: true } },
              complianceRequirements: { include: { coSignOffs: true } },
            },
          },
        },
      },
    },
  });
  if (!project) notFound();

  const { holdPoints, roleRows } = await getMandatoryApprovalTracker(db, project);
  const groups = groupRolesByCategory(roleRows);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-xl font-bold">Mandatory approvals</h1>
        <p className="text-sm text-inkmuted">
          Every Safety Group, Authorised Engineer/Person, and statutory sign-off this project&rsquo;s own
          checklist calls for &mdash; and whether it&rsquo;s been given yet.
        </p>
      </div>

      {holdPoints.length > 0 && (
        <div>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
            Pre-Contract Hold Point
          </h2>
          <div className="flex flex-col gap-3">
            {holdPoints.map((hp) => {
              const ts = gateTimelineStatus({
                status: hp.gateStatus,
                targetStartDate: hp.targetStartDate,
                targetEndDate: hp.targetEndDate,
                actualEndDate: hp.actualEndDate,
              });
              return (
                <div key={`${hp.gateId}-${hp.key}`} className="rounded-lg border-2 border-risk bg-risk/5 p-5">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{hp.label}</span>
                    <span className={`font-mono text-[10px] uppercase tracking-wide ${STATUS_CLASS[hp.status]}`}>
                      {STATUS_LABEL[hp.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <a href={`/projects/${projectNumber}/gates/${hp.gateId}`} className="text-accent hover:underline">
                      {hp.stageName}
                    </a>
                    <span className={GATE_TIMELINE_TEXT_CLASS[ts]}>{GATE_TIMELINE_LABELS[ts]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.category}>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">{group.label}</h2>
          <div className="flex flex-col gap-3">
            {group.roles.map((role) => {
              const isHeavy = role.roleKey === "SRO" || role.isExactMatchAuthority;
              return (
                <div
                  key={role.roleKey}
                  className={`rounded-lg border p-5 ${isHeavy ? "border-2 border-risk bg-risk/5" : "border-rule bg-surface"}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{role.roleName}</span>
                    {role.assignedUsers.length > 0 ? (
                      <span className="text-sm text-inkmuted">
                        {role.assignedUsers.map((u) => u.name).join(", ")}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wide text-warn">
                        Not yet assigned
                      </span>
                    )}
                  </div>
                  {role.assignedUsers.length === 0 && (
                    <p className="mb-2 text-xs text-inkmuted">
                      Nobody&rsquo;s assigned to this role on this project yet &mdash; add a name on the{" "}
                      <a href="/team" className="text-accent hover:underline">
                        Team
                      </a>{" "}
                      page.
                    </p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {role.items.map((item) => (
                      <div
                        key={`${item.gateId}-${item.key}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <a
                          href={`/projects/${projectNumber}/gates/${item.gateId}`}
                          className="text-accent hover:underline"
                        >
                          {item.label}
                        </a>
                        <span className={`font-mono text-[10px] uppercase tracking-wide ${STATUS_CLASS[item.status]}`}>
                          {STATUS_LABEL[item.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {holdPoints.length === 0 && groups.length === 0 && (
        <p className="text-sm text-inkmuted">
          This project&rsquo;s checklist doesn&rsquo;t currently call for any mandatory approval beyond the
          standard PM/Compliance Officer sign-off chain.
        </p>
      )}
    </div>
  );
}
