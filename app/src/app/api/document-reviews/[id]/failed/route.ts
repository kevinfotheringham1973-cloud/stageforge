// Phase 5 of the Project Managed System build (PRD.html §06/§09) — the AI
// Council mailbox pipeline calls this when it genuinely could not complete
// a review (evidence download failed, the agent errored, etc.), so the
// request is recorded as FAILED rather than silently vanishing from
// PENDING forever with no trace anywhere the PM would see.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth, getEmailApprovalSystemUserId } from "@/lib/emailApprovalApi";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id: requestToken } = await params;
  const body = await request.json().catch(() => ({}));
  if (String(body.requestToken ?? "") !== requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }
  const failureReason = String(body.failureReason ?? "").trim() || "(no reason given)";

  const review = await db.documentReviewRequest.findUnique({ where: { requestToken }, include: { deliverable: true } });
  if (!review) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  if (review.status !== "PENDING" && review.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Already ${review.status} — cannot fail again.` }, { status: 409 });
  }

  const systemUserId = await getEmailApprovalSystemUserId();
  const now = new Date();
  await db.$transaction([
    db.documentReviewRequest.update({
      where: { id: review.id },
      data: { status: "FAILED", completedAt: now, failureReason },
    }),
    db.auditLogEntry.create({
      data: {
        actorId: systemUserId,
        gateId: review.deliverable.gateId,
        action: "document_review.failed",
        entityType: "DocumentReviewRequest",
        entityId: review.id,
        reason: `${review.agentSlug} review failed: ${failureReason}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
