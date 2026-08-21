import { createProvisioningDraft, createProvisioningDraftBatch } from "@/lib/actions";
import { peekNextProjectNumber } from "@/lib/projectNumber";
import { listMatchableTemplates } from "@/lib/provisioning";
import { listWorksPackages } from "@/lib/worksPackages";
import { SubmitButton } from "@/components/SubmitButton";
import { db } from "@/lib/db";

/**
 * The "Input" step of AI-assisted provisioning (ProvisioningModel.html
 * §03). Submitting matches the description against the Template
 * library and creates a DRAFT project — never touches Stages/Gates
 * directly. Review happens at /projects/[projectNumber]/provisioning.
 *
 * Project number is system-issued, not typed (confirmed by Kevin, 19
 * Aug 2026) — the number shown here is a peek, not a reservation; the
 * real one is assigned atomically at submit time in
 * createProvisioningDraft, so it can drift if someone else submits
 * first. Fine for a single-PM-at-a-time dev scaffold.
 */
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ worksPackageId?: string }>;
}) {
  const { worksPackageId: preselectedWorksPackageId } = await searchParams;
  const nextProjectNumber = await peekNextProjectNumber();
  const [templates, allWorksPackages] = await Promise.all([
    listMatchableTemplates(db),
    listWorksPackages(db),
  ]);
  const preselectedWorksPackage = preselectedWorksPackageId
    ? allWorksPackages.find((wp) => wp.id === preselectedWorksPackageId)
    : undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">New project</h1>
      <div className="mb-4 font-mono text-xs uppercase tracking-wide text-inkmuted">
        Project No. {nextProjectNumber} &middot; assigned automatically
      </div>
      <p className="mb-8 text-sm text-inkmuted">
        Pick the system this project covers and describe the works. StageForge proposes compliance
        tags from the description, plus the deliverables checklist and compliance requirements for
        the selected system — a Compliance Officer reviews the tags before the project goes live.
      </p>

      <form action={createProvisioningDraft} className="flex flex-col gap-5">
        <div>
          <label htmlFor="new-project-name" className="mb-1 block font-mono text-xs uppercase tracking-wide text-inkmuted">
            Project name
          </label>
          <input
            id="new-project-name"
            name="name"
            required
            placeholder="e.g. Ward 8 Ventilation Replacement"
            className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-project-template" className="mb-1 block font-mono text-xs uppercase tracking-wide text-inkmuted">
            System / Template
          </label>
          <select
            id="new-project-template"
            name="templateId"
            required
            defaultValue=""
            className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Select the system this project covers&hellip;
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="new-project-brief" className="mb-1 block font-mono text-xs uppercase tracking-wide text-inkmuted">
            Description
          </label>
          <textarea
            id="new-project-brief"
            name="brief"
            required
            rows={5}
            placeholder="e.g. Replace 6 air handling units serving theatres and wards, phased over consecutive weekends, live hospital, continuous clinical use."
            className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
          />
        </div>
        <fieldset className="rounded-lg border border-dashed border-flag bg-accentsoft/30 p-4">
          <legend className="mb-1 font-mono text-xs uppercase tracking-wide text-flag">
            CDM 2015 — works type (required)
          </legend>
          <p className="mb-3 text-sm text-inkmuted">
            Under the Construction (Design and Management) Regulations 2015, a Principal Designer must
            be engaged whenever more than one contractor is or will be working on the project — whether
            or not the building itself is touched. Building modification additionally raises planning
            permission as a live question.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="worksType"
                value="DIRECT_REPLACEMENT_SINGLE_CONTRACTOR"
                required
                className="mt-1"
              />
              <span>
                <span className="font-semibold">Direct replacement, one contractor</span> — like-for-like
                plant/equipment swap, a single contractor throughout, no structural or building fabric
                modification. Neither CDM duty applies.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="worksType"
                value="DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS"
                required
                className="mt-1"
              />
              <span>
                <span className="font-semibold">Direct replacement, multiple contractors</span> —
                like-for-like swap, but more than one contractor on site. A Principal Designer must be
                engaged; no building fabric modification, so planning permission doesn&rsquo;t arise.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="worksType" value="BUILDING_MODIFICATION" required className="mt-1" />
              <span>
                <span className="font-semibold">Building modification</span> — alters structure, layout,
                or fabric (new penetrations, extensions, reconfiguration). Both duties apply: a Principal
                Designer must be engaged, and planning permission needs to be confirmed.
              </span>
            </label>
          </div>
        </fieldset>
        <fieldset className="rounded-lg border border-dashed border-rule p-4">
          <legend className="mb-1 font-mono text-xs uppercase tracking-wide text-inkmuted">
            Part of a combined works package? {preselectedWorksPackage ? "" : "(optional)"}
          </legend>
          {preselectedWorksPackage ? (
            <p className="mb-3 text-sm text-inkmuted">
              Adding a system to <span className="font-semibold text-ink">{preselectedWorksPackage.name}</span>.
              Pick a different package below, or clear it to create this as a standalone project instead.
            </p>
          ) : (
            <p className="mb-3 text-sm text-inkmuted">
              A hospital runs 24&#8209;7, so a disruption window is precious &mdash; if this project opens
              one up (an area decanted, a system isolated) and other work is riding along with it, link
              them here. Each project keeps its own complete, discipline-specific checklist &mdash; this
              just labels them as one combined package on the portfolio.
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="new-project-works-package" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Add to an existing package
              </label>
              <select
                id="new-project-works-package"
                name="worksPackageId"
                defaultValue={preselectedWorksPackage?.id ?? ""}
                className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {allWorksPackages.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="new-project-works-package-name" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Or name a new package
              </label>
              <input
                id="new-project-works-package-name"
                name="newWorksPackageName"
                placeholder="e.g. Main Kitchen Refit"
                className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </fieldset>
        <SubmitButton
          pendingText="Matching against the template library…"
          className="self-start rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          Match &amp; create draft
        </SubmitButton>
      </form>

      <details className="group mt-8 rounded-lg border border-rule bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide text-accent">
          Or, create multiple systems as one combined works package
        </summary>
        <div className="border-t border-rule p-4 sm:p-6">
          <p className="mb-5 text-sm text-inkmuted">
            For when a disruption window covers more than one system at once &mdash; e.g. the kitchen is
            decanted for a drainage redesign, so the ventilation and lighting ride along too. Check every
            system involved; each becomes its own project with its own complete, discipline-specific
            checklist, all linked to the same package. One shared description and CDM answer apply to all
            of them &mdash; each project can still be edited individually afterward.
          </p>
          <form action={createProvisioningDraftBatch} className="flex flex-col gap-5">
            <fieldset>
              <legend className="mb-2 font-mono text-xs uppercase tracking-wide text-inkmuted">
                Systems (select two or more)
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <label key={t.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="templateIds" value={t.id} className="mt-1" />
                    {t.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="batch-brief" className="mb-1 block font-mono text-xs uppercase tracking-wide text-inkmuted">
                Description (shared across every system)
              </label>
              <textarea
                id="batch-brief"
                name="brief"
                required
                rows={4}
                placeholder="e.g. Main kitchen fully decanted for combined drainage, ventilation, and lighting works, phased over consecutive weekends."
                className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
              />
            </div>
            <fieldset className="rounded-lg border border-dashed border-flag bg-accentsoft/30 p-4">
              <legend className="mb-1 font-mono text-xs uppercase tracking-wide text-flag">
                CDM 2015 — works type (required, applies to every system)
              </legend>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="worksType" value="DIRECT_REPLACEMENT_SINGLE_CONTRACTOR" required className="mt-1" />
                  <span>
                    <span className="font-semibold">Direct replacement, one contractor</span> — like-for-like
                    plant/equipment swap, a single contractor throughout, no structural or building fabric
                    modification. Neither CDM duty applies.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="worksType" value="DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS" required className="mt-1" />
                  <span>
                    <span className="font-semibold">Direct replacement, multiple contractors</span> —
                    like-for-like swap, but more than one contractor on site. A Principal Designer must be
                    engaged; no building fabric modification, so planning permission doesn&rsquo;t arise.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="worksType" value="BUILDING_MODIFICATION" required className="mt-1" />
                  <span>
                    <span className="font-semibold">Building modification</span> — alters structure, layout,
                    or fabric (new penetrations, extensions, reconfiguration). Both duties apply: a Principal
                    Designer must be engaged, and planning permission needs to be confirmed.
                  </span>
                </label>
              </div>
            </fieldset>
            <fieldset className="rounded-lg border border-dashed border-rule p-4">
              <legend className="mb-1 font-mono text-xs uppercase tracking-wide text-inkmuted">
                Works package (required &mdash; this is what links the systems above together)
              </legend>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <label htmlFor="batch-works-package" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Add to an existing package
                  </label>
                  <select
                    id="batch-works-package"
                    name="worksPackageId"
                    defaultValue=""
                    className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {allWorksPackages.map((wp) => (
                      <option key={wp.id} value={wp.id}>
                        {wp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label htmlFor="batch-works-package-name" className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                    Or name a new package
                  </label>
                  <input
                    id="batch-works-package-name"
                    name="newWorksPackageName"
                    placeholder="e.g. Main Kitchen Refit"
                    className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </fieldset>
            <SubmitButton
              pendingText="Creating the combined works package…"
              className="self-start rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white"
            >
              Create combined works package
            </SubmitButton>
          </form>
        </div>
      </details>
    </div>
  );
}
