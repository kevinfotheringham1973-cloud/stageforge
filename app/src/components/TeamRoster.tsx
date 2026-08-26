"use client";

import { useActionState, useMemo, useState } from "react";
import { assignUserToProject, updateUser } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";

type TeamUser = {
  id: string;
  name: string;
  email: string;
  departmentLabel: string;
  roleLabel: string;
};

/**
 * Client-side so the search box can filter without a round trip — the
 * roster is small enough (tens, not thousands, of people) that fetching
 * everything once and filtering in the browser is simpler than paginating
 * or debouncing a server search.
 */
export function TeamRoster({
  users,
  projects,
  roles,
}: {
  users: TeamUser[];
  projects: { id: string; name: string; projectNumber: string }[];
  roles: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        aria-label="Search people by name or email"
        className="mb-4 w-full max-w-sm rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-inkmuted">No one matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((u) => (
            <div key={u.id} className="rounded-lg border border-rule bg-surface p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold">{u.name}</span>
                {u.roleLabel && (
                  <span className="rounded bg-accentsoft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                    {u.roleLabel}
                  </span>
                )}
              </div>
              <div className="mb-3 text-sm text-inkmuted">
                {u.email} &middot; {u.departmentLabel}
              </div>

              <details className="mb-3">
                <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wide text-accent">
                  Edit name / email
                </summary>
                <p className="mb-2 mt-2 text-xs text-inkmuted">
                  This updates every past record too, including audit history — right for a typo or a contact
                  change. If this person has actually left and someone else has taken over their role, add the
                  new person above instead and assign them below, so history stays correctly attributed.
                </p>
                <form action={updateUser.bind(null, u.id)} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                      Name
                    </label>
                    <input
                      name="name"
                      defaultValue={u.name}
                      required
                      className="w-48 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">
                      Email
                    </label>
                    <input
                      name="email"
                      type="email"
                      defaultValue={u.email}
                      required
                      className="w-56 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <SubmitButton pendingText="Saving…" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
                    Save
                  </SubmitButton>
                </form>
              </details>

              <details>
                <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wide text-accent">
                  Assign to a project
                </summary>
                <AssignToProjectForm userId={u.id} projects={projects} roles={roles} />
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Its own component (not inlined in the roster's .map) so
 * useActionState gets one call per user row, following the Rules of
 * Hooks — the roster's row count changes as the search box filters.
 */
function AssignToProjectForm({
  userId,
  projects,
  roles,
}: {
  userId: string;
  projects: { id: string; name: string; projectNumber: string }[];
  roles: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(assignUserToProject.bind(null, userId), undefined);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">Project</label>
        <select name="projectId" required className="w-64 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm">
          <option value="">Select…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (#{p.projectNumber})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-inkmuted">Role</label>
        <select name="roleId" required className="w-48 rounded border border-inkmuted bg-bg px-2.5 py-1.5 text-sm">
          <option value="">Select…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pendingText="Assigning…" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent">
        Assign
      </SubmitButton>
      {state?.error && (
        <p className="w-full text-sm font-semibold text-risk" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
