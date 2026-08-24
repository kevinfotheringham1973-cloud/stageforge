"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Was a row of 10 buttons — stopped scaling once the cast grew past
 * ~8 people (20 Aug 2026). A native <select> gets type-ahead
 * (type a letter to jump) for free, and auto-submits on change so
 * switching stays a single interaction, same as clicking a button did.
 *
 * Option labels lead with the role, not the name (confirmed 24 Aug
 * 2026 — "not clear what their role is" with names-first) — a demo
 * audience picking a persona to watch cares which role they're
 * switching into, not who the seeded person happens to be. `users`
 * is pre-filtered by the caller to people who actually hold a role
 * (25 Aug 2026) — there's nothing to demo by acting as someone who
 * can't do anything yet, so every entry here always has a real
 * roleLabel. Two people sharing the exact same role (there are two
 * plain "PM"s in the demo cast) stay distinguishable because the name
 * is still there, just second.
 *
 * Two layers of state-sync, found necessary by testing this live (the
 * display was noticed drifting from the real acting-as user, 21 Aug
 * 2026):
 *
 * 1. Local `value` state, not a bare `value={currentUserId}` — a
 *    controlled select with no local state snaps back to the stale
 *    prop the instant onChange fires, before the server round trip
 *    even starts. Local state gives the click its own result
 *    immediately.
 * 2. An explicit `router.refresh()` after the action resolves, rather
 *    than relying on the form's own implicit post-action refresh —
 *    that implicit refresh turned out not to reliably deliver the
 *    updated `currentUserId` prop back down to this component, so the
 *    effect below kept re-syncing `value` back to the pre-switch user
 *    a few hundred ms after every switch. Calling the server action
 *    directly (instead of binding it as the form's `action`) and
 *    forcing the refresh ourselves closes that gap; the effect still
 *    exists as a backstop for any other way currentUserId could change
 *    (e.g. a hard navigation) without leaving the switcher able to
 *    drift from the true acting-as user either way.
 */
export function ActingAsSwitcher({
  action,
  users,
  currentUserId,
}: {
  action: (formData: FormData) => Promise<void>;
  users: { id: string; name: string; roleLabel: string }[];
  currentUserId: string | undefined;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentUserId ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    setValue(currentUserId ?? "");
  }, [currentUserId]);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-2">
        <label htmlFor="acting-as-select" className="font-mono text-[10px] uppercase tracking-wide text-inkmuted">
          Acting as
        </label>
        <select
          id="acting-as-select"
          name="userId"
          title="This demo has no separate logins — switch this to see the app as a different person/role."
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            const formData = new FormData();
            formData.set("userId", next);
            startTransition(async () => {
              await action(formData);
              router.refresh();
            });
          }}
          className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-sm font-semibold text-ink"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.roleLabel} — {u.name}
            </option>
          ))}
        </select>
      </div>
      <span className="text-[10px] text-inkmuted">Switches who you&rsquo;re signed in as &mdash; stands in for separate logins</span>
    </div>
  );
}
