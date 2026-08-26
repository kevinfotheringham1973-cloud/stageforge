// Deterministic (never LLM-guessed) compliance-tag bridges. Kept
// separate from the free-text `tags` a PM/LLM can set, because these
// tags must be driven only by facts the app already knows for
// certain — see the schema comment on Project.worksType and the
// exclusion of these tags from lib/provisioning.ts's LLM tag
// vocabulary. Originally CDM-only (hence the filename); the
// HAI-SCRIBE intensity tag below follows the exact same reasoning —
// which system a project's Template covers is a fixed fact, not
// something that should vary by free-text description within one
// discipline, so it isn't left to the LLM either.
//
// Two independent CDM tags, not one, because CDM 2015's Principal
// Designer duty (reg 5) and the planning-permission question are
// triggered by different things: "more than one contractor" for the
// former, "modifies the building" for the latter.
// DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS gets the first tag but not
// the second; BUILDING_MODIFICATION gets both (a building-modification
// job always needs more than one trade in practice).

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

// The systems/templates rated "High" HAI-SCRIBE/IPC involvement across
// most of the project lifecycle (RIBA 2–6), versus every other
// template's Low–Medium rating. Keyed by Template.key so it's a
// property of the discipline, not guessed per project. First 5 from
// the HAI-SCRIBE vs RIBA intensity matrix (21 Aug 2026); the three
// refresh templates (Room or Ward Refresh, Mental Health Unit Ligature
// & Room Refresh, Theatre Refresh — split 22 Aug 2026 from one merged
// draft) added per their shared source document
// ("Room,Ward or Theatre Refresh.docx"), which states HAI-SCRIBE "must
// be applied rigorously (High involvement expected)" as a blanket
// principle covering all three of the project types it describes, and
// appears at all four HAI-SCRIBE stages — same standing as the
// original matrix, different source.
export const HAISCRIBE_HIGH_INTENSITY_TAG = "haiscribe_high_intensity_system_affected";
const HAISCRIBE_HIGH_INTENSITY_TEMPLATE_KEYS = new Set([
  "template.health.ventilation_systems_replacement",
  "template.health.medical_gas_systems_replacement",
  "template.health.domestic_hot_cold_water_replacement",
  "template.health.chilled_water_cooling_replacement",
  "template.health.above_ground_drainage_replacement",
  "template.health.room_ward_refresh",
  "template.health.mhu_ligature_room_refresh",
  "template.health.theatre_refresh",
]);

/**
 * The tag set actually used to match ComplianceRuleTemplate.appliesIfTags
 * at Stage instantiation — a project's free-text tags, plus whichever
 * CDM tags its worksType answer implies, plus the HAI-SCRIBE
 * high-intensity tag if ANY of its constituent Templates is one of the
 * high-intensity ones (a project can now be built from more than one
 * Template — see ProjectAdditionalTemplate in schema.prisma — so this
 * takes every constituent template's key, not just one). Callers that
 * instantiate stages (approveProvisioning, reinstateStage, seed.ts)
 * pass this instead of project.tags directly. templateKeys is optional
 * only so existing callers that haven't been threaded through yet
 * don't break — always pass it where the Templates are known.
 */
export function effectiveComplianceTags(
  project: { tags: string[]; worksType: CdmWorksType },
  templateKeys?: string[]
): string[] {
  const derivedTags: string[] = [];
  if (project.worksType !== "DIRECT_REPLACEMENT_SINGLE_CONTRACTOR") {
    derivedTags.push(CDM_PRINCIPAL_DESIGNER_TAG);
  }
  if (project.worksType === "BUILDING_MODIFICATION") {
    derivedTags.push(CDM_BUILDING_MODIFICATION_TAG);
  }
  if (templateKeys?.some((k) => HAISCRIBE_HIGH_INTENSITY_TEMPLATE_KEYS.has(k))) {
    derivedTags.push(HAISCRIBE_HIGH_INTENSITY_TAG);
  }
  return [...project.tags, ...derivedTags];
}
