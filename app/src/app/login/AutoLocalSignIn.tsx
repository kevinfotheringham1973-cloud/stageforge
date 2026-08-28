"use client";

import { useEffect, useRef } from "react";

/**
 * Desktop build only (STAGEFORGE_LOCAL_MODE) — auto-submits the local
 * sign-in form on mount so /login is a same-tick flash, not something
 * the user has to click through. signIn() itself can't run during
 * server-side render (cookies can only be set in a Server Action), so
 * this is the least-code way to fire that action immediately instead.
 */
export function AutoLocalSignIn({ action }: { action: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={action}>
      <button type="submit" className="sr-only">
        Continue
      </button>
    </form>
  );
}
