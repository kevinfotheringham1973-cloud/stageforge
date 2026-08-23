import Link from "next/link";

/**
 * Rendered whenever forbidden() is called (admin-only pages like
 * /team, /compliance-rules) — a clear, honest message rather than the
 * generic 404, so a permissions problem never reads as "this page
 * doesn't exist" or a broken link. Real 403 status code, per Next's
 * forbidden.tsx convention.
 */
export default function Forbidden() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <h1 className="mb-3 text-2xl font-bold">You don&rsquo;t have the appropriate privileges to view this page</h1>
      <p className="mb-6 text-sm text-inkmuted">
        This screen is only available to a platform admin. If you think you should have access, ask whoever
        manages the team roster to check your account.
      </p>
      <Link href="/" className="text-sm font-semibold text-accent hover:underline">
        ← Back to the portfolio
      </Link>
    </div>
  );
}
