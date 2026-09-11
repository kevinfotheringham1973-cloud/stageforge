// Phase 5 of the Project Managed System build (PRD.html §06/§09) — streams
// the real evidence file's bytes back to the AI Council mailbox pipeline so
// it has something real to hand the review agent. GET has no body, so the
// requestToken travels as a query param instead (still required — the
// route id alone isn't treated as sufficient, same "never trust the path
// segment on its own" posture as every other route here).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";
import { downloadRealEvidenceBytes } from "@/lib/documentReviewEvidence";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id: requestToken } = await params;
  const url = new URL(request.url);
  if (url.searchParams.get("requestToken") !== requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }

  const review = await db.documentReviewRequest.findUnique({
    where: { requestToken },
    include: {
      evidenceFile: true,
      deliverable: { include: { gate: { include: { stage: { include: { project: true } } } } } },
    },
  });
  if (!review) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });

  const project = review.deliverable.gate.stage.project;
  const stageName = review.deliverable.gate.stage.name;
  const bytes = await downloadRealEvidenceBytes(
    review.evidenceFile.fileRef,
    review.evidenceFile.fileName,
    { name: project.name, projectNumber: project.projectNumber },
    stageName
  );
  if (!bytes) {
    return NextResponse.json(
      { error: "No real evidence file exists for this record (dev/stub upload) — nothing to download." },
      { status: 422 }
    );
  }

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${review.evidenceFile.fileName.replace(/"/g, "")}"`,
    },
  });
}
