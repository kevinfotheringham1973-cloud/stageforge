// The redemption link itself -- e.g.
// https://stageforge.pmopassport.co.uk/share/<token>. Sets the cookie
// proxy.ts and session.ts key off; the actual "is this token still good"
// check lives in shareLinks.ts, not here.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SHARE_LINK_COOKIE_NAME } from "@/lib/shareLinks";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await db.shareLink.findUnique({ where: { token } });
  const isValid = link && !link.revokedAt && link.expiresAt > new Date();
  if (!isValid) {
    return NextResponse.redirect(new URL("/login?error=ShareLinkExpired", req.nextUrl.origin));
  }

  const maxAge = Math.max(1, Math.floor((link.expiresAt.getTime() - Date.now()) / 1000));
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin));
  res.cookies.set(SHARE_LINK_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  });
  return res;
}
