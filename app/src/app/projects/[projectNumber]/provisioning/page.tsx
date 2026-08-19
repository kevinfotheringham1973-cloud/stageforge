import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUserGlobalRoleKeys, getCurrentUserId } from "@/lib/session";
import {
  approveProvisioning,
  requestProvisioningRevision,
  reviseProvisioningBrief,
  updateProvisioningDraft,
} from "@/lib/actions";

/**
 * The "Review" step of AI-assisted provisioning (ProvisioningModel.html
 * §03). Shows the LLM's proposed match and reasoning; a Compliance
 * Officer approves (instantiates the project for real) or sends it
 * back for revision; the drafting PM can edit the brief and re-match.
 */
export default async function ProvisioningReviewPage({
  params,
}: {
  params: Promise<{ projectNumber: string }>;
}) {
  const { projectNumber } = await params;

  const project = await db.project.findUnique({
    where: { projectNumber },
    include: {
      createdBy: true,
      template: true,
      provisioningReviews: { orderBy: { createdAt: "desc" }, include: { reviewedBy: true } },
    },
  });
  if (!project) notFound();
  if (project.status === "ACTIVE") redirect(`/projects/${projectNumber}`);

  const [userId, roleKeys, allTemplates] = await Promise.all([
    getCurrentUserId(),
    getCurrentUserGlobalRoleKeys(),
    db.template.findMany({ where: { matchKeywords: { isEmpty: false } }, orderBy: { name: "asc" } }),
  ]);
  const isCreator = userId === project.createdById;
  const isComplianceOfficer = roleKeys.includes("COMPLIANCE_OFFICER");

  return (
    <div className="mx-auto max-w-2xl px-10 py-10">
      <div className="mb-1 font-mono text-xs uppercase tracking-wide text-inkmuted">
        Project No. {project.projectNumber} &middot; Draft, awaiting review
      </div>
      <h1 className="mb-2 text-2xl font-bold">{project.name}</h1>

      {!isComplianceOfficer && (
        <div className="mb-6 rounded-lg border border-dashed border-flag bg-accentsoft/40 px-4 py-3 text-sm">
          <span className="font-semibold">Waiting on Compliance Officer review.</span> This draft
          isn&rsquo;t live yet — someone with the Compliance Officer role needs to review the match
          below and approve it. Switch &ldquo;Acting as&rdquo; in the header to a Compliance Officer
          (e.g. Gary Grant) to review, override the match, or approve it.
        </div>
      )}

      <div className="mb-6 rounded-lg border border-rule bg-surface p-5">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Description</div>
        <p className="text-sm">{project.provisioningBrief}</p>
      </div>

      <div className="mb-6 rounded-lg border border-rule bg-surface p-5">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Proposed match</div>
        <div className="mb-2 text-sm font-semibold">{project.template.name}</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {project.tags.length > 0 ? (
            project.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-accentsoft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent"
              >
                {t}
              </span>
            ))
          ) : (
            <span className="text-xs text-inkmuted">No tags proposed</span>
          )}
        </div>
        {project.provisioningMatchReasoning && (
          <p className="text-sm text-inkmuted">{project.provisioningMatchReasoning}</p>
        )}
      </div>

      {project.provisioningReviews.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-inkmuted">Review history</div>
          <div className="flex flex-col gap-2">
            {project.provisioningReviews.map((r) => (
              <div key={r.id} className="rounded-md border border-rule bg-surface px-4 py-2.5 text-sm">
                <span className={r.decision === "APPROVED" ? "font-semibold text-ok" : "font-semibold text-flag"}>
                  {r.decision === "APPROVED" ? "Approved" : "Sent back for revision"}
                </span>{" "}
                by {r.reviewedBy.name} &middot; {r.createdAt.toLocaleDateString("en-GB")}
                {r.reason && <div className="mt-1 text-inkmuted">{r.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isCreator && (
        <div className="mb-6 rounded-lg border border-rule bg-surface p-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
            Revise description &amp; re-match
          </div>
          <form action={reviseProvisioningBrief.bind(null, project.id, projectNumber)} className="flex flex-col gap-3">
            <textarea
              name="brief"
              required
              rows={4}
              defaultValue={project.provisioningBrief ?? ""}
              className="w-full rounded border border-rule bg-bg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="self-start rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent"
            >
              Re-match
            </button>
          </form>
        </div>
      )}

      {isComplianceOfficer && (
        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-flag bg-accentsoft/30 p-5">
          <div className="font-mono text-[10px] uppercase tracking-wide text-flag">Compliance Officer review</div>

          <form action={updateProvisioningDraft.bind(null, project.id, projectNumber)} className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Override template
              </label>
              <select name="templateId" defaultValue={project.templateId} className="w-full rounded border border-rule bg-bg px-2.5 py-1.5 text-sm">
                {allTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Tags (comma-separated)
              </label>
              <input
                name="tags"
                defaultValue={project.tags.join(", ")}
                className="w-full rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
              />
            </div>
            <button type="submit" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
              Update draft
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <form action={approveProvisioning.bind(null, project.id, projectNumber)}>
              <button type="submit" className="rounded-md bg-ok px-4 py-2.5 text-sm font-bold text-white">
                Approve &amp; activate
              </button>
            </form>
            <form
              action={requestProvisioningRevision.bind(null, project.id, projectNumber)}
              className="flex items-center gap-2"
            >
              <input
                name="reason"
                placeholder="Reason for sending back (required)"
                required
                className="w-64 rounded border border-rule bg-bg px-2.5 py-1.5 text-sm"
              />
              <button type="submit" className="rounded-md border border-flag px-3 py-1.5 text-sm font-semibold text-flag">
                Send back for revision
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
