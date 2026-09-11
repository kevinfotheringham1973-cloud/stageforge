import { timingSafeEqual } from "crypto";

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
