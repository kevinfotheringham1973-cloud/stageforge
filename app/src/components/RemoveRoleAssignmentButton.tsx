"use client";

import { useActionState } from "react";
import { removeRoleAssignment } from "@/lib/actions";

/**
 * useActionState so a since-changed assignment (e.g. removed from
 * another tab) comes back as a plain inline message instead of Next's
 * generic minified error — same pattern as DeleteProjectForm and
 * AssignToProjectForm.
 */
export function RemoveRoleAssignmentButton({
  assignmentId,
  projectId,
  projectNumber,
  personName,
  roleName,
}: {
  assignmentId: string;
  projectId: string;
  projectNumber: string;
  personName: string;
  roleName: string;
}) {
  const [state, formAction] = useActionState(removeRoleAssignment.bind(null, assignmentId, projectId, projectNumber), undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        title={`Remove ${personName} as ${roleName} from this project`}
        className="rounded border border-rule px-2 py-1 text-xs font-semibold text-risk hover:bg-risk hover:text-white"
      >
        Remove
      </button>
      {state?.error && (
        <p className="text-xs font-semibold text-risk" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
