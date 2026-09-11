"use client";

import { archiveProjectContact, reactivateProjectContact } from "@/lib/actions";

/**
 * One row on the external roster (Project Managed System, Phase 1 — see
 * the project_ai_pm_agent planning notes). Archive/reactivate only —
 * editing a contact's own details (updateProjectContact in actions.ts)
 * is built and ready but not yet wired into this row; add an inline edit
 * form here if that's wanted next.
 */
export function ProjectContactRow({
  contact,
  projectId,
  projectNumber,
  isPM,
}: {
  contact: {
    id: string;
    name: string;
    email: string;
    roleLabel: string | null;
    accountability: string | null;
    active: boolean;
  };
  projectId: string;
  projectNumber: string;
  isPM: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
        contact.active ? "border-rule" : "border-dashed border-rule opacity-60"
      }`}
    >
      <div className="text-sm">
        <span className="font-semibold">{contact.name}</span>{" "}
        <span className="text-inkmuted">&lt;{contact.email}&gt;</span>
        {contact.roleLabel && <span className="text-inkmuted"> &middot; {contact.roleLabel}</span>}
        {contact.accountability && <div className="text-xs text-inkmuted">{contact.accountability}</div>}
        {!contact.active && (
          <span className="ml-2 rounded-full border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-inkmuted">
            Archived
          </span>
        )}
      </div>
      {isPM &&
        (contact.active ? (
          <form action={archiveProjectContact.bind(null, contact.id, projectId, projectNumber)}>
            <button
              type="submit"
              title={`Remove ${contact.name} from the active external roster`}
              className="rounded border border-rule px-2 py-1 text-xs font-semibold text-risk hover:bg-risk hover:text-white"
            >
              Archive
            </button>
          </form>
        ) : (
          <form action={reactivateProjectContact.bind(null, contact.id, projectId, projectNumber)}>
            <button
              type="submit"
              title={`Reinstate ${contact.name} on the external roster`}
              className="rounded border border-rule px-2 py-1 text-xs font-semibold text-accent hover:bg-surface2"
            >
              Reinstate
            </button>
          </form>
        ))}
    </div>
  );
}
