// The redemption link itself -- e.g.
// https://stageforge.pmopassport.co.uk/share/<token>. Sets the cookie
// proxy.ts and session.ts key off; the actual "is this token still good"
// check lives in shareLinks.ts, not here.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SHARE_LINK_COOKIE_NAME } from "@/lib/shareLinks";

// req.nextUrl.origin resolves to the tunnel's local bind address
// (http://localhost:3001) rather than the public hostname -- Cloudflare's
// tunnel forwards the request to that local address without Next trusting
// the original Host header for origin computation, so a redirect built
// from it sends every external visitor to their own machine's localhost
// (found live, 28 Aug 2026, testing the landing page's demo link).
// APP_BASE_URL is the existing fix for exactly this elsewhere in the app
// (scheduledReportSender.ts, share-links/page.tsx's own displayed URL).
const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://stageforge.pmopassport.co.uk";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await db.shareLink.findUnique({ where: { token } });
  const isValid = link && !link.revokedAt && link.expiresAt > new Date();
  if (!isValid) {
    return NextResponse.redirect(new URL("/login?error=ShareLinkExpired", APP_BASE_URL));
  }

  const maxAge = Math.max(1, Math.floor((link.expiresAt.getTime() - Date.now()) / 1000));
  const res = NextResponse.redirect(new URL("/", APP_BASE_URL));
  res.cookies.set(SHARE_LINK_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  });
  return res;
}
