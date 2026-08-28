"use client";

import { useState } from "react";
import { createProvisioningDraft } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";

// Every one of Scotland's 21 systems has an identically-named England
// (HTM) equivalent (generateEnglandVariant) -- with no region filter
// here, both the primary picker and the bundle checklist below used to
// list all 42 with no way to tell which was which (found live, 28 Aug
// 2026, right after the England demo tenant existed alongside Scotland
// for the first time). Hardcoded labels, not SectorVariant.name (just
// "Health" / "Health (England)" -- not distinctive enough on their own
// for a picker), matching the "SHTM"/"HTM" language already used
// throughout englandConversion.ts and /regulatory-reference.
const SECTOR_LABEL: Record<string, string> = {
  health: "Scotland (SHTM)",
  health_england: "England (HTM)",
};

/**
 * Client component only because the bundling checkboxes need to react
 * live to the primary System/Template pick (22 Aug 2026: seeing
 * the system you just selected as primary also listed as something you
 * could "additionally" bundle in is confusing, especially for less
 * menu-confident users — it can't mean anything since a project can't
 * ride along with itself) and, since 28 Aug 2026, to the region pick
 * (both lists need to re-filter the instant it changes). Everything
 * else here is a plain form same as before; only the template select's
 * value and the region need to live in React state.
 */
export function NewProjectForm({
  templates,
  preselectedWorksPackage,
}: {
  templates: { id: string; name: string; sectorVariant: { key: string; name: string } }[];
  preselectedWorksPackage?: { id: string; name: string };
}) {
  const sectorKeys = Array.from(new Set(templates.map((t) => t.sectorVariant.key))).sort();
  // "health" (Scotland) first if present -- the platform's original/
  // primary sector, and the sensible default for whoever hasn't
  // deliberately picked England.
  const [sectorKey, setSectorKey] = useState(sectorKeys.includes("health") ? "health" : (sectorKeys[0] ?? ""));
  const sectorTemplates = templates.filter((t) => t.sectorVariant.key === sectorKey);

  const [templateId, setTemplateId] = useState("");
  const bundleableTemplates = sectorTemplates.filter((t) => t.id !== templateId);

  return (
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
      {sectorKeys.length > 1 && (
        <div>
          <label htmlFor="new-project-sector" className="mb-1 block font-mono text-xs uppercase tracking-wide text-inkmuted">
            Region
          </label>
          <select
            id="new-project-sector"
            value={sectorKey}
            onChange={(e) => {
              setSectorKey(e.target.value);
              // A template picked under the old region has no meaning
              // under the new one -- every system name exists in both,
              // so leaving the old id selected would silently submit
              // the wrong region's template.
              setTemplateId("");
            }}
            className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
          >
            {sectorKeys.map((key) => (
              <option key={key} value={key}>
                {SECTOR_LABEL[key] ?? key}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="new-project-template" className="mb-1 block font-mono text-xs uppercase tracking-wide text-inkmuted">
          System / Template
        </label>
        <select
          id="new-project-template"
          name="templateId"
          required
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full rounded border border-inkmuted bg-bg px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select the system this project covers&hellip;
          </option>
          {sectorTemplates.map((t) => (
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
      <fieldset className="rounded-lg border border-dashed border-flag bg-accentsoft/30 p-4">
        <legend className="mb-1 font-mono text-xs uppercase tracking-wide text-flag">
          F10 notification (CDM 2015, reg 6) — required
        </legend>
        <p className="mb-3 text-sm text-inkmuted">
          Will this project last more than 30 working days <strong>and</strong> have more than 20
          workers on site at once, or involve more than 500 person-days of construction work in
          total? If either test is met, an F10 must be submitted to the HSE before construction
          starts.
        </p>
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="notifiableUnderCdm" value="true" required className="mt-1" />
            <span>
              <span className="font-semibold">Yes / not sure yet</span> — an F10 will need to be
              submitted before construction starts. Safer default if unsure; a Compliance Officer
              can correct this at review.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="notifiableUnderCdm" value="false" required className="mt-1" />
            <span>
              <span className="font-semibold">No</span> — neither threshold will be met.
            </span>
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-dashed border-rule p-4">
        <legend className="mb-1 font-mono text-xs uppercase tracking-wide text-inkmuted">
          {preselectedWorksPackage ? "Part of a combined works package?" : "Other systems this project also covers (optional)"}
        </legend>
        {preselectedWorksPackage ? (
          <>
            <p className="mb-3 text-sm text-inkmuted">
              Adding a system to <span className="font-semibold text-ink">{preselectedWorksPackage.name}</span>.
            </p>
            <input type="hidden" name="worksPackageId" value={preselectedWorksPackage.id} />
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                Also create these systems in the same package (optional)
              </div>
              <p className="mb-2 text-xs text-inkmuted">
                Check every other system riding along in the same disruption window &mdash; each becomes its
                own project with its own complete, discipline-specific checklist, created in this same
                submission. StageForge names the package after this project automatically &mdash; the name is
                just a label on the portfolio, nothing hinges on it.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {bundleableTemplates.map((t) => (
                  <label key={t.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="additionalTemplateIds" value={t.id} className="mt-1" />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-inkmuted">
              A hospital runs 24&#8209;7, so a disruption window is precious &mdash; if this project opens
              one up (an area decanted, a system isolated) and other work needs the same window, check off
              whichever other systems belong to it below.
            </p>
            <div>
              <p className="mb-2 text-xs text-inkmuted">
                Check every other system this project also needs to cover &mdash; they&rsquo;ll be folded
                into this one project&rsquo;s checklist (one shared gate per stage, with deliverables and
                compliance requirements from every system combined), not created as separate projects.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {bundleableTemplates.map((t) => (
                  <label key={t.id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="additionalTemplateIds" value={t.id} className="mt-1" />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </fieldset>
      <div className="flex flex-col items-start gap-2">
        <SubmitButton
          pendingText="Matching against the template library…"
          className="self-start rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          Match &amp; create draft
        </SubmitButton>
        <p className="text-xs text-inkmuted">
          This won&rsquo;t go live yet — it creates a draft that a Compliance Officer reviews next, and
          may need sign-off from other roles (Principal Designer, Fire Officer, Authorised Person)
          depending on your answers above.
        </p>
      </div>
    </form>
  );
}
