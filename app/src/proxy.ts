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
import { SHARE_LINK_COOKIE_NAME, resolveShareLinkViewerUserId } from "./lib/shareLinks";

const PUBLIC_PATHS = ["/login", "/share"];

// Write-only entry points, plus the two admin pages that carry real
// people's contact details (Team) or deployment internals (About) -- a
// share-link viewer shouldn't even see the door to these. Compliance
// rules and Regulatory reference are deliberately NOT here: they're pure
// reference content, and their own page-level gate
// (canViewAdminReferencePage, shareLinks.ts) already lets a demo viewer
// read them. This list is belt-and-braces on top of the real protection
// either way -- every write Server Action already rejects the role-less
// Demo Viewer on its own (see shareLinks.ts).
const SHARE_VIEWER_DENYLIST = ["/projects/new", "/team", "/about"];

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (req.auth || isPublic) return;

  const shareToken = req.cookies.get(SHARE_LINK_COOKIE_NAME)?.value;
  const shareViewerId = await resolveShareLinkViewerUserId(shareToken);
  if (shareViewerId) {
    if (SHARE_VIEWER_DENYLIST.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return;
  }

  return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|jpg|svg|ico)).*)"],
};
