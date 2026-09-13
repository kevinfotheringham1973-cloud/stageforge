import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { acknowledgeDeliverableStaleness, recordEvidenceStub } from "@/lib/actions";
import { getCurrentUserGlobalRoleKeys, getCurrentUserRoleKeysForProject } from "@/lib/session";
import { canUploadEvidence } from "@/lib/permissions";
import { computeDeliverableStalenessAction, DEFAULT_STALE_AFTER_DAYS } from "@/lib/deliverableStaleness";
import { DeliverableEvidenceSummary } from "@/components/DeliverableEvidenceSummary";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * Project-wide evidence view (added 13 Sep 2026, per Kevin's real-user
 * review of live project #30004's Gate 0): every deliverable across
 * every gate in this project, in one place, so a PM can see what's
 * genuinely missing without opening each gate one at a time — and add
 * evidence to any of them right here, rather than hunting for the right
 * gate first. `generationSourceOptions` (GateDetail.tsx) already treats
 * evidence as project-wide when picking a draft's source documents; this
 * is the first place that view is actually shown to a PM instead of only
 * used internally by that dropdown.
 *
 * Deliberately simpler than the gate page: no AI review/generate request
 * forms here (those stay where the richer per-deliverable context lives,
 * on the gate itself) — this page's only job is "what exists, what's
 * missing, add evidence here."
 */
export default async function EvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectNumber: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { projectNumber } = await params;
  const { filter } = await searchParams;
  const missingOnly = filter === "missing";

  const project = await db.project.findUnique({
    where: { projectNumber },
    select: { id: true, projectNumber: true },
  });
  if (!project) notFound();

  const [roleKeys, globalRoleKeys, allRoles] = await Promise.all([
    getCurrentUserRoleKeysForProject(project.id),
    getCurrentUserGlobalRoleKeys(),
    db.role.findMany(),
  ]);
  const exactMatchAuthorityKeys = new Set(allRoles.filter((r) => r.isExactMatchAuthority).map((r) => r.key));

  const stages = await db.stage.findMany({
    where: { projectId: project.id },
    orderBy: { order: "asc" },
    include: {
      gate: {
        include: {
          deliverables: {
            orderBy: { createdAt: "asc" },
            include: {
              evidenceFiles: { orderBy: { uploadedAt: "desc" } },
              documentReviewRequests: { orderBy: { requestedAt: "desc" } },
              documentGenerationRequests: { orderBy: { requestedAt: "desc" } },
            },
          },
        },
      },
    },
  });

  // A deliverable counts as a genuine gap once it's neither got its own
  // real SUBMITTED evidence nor been consciously waved through --
  // BYPASSED is a real decision with its own recorded reason, not an
  // oversight, so it shouldn't read as "missing" here.
  const allDeliverables = stages.flatMap((s) => s.gate?.deliverables ?? []);
  const totalCount = allDeliverables.length;
  const evidencedCount = allDeliverables.filter((d) => d.evidenceFiles.some((f) => f.kind === "SUBMITTED")).length;
  const gapCount = allDeliverables.filter(
    (d) => !d.evidenceFiles.some((f) => f.kind === "SUBMITTED") && d.status !== "BYPASSED"
  ).length;
  const evidencedPct = totalCount > 0 ? Math.round((evidencedCount / totalCount) * 100) : 0;

  // "Needs attention" — AI Council-style oversight, but sensing time rather
  // than reviewing documents: has this deliverable gone quiet? Deterministic
  // (computeDeliverableStalenessAction, lib/deliverableStaleness.ts), no LLM
  // judgment call, same relay-and-recorder boundary as everything else here.
  // Kevin's framing, 13 Sep 2026: the AI Council isn't only for drafting —
  // it should also surface when a human-owned deliverable has stalled.
  const staleDeliverables = stages.flatMap(({ gate }) => {
    if (!gate) return [];
    return gate.deliverables
      .map((d) => {
        const timestamps = [
          d.createdAt,
          ...d.evidenceFiles.map((f) => f.uploadedAt),
          ...d.documentReviewRequests.map((r) => r.requestedAt),
          ...d.documentGenerationRequests.map((r) => r.requestedAt),
        ];
        const lastActivityAt = new Date(Math.max(...timestamps.map((t) => t.getTime())));
        const action = computeDeliverableStalenessAction({
          status: d.status,
          targetEndDate: gate.targetEndDate,
          lastActivityAt,
          lastStalenessAckAt: d.lastStalenessAckAt,
        });
        return action === "STALE" ? { deliverable: d, gate, lastActivityAt } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Evidence</h2>
          <p className="text-sm text-inkmuted">
            Every deliverable across every gate in this project — what&rsquo;s been submitted, what AI has
            reviewed or drafted, and what&rsquo;s still missing.
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {evidencedCount} of {totalCount} deliverable{totalCount === 1 ? "" : "s"} fully evidenced ({evidencedPct}%)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {staleDeliverables.length > 0 && (
            <span className="rounded-full bg-red-700 px-2.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wide text-white">
              {staleDeliverables.length} needs attention
            </span>
          )}
          {gapCount > 0 && (
            <span className="rounded-full bg-warn px-2.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wide text-white">
              {gapCount} gap{gapCount === 1 ? "" : "s"} requiring evidence
            </span>
          )}
          <div className="flex rounded-lg border border-rule bg-surface p-1">
            <a
              href={`/projects/${projectNumber}/evidence`}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                !missingOnly ? "bg-accentsoft text-accent" : "text-inkmuted hover:bg-accentsoft/50"
              }`}
            >
              Show all gates
            </a>
            <a
              href={`/projects/${projectNumber}/evidence?filter=missing`}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                missingOnly ? "bg-accentsoft text-accent" : "text-inkmuted hover:bg-accentsoft/50"
              }`}
            >
              Only missing evidence
            </a>
          </div>
        </div>
      </div>

      {staleDeliverables.length > 0 && (
        <div className="rounded-lg border border-red-700 bg-red-50 p-5">
          <h3 className="mb-3 font-mono text-sm font-bold uppercase tracking-wide text-red-700">Needs attention</h3>
          <p className="mb-3 text-xs text-inkmuted">
            Either past its gate&rsquo;s target date, or {DEFAULT_STALE_AFTER_DAYS} days with no activity and no
            target date set.
          </p>
          <div className="flex flex-col gap-3">
            {staleDeliverables.map(({ deliverable: d, gate, lastActivityAt }) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-red-200 pt-3 first:border-t-0 first:pt-0">
                <div>
                  <a href={`/projects/${projectNumber}/gates/${gate.id}`} className="text-sm font-semibold text-ink hover:underline">
                    {d.label}
                  </a>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    {gate.name} &middot; last activity {lastActivityAt.toLocaleDateString("en-GB")}
                    {gate.targetEndDate ? ` · target end ${gate.targetEndDate.toLocaleDateString("en-GB")}` : ""}
                  </div>
                </div>
                <form action={acknowledgeDeliverableStaleness.bind(null, d.id, projectNumber)}>
                  <SubmitButton pendingText="…" className="rounded-md border border-rule px-2.5 py-1 text-xs font-semibold text-inkmuted">
                    Acknowledge
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {stages.map(({ gate }) => {
        if (!gate) return null;
        const visibleDeliverables = missingOnly
          ? gate.deliverables.filter((d) => !d.evidenceFiles.some((f) => f.kind === "SUBMITTED") && d.status !== "BYPASSED")
          : gate.deliverables;
        if (visibleDeliverables.length === 0) return null;
        return (
          <div key={gate.id} className="rounded-lg border border-rule bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <a
                href={`/projects/${projectNumber}/gates/${gate.id}`}
                className="font-mono text-sm font-bold uppercase tracking-wide text-accent hover:underline"
              >
                {gate.name}
              </a>
              <span className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">{gate.status}</span>
            </div>
            <div className="flex flex-col gap-4">
              {visibleDeliverables.map((d) => {
                const canUpload = canUploadEvidence(roleKeys, d.bypassAuthority, exactMatchAuthorityKeys, globalRoleKeys);
                const hasSubmitted = d.evidenceFiles.some((f) => f.kind === "SUBMITTED");
                return (
                  <div key={d.id} className="border-t border-dashed border-rule pt-3 first:border-t-0 first:pt-0">
                    <div className="mb-1 text-sm font-semibold">{d.label}</div>
                    <DeliverableEvidenceSummary
                      evidenceFiles={d.evidenceFiles}
                      documentReviewRequests={d.documentReviewRequests}
                      documentGenerationRequests={d.documentGenerationRequests}
                    />
                    {!hasSubmitted && canUpload && d.status !== "BYPASSED" && (
                      <form
                        action={recordEvidenceStub.bind(null, d.id, projectNumber, gate.id)}
                        className="mt-2 flex items-center gap-2"
                      >
                        <input
                          type="file"
                          name="file"
                          multiple
                          aria-label={`Evidence file(s) for ${d.label}`}
                          required
                          className="rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-accentsoft file:px-2 file:py-1 file:text-xs file:font-semibold file:text-accent"
                        />
                        <SubmitButton pendingText="Uploading…" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white">
                          Upload evidence
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
