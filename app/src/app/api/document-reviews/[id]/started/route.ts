// Phase 5 of the Project Managed System build (PRD.html §06/§09) — the AI
// Council mailbox pipeline calls this once it has actually picked up a
// PENDING request and is about to run the agent, so a concurrent poll
// never processes the same request twice. Addressed by requestToken, same
// reasoning as every other [id] route here — see the Phase 3 /reply
// route's own comment on why: the caller only ever has the token it read
// off GET .../pending, never the database id.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id: requestToken } = await params;
  const body = await request.json().catch(() => ({}));
  if (String(body.requestToken ?? "") !== requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }

  const review = await db.documentReviewRequest.findUnique({ where: { requestToken } });
  if (!review) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  if (review.status !== "PENDING") {
    return NextResponse.json({ error: `Already ${review.status}, not PENDING.` }, { status: 409 });
  }

  await db.documentReviewRequest.update({
    where: { id: review.id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
