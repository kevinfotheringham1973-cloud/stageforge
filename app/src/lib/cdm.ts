// CDM 2015 statutory question (Project.worksType) → compliance tag
// bridge. Kept separate from the free-text `tags` a PM/LLM can set,
// because these tags must be driven only by the explicit worksType
// answer — see the schema comment on Project.worksType and the
// exclusion of both tags from lib/provisioning.ts's LLM tag vocabulary.
//
// Two independent tags, not one, because CDM 2015's Principal Designer
// duty (reg 5) and the planning-permission question are triggered by
// different things: "more than one contractor" for the former,
// "modifies the building" for the latter. DIRECT_REPLACEMENT_MULTIPLE_
// CONTRACTORS gets the first tag but not the second; BUILDING_
// MODIFICATION gets both (a building-modification job always needs
// more than one trade in practice).

import type { CdmWorksType } from "@prisma/client";

export const CDM_PRINCIPAL_DESIGNER_TAG = "cdm_principal_designer_required";
export const CDM_BUILDING_MODIFICATION_TAG = "cdm_building_modification";

export const CDM_WORKS_TYPES: CdmWorksType[] = [
  "DIRECT_REPLACEMENT_SINGLE_CONTRACTOR",
  "DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS",
  "BUILDING_MODIFICATION",
];

export function isCdmWorksType(value: string): value is CdmWorksType {
  return (CDM_WORKS_TYPES as string[]).includes(value);
}

/**
 * The tag set actually used to match ComplianceRuleTemplate.appliesIfTags
 * at Stage instantiation — a project's free-text tags, plus whichever
 * CDM tags its worksType answer implies. Callers that instantiate
 * stages (approveProvisioning, reinstateStage, seed.ts) pass this
 * instead of project.tags directly.
 */
export function effectiveComplianceTags(project: { tags: string[]; worksType: CdmWorksType }): string[] {
  const cdmTags: string[] = [];
  if (project.worksType !== "DIRECT_REPLACEMENT_SINGLE_CONTRACTOR") {
    cdmTags.push(CDM_PRINCIPAL_DESIGNER_TAG);
  }
  if (project.worksType === "BUILDING_MODIFICATION") {
    cdmTags.push(CDM_BUILDING_MODIFICATION_TAG);
  }
  return [...project.tags, ...cdmTags];
}
