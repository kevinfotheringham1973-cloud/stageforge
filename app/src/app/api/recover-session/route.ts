// Reached only via layout.tsx's redirect when a session token decodes
// fine (auth() finds it -- the JWT carries user info directly and is
// never re-checked against the database) but no longer matches any
// actual User row -- found live, 27 Aug 2026, after the local-mode
// database got reset while an old token was still cached in the
// browser. That left a dead end: the header (and its own "sign out"
// button) never rendered, because currentUser resolution failed, but
// nothing ever cleared the stale cookie either.
//
// signOut() needs a Server Action or Route Handler to mutate cookies at
// all (the same reason signIn() can't run directly during a page
// render) -- this route exists purely to give layout.tsx one to redirect
// to.
import { signOut } from "@/lib/auth";

export async function GET() {
  await signOut({ redirectTo: "/login" });
}
