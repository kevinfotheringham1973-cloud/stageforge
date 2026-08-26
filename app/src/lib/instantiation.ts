// Stage instantiation — creating a live Stage/Gate from one or more
// StageTemplates sharing the same key, with its delivery checklist
// copied from DeliverableTemplate and its compliance checklist merged
// in via matchingComplianceRuleTemplates (ConfigSchema.html §05).
// Extracted so reinstateStage and approveProvisioning
// (ProvisioningModel.html §06) share one implementation instead of
// writing this sequence out inline a third time — the same "copy at
// instantiation, never a live join" rule applies to every caller.
//
// Accepts a GROUP of StageTemplates, not one (26 Aug 2026, "merge
// additional systems into one Project") — a merged project's Gate for
// a shared RIBA stage key (e.g. "stage.design_planning") carries the
// UNION of every constituent template's deliverables for that stage,
// not a separate gate per template. Compliance-requirement matching
// needs no equivalent union logic: matchingComplianceRuleTemplates
// already matches purely on stage key + Project.tags against global
// ComplianceRuleSet rows, never per-template, so it's already
// template-count-agnostic as long as the caller passes the union of
// tags across every constituent template.

import type { PrismaClient } from "@prisma/client";
import { matchingComplianceRuleTemplates } from "./compliance";

type StageTemplateForInstantiation = {
  id: string;
  key: string;
  name: string;
  gateTemplate: {
    key: string;
    name: string;
    deliverableTemplates: {
      id: string;
      key: string;
      label: string;
      description: string | null;
      minFiles: number;
      blocksGate: boolean;
      bypassAuthority: string;
    }[];
  } | null;
};

export async function instantiateStage(
  db: PrismaClient,
  params: {
    projectId: string;
    projectTags: string[];
    sectorVariantId: string;
    order: number;
    // Every entry must share the same `.key` — one per constituent
    // Template that defines this stage. Index 0 (the primary
    // template's version, when present) drives Stage/Gate naming and
    // Stage.sourceStageTemplateId provenance — that field is
    // informational-only and never read elsewhere in the app, so
    // recording only the primary source is a safe simplification.
    stageTemplates: StageTemplateForInstantiation[];
  }
) {
  const { projectId, projectTags, sectorVariantId, order, stageTemplates } = params;
  if (stageTemplates.length === 0) {
    throw new Error("instantiateStage called with no stage templates.");
  }
  const key = stageTemplates[0]!.key;
  if (stageTemplates.some((st) => st.key !== key)) {
    throw new Error(`instantiateStage: mismatched stage template keys in group (${stageTemplates.map((st) => st.key).join(", ")}).`);
  }
  const withGate = stageTemplates.filter((st) => st.gateTemplate);
  if (withGate.length === 0) {
    throw new Error(`Stage template "${key}" has no gate template in any constituent template — nothing to instantiate.`);
  }
  const primary = withGate[0]!;
  const gateTemplate = primary.gateTemplate!;

  const stage = await db.stage.create({
    data: {
      projectId,
      sourceStageTemplateId: primary.id,
      key,
      name: primary.name,
      order,
    },
  });

  const gate = await db.gate.create({
    data: {
      stageId: stage.id,
      key: gateTemplate.key,
      name: gateTemplate.name,
      status: "NOT_STARTED",
    },
  });

  // Union every contributing template's deliverables onto this one
  // Gate, deduping by `key` (first-template-wins, primary first) — a
  // shared key across two templates almost certainly means the same
  // real-world artifact, and creating two Deliverable rows for it would
  // force duplicate evidence uploads for one requirement.
  const seenDeliverableKeys = new Set<string>();
  const deliverableRows: {
    gateId: string;
    templateId: string;
    key: string;
    label: string;
    description: string | null;
    minFiles: number;
    blocksGate: boolean;
    bypassAuthority: string;
    status: "PENDING";
  }[] = [];
  for (const st of withGate) {
    for (const dt of st.gateTemplate!.deliverableTemplates) {
      if (seenDeliverableKeys.has(dt.key)) continue;
      seenDeliverableKeys.add(dt.key);
      deliverableRows.push({
        gateId: gate.id,
        templateId: dt.id,
        key: dt.key,
        label: dt.label,
        description: dt.description,
        minFiles: dt.minFiles,
        blocksGate: dt.blocksGate,
        bypassAuthority: dt.bypassAuthority,
        status: "PENDING",
      });
    }
  }
  if (deliverableRows.length > 0) {
    await db.deliverable.createMany({ data: deliverableRows });
  }

  const matchingRules = await matchingComplianceRuleTemplates(db, sectorVariantId, key, projectTags);
  if (matchingRules.length > 0) {
    await db.complianceRequirement.createMany({
      data: matchingRules.map((rt) => ({
        gateId: gate.id,
        templateId: rt.id,
        key: rt.key,
        label: rt.label,
        description: rt.description,
        ruleRef: rt.ruleRef,
        evidenceType: rt.evidenceType,
        minFiles: rt.minFiles,
        blocksGate: rt.blocksGate,
        overrideAuthority: rt.overrideAuthority,
        additionalApproverRoleKeys: rt.additionalApproverRoleKeys,
        status: "PENDING" as const,
      })),
    });
  }

  return { stage, gate };
}
