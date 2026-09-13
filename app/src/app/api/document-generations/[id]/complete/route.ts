// Phase 5 extended (PRD.html §06/§09) — the AI Council side calls this once
// the named drafting agent has actually produced a real draft, uploading it
// here so it lands in the same storage the target Deliverable's real
// evidence would, and gets attached as an EvidenceFile tagged
// kind: AI_DRAFT — never SUBMITTED, so it can never be mistaken for, or
// supersede, real evidence on that Deliverable. Mirrors
// /api/document-reviews/[id]/complete exactly, save for the AI_DRAFT kind
// and the DocumentGenerationRequest table.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth, getEmailApprovalSystemUserId } from "@/lib/emailApprovalApi";
import { uploadGeneratedDraft } from "@/lib/documentGenerationEvidence";

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

  const generation = await db.documentGenerationRequest.findUnique({
    where: { requestToken },
    include: { deliverable: { include: { gate: { include: { stage: { include: { project: true } } } } } } },
  });
  if (!generation) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  if (generation.status !== "PENDING" && generation.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: `Already ${generation.status} — cannot complete again.` }, { status: 409 });
  }

  const project = generation.deliverable.gate.stage.project;
  const stageName = generation.deliverable.gate.stage.name;
  const content = Buffer.from(contentBase64, "base64");
  const { fileRef } = await uploadGeneratedDraft(fileName, content, { name: project.name, projectNumber: project.projectNumber }, stageName);

  const systemUserId = await getEmailApprovalSystemUserId();
  const now = new Date();
  // Interactive transaction, same reasoning as the review bridge's complete
  // route: the new EvidenceFile's generated id must be available to link
  // back onto resultEvidenceFileId in the same atomic unit.
  await db.$transaction(async (tx) => {
    const resultFile = await tx.evidenceFile.create({
      data: {
        deliverableId: generation.deliverableId,
        fileName,
        fileRef,
        kind: "AI_DRAFT",
        uploadedById: systemUserId,
      },
    });
    await tx.documentGenerationRequest.update({
      where: { id: generation.id },
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
        gateId: generation.deliverable.gateId,
        action: "document_generation.completed",
        entityType: "DocumentGenerationRequest",
        entityId: generation.id,
        reason: `${generation.agentSlug} draft complete: ${resultSummary || "(no summary)"}`,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
