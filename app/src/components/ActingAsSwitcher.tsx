"use client";

import { useRef } from "react";

/**
 * Was a row of 10 buttons — stopped scaling once the cast grew past
 * ~8 people (Kevin, 20 Aug 2026). A native <select> gets type-ahead
 * (type a letter to jump) for free, and auto-submits on change so
 * switching stays a single interaction, same as clicking a button did.
 */
export function ActingAsSwitcher({
  action,
  users,
  currentUserId,
}: {
  action: (formData: FormData) => void;
  users: { id: string; name: string; roleLabel: string }[];
  currentUserId: string | undefined;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <label htmlFor="acting-as-select" className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">
        Acting as
      </label>
      <select
        id="acting-as-select"
        name="userId"
        defaultValue={currentUserId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-sm font-semibold text-ink"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
            {u.roleLabel ? ` — ${u.roleLabel}` : ""}
          </option>
        ))}
      </select>
    </form>
  );
}
