// Phase 5 extended (PRD.html §06/§09) — the AI Council side polls this to
// discover PENDING document-GENERATION requests, mirroring GET
// /api/document-reviews/pending exactly, except each item carries a LIST of
// source files (possibly from different Deliverables/Gates) rather than one.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";

export async function GET(request: Request) {
  const authError = checkEmailApprovalApiAuth(request);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const pending = await db.documentGenerationRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    include: {
      sources: {
        include: {
          evidenceFile: {
            select: {
              id: true,
              fileName: true,
              deliverable: { select: { label: true, gate: { select: { name: true } } } },
            },
          },
        },
      },
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
      targetDeliverableLabel: r.deliverable.label,
      gateName: r.deliverable.gate.name,
      gateKey: r.deliverable.gate.key,
      projectName: r.deliverable.gate.stage.project.name,
      projectNumber: r.deliverable.gate.stage.project.projectNumber,
      requestedByName: r.requestedBy.name,
      sources: r.sources.map((s) => ({
        evidenceFileId: s.evidenceFile.id,
        fileName: s.evidenceFile.fileName,
        deliverableLabel: s.evidenceFile.deliverable.label,
        gateName: s.evidenceFile.deliverable.gate.name,
      })),
    })),
  });
}
