// Phase 5 of the Project Managed System build (PRD.html §06/§09) — the AI
// Council mailbox pipeline polls this to discover PENDING document-review
// requests. Read-only, same request/confirm split as every other AI
// Council integration point here: this only reports what's pending, the
// caller confirms it picked one up via POST .../started before doing any
// real work, and confirms the outcome via .../complete or .../failed.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";

export async function GET(request: Request) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const pending = await db.documentReviewRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    include: {
      evidenceFile: { select: { fileName: true } },
      deliverable: {
        select: {
          label: true,
          gate: { select: { name: true, key: true, stage: { select: { project: { select: { name: true, projectNumber: true } } } } } },
        },
      },
      requestedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({
    pending: pending.map((r) => ({
      id: r.id,
      requestToken: r.requestToken,
      requestedAt: r.requestedAt.toISOString(),
      agentSlug: r.agentSlug,
      evidenceFileName: r.evidenceFile.fileName,
      deliverableLabel: r.deliverable.label,
      gateName: r.deliverable.gate.name,
      gateKey: r.deliverable.gate.key,
      projectName: r.deliverable.gate.stage.project.name,
      projectNumber: r.deliverable.gate.stage.project.projectNumber,
      requestedByName: r.requestedBy.name,
    })),
  });
}
