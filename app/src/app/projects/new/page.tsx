import { createProvisioningDraft } from "@/lib/actions";
import { peekNextProjectNumber } from "@/lib/projectNumber";
import { listMatchableTemplates } from "@/lib/provisioning";
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
export default async function NewProjectPage() {
  const nextProjectNumber = await peekNextProjectNumber();
  const templates = await listMatchableTemplates(db);

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
        <SubmitButton
          pendingText="Matching against the template library…"
          className="self-start rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          Match &amp; create draft
        </SubmitButton>
      </form>
    </div>
  );
}
