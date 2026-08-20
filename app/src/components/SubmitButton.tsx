"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Every mutation in this app is a plain form action — no client state,
 * no optimistic UI. This is the smallest fix for the silence that
 * leaves: while pending, the button visibly says so; the moment
 * pending flips back to false (the server action completed and the
 * page re-rendered with fresh data), it shows a brief "Saved"
 * confirmation instead of just going quiet. No action signatures
 * change — this only reads useFormStatus's pending flag.
 */
export function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setJustSaved(true);
      const timer = setTimeout(() => setJustSaved(false), 1800);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="submit"
        disabled={pending || disabled}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pending ? (pendingText ?? "Saving…") : children}
      </button>
      {justSaved && <span className="text-xs font-semibold text-ok">Saved</span>}
    </span>
  );
}
