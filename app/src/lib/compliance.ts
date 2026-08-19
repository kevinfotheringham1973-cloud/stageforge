// The "merge at Stage instantiation" step (ConfigSchema.html §05): a
// Gate's compliance requirements are assembled once, at the moment its
// Stage is instantiated, from every ComplianceRuleTemplate whose
// appliesToStageKeys includes that stage and whose appliesIfTags either
// is empty (always applies) or shares at least one tag with the project
// ("any match" — no AND/OR/NOT, per the PRD decision). The result is
// copied into real ComplianceRequirement rows and never re-resolved
// live, so editing the corpus later never rewrites what an in-progress
// or signed-off gate was actually reviewed against.

import type { PrismaClient } from "@prisma/client";

export async function matchingComplianceRuleTemplates(
  db: PrismaClient,
  sectorVariantId: string,
  stageKey: string,
  projectTags: string[]
) {
  return db.complianceRuleTemplate.findMany({
    where: {
      ruleSet: { sectorVariantId },
      appliesToStageKeys: { has: stageKey },
      OR: [{ appliesIfTags: { isEmpty: true } }, { appliesIfTags: { hasSome: projectTags } }],
    },
  });
}
