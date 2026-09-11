// Phase 5 of the Project Managed System build (PRD.html §06/§09) — the AI
// Council mailbox pipeline calls this once the named agent has actually
// produced a real report, uploading it here so it lands in the same
// storage (SharePoint/local) the original evidence did, and gets attached
// to the same Deliverable as an EvidenceFile tagged kind: AI_REVIEW — never
// SUBMITTED, so it can never be mistaken for, or supersede, the real
// evidence it reviewed (see EvidenceFileKind's own schema comment).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth, getEmailApprovalSystemUserId } from "@/lib/emailApprovalApi";
import { uploadReviewReport } from "@/lib/documentReviewEvidence";

type CompleteBody = {
  requestToken?: string;
  resultSummary?: string;
  fileName?: string;
  contentBase64?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id: requestToken } = await params;
  const body: CompleteBody = await request.json().catch(() => ({}));
  if (String(body.requestToken ?? "") !== requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }
  const fileName = String(body.fileName ?? "").trim();
  const contentBase64 = String(body.contentBase64 ?? "");
  const resultSummary = String(body.resultSummary ?? "").trim();
  if (!fileName || !contentBase64) {
    return NextResponse.json({ error: "fileName and contentBase64 are required." }, { status: 400 });
  }

  const review = await db.documentReviewRequest.findUnique({
    where: { requestToken },
    include: { deliverable: { include: { gate: { include: { stage: { include: { project: true } } } } } } },
  });
  if (!review) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  if (review.status !== "PENDING" && review.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Already ${review.status} — cannot complete again.` }, { status: 409 });
  }

  const project = review.deliverable.gate.stage.project;
  const stageName = review.deliverable.gate.stage.name;
  const content = Buffer.from(contentBase64, "base64");
  const { fileRef } = await uploadReviewReport(fileName, content, { name: project.name, projectNumber: project.projectNumber }, stageName);

  const systemUserId = await getEmailApprovalSystemUserId();
  const now = new Date();
  // Interactive transaction (not the array form) so the new EvidenceFile's
  // generated id is available to link back onto resultEvidenceFileId in
  // the same atomic unit, rather than re-querying for it afterwards.
  await db.$transaction(async (tx) => {
    const resultFile = await tx.evidenceFile.create({
      data: {
        deliverableId: review.deliverableId,
        fileName,
        fileRef,
        kind: "AI_REVIEW",
        uploadedById: systemUserId,
      },
    });
    await tx.documentReviewRequest.update({
      where: { id: review.id },
      data: {
        status: "COMPLETE",
        completedAt: now,
        resultSummary: resultSummary || null,
        resultEvidenceFileId: resultFile.id,
      },
    });
    await tx.auditLogEntry.create({
      data: {
        actorId: systemUserId,
        gateId: review.deliverable.gateId,
        action: "document_review.completed",
        entityType: "DocumentReviewRequest",
        entityId: review.id,
        reason: `${review.agentSlug} review complete: ${resultSummary || "(no summary)"}`,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
