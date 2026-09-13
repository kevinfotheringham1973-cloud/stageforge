// Phase 5 extended (PRD.html §06/§09) — streams one source EvidenceFile's
// real bytes back to the AI Council pipeline, the multi-file equivalent of
// /api/document-reviews/[id]/evidence. [fileId] must actually be one of this
// request's own sources (checked below) — not just any EvidenceFile id in
// the database — same "never trust the path segment on its own" posture as
// every other route here.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";
import { downloadRealSourceBytes } from "@/lib/documentGenerationEvidence";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id: requestToken, fileId } = await params;
  const url = new URL(request.url);
  if (url.searchParams.get("requestToken") !== requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }

  const generation = await db.documentGenerationRequest.findUnique({
    where: { requestToken },
    include: { sources: { where: { evidenceFileId: fileId }, include: { evidenceFile: true } } },
  });
  if (!generation) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  const source = generation.sources[0];
  if (!source) return NextResponse.json({ error: "That file is not a source of this request." }, { status: 404 });

  const evidenceFile = await db.evidenceFile.findUniqueOrThrow({
    where: { id: fileId },
    include: { deliverable: { include: { gate: { include: { stage: { include: { project: true } } } } } } },
  });
  const project = evidenceFile.deliverable.gate.stage.project;
  const stageName = evidenceFile.deliverable.gate.stage.name;
  const bytes = await downloadRealSourceBytes(
    evidenceFile.fileRef,
    evidenceFile.fileName,
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
      "Content-Disposition": `attachment; filename="${evidenceFile.fileName.replace(/"/g, "")}"`,
    },
  });
}
