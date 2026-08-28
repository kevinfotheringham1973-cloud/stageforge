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
import { SHARE_LINK_COOKIE_NAME, resolveShareLinkProject } from "./lib/shareLinks";

const PUBLIC_PATHS = ["/login", "/share"];

// Write-only entry points, plus the admin pages that carry real people's
// contact details (Team, Access requests, Share links) or deployment
// internals (About) -- a share-link viewer shouldn't even see the door to
// these. Compliance rules and Regulatory reference are deliberately NOT
// here: they're pure reference content, and their own page-level gate
// (canViewAdminReferencePage, shareLinks.ts) already lets a demo viewer
// read them. This list is belt-and-braces on top of the real protection
// either way -- every write Server Action already rejects the role-less
// Demo Viewer on its own (see shareLinks.ts).
const SHARE_VIEWER_DENYLIST = ["/projects/new", "/team", "/about", "/access-requests", "/share-links"];

// Cross-project listing/aggregate pages (28 Aug 2026, closing a real
// leak alongside ShareLink gaining a required projectId): every one of
// these calls db.project.findMany with no project filter, so they list
// every project on the platform -- exactly what let a demo viewer browse
// off the England demo tenant and onto the real Scotland projects to see
// real people's names (found live testing the landing page's demo link).
// A share-link viewer is confined to their one linked project, so none
// of these make sense for them anyway -- redirected to that project.
const SHARE_VIEWER_CROSS_PROJECT_PATHS = ["/finance", "/resources", "/lessons-learned", "/works-packages"];

// Lets the root layout know which project (if any) the current request is
// for, without every page having to pass it down itself -- layout.tsx reads
// this via next/headers to scope the "view as" switcher to that project's
// own team (28 Aug 2026: with two separate demo tenants now sharing one
// platform-wide user list, the switcher was otherwise leaking Scotland/FVRH
// persona names onto the England tenant's pages, and vice versa).
// Excludes "new" -- /projects/new is the creation form, not a real
// project's projectNumber. Also matches /api/projects/<number>/... (the
// draft-document download routes) so a share viewer is blocked from
// requesting another project's generated draft at the proxy layer too,
// not solely relying on each route's own canUploadEvidence check (28 Aug
// 2026, belt-and-braces alongside the rest of this file's leak fix).
const PROJECT_PATH_RE = /^\/(?:api\/)?projects\/(?!new(?:\/|$))([^/]+)/;

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const projectNumber = pathname.match(PROJECT_PATH_RE)?.[1];

  if (req.auth || isPublic) {
    if (!projectNumber) return;
    const res = NextResponse.next();
    res.headers.set("x-current-project-number", projectNumber);
    return res;
  }

  const shareToken = req.cookies.get(SHARE_LINK_COOKIE_NAME)?.value;
  const linkedProject = await resolveShareLinkProject(shareToken);
  if (linkedProject) {
    const home = new URL(`/projects/${linkedProject.projectNumber}`, req.nextUrl.origin);

    // Confine navigation to the one project this link is for -- root,
    // any other project's number, the denylist, and every cross-project
    // listing page all bounce back to it rather than "/", which used to
    // be (and without this would still be) the platform-wide portfolio.
    if (
      pathname === "/" ||
      SHARE_VIEWER_DENYLIST.some((p) => pathname.startsWith(p)) ||
      SHARE_VIEWER_CROSS_PROJECT_PATHS.some((p) => pathname.startsWith(p)) ||
      (projectNumber && projectNumber !== linkedProject.projectNumber)
    ) {
      return NextResponse.redirect(home);
    }

    if (!projectNumber) return;
    const res = NextResponse.next();
    res.headers.set("x-current-project-number", projectNumber);
    return res;
  }

  return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|jpg|svg|ico)).*)"],
};
