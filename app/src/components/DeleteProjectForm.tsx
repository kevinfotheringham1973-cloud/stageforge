"use client";

import { useActionState } from "react";
import { deleteProject } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * useActionState (rather than a plain form action) so a mismatched
 * confirmation number comes back as state deleteProject returns, not
 * a thrown error — Next surfaces thrown Server Action errors as its
 * generic minified-error boundary, which read as a crash rather than
 * "you typed the wrong number".
 */
export function DeleteProjectForm({ projectId, projectNumber }: { projectId: string; projectNumber: string }) {
  const [state, formAction] = useActionState(deleteProject.bind(null, projectId), undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="confirmProjectNumber"
        required
        placeholder={`Type ${projectNumber} to confirm`}
        className="w-full rounded border border-risk bg-bg px-2.5 py-1.5 text-sm sm:w-64"
      />
      <SubmitButton pendingText="Deleting…" className="rounded-md border border-risk px-3 py-1.5 text-sm font-semibold text-risk">
        Delete project permanently
      </SubmitButton>
      {state?.error && (
        <p className="w-full text-sm font-semibold text-risk" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
