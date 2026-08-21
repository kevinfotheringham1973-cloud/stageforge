import { notFound, redirect } from "next/navigation";
import type { CdmWorksType } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUserGlobalRoleKeys, getCurrentUserId } from "@/lib/session";
import {
  approveProvisioning,
  requestProvisioningRevision,
  reviseProvisioningBrief,
  updateProvisioningDraft,
} from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { listMatchableTemplates } from "@/lib/provisioning";

const WORKS_TYPE_LABEL: Record<CdmWorksType, string> = {
  DIRECT_REPLACEMENT_SINGLE_CONTRACTOR: "Direct replacement, one contractor",
  DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS: "Direct replacement, multiple contractors",
  BUILDING_MODIFICATION: "Building modification",
};

const WORKS_TYPE_DESCRIPTION: Record<CdmWorksType, string> = {
  DIRECT_REPLACEMENT_SINGLE_CONTRACTOR:
    "Like-for-like plant/equipment swap, one contractor throughout — neither CDM 2015 duty applies.",
  DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS:
    "Like-for-like swap, but more than one contractor on site — a Principal Designer must be engaged. No building fabric modification, so planning permission doesn't arise.",
  BUILDING_MODIFICATION:
    "Alters structure, layout, or fabric — a Principal Designer must be engaged and planning permission needs to be confirmed.",
};

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
    listMatchableTemplates(db),
  ]);
  const isCreator = userId === project.createdById;
  const isComplianceOfficer = roleKeys.includes("COMPLIANCE_OFFICER");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
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
        <h2 className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Description</h2>
        <p className="text-sm">{project.provisioningBrief}</p>
      </div>

      <div className="mb-6 rounded-lg border border-rule bg-surface p-5">
        <h2 className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Selected system</h2>
        <div className="mb-3 text-sm font-semibold">{project.template.name}</div>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">Proposed tags</div>
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

      <div className="mb-6 rounded-lg border border-rule bg-surface p-5">
        <h2 className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">CDM 2015 works type</h2>
        <div className={`mb-1 text-sm font-semibold ${project.worksType === "DIRECT_REPLACEMENT_SINGLE_CONTRACTOR" ? "" : "text-flag"}`}>
          {WORKS_TYPE_LABEL[project.worksType]}
        </div>
        <p className="text-sm text-inkmuted">{WORKS_TYPE_DESCRIPTION[project.worksType]}</p>
      </div>

      {project.provisioningReviews.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-inkmuted">Review history</h2>
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
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
            Revise system, description &amp; re-match tags
          </h2>
          <form action={reviseProvisioningBrief.bind(null, project.id, projectNumber)} className="flex flex-col gap-3">
            <select
              name="templateId"
              aria-label="System / Template"
              required
              defaultValue={project.templateId}
              className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
            >
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <textarea
              name="brief"
              aria-label="Description"
              required
              rows={4}
              defaultValue={project.provisioningBrief ?? ""}
              className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
            />
            <SubmitButton
              pendingText="Re-matching…"
              className="self-start rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent"
            >
              Re-match
            </SubmitButton>
          </form>
        </div>
      )}

      {isComplianceOfficer && (
        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-flag bg-accentsoft/30 p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-wide text-flag">Compliance Officer review</h2>

          <form action={updateProvisioningDraft.bind(null, project.id, projectNumber)} className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label htmlFor="override-template" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Override template
              </label>
              <select id="override-template" name="templateId" defaultValue={project.templateId} className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm">
                {allTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="override-tags" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Tags (comma-separated)
              </label>
              <input
                id="override-tags"
                name="tags"
                defaultValue={project.tags.join(", ")}
                className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
              />
            </div>
            <fieldset className="w-full basis-full">
              <legend className="mb-1 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                CDM 2015 works type
              </legend>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(WORKS_TYPE_LABEL) as CdmWorksType[]).map((wt) => (
                  <label key={wt} className="flex items-center gap-1.5 text-sm">
                    <input type="radio" name="worksType" value={wt} defaultChecked={project.worksType === wt} />
                    {WORKS_TYPE_LABEL[wt]}
                  </label>
                ))}
              </div>
            </fieldset>
            <SubmitButton pendingText="Updating…" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
              Update draft
            </SubmitButton>
          </form>

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <form action={approveProvisioning.bind(null, project.id, projectNumber)}>
              <SubmitButton pendingText="Activating…" className="rounded-md bg-ok px-4 py-2.5 text-sm font-bold text-white">
                Approve &amp; activate
              </SubmitButton>
            </form>
            <form
              action={requestProvisioningRevision.bind(null, project.id, projectNumber)}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                name="reason"
                aria-label="Reason for sending back for revision"
                placeholder="Reason for sending back (required)"
                required
                className="w-full rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm sm:w-64"
              />
              <SubmitButton pendingText="Sending…" className="rounded-md border border-flag px-3 py-1.5 text-sm font-semibold text-flag">
                Send back for revision
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
