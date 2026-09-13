// Phase 5 extended (PRD.html §06/§09) — returns the manifest of source files
// for one generation request (there can be several, from different
// Deliverables/Gates — see DocumentGenerationRequest's own schema comment).
// The AI Council side reads this first, then downloads each file
// individually via GET .../sources/[fileId], mirroring the single-file
// /api/document-reviews/[id]/evidence route's requestToken-in-query
// convention, generalised to a list instead of one file.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id: requestToken } = await params;
  const url = new URL(request.url);
  if (url.searchParams.get("requestToken") !== requestToken) {
    return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });
  }

  const generation = await db.documentGenerationRequest.findUnique({
    where: { requestToken },
    include: { sources: { include: { evidenceFile: { select: { id: true, fileName: true } } } } },
  });
  if (!generation) return NextResponse.json({ error: "No matching request for that id/token." }, { status: 404 });

  return NextResponse.json({
    sources: generation.sources.map((s) => ({ evidenceFileId: s.evidenceFile.id, fileName: s.evidenceFile.fileName })),
  });
}
