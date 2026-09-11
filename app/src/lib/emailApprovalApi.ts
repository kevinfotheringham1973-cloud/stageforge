import { timingSafeEqual } from "crypto";
import { db } from "./db";

// GateSignOff.signedOffById requires a real User (schema FK, unchanged
// by Phase 3 — see GateSignOffCapturedVia's own comment in
// schema.prisma). For an EMAIL_PROXY row there is no real logged-in
// actor to point it at, so it points here instead — a fixed, never-
// signed-into service account that exists ONLY to satisfy that foreign
// key. It must never be mistaken for the actual decision-maker: every
// UI display of a GateSignOff has to branch on capturedVia and show
// gate.signOffs[].emailApproval.contact (the real, verified external
// person) for EMAIL_PROXY rows instead of this account's name — see
// GateDetail.tsx's decision-history section.
export const EMAIL_APPROVAL_SYSTEM_USER_EMAIL = "email-approval-system@stageforge.local";

let cachedSystemUserId: string | null = null;

/**
 * Find-or-create, same shape as auth.ts's local-admin upsert for
 * STAGEFORGE_LOCAL_MODE — this account can never actually sign in (no
 * real auth provider issues a session for a .local address), it just
 * needs to exist as a row.
 */
export async function getEmailApprovalSystemUserId(): Promise<string> {
  if (cachedSystemUserId) return cachedSystemUserId;
  const user = await db.user.upsert({
    where: { email: EMAIL_APPROVAL_SYSTEM_USER_EMAIL },
    update: {},
    create: {
      name: "Email Approval System (do not sign in)",
      email: EMAIL_APPROVAL_SYSTEM_USER_EMAIL,
      seedKey: "email_approval_system",
    },
  });
  cachedSystemUserId = user.id;
  return user.id;
}

// Auth for the small, narrowly-scoped external API the AI Council
// mailbox pipeline uses to discover and confirm-sent EmailApproval
// requests (Phase 2, PRD.html §06). Deliberately NOT a full user
// session or DB credential — a single bearer token, held in each app's
// own .env (EMAIL_APPROVAL_API_TOKEN), matching the existing convention
// for cross-app secrets (e.g. GRAPH_CLIENT_ID). This token can only ever
// reach the two routes in src/app/api/email-approvals/ — it has no
// standing anywhere else in the app, unlike a real DB connection would.
// This app is tunnel-exposed to the internet, so the comparison itself
// is timing-safe rather than a plain !== check.
export function checkEmailApprovalApiAuth(request: Request): string | null {
  const expected = process.env.EMAIL_APPROVAL_API_TOKEN;
  if (!expected) return "EMAIL_APPROVAL_API_TOKEN is not configured on this server.";
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const expectedBuf = Buffer.from(expected);
  const presentedBuf = Buffer.from(presented);
  const same = presentedBuf.length === expectedBuf.length && timingSafeEqual(presentedBuf, expectedBuf);
  if (!presented || !same) return "Invalid or missing bearer token.";
  return null;
}
