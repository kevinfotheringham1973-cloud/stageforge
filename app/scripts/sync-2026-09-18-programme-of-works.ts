/**
 * Applies the 2026-09-18 "Programme of Works" Gate 4 deliverable
 * (seed.ts, same commit) to an EXISTING database — safe to run against an
 * already-seeded install with real project data, not just a fresh one.
 * Same idempotent-append pattern as sync-2026-09-16-water-isolation-
 * flushing.ts's appendDeliverable: skip if the deliverable key already
 * exists under that gate, otherwise create it at the end of the gate's
 * list (order = current count) rather than at seed.ts's exact array
 * position next to the Pre-Contract Hold Point — `order` only affects
 * display position/merged-project slot-pairing within a gate, never
 * anything functional.
 *
 * Unlike seed.ts (which inserted this key into 32 templates, right
 * before every "*_pre_contract_hold_point" row, so it lands next to
 * SBAR/safety-group approval for the templates that have one), this
 * script targets the same 32 templates by their real Template.key —
 * every discipline template that has a Gate 4 Pre-Contract Hold Point,
 * since "Programme of Works" is universal, not discipline-specific
 * content the way the hold point's own wording is.
 *
 * Nothing here touches an existing Project or already-instantiated
 * Gate/Deliverable row — those are frozen at instantiation time, same
 * boundary the 2026-09-16 sync already documented; only NEW projects
 * created after this runs see this checklist item.
 *
 * Usage: npx tsx scripts/sync-2026-09-18-programme-of-works.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TEMPLATE_KEYS = [
  "template.health.electrical_services_replacement",
  "template.health.domestic_hot_cold_water_replacement",
  "template.health.drainage_replacement",
  "template.health.lighting_replacement",
  "template.health.boiler_heating_plant_replacement",
  "template.health.ventilation_systems_replacement",
  "template.health.medical_gas_systems_replacement",
  "template.health.fire_alarm_detection_replacement",
  "template.health.lift_systems_replacement",
  "template.health.nurse_call_staff_paging_replacement",
  "template.health.bms_replacement",
  "template.health.chilled_water_cooling_replacement",
  "template.health.steam_systems_replacement",
  "template.health.fire_suppression_replacement",
  "template.health.security_systems_replacement",
  "template.health.pneumatic_tube_system_replacement",
  "template.health.above_ground_drainage_replacement",
  "template.health.compressed_air_systems_replacement",
  "template.health.room_ward_refresh",
  "template.health.mhu_ligature_room_refresh",
  "template.health.theatre_refresh",
  "template.health.automatic_doors_replacement",
  "template.health.fume_cupboards_replacement",
  "template.health.fire_curtains_replacement",
  "template.health.catering_kitchen_equipment_replacement",
  "template.health.laundry_linen_services_replacement",
  "template.health.waste_management_systems_replacement",
  "template.health.mortuary_services_replacement",
  "template.health.renewable_net_zero_plant",
  "template.health.building_fabric_external_envelope_replacement",
  "template.health.escalators_replacement",
  "template.health.water_treatment_plant_replacement",
];

const DELIVERABLE_KEY = "del.common_programme_of_works";
const DELIVERABLE_LABEL = "Programme of Works";
const DELIVERABLE_DESCRIPTION =
  "Contractor's detailed programme of works, submitted alongside the SBAR/safety-group submission and PFI/NHS cost approval, ahead of the Pre-Contract Hold Point.";

async function appendProgrammeOfWorks(templateKey: string) {
  const template = await db.template.findUnique({ where: { key: templateKey } });
  if (!template) {
    console.log(`  [SKIP - template not found] ${templateKey} (this install may predate this template — check manually)`);
    return;
  }
  const stageTemplate = await db.stageTemplate.findUnique({
    where: { templateId_key: { templateId: template.id, key: "stage.technical_design" } },
  });
  if (!stageTemplate) {
    console.log(`  [SKIP - stage not found] ${templateKey} / stage.technical_design`);
    return;
  }
  const gateTemplate = await db.gateTemplate.findUnique({ where: { stageTemplateId: stageTemplate.id } });
  if (!gateTemplate) {
    console.log(`  [SKIP - gate not found] ${templateKey} / stage.technical_design`);
    return;
  }
  const existing = await db.deliverableTemplate.findUnique({
    where: { gateTemplateId_key: { gateTemplateId: gateTemplate.id, key: DELIVERABLE_KEY } },
  });
  if (existing) {
    console.log(`  [skip] deliverable already present: ${templateKey}`);
    return;
  }
  const currentCount = await db.deliverableTemplate.count({ where: { gateTemplateId: gateTemplate.id } });
  await db.deliverableTemplate.create({
    data: {
      gateTemplateId: gateTemplate.id,
      order: currentCount,
      key: DELIVERABLE_KEY,
      label: DELIVERABLE_LABEL,
      description: DELIVERABLE_DESCRIPTION,
      bypassAuthority: "PM",
    },
  });
  console.log(`  [added] ${templateKey}`);
}

async function main() {
  console.log("== Programme of Works (Gate 4, all disciplines) ==");
  for (const key of TEMPLATE_KEYS) {
    await appendProgrammeOfWorks(key);
  }
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
