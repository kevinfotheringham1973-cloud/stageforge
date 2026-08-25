import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { forbidden } from "next/navigation";
import { dismissAccessRequest } from "@/lib/actions";

const PROVIDER_LABEL: Record<string, string> = {
  "microsoft-entra-id": "Microsoft",
  resend: "Email link",
};

/**
 * Platform-admin-only, read-only. Every email that tried to sign in but
 * had no matching User row -- captured in auth.ts's signIn callback. As
 * much a lead list (someone from an outside organisation wanted in) as a
 * security log; the fix for any row here is adding the person on /team,
 * not anything on this page itself.
 */
export default async function AccessRequestsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isPlatformAdmin) forbidden();

  const attempts = await db.rejectedSignInAttempt.findMany({
    orderBy: { lastAttemptedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6 md:px-10 md:py-10">
      <h1 className="mb-1 text-2xl font-bold">Access requests</h1>
      <p className="mb-8 text-sm text-inkmuted">
        Emails that tried to sign in but aren&rsquo;t on the team yet. Add someone on the{" "}
        <a href="/team" className="text-accent underline">
          Team
        </a>{" "}
        page to let them in. Platform admin only.
      </p>

      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        {attempts.length === 0 && <p className="px-4 py-4 text-sm text-inkmuted">No rejected sign-in attempts yet.</p>}
        {attempts.map((a, i) => (
          <div
            key={a.id}
            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm ${
              i > 0 ? "border-t border-rule" : ""
            }`}
          >
            <div className="min-w-0">
              <span className="font-semibold">{a.email}</span>
              <p className="mt-0.5 text-xs text-inkmuted">
                Via {PROVIDER_LABEL[a.provider] ?? a.provider} · last tried {a.lastAttemptedAt.toLocaleString("en-GB")}
                {a.attemptCount > 1 && ` · ${a.attemptCount} attempts since ${a.firstAttemptedAt.toLocaleDateString("en-GB")}`}
              </p>
            </div>
            <form action={dismissAccessRequest.bind(null, a.id)}>
              <button type="submit" className="shrink-0 text-xs font-semibold text-inkmuted underline hover:text-danger">
                Dismiss
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
