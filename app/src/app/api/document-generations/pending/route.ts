// Phase 5 extended (PRD.html §06/§09) — the AI Council side polls this to
// discover PENDING document-GENERATION requests, mirroring GET
// /api/document-reviews/pending exactly, except each item carries a LIST of
// source files (possibly from different Deliverables/Gates) rather than one.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkEmailApprovalApiAuth } from "@/lib/emailApprovalApi";
import { isBusinessCaseShapedDeliverable, isEnergyRelevantTemplate } from "@/lib/documentGenerationEvidence";

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
          key: true,
          label: true,
          gate: {
            select: {
              name: true,
              key: true,
              stage: {
                select: {
                  project: {
                    select: {
                      name: true,
                      projectNumber: true,
                      template: { select: { matchKeywords: true } },
                      additionalTemplates: { select: { template: { select: { matchKeywords: true } } } },
                    },
                  },
                },
              },
            },
          },
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
      // A decision, not raw data -- the AI Council side never needs to know
      // StageForge's own deliverable-key taxonomy, just whether to run the
      // oversight-panel step before drafting. See
      // isBusinessCaseShapedDeliverable's own comment (documentGenerationEvidence.ts)
      // for why: found live 13 Sep 2026, business-case-generator drafted a
      // Gate 0 case from a contractor quote alone and rated its own
      // justification "Weak/Mixed" -- a quote is the wrong evidence type,
      // and none of the five relevant Hard FM oversight agents (compliance,
      // PFI/paymech, lifecycle/handback, IPC/HAI-SCRIBE, net-zero) were ever
      // consulted for their domain view.
      consultOversightPanel: isBusinessCaseShapedDeliverable(r.deliverable.key),
      // Gates only nhs-scotland-netzero-energy out of the panel -- see
      // isEnergyRelevantTemplate's own comment for why it alone is narrowed
      // and the other four aren't. Checks every template this project
      // actually covers (primary + any bundled additional systems), not
      // just the primary one.
      includeNetZeroInPanel: isEnergyRelevantTemplate([
        ...r.deliverable.gate.stage.project.template.matchKeywords,
        ...r.deliverable.gate.stage.project.additionalTemplates.flatMap((a) => a.template.matchKeywords),
      ]),
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
