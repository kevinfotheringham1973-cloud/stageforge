// Phase 5 extended (PRD.html §06/§09) — mirrors
// /api/document-reviews/[id]/failed exactly: called when the AI Council side
// genuinely could not complete a generation (a source download failed, the
// agent errored, etc.), so the request is recorded as FAILED rather than
// silently vanishing from PENDING forever with no trace the PM would see.
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

  const generation = await db.documentGenerationRequest.findUnique({ where: { requestToken }, include: { deliverable: true } });
  if (!generation) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  if (generation.status !== "PENDING" && generation.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Already ${generation.status} — cannot fail again.` }, { status: 409 });
  }

  const systemUserId = await getEmailApprovalSystemUserId();
  const now = new Date();
  await db.$transaction([
    db.documentGenerationRequest.update({
      where: { id: generation.id },
      data: { status: "FAILED", completedAt: now, failureReason },
    }),
    db.auditLogEntry.create({
      data: {
        actorId: systemUserId,
        gateId: generation.deliverable.gateId,
        action: "document_generation.failed",
        entityType: "DocumentGenerationRequest",
        entityId: generation.id,
        reason: `${generation.agentSlug} draft failed: ${failureReason}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
