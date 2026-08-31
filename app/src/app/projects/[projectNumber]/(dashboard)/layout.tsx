import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { GateStatus } from "@prisma/client";
import {
  GATE_TIMELINE_BAR_CLASS,
  GATE_TIMELINE_LABELS,
  GATE_TIMELINE_TEXT_CLASS,
  gateTimelineStatus,
  projectTimelineHeadline,
  type GateTimelineStatus,
} from "@/lib/permissions";
import { getCurrentUser, getCurrentUserRoleKeysForProject } from "@/lib/session";
import { setProjectDemoFlag } from "@/lib/actions";
import { GateRail } from "@/components/GateRail";
import { DeleteProjectForm } from "@/components/DeleteProjectForm";
import { SubmitButton } from "@/components/SubmitButton";

const APPROVAL_BUCKET_LABELS: Record<string, string> = {
  LIFECYCLE_REPLACEMENT: "Lifecycle replacement",
  SMALL_WORKS: "Small works",
  VARIATION: "Variation",
};

const GBP = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Rail dot colour: timeline health where a target exists (it's the more
 * specific signal — a signed-off gate that finished late still deserves
 * an amber dot), falling back to plain gate status where no target was
 * ever set.
 */
function railDot(gate: {
  status: GateStatus;
  targetStartDate: Date | null;
  targetEndDate: Date | null;
  actualEndDate: Date | null;
}): string {
  const ts = gateTimelineStatus(gate);
  const byTimeline: Partial<Record<GateTimelineStatus, string>> = {
    IN_PROGRESS_OVERDUE: "risk",
    NOT_STARTED_OVERDUE: "warn",
    COMPLETED_LATE: "warn",
    IN_PROGRESS_ON_TRACK: "accent",
    COMPLETED_ON_TIME: "ok",
    NOT_STARTED_ON_TRACK: "muted",
  };
  if (byTimeline[ts]) return byTimeline[ts]!;
  if (gate.status === "SIGNED_OFF") return "ok";
  if (gate.status === "IN_PROGRESS" || gate.status === "AWAITING_SPONSOR") return "accent";
  return "muted";
}

/**
 * The project dashboard shell (Gate Dashboard mockup, confirmed
 * 19 Aug 2026): a persistent KPI strip + full timeline up top, a side
 * rail to switch gates below, replacing the old single-page scroll of
 * every gate's accordion. `children` is whichever gate (or the
 * Team & scope overview) is currently selected — routed, not client
 * state, so each panel is its own bookmarkable/shareable URL and only
 * that panel's data is fetched.
 */
export default async function ProjectDashboardLayout({
  params,
  children,
}: {
  params: Promise<{ projectNumber: string }>;
  children: React.ReactNode;
}) {
  const { projectNumber } = await params;

  const project = await db.project.findUnique({
    where: { projectNumber },
    include: {
      roleAssignments: { include: { role: true, user: true, department: { include: { company: true } } } },
      worksPackage: { include: { projects: { select: { projectNumber: true, name: true } } } },
      stages: {
        orderBy: { order: "asc" },
        include: {
          gate: { include: { deliverables: true, complianceRequirements: true, spendRecords: true } },
        },
      },
    },
  });
  if (!project) notFound();

  const [roleKeys, currentUser] = await Promise.all([
    getCurrentUserRoleKeysForProject(project.id),
    getCurrentUser(),
  ]);
  const worksPackageSiblings = project.worksPackage?.projects.filter((p) => p.projectNumber !== projectNumber) ?? [];
  const isPlatformAdmin = currentUser?.isPlatformAdmin ?? false;
  // Desktop build: no demo-project tooling at all (the fast-forward
  // action itself refuses in local mode too — this just keeps the
  // toggle from ever appearing there in the first place).
  const isLocalMode = process.env.STAGEFORGE_LOCAL_MODE === "1";

  const contractorAssignment = project.roleAssignments.find((a) => a.role.key === "FM_CONTRACTOR");
  const authorityAssignment = project.roleAssignments.find((a) => a.role.key === "CLIENT_AUTHORITY");

  // Roles are assigned per project, not globally — the same person can be
  // PM on one project and hold no role at all on another (e.g. a project
  // created live by a different PM). The Acting-as switcher's role label
  // is a global summary, so it can't warn about this; this banner checks
  // the actual per-project assignment and, if the acting-as user holds
  // none, tells them who does — otherwise every action on this project
  // looks unexplainably unavailable.
  const hasNoRoleHere = currentUser !== null && roleKeys.length === 0;
  const roleHoldersHere = Array.from(
    new Map(project.roleAssignments.map((a) => [`${a.role.name}:${a.user.name}`, a])).values()
  ).sort((a, b) => a.role.name.localeCompare(b.role.name));

  const gates = project.stages.map((s) => s.gate).filter((g): g is NonNullable<typeof g> => g !== null);

  // ── Cost ──────────────────────────────────────────────────────
  const allSpendRecords = gates.flatMap((g) => g.spendRecords);
  const totalSpend = allSpendRecords.reduce((sum, s) => sum + Number(s.amount), 0);
  const approvedSpend = allSpendRecords
    .filter((s) => s.status === "APPROVED")
    .reduce((sum, s) => sum + Number(s.amount), 0);
  const pendingSpendRecords = allSpendRecords.filter((s) => s.status === "PENDING");
  const pendingSpend = pendingSpendRecords.reduce((sum, s) => sum + Number(s.amount), 0);
  const spendByBucket = allSpendRecords.reduce<Record<string, number>>((acc, s) => {
    acc[s.bucket] = (acc[s.bucket] ?? 0) + Number(s.amount);
    return acc;
  }, {});

  // ── Gate activity ─────────────────────────────────────────────
  const signedOffGates = gates.filter((g) => g.status === "SIGNED_OFF");
  const activeGates = gates.filter((g) => g.status === "IN_PROGRESS" || g.status === "AWAITING_SPONSOR");
  const notStartedGates = gates.filter((g) => g.status === "NOT_STARTED");
  const gateTotal = gates.length || 1;
  // Estimated completion: the furthest-out target end date currently
  // set on any gate — the plan's projected finish line, not a
  // statistical forecast off actual pace. Null (and hidden in the UI)
  // until at least one gate has a target end date.
  const targetEndDates = gates.map((g) => g.targetEndDate).filter((d): d is Date => d !== null);
  const estimatedCompletion =
    targetEndDates.length > 0 ? new Date(Math.max(...targetEndDates.map((d) => d.getTime()))) : null;

  // ── Timeline headline (most urgent thing first) ─────────────────
  const now = new Date();
  const gateTimelines = gates.map((g) => ({ gate: g, status: gateTimelineStatus(g, now) }));
  const overdue = gateTimelines.filter((g) => g.status === "IN_PROGRESS_OVERDUE");
  const shouldHaveStarted = gateTimelines.filter((g) => g.status === "NOT_STARTED_OVERDUE");
  const completedLate = gateTimelines.filter((g) => g.status === "COMPLETED_LATE");
  const upcoming = gateTimelines
    .filter((g) => g.status === "NOT_STARTED_ON_TRACK" && g.gate.targetStartDate)
    .sort((a, b) => a.gate.targetStartDate!.getTime() - b.gate.targetStartDate!.getTime())[0];
  const hasAnyTimelineDates = gates.some(
    (g) => g.targetStartDate || g.targetEndDate || g.actualStartDate || g.actualEndDate
  );

  // Headline/class/border come from the shared helper (also used by the
  // root layout's top-bar badge, so the two can't drift to different
  // colours for the same fact) -- sub-text stays computed here since it
  // needs the specific gate/date/count detail the badge doesn't show.
  const { headline: timelineHeadline, headlineClass: timelineHeadlineClass, borderClass: timelineBorderClass } =
    projectTimelineHeadline(gates, now);
  let timelineSub: string;
  if (overdue.length > 0) {
    timelineSub = `target end was ${overdue[0]!.gate.targetEndDate!.toLocaleDateString("en-GB")}`;
  } else if (shouldHaveStarted.length > 0) {
    timelineSub = `target start was ${shouldHaveStarted[0]!.gate.targetStartDate!.toLocaleDateString("en-GB")}`;
  } else if (completedLate.length > 0) {
    timelineSub = `${completedLate.length} gate(s) finished after target`;
  } else if (upcoming) {
    timelineSub = `next target start ${upcoming.gate.targetStartDate!.toLocaleDateString("en-GB")}`;
  } else {
    timelineSub = hasAnyTimelineDates ? "no gate is overdue" : "no target dates set yet";
  }

  // ── Full timeline chart (target/actual bars + today marker) ────
  const timelineDates = [
    now,
    ...gates.flatMap((g) => [g.targetStartDate, g.targetEndDate, g.actualStartDate, g.actualEndDate]),
  ].filter((d): d is Date => d !== null);
  const rangeStartMs = Math.min(...timelineDates.map((d) => d.getTime()));
  const rangeEndMs = Math.max(...timelineDates.map((d) => d.getTime()));
  const rangeMs = Math.max(rangeEndMs - rangeStartMs, 1);
  const timelinePct = (d: Date) => ((d.getTime() - rangeStartMs) / rangeMs) * 100;
  const todayPct = timelinePct(now);

  const railGates = gates.map((g) => ({ id: g.id, name: g.name, dot: railDot(g) }));

  return (
    <div>
      {/*
        Lives here, not in the root layout, on purpose: the root layout
        is shared across every route, and the App Router doesn't
        re-invoke a shared layout on a client-side navigation unless its
        own segment/params changed -- a header-derived value read there
        would still show the last project you were on after navigating
        away to a project-less route (found live 31 Aug 2026). This
        layout's own params genuinely change (or it unmounts entirely)
        on every navigation into/out of a project, so it can't go stale
        the same way.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface px-4 py-3 sm:px-6 md:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-ink">{project.name}</h1>
          <span className="font-mono text-sm text-inkmuted">#{project.projectNumber}</span>
          {gates.length > 0 && (
            <span
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide bg-surface ${timelineHeadlineClass} ${timelineBorderClass}`}
            >
              {timelineHeadline}
            </span>
          )}
          {project.worksType !== "DIRECT_REPLACEMENT_SINGLE_CONTRACTOR" && (
            <span
              className="rounded-full bg-flag px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-white"
              title={
                project.worksType === "BUILDING_MODIFICATION"
                  ? "CDM 2015 applies — Principal Designer engaged, planning permission confirmed"
                  : "CDM 2015 applies — Principal Designer engaged (multiple contractors)"
              }
            >
              {project.worksType === "BUILDING_MODIFICATION" ? "Building modification" : "Multiple contractors"}{" "}
              &middot; CDM 2015
            </span>
          )}
        </div>

        {(contractorAssignment || authorityAssignment) && (
          <div className="flex flex-wrap items-center gap-2">
            {contractorAssignment && (
              <div className="rounded-lg border border-rule bg-surface2 px-3 py-1.5">
                <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">FM Contractor</div>
                <div className="text-sm font-semibold">{contractorAssignment.department.company.name}</div>
              </div>
            )}
            {contractorAssignment && authorityAssignment && <span className="text-inkmuted">&rarr;</span>}
            {authorityAssignment && (
              <div className="rounded-lg border border-rule bg-surface2 px-3 py-1.5">
                <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Client Authority</div>
                <div className="text-sm font-semibold">
                  {authorityAssignment.department.company.name} - {authorityAssignment.department.name}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {hasNoRoleHere && (
          <div className="rounded-lg border border-dashed border-flag bg-accentsoft/40 px-4 py-3 text-sm">
            <span className="font-semibold">{currentUser!.name} has no role on this project.</span> Roles
            here are assigned per project, not globally — a role shown in the &ldquo;Acting as&rdquo;
            dropdown (e.g. &ldquo;PM&rdquo;) only applies on projects that person is actually assigned to,
            so nothing here will be available to act on. Switch &ldquo;Acting as&rdquo; above to one of:{" "}
            {roleHoldersHere.map((a, i) => (
              <span key={`${a.roleId}:${a.userId}`}>
                <span className="font-semibold">{a.user.name}</span> ({a.role.name})
                {i < roleHoldersHere.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </div>
        )}
        <div>
          {project.worksPackage && (
            <div className="mt-1 text-sm text-inkmuted">
              Part of:{" "}
              <a href={`/works-packages/${project.worksPackage.id}`} className="font-semibold text-accent hover:underline">
                {project.worksPackage.name}
              </a>
              {worksPackageSiblings.length > 0 && (
                <>
                  {" "}
                  with{" "}
                  {worksPackageSiblings.map((s, i, arr) => (
                    <span key={s.projectNumber}>
                      <a href={`/projects/${s.projectNumber}`} className="text-accent hover:underline">
                        {s.name}
                      </a>
                      {i < arr.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </>
              )}
              {" · "}
              <a href={`/projects/new?worksPackageId=${project.worksPackage.id}`} className="text-accent hover:underline">
                + Add a system
              </a>
            </div>
          )}
        </div>

        {project.provisioningBrief && (
          <details className="group rounded-lg border border-rule bg-surface px-4 py-3">
            <summary className="cursor-pointer select-none font-mono text-[10px] font-bold uppercase tracking-wide text-inkmuted">
              Project brief &amp; why it was templated this way
            </summary>
            <div className="mt-3 flex flex-col gap-3 text-sm">
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Original brief</div>
                <p className="font-semibold text-ink">{project.provisioningBrief}</p>
              </div>
              {project.provisioningMatchReasoning && (
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Why this template matched
                  </div>
                  <p className="text-inkmuted">{project.provisioningMatchReasoning}</p>
                </div>
              )}
            </div>
          </details>
        )}

        {isPlatformAdmin && !isLocalMode && (
          <div className="rounded-lg border border-dashed border-flag bg-flag/5 p-4">
            <h2 className="mb-1 font-mono text-[10px] uppercase tracking-wide text-flag">Demo tools &middot; platform admin</h2>
            <p className="mb-3 text-sm text-inkmuted">
              A demo project unlocks a &ldquo;Fast-forward this gate&rdquo; button on every gate page —
              fabricates evidence and sign-off to show what a passed gate looks like, without the real
              upload/sign-off flow. Never enable this on a real customer&rsquo;s project.
            </p>
            <form action={setProjectDemoFlag.bind(null, project.id, project.projectNumber)} className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="isDemoProject"
                  defaultChecked={project.isDemoProject}
                  className="h-4 w-4"
                />
                This is a demo project
              </label>
              <SubmitButton pendingText="Saving…" className="rounded border border-rule px-2.5 py-1 text-xs font-semibold text-accent hover:bg-surface2">
                Save
              </SubmitButton>
            </form>
          </div>
        )}

        {isPlatformAdmin && (
          <div className="rounded-lg border border-dashed border-risk bg-risk/5 p-4">
            <h2 className="mb-1 font-mono text-[10px] uppercase tracking-wide text-risk">Danger zone &middot; platform admin</h2>
            <p className="mb-3 text-sm text-inkmuted">
              Permanently deletes this project and everything on it — deliverables, evidence,
              compliance, spend, sign-offs, lessons learned. This cannot be undone.
            </p>
            <DeleteProjectForm projectId={project.id} projectNumber={project.projectNumber} />
          </div>
        )}

        {gates.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Cost */}
            <div
              className={`rounded-lg border bg-surface p-5 ${pendingSpendRecords.length > 0 ? "border-warn" : "border-rule"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">Cost</h2>
                {pendingSpendRecords.length > 0 && (
                  <span className="rounded-full bg-warn px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wide text-white">
                    Needs approval
                  </span>
                )}
              </div>
              <div className="text-3xl font-extrabold">{GBP(totalSpend)}</div>
              <div className="text-sm font-medium text-inkmuted">total recorded</div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <div>
                  <span className="font-semibold text-ok">{GBP(approvedSpend)}</span> approved
                </div>
                {pendingSpendRecords.length > 0 && (
                  <div>
                    <span className="font-semibold text-warn">{GBP(pendingSpend)}</span>{" "}
                    pending ({pendingSpendRecords.length})
                  </div>
                )}
              </div>
              {Object.keys(spendByBucket).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(spendByBucket).map(([bucket, amount]) => (
                    <span
                      key={bucket}
                      className="rounded bg-accentsoft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent"
                    >
                      {APPROVAL_BUCKET_LABELS[bucket] ?? bucket} &middot; {GBP(amount)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Gate activity */}
            <div className="rounded-lg border border-rule bg-surface p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">Gate activity</h2>
                {activeGates.length > 0 && (
                  <span className="rounded-full bg-accent px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wide text-white">
                    {activeGates.length} in progress
                  </span>
                )}
              </div>
              <div className="text-3xl font-extrabold">
                {signedOffGates.length}
                <span className="text-lg font-bold text-inkmuted"> / {gates.length} signed off</span>
              </div>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded bg-surface2">
                <span className="bg-ok" style={{ width: `${(signedOffGates.length / gateTotal) * 100}%` }} />
                <span className="bg-accent" style={{ width: `${(activeGates.length / gateTotal) * 100}%` }} />
                <span className="bg-rule" style={{ width: `${(notStartedGates.length / gateTotal) * 100}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-inkmuted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-ok" />
                  {signedOffGates.length} signed off
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  {activeGates.length} in progress
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rule" />
                  {notStartedGates.length} not started
                </span>
              </div>
              {estimatedCompletion && (
                <div className="mt-2 border-t border-rule pt-2 text-sm">
                  <span className="font-mono text-xs font-semibold uppercase tracking-wide text-inkmuted">
                    Est. completion
                  </span>{" "}
                  <span className="font-bold">{estimatedCompletion.toLocaleDateString("en-GB")}</span>
                </div>
              )}
            </div>

            {/* Timeline headline */}
            <div className={`rounded-lg border bg-surface p-5 ${timelineBorderClass}`}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">Timeline</h2>
                {overdue.length > 0 && (
                  <span className="rounded-full bg-risk px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-wide text-white">
                    {overdue.length} overdue
                  </span>
                )}
              </div>
              <div className={`text-3xl font-extrabold leading-tight ${timelineHeadlineClass}`}>{timelineHeadline}</div>
              <div className="text-sm font-medium text-inkmuted">{timelineSub}</div>
              {(shouldHaveStarted.length > 0 || completedLate.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {shouldHaveStarted.length > 0 && (
                    <div>
                      <span className="font-semibold text-warn">{shouldHaveStarted.length}</span> should have started
                    </div>
                  )}
                  {completedLate.length > 0 && (
                    <div>
                      <span className="font-semibold text-warn">{completedLate.length}</span> completed late
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {hasAnyTimelineDates && (
          <div className="rounded-lg border border-rule bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">Full timeline</h2>
              <div className="font-mono text-[10px] text-inkmuted">
                {new Date(rangeStartMs).toLocaleDateString("en-GB")} &ndash;{" "}
                {new Date(rangeEndMs).toLocaleDateString("en-GB")}
              </div>
            </div>
            <div className="-mx-5 overflow-x-auto px-5">
            <div className="flex min-w-[32rem] flex-col gap-2.5">
              {gates.map((gate) => {
                const status = gateTimelineStatus(gate);
                const hasTarget = gate.targetStartDate && gate.targetEndDate;
                const targetLeft = gate.targetStartDate ? timelinePct(gate.targetStartDate) : 0;
                const targetWidth = hasTarget ? Math.max(timelinePct(gate.targetEndDate!) - targetLeft, 1) : 0;
                const actualLeft = gate.actualStartDate ? timelinePct(gate.actualStartDate) : 0;
                const actualWidth = gate.actualStartDate
                  ? Math.max(timelinePct(gate.actualEndDate ?? now) - actualLeft, 1)
                  : 0;
                return (
                  <div key={gate.id} className="flex items-center gap-3">
                    <div className="w-44 shrink-0 truncate text-sm font-medium" title={gate.name}>
                      {gate.name}
                    </div>
                    <div
                      className={`relative h-6 flex-1 rounded ${
                        hasTarget ? "bg-surface2" : "border border-dashed border-rule bg-transparent"
                      }`}
                    >
                      {todayPct >= 0 && todayPct <= 100 && (
                        <div className="absolute top-0 bottom-0 w-px bg-ink/50" style={{ left: `${todayPct}%` }} />
                      )}
                      {hasTarget && (
                        <div
                          className={`absolute top-0.5 h-2 rounded ${GATE_TIMELINE_BAR_CLASS[status]}`}
                          style={{ left: `${targetLeft}%`, width: `${targetWidth}%` }}
                          title={`Target ${gate.targetStartDate!.toLocaleDateString("en-GB")} – ${gate.targetEndDate!.toLocaleDateString("en-GB")}`}
                        />
                      )}
                      {gate.actualStartDate && (
                        <div
                          className="absolute bottom-0.5 h-2 rounded bg-ink/70"
                          style={{ left: `${actualLeft}%`, width: `${actualWidth}%` }}
                          title={`Actual ${gate.actualStartDate.toLocaleDateString("en-GB")} – ${(gate.actualEndDate ?? now).toLocaleDateString("en-GB")}`}
                        />
                      )}
                    </div>
                    <span className={`w-36 shrink-0 text-right text-xs font-semibold ${GATE_TIMELINE_TEXT_CLASS[status]}`}>
                      {GATE_TIMELINE_LABELS[status]}
                    </span>
                  </div>
                );
              })}
            </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-rule pt-3 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded bg-accent" /> Target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded bg-ink/70" /> Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-px bg-ink/50" /> Today
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
          <GateRail projectNumber={project.projectNumber} gates={railGates} />
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}
