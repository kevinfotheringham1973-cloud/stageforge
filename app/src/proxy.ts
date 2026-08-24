// Renamed from middleware.ts in Next 16 -- proxy now defaults to the
// Node.js runtime (not Edge), which matters here: auth() does a real
// Prisma lookup against the Session table (database session strategy,
// not a self-contained JWT), and Prisma can't run on Edge.
//
// This is the actual enforcement point that makes "you must sign in"
// real -- before this, every page was open regardless of what
// permissions.ts said, since that only ever governed which *actions*
// were allowed, never whether you could view a page at all. Note per
// Next's own proxy docs: Server Functions on an excluded path skip this
// entirely, so it's a UX-level gate on top of, not instead of, each
// Server Action's own permission checks.
import { NextResponse } from "next/server";
import { auth } from "./lib/auth";

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|jpg|svg|ico)).*)"],
};
