/**
 * Applies the 2026-09-16 Water Isolation Plan / Flushing Plan / POU
 * filter deliverables (seed.ts, same commit) to an EXISTING database —
 * safe to run against an already-seeded install with real project data,
 * not just a fresh one. Same idempotent-append pattern as
 * scripts/sync-scotland-compliance-updates.ts's appendDeliverable: skip
 * if the deliverable key already exists under that gate, otherwise
 * create it at the end of the gate's list (order = current count).
 * Appending rather than inserting at seed.ts's exact array index is a
 * deliberate simplification, same choice the 2026-09-10 sync made —
 * `order` only affects display position/merged-project slot-pairing
 * within a gate, never anything functional, and none of these five
 * templates are typically merged with each other on a live project.
 *
 * Nothing here touches an existing Project, WorksPackage, or any
 * already-instantiated Gate/Deliverable row — those are frozen at
 * instantiation time; only NEW projects created after this runs see
 * these checklist items. Domestic Hot & Cold Water Systems Replacement
 * has a permanent live demo (#20777) with real Deliverable rows already
 * instantiated from its Template, but since this script only CREATEs
 * new DeliverableTemplate rows and never deletes/renames an existing
 * one, that live demo's existing gates are unaffected.
 *
 * Usage: npx tsx scripts/sync-2026-09-16-water-isolation-flushing.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type DeliverableDef = {
  key: string;
  label: string;
  description?: string;
  section?: string;
  bypassAuthority?: string;
};

async function appendDeliverable(templateKey: string, stageKey: string, def: DeliverableDef) {
  const template = await db.template.findUnique({ where: { key: templateKey } });
  if (!template) {
    console.log(`  [SKIP - template not found] ${templateKey} (this install may predate this template — check manually)`);
    return;
  }
  const stageTemplate = await db.stageTemplate.findUnique({
    where: { templateId_key: { templateId: template.id, key: stageKey } },
  });
  if (!stageTemplate) {
    console.log(`  [SKIP - stage not found] ${templateKey} / ${stageKey}`);
    return;
  }
  const gateTemplate = await db.gateTemplate.findUnique({ where: { stageTemplateId: stageTemplate.id } });
  if (!gateTemplate) {
    console.log(`  [SKIP - gate not found] ${templateKey} / ${stageKey}`);
    return;
  }
  const existing = await db.deliverableTemplate.findUnique({
    where: { gateTemplateId_key: { gateTemplateId: gateTemplate.id, key: def.key } },
  });
  if (existing) {
    console.log(`  [skip] deliverable already present: ${def.key}`);
    return;
  }
  const currentCount = await db.deliverableTemplate.count({ where: { gateTemplateId: gateTemplate.id } });
  await db.deliverableTemplate.create({
    data: {
      gateTemplateId: gateTemplate.id,
      order: currentCount,
      key: def.key,
      label: def.label,
      description: def.description ?? null,
      section: def.section ?? null,
      bypassAuthority: def.bypassAuthority ?? "PM",
    },
  });
  console.log(`  [added] deliverable: ${def.key} -> ${templateKey} / ${stageKey}`);
}

async function main() {
  console.log("== Domestic Hot & Cold Water Systems Replacement ==");
  await appendDeliverable("template.health.domestic_hot_cold_water_replacement", "stage.technical_design", {
    key: "del.water_isolation_plan",
    section: "Technical Design Package",
    label: "Water Isolation Plan (zones/outlets affected, isolation sequence, continuity-of-supply arrangements for unaffected areas)",
    description: "SHTM 04-01 Part B/D — the forward plan for how shutdowns will be sequenced, distinct from the Permit-to-Work/Isolation Certificates in Gate 5 that evidence it was actually done.",
  });
  await appendDeliverable("template.health.domestic_hot_cold_water_replacement", "stage.technical_design", {
    key: "del.water_flushing_plan",
    section: "Technical Design Package",
    label: "Flushing Plan (daily vs periodic/scheduled flushing regime for affected outlets and dead legs, during works and pending clearance)",
    description: "SHTM 04-01 Part D, HSG274 — the regime document, distinct from the jointing/flushing/disinfection records in Gate 5 that evidence it was carried out.",
  });
  await appendDeliverable("template.health.domestic_hot_cold_water_replacement", "stage.technical_design", {
    key: "del.water_pou_filter_strategy",
    section: "Technical Design Package",
    label: "Point-of-use (POU) filter strategy for at-risk outlets pending clearance sampling",
    description: "SHTM 04-01 Part D, HSG274 — which outlets need interim POU filtration while the system stabilises after works, and the criteria for removing them once clearance sampling passes.",
  });
  await appendDeliverable("template.health.domestic_hot_cold_water_replacement", "stage.manufacturing_construction", {
    key: "del.water_pou_filter_installation_records",
    label: "Point-of-use (POU) filter installation and change-out records for outlets under temporary mitigation",
    description: "Critical interim Legionella control step per SHTM 04-01 Part D — cannot be bypassed at PM level.",
    bypassAuthority: "AUTHORISED_PERSON_WATER",
  });

  console.log("== Room or Ward Refresh ==");
  await appendDeliverable("template.health.room_ward_refresh", "stage.technical_design", {
    key: "del.wardrefresh_water_isolation_plan",
    label: "Water Isolation Plan for affected ensuite/ward outlets (isolation sequence, continuity-of-supply arrangements for unaffected areas)",
    description: "SHTM 04-01 Part B/D — required wherever ensuite or ward pipework/outlets are disturbed, e.g. ensuite upgrades.",
  });
  await appendDeliverable("template.health.room_ward_refresh", "stage.technical_design", {
    key: "del.wardrefresh_flushing_plan",
    label: "Flushing Plan for affected outlets (daily vs periodic/scheduled flushing regime during works and pending clearance)",
    description: "SHTM 04-01 Part D, HSG274 — disturbed or newly dead-legged pipework needs a defined flushing regime, not just a one-off flush.",
  });
  await appendDeliverable("template.health.room_ward_refresh", "stage.manufacturing_construction", {
    key: "del.wardrefresh_water_isolation_flushing_records",
    label: "Water isolation, flushing and disinfection records for disturbed ensuite/ward pipework",
    description: "Critical Legionella control step, per SHTM 04-01 Part D — cannot be bypassed at PM level.",
    bypassAuthority: "AUTHORISED_PERSON_WATER",
  });
  await appendDeliverable("template.health.room_ward_refresh", "stage.manufacturing_construction", {
    key: "del.wardrefresh_pou_filter_install",
    label: "Installation of point-of-use (POU) filters on affected outlets pending clearance sampling",
    description: "Critical interim Legionella control step per SHTM 04-01 Part D — cannot be bypassed at PM level.",
    bypassAuthority: "AUTHORISED_PERSON_WATER",
  });

  console.log("== Mental Health Unit Ligature & Room Refresh ==");
  await appendDeliverable("template.health.mhu_ligature_room_refresh", "stage.technical_design", {
    key: "del.mhu_water_isolation_plan",
    label: "Water Isolation Plan for affected ensuite outlets (isolation sequence, continuity-of-supply arrangements for unaffected areas)",
    description: "SHTM 04-01 Part B/D — required wherever ensuite fittings/pipework are disturbed as part of ligature works.",
  });
  await appendDeliverable("template.health.mhu_ligature_room_refresh", "stage.technical_design", {
    key: "del.mhu_flushing_plan",
    label: "Flushing Plan for affected outlets (daily vs periodic/scheduled flushing regime during works and pending clearance)",
    description: "SHTM 04-01 Part D, HSG274 — disturbed or newly dead-legged pipework needs a defined flushing regime, not just a one-off flush.",
  });
  await appendDeliverable("template.health.mhu_ligature_room_refresh", "stage.manufacturing_construction", {
    key: "del.mhu_water_isolation_flushing_records",
    label: "Water isolation, flushing and disinfection records for disturbed ensuite pipework",
    description: "Critical Legionella control step, per SHTM 04-01 Part D — cannot be bypassed at PM level.",
    bypassAuthority: "AUTHORISED_PERSON_WATER",
  });
  await appendDeliverable("template.health.mhu_ligature_room_refresh", "stage.manufacturing_construction", {
    key: "del.mhu_pou_filter_install",
    label: "Installation of point-of-use (POU) filters on affected outlets pending clearance sampling",
    description: "Critical interim Legionella control step per SHTM 04-01 Part D — cannot be bypassed at PM level.",
    bypassAuthority: "AUTHORISED_PERSON_WATER",
  });

  console.log("== Theatre Refresh ==");
  await appendDeliverable("template.health.theatre_refresh", "stage.technical_design", {
    key: "del.theatrerefresh_water_isolation_plan",
    label: "Water Isolation Plan for affected scrub sinks/theatre outlets (isolation sequence, continuity-of-supply arrangements for unaffected theatres)",
    description: "SHTM 04-01 Part B/D — required wherever scrub sink or theatre wet-service pipework/outlets are disturbed.",
  });
  await appendDeliverable("template.health.theatre_refresh", "stage.technical_design", {
    key: "del.theatrerefresh_flushing_plan",
    label: "Flushing Plan for affected scrub sink/theatre outlets (daily vs periodic/scheduled flushing regime during works and pending clearance)",
    description: "SHTM 04-01 Part D, HSG274 — augmented-care outlets need a defined flushing regime, not just a one-off flush.",
  });
  await appendDeliverable("template.health.theatre_refresh", "stage.manufacturing_construction", {
    key: "del.theatrerefresh_water_isolation_flushing_records",
    label: "Water isolation, flushing and disinfection records for disturbed scrub sink/theatre pipework",
    description: "Critical Legionella control step, per SHTM 04-01 Part D — cannot be bypassed at PM level.",
    bypassAuthority: "AUTHORISED_PERSON_WATER",
  });
  await appendDeliverable("template.health.theatre_refresh", "stage.manufacturing_construction", {
    key: "del.theatrerefresh_pou_filter_install",
    label: "Installation of point-of-use (POU) filters on affected scrub sink/theatre outlets pending clearance sampling",
    description: "Critical interim Legionella control step per SHTM 04-01 Part D — cannot be bypassed at PM level.",
    bypassAuthority: "AUTHORISED_PERSON_WATER",
  });

  console.log("== Water Treatment Plant Replacement ==");
  await appendDeliverable("template.health.water_treatment_plant_replacement", "stage.technical_design", {
    key: "del.watertreatment_isolation_plan",
    section: "Technical Design Package",
    label: "Water Isolation Plan for the treatment plant and distribution loop (isolation sequence, continuity arrangements for dialysis/pharmacy/CSSD end uses during works)",
    description: "SHTM 04-01 Part B/D.",
  });
  await appendDeliverable("template.health.water_treatment_plant_replacement", "stage.technical_design", {
    key: "del.watertreatment_flushing_plan",
    section: "Technical Design Package",
    label: "Flushing Plan for the distribution loop (daily vs periodic/scheduled flushing regime during works and pending validation)",
    description: "SHTM 04-01 Part D, HSG274, ISO 23500-3.",
  });
  await appendDeliverable("template.health.water_treatment_plant_replacement", "stage.manufacturing_construction", {
    key: "del.watertreatment_permit_to_work_isolation",
    label: "Permit-to-Work and Isolation Certificates for every plant/loop shutdown",
    bypassAuthority: "AUTHORISED_PERSON_ELECTRICAL",
  });
  await appendDeliverable("template.health.water_treatment_plant_replacement", "stage.manufacturing_construction", {
    key: "del.watertreatment_pou_filter_install",
    label: "Installation of point-of-use (POU) filters at affected dialysis/pharmacy/CSSD stations pending validation",
    description: "Critical interim Legionella/water-quality control step per SHTM 04-01 Part D, ISO 23500 — cannot be bypassed at PM level.",
    bypassAuthority: "AUTHORISED_PERSON_WATER",
  });

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
