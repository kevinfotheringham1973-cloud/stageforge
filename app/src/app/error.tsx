"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Every server action in this app throws a plain Error on a rule
 * violation ("Only the Project Manager can set resource allocation.",
 * etc.) rather than returning a typed result — this boundary is what
 * turns that into a readable message instead of Next's raw dev/digest
 * error screen. See lib/actions.ts.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-4 px-4 py-16 sm:px-6 md:px-10">
      <div className="font-mono text-[10px] uppercase tracking-wide text-risk">Something went wrong</div>
      <p className="text-lg font-semibold text-ink">{error.message || "That action couldn't be completed."}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-accent"
        >
          Try again
        </button>
        <Link href="/" className="rounded-md border border-rule px-3 py-1.5 text-sm font-semibold text-inkmuted">
          Back to portfolio
        </Link>
      </div>
    </div>
  );
}
