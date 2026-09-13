import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { recordEvidenceStub } from "@/lib/actions";
import { getCurrentUserGlobalRoleKeys, getCurrentUserRoleKeysForProject } from "@/lib/session";
import { canUploadEvidence } from "@/lib/permissions";
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
}: {
  params: Promise<{ projectNumber: string }>;
}) {
  const { projectNumber } = await params;

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Evidence</h2>
        <p className="text-sm text-inkmuted">
          Every deliverable across every gate in this project — what&rsquo;s been submitted, what AI has
          reviewed or drafted, and what&rsquo;s still missing.
        </p>
      </div>

      {stages.map(({ gate }) => {
        if (!gate || gate.deliverables.length === 0) return null;
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
              {gate.deliverables.map((d) => {
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
