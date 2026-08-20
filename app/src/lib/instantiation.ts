// Stage instantiation — creating a live Stage/Gate from a StageTemplate,
// with its delivery checklist copied from DeliverableTemplate and its
// compliance checklist merged in via matchingComplianceRuleTemplates
// (ConfigSchema.html §05). Extracted so reinstateStage and
// approveProvisioning (ProvisioningModel.html §06) share one
// implementation instead of writing this sequence out inline a third
// time — the same "copy at instantiation, never a live join" rule
// applies to every caller.

import type { BypassAuthority, PrismaClient } from "@prisma/client";
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
      bypassAuthority: BypassAuthority;
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
    stageTemplate: StageTemplateForInstantiation;
  }
) {
  const { projectId, projectTags, sectorVariantId, order, stageTemplate } = params;
  if (!stageTemplate.gateTemplate) {
    throw new Error(`Stage template "${stageTemplate.key}" has no gate template — nothing to instantiate.`);
  }
  const gateTemplate = stageTemplate.gateTemplate;

  const stage = await db.stage.create({
    data: {
      projectId,
      sourceStageTemplateId: stageTemplate.id,
      key: stageTemplate.key,
      name: stageTemplate.name,
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

  if (gateTemplate.deliverableTemplates.length > 0) {
    await db.deliverable.createMany({
      data: gateTemplate.deliverableTemplates.map((dt) => ({
        gateId: gate.id,
        templateId: dt.id,
        key: dt.key,
        label: dt.label,
        description: dt.description,
        minFiles: dt.minFiles,
        blocksGate: dt.blocksGate,
        bypassAuthority: dt.bypassAuthority,
        status: "PENDING" as const,
      })),
    });
  }

  const matchingRules = await matchingComplianceRuleTemplates(db, sectorVariantId, stageTemplate.key, projectTags);
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
        status: "PENDING" as const,
      })),
    });
  }

  return { stage, gate };
}
