// CDM 2015 statutory question (Project.worksType) → compliance tag
// bridge. Kept separate from the free-text `tags` a PM/LLM can set,
// because this one tag must be driven only by the explicit worksType
// answer — see the schema comment on Project.worksType and the
// exclusion of this tag from lib/provisioning.ts's LLM tag vocabulary.

import type { CdmWorksType } from "@prisma/client";

export const CDM_BUILDING_MODIFICATION_TAG = "cdm_building_modification";

/**
 * The tag set actually used to match ComplianceRuleTemplate.appliesIfTags
 * at Stage instantiation — a project's free-text tags, plus the CDM tag
 * when worksType says this project modifies the building. Callers that
 * instantiate stages (approveProvisioning, reinstateStage, seed.ts) pass
 * this instead of project.tags directly.
 */
export function effectiveComplianceTags(project: { tags: string[]; worksType: CdmWorksType }): string[] {
  return project.worksType === "BUILDING_MODIFICATION"
    ? [...project.tags, CDM_BUILDING_MODIFICATION_TAG]
    : project.tags;
}
