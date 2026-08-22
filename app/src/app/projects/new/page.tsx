import { peekNextProjectNumber } from "@/lib/projectNumber";
import { listMatchableTemplates } from "@/lib/provisioning";
import { listWorksPackages } from "@/lib/worksPackages";
import { db } from "@/lib/db";
import { NewProjectForm } from "./NewProjectForm";

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
 *
 * The form itself is NewProjectForm, a client component — the primary
 * System/Template pick has to live in React state so the "also bundle
 * these systems" checkbox list can filter that same system out of
 * itself as the pick changes (Kevin, 22 Aug 2026).
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

      <NewProjectForm templates={templates} preselectedWorksPackage={preselectedWorksPackage} />
    </div>
  );
}
