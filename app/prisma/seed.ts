// Seed data — the same running example used throughout the PRD, Data
// Model, Config Schema, and the design screens: Serco Health : FVRH
// Scotland delivering the UPS Systems Replacement (4 systems, 12
// units) for FVRH NHS at Forth Valley Royal Hospital. Stage/gate
// structure and deliverables follow the RIBA Plan of Work 2020,
// matching the worked example in Example_Overview_Plan.docx.
//
// Also seeds a second Template — Water Systems Replacement — purely
// as template-library content (no live project instantiated from it).
// This is what AI-assisted provisioning (ProvisioningModel.html) will
// have to choose between once it exists: a "match" against a library
// of exactly one entry proves nothing.

import { PrismaClient } from "@prisma/client";
import { matchingComplianceRuleTemplates } from "../src/lib/compliance";
import { instantiateStage } from "../src/lib/instantiation";
import { CDM_BUILDING_MODIFICATION_TAG, CDM_PRINCIPAL_DESIGNER_TAG, effectiveComplianceTags } from "../src/lib/cdm";

const db = new PrismaClient();

async function main() {
  console.log("Seeding StageForge Phase 1 dev data…");

  // ── Managed project-number counter (lib/projectNumber.ts) — starts a
  // fresh block at 30001, deliberately unrelated to the ad-hoc numbers
  // the first three demo projects below already carry (20456, 20777,
  // 55998). Seeded to 30001, not 30000: the fourth demo project below
  // is itself the real project that was issued 30001 live, so the
  // counter has to already account for that number being taken —
  // otherwise the next real project created after a reset would
  // collide with it.
  await db.projectNumberCounter.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, value: 30001 },
  });

  // ── Roles (global, Phase 1's core eight, plus three project-specific
  // gate-approver roles named in the UPS example — informational only,
  // same non-bypass standing as FM Contractor / Client Authority) ────
  const roleDefs = [
    { key: "PM", name: "Project Manager" },
    { key: "SPONSOR", name: "Project Sponsor" },
    { key: "SRO", name: "Senior Responsible Owner" },
    { key: "FM_CONTRACTOR", name: "FM Contractor" },
    { key: "CLIENT_AUTHORITY", name: "Client Authority" },
    { key: "COMPLIANCE_OFFICER", name: "Compliance Officer" },
    { key: "RESOURCE_MANAGER", name: "Resource / Portfolio Manager" },
    { key: "FINANCE", name: "Finance" },
    { key: "AUTHORISED_PERSON", name: "Authorised Person" },
    { key: "AUTHORISING_ENGINEER", name: "Authorising Engineer" },
    { key: "PRINCIPAL_DESIGNER", name: "Principal Designer" },
  ];
  const roles = Object.fromEntries(
    await Promise.all(
      roleDefs.map(async (r) => [
        r.key,
        await db.role.upsert({
          where: { key: r.key },
          update: {},
          create: r,
        }),
      ])
    )
  );

  // ── Sector ──────────────────────────────────────────────────────
  const health = await db.sectorVariant.upsert({
    where: { key: "health" },
    update: {},
    create: { key: "health", name: "Health", brandName: "StageForge" },
  });

  // ── Companies & departments ────────────────────────────────────
  const buildCare = await db.company.create({
    data: { name: "Serco Health : FVRH Scotland", type: "FM_CONTRACTOR" },
  });
  const buildCareNorth = await db.department.create({
    data: { companyId: buildCare.id, name: "North Region" },
  });
  const buildCareCompliance = await db.department.create({
    data: { companyId: buildCare.id, name: "Central Compliance" },
  });
  const buildCareFinance = await db.department.create({
    data: { companyId: buildCare.id, name: "Finance" },
  });

  const stAldwyn = await db.company.create({
    data: { name: "FVRH NHS", type: "CLIENT_AUTHORITY" },
  });
  const stAldwynEstates = await db.department.create({
    data: { companyId: stAldwyn.id, name: "Estates & Facilities" },
  });

  // ── Users ───────────────────────────────────────────────────────
  const derek = await db.user.create({
    data: {
      name: "Derek Gibb",
      email: "derek.gibb@buildcare.example",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const david = await db.user.create({
    data: {
      name: "David Mackay",
      email: "david.mackay@staldwyn.example",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const gary = await db.user.create({
    data: {
      name: "Gary Grant",
      email: "gary.grant@buildcare.example",
      homeDepartmentId: buildCareCompliance.id,
    },
  });
  const mark = await db.user.create({
    data: {
      name: "Mark O'Hear",
      email: "mark.ohear@staldwyn.example",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const alan = await db.user.create({
    data: {
      name: "Alan Petrie",
      email: "alan.petrie@buildcare.example",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const fiona = await db.user.create({
    data: {
      name: "Fiona Carswell",
      email: "fiona.carswell@independent.example",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const ross = await db.user.create({
    data: {
      name: "Ross Blair",
      email: "ross.blair@buildcare.example",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const priya = await db.user.create({
    data: {
      name: "Priya Sharma",
      email: "priya.sharma@buildcare.example",
      homeDepartmentId: buildCareFinance.id,
    },
  });

  // ── Stage/gate structure: RIBA Plan of Work 2020, fixed regardless of
  // project type (PRD.html §06 decided flag) — every Health-sector
  // Template reuses the same eight stages; only the deliverables per
  // gate vary by discipline.
  const stageDefs = [
    { key: "stage.strategic_definition", name: "Strategic Definition", gateKey: "gate.g0_strategic_definition", gateName: "Gate 0 — Strategic Definition" },
    { key: "stage.preparation_briefing", name: "Preparation & Briefing", gateKey: "gate.g1_preparation_briefing", gateName: "Gate 1 — Preparation & Briefing" },
    { key: "stage.concept_design", name: "Concept Design", gateKey: "gate.g2_concept_design", gateName: "Gate 2 — Concept Design" },
    { key: "stage.spatial_coordination", name: "Spatial Coordination", gateKey: "gate.g3_spatial_coordination", gateName: "Gate 3 — Spatial Coordination" },
    { key: "stage.technical_design", name: "Technical Design", gateKey: "gate.g4_technical_design", gateName: "Gate 4 — Technical Design" },
    { key: "stage.manufacturing_construction", name: "Manufacturing & Construction", gateKey: "gate.g5_manufacturing_construction", gateName: "Gate 5 — Manufacturing & Construction" },
    { key: "stage.handover", name: "Handover", gateKey: "gate.g6_handover", gateName: "Gate 6 — Handover" },
    { key: "stage.use", name: "Use", gateKey: "gate.g7_use", gateName: "Gate 7 — Use" },
  ];

  type DeliverableDef = {
    key: string;
    label: string;
    description?: string;
    bypassAuthority?: "PM" | "COMPLIANCE_OFFICER" | "SRO";
  };

  async function createStageAndGateTemplates(templateId: string) {
    const templates = [];
    for (let i = 0; i < stageDefs.length; i++) {
      const def = stageDefs[i]!;
      const st = await db.stageTemplate.create({
        data: { templateId, key: def.key, name: def.name, order: i },
      });
      await db.gateTemplate.create({
        data: { stageTemplateId: st.id, key: def.gateKey, name: def.gateName },
      });
      templates.push(st);
    }
    return templates;
  }

  async function createDeliverableTemplates(
    stageTemplatesForTemplate: Awaited<ReturnType<typeof createStageAndGateTemplates>>,
    deliverableDefsByStage: DeliverableDef[][]
  ) {
    for (let i = 0; i < stageTemplatesForTemplate.length; i++) {
      const gateTemplate = await db.gateTemplate.findUniqueOrThrow({
        where: { stageTemplateId: stageTemplatesForTemplate[i]!.id },
      });
      await db.deliverableTemplate.createMany({
        data: deliverableDefsByStage[i]!.map((d) => ({
          gateTemplateId: gateTemplate.id,
          key: d.key,
          label: d.label,
          description: d.description,
          bypassAuthority: d.bypassAuthority ?? "PM",
        })),
      });
    }
  }

  // ── Template library ──────────────────────────────────────────────

  // M&E Systems Replacement — the UPS Systems Replacement worked example.
  const meTemplate = await db.template.create({
    data: {
      key: "template.health.me_systems_replacement",
      name: "M&E Systems Replacement",
      description:
        "Electrical and mechanical plant replacement — UPS/battery backup systems, generators, switchgear, and associated distribution, in an operational healthcare environment.",
      matchKeywords: ["UPS", "battery backup", "electrical replacement", "generator", "switchgear", "M&E", "power resilience"],
      sectorVariantId: health.id,
    },
  });
  const meStageTemplates = await createStageAndGateTemplates(meTemplate.id);

  // Deliverable templates for every gate — the full mandatory-deliverables
  // list per RIBA stage from the UPS Systems Replacement worked example
  // (Example_Overview_Plan.docx §3). bypassAuthority reflects which items
  // carry statutory/safety weight (SRO), compliance documentation
  // (Compliance Officer), or ordinary delivery (PM).
  const meDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.strategic_brief", label: "Strategic Brief — clinical risk of existing systems and options appraisal" },
      { key: "del.high_level_risk_register", label: "High-level Risk Register — patient safety and power continuity focus" },
      { key: "del.detailed_project_plan", label: "Detailed Project Plan" },
      { key: "del.load_category_confirmation", label: "Confirmation of affected load categories against SHTM 06-01", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.outline_business_case", label: "Outline Business Case / funding confirmation" },
      { key: "del.stakeholder_map", label: "Initial Stakeholder Map" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.project_brief", label: "Project Brief — full scope, constraints, success criteria, weekend working rules" },
      { key: "del.load_survey", label: "Complete Load Survey and existing UPS Condition Report" },
      { key: "del.preliminary_programme", label: "Preliminary Programme, including concurrent weekend strategy (max 2 systems)" },
      { key: "del.hs_strategy_haiscribe", label: "Initial Health & Safety Strategy and HAI-SCRIBE assessment", description: "HAI-SCRIBE (SHFN 30) infection-risk assessment for construction/refurbishment in a healthcare setting.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.expanded_risk_register", label: "Expanded Risk Register" },
      { key: "del.detailed_project_plan_updated_briefing", label: "Updated Detailed Project Plan — full scope, methodology and resourcing" },
      { key: "del.stakeholder_engagement_plan", label: "Stakeholder Engagement Plan and early consultation records" },
      { key: "del.medical_locations_confirmation", label: "Confirmation of any Group 1 or Group 2 medical locations affected (BS 7671 Section 710)", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.concept_design_report", label: "Concept Design Report — UPS topology, redundancy level, bypass strategy, temporary power arrangements" },
      { key: "del.outline_ups_spec", label: "Outline UPS and battery specification" },
      { key: "del.preliminary_method_statements", label: "Preliminary Method Statements and high-level RAMS" },
      { key: "del.concept_single_line_diagrams", label: "Concept single-line diagrams" },
      { key: "del.updated_programme_weekend_pairs", label: "Updated Programme showing concurrent weekend pairs" },
      { key: "del.stakeholder_feedback_log", label: "Stakeholder consultation feedback log" },
      { key: "del.concept_risk_assessment", label: "Concept-level Risk Assessment" },
    ],
    // Gate 3 — Spatial Coordination (the running mid-flight example)
    [
      { key: "del.plant_room_drawings", label: "Coordinated plant room / location drawings" },
      { key: "del.cable_routing_containment", label: "Cable routing and containment proposals" },
      { key: "del.access_delivery_strategy", label: "Access, delivery and temporary works strategy" },
      { key: "del.fire_compartmentation_assessment", label: "Fire compartmentation and ventilation impact assessment", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.updated_risk_register_spatial", label: "Updated Risk Register and Method Statements reflecting spatial constraints" },
      { key: "del.detailed_project_plan_updated_spatial", label: "Updated Detailed Project Plan reflecting spatial constraints" },
      { key: "del.infrastructure_confirmation", label: "Confirmation that existing infrastructure can support the new units (structural, electrical, thermal)", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.full_technical_design_package", label: "Full Technical Design Package — detailed drawings, schematics, specifications" },
      { key: "del.design_calculations", label: "Design calculations — short-circuit, discrimination, voltage drop, battery autonomy" },
      { key: "del.ups_battery_spec_compliant", label: "Complete UPS and battery specifications compliant with BS 7671 and SHTM 06-01", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.installation_method_statements", label: "Detailed Installation Method Statements, LOTO procedures and RAMS" },
      { key: "del.compliance_matrix", label: "Compliance Matrix — mapping against BS 7671, SHTM 06-01/06-02, Electricity at Work Regulations 1989, CDM 2015", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.pre_construction_information", label: "Pre-Construction Information (CDM)" },
      { key: "del.procurement_package", label: "Tender or direct-award procurement package" },
      { key: "del.updated_programme_resource_plan", label: "Updated Programme and Resource Plan" },
      { key: "del.design_risk_assessment_signed", label: "Design Risk Assessment signed by the Designer", bypassAuthority: "SRO" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.manufacturer_drawings_fat", label: "Manufacturer drawings and Factory Acceptance Test (FAT) reports" },
      { key: "del.delivery_storage_records", label: "Delivery and secure storage records" },
      { key: "del.construction_phase_plan", label: "Approved Construction Phase Plan / Method Statements for each weekend" },
      { key: "del.permit_to_work_isolation", label: "Permit-to-Work and Isolation Certificates for every switch-out", bypassAuthority: "SRO" },
      { key: "del.progress_test_records", label: "Daily and weekend progress / test records" },
      { key: "del.temp_power_reinstatement", label: "Temporary power and reinstatement records after each weekend" },
      { key: "del.as_installed_drawings_progressive", label: "Progressive as-installed drawings" },
      { key: "del.dual_crew_loto_evidence", label: "Evidence of dual-crew supervision and full LOTO compliance for concurrent systems", bypassAuthority: "SRO" },
      { key: "del.snagging_list", label: "Snagging list and resolution tracker" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.eic_certificates", label: "Electrical Installation Certificate(s) (EIC) issued under BS 7671", bypassAuthority: "SRO" },
      { key: "del.commissioning_validation_reports", label: "Full Commissioning and Validation Reports — load-bank tests, transfer tests, autonomy, alarms, BMS integration" },
      { key: "del.as_built_drawings", label: "As-built drawings and single-line diagrams" },
      { key: "del.om_manuals", label: "Complete Operation & Maintenance (O&M) Manuals, including configuration files and recommended spares" },
      { key: "del.battery_disposal_records", label: "Battery installation and compliant disposal records (WEEE)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.training_records", label: "Training records for Estates and relevant clinical staff" },
      { key: "del.final_risk_assessment_closed", label: "Final Risk Assessment and closed-out RAMS" },
      { key: "del.asset_data_cafm", label: "Asset data uploaded to CAFM / asset register" },
      { key: "del.acceptance_to_service_certificate", label: 'Formal "Acceptance to Service" certificate signed by NHS Forth Valley', bypassAuthority: "SRO" },
      { key: "del.defects_liability_schedule", label: "Defects Liability Schedule" },
    ],
    // Gate 7 — Use
    [
      { key: "del.defects_monitoring_reports", label: "Defects Liability monitoring reports" },
      { key: "del.lessons_learned_report", label: "Final Lessons Learned report" },
      { key: "del.updated_ppm_schedules", label: "Updated Planned Preventative Maintenance (PPM) schedules" },
      { key: "del.end_of_defects_certificate", label: "End-of-Defects Certificate (if applicable)" },
    ],
  ];

  await createDeliverableTemplates(meStageTemplates, meDeliverableDefsByStage);

  // Calorifier & Hot Water System Replacement — calorifiers and HOT
  // water storage/distribution plant specifically, not general "water
  // systems": drainage/foul water and cold water storage are both
  // genuinely different disciplines and got their own Templates below,
  // after live projects were wrongly matched here — a drainage project
  // on an over-broad "water system"/"plumbing" keyword match, and then
  // a cold-water-tank project on this template's description still
  // over-claiming "hot/cold water storage" even after the drainage fix
  // (both confirmed by Kevin, 19 Aug 2026). Grounded in Complaince and
  // Regulations.docx and Maintenance schedule - SHTM.docx (SHTM 04-01,
  // Legionella/water safety).
  const waterTemplate = await db.template.create({
    data: {
      key: "template.health.calorifier_replacement",
      name: "Calorifier & Hot Water System Replacement",
      description:
        "Calorifier and hot water storage/distribution plant replacement — Legionella/water-safety-led, in an operational healthcare environment. Not cold water storage (see Cold Water Storage & Distribution Replacement) and not drainage/foul water (see Drainage & Foul Water System Replacement).",
      matchKeywords: ["calorifier", "hot water storage", "hot water cylinder", "Legionella", "hot water", "water safety", "water heater"],
      sectorVariantId: health.id,
    },
  });
  const waterStageTemplates = await createStageAndGateTemplates(waterTemplate.id);

  const waterDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.water_strategic_brief", label: "Strategic Brief — water safety risk of existing calorifiers/pipework and options appraisal" },
      { key: "del.water_high_level_risk_register", label: "High-level Risk Register — water safety and supply continuity focus" },
      { key: "del.water_detailed_project_plan", label: "Detailed Project Plan" },
      { key: "del.water_safety_zone_confirmation", label: "Confirmation of affected water safety zones against SHTM 04-01", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_outline_business_case", label: "Outline Business Case / funding confirmation" },
      { key: "del.water_stakeholder_map", label: "Initial Stakeholder Map, including the Water Safety Group" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.water_project_brief", label: "Project Brief — full scope, constraints, success criteria, phased shutdown rules" },
      { key: "del.water_hygiene_survey", label: "Complete water hygiene survey and existing system condition report" },
      { key: "del.water_preliminary_programme", label: "Preliminary Programme, including phased zone-by-zone shutdown strategy" },
      { key: "del.water_hs_haiscribe", label: "Initial Health & Safety Strategy and HAI-SCRIBE assessment", description: "HAI-SCRIBE (SHFN 30) infection-risk assessment for construction/refurbishment in a healthcare setting.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_expanded_risk_register", label: "Expanded Risk Register" },
      { key: "del.water_detailed_project_plan_updated_briefing", label: "Updated Detailed Project Plan — full scope, methodology and resourcing" },
      { key: "del.water_stakeholder_engagement_plan", label: "Stakeholder Engagement Plan and early consultation records" },
      { key: "del.water_augmented_care_confirmation", label: "Confirmation of augmented/high-risk care areas affected (SHTM 04-01 Part A risk categories)", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.water_concept_design_report", label: "Concept Design Report — system topology, redundancy, temporary water supply strategy" },
      { key: "del.water_outline_plant_spec", label: "Outline calorifier and plant specification" },
      { key: "del.water_preliminary_method_statements", label: "Preliminary Method Statements and high-level RAMS" },
      { key: "del.water_concept_schematics", label: "Concept distribution schematics" },
      { key: "del.water_updated_programme_shutdowns", label: "Updated Programme showing phased shutdowns" },
      { key: "del.water_stakeholder_feedback_log", label: "Stakeholder consultation feedback log" },
      { key: "del.water_concept_risk_assessment", label: "Concept-level Risk Assessment" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.water_plant_room_riser_drawings", label: "Coordinated plant room / riser drawings" },
      { key: "del.water_pipework_routing", label: "Pipework routing and containment proposals" },
      { key: "del.water_access_delivery_strategy", label: "Access, delivery and temporary works strategy" },
      { key: "del.water_fire_structural_assessment", label: "Fire compartmentation and structural impact assessment for pipework penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.water_updated_risk_register_spatial", label: "Updated Risk Register and Method Statements reflecting spatial constraints" },
      { key: "del.water_detailed_project_plan_updated_spatial", label: "Updated Detailed Project Plan reflecting spatial constraints" },
      { key: "del.water_infrastructure_confirmation", label: "Confirmation that existing plant room infrastructure can support the new units (structural, thermal, electrical supply)", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.water_full_technical_design_package", label: "Full Technical Design Package — detailed drawings, schematics, specifications" },
      { key: "del.water_design_calculations", label: "Design calculations — flow rates, storage capacity, thermal balance, pump duty" },
      { key: "del.water_plant_spec_compliant", label: "Complete calorifier/plant and pipework specifications compliant with SHTM 04-01 and the Water Supply (Water Fittings) (Scotland) Byelaws 2014", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_installation_method_statements", label: "Detailed Installation Method Statements, permit procedures and RAMS" },
      { key: "del.water_compliance_matrix", label: "Compliance Matrix — mapping against SHTM 04-01, Water Byelaws, HSE ACOP L8, CDM 2015", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_pre_construction_information", label: "Pre-Construction Information (CDM)" },
      { key: "del.water_procurement_package", label: "Tender or direct-award procurement package" },
      { key: "del.water_updated_programme_resource_plan", label: "Updated Programme and Resource Plan" },
      { key: "del.water_design_risk_assessment_signed", label: "Design Risk Assessment signed by the Designer", bypassAuthority: "SRO" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.water_manufacturer_drawings_fat", label: "Manufacturer drawings and Factory Acceptance Test (FAT) reports" },
      { key: "del.water_delivery_storage_records", label: "Delivery and secure storage records" },
      { key: "del.water_construction_phase_plan", label: "Approved Construction Phase Plan / Method Statements for each shutdown" },
      { key: "del.water_permit_to_work_isolation", label: "Permit-to-Work and Isolation Certificates for every zone shutdown", bypassAuthority: "SRO" },
      { key: "del.water_progress_test_records", label: "Daily and shutdown progress / test records" },
      { key: "del.water_temp_supply_reinstatement", label: "Temporary water supply and reinstatement records after each shutdown" },
      { key: "del.water_as_installed_drawings_progressive", label: "Progressive as-installed drawings" },
      { key: "del.water_disinfection_evidence", label: "Evidence of disinfection/chlorination of new pipework before reconnection", description: "Critical Legionella control step — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.water_snagging_list", label: "Snagging list and resolution tracker" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.water_hygiene_commissioning_cert", label: "Water hygiene commissioning certificate — disinfection, flushing, and sampling results", bypassAuthority: "SRO" },
      { key: "del.water_commissioning_validation_reports", label: "Full Commissioning and Validation Reports — flow/temperature tests, TMV commissioning" },
      { key: "del.water_as_built_drawings", label: "As-built drawings and distribution schematics" },
      { key: "del.water_om_manuals", label: "Complete Operation & Maintenance (O&M) Manuals, including configuration files and recommended spares" },
      { key: "del.water_legionella_risk_assessment_updated", label: "Legionella risk assessment updated and water safety plan reissued", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_training_records", label: "Training records for Estates and relevant clinical staff" },
      { key: "del.water_final_risk_assessment_closed", label: "Final Risk Assessment and closed-out RAMS" },
      { key: "del.water_asset_data_cafm", label: "Asset data uploaded to CAFM / asset register" },
      { key: "del.water_acceptance_to_service_certificate", label: 'Formal "Acceptance to Service" certificate signed by the Client Authority', bypassAuthority: "SRO" },
      { key: "del.water_defects_liability_schedule", label: "Defects Liability Schedule" },
    ],
    // Gate 7 — Use
    [
      { key: "del.water_defects_monitoring_reports", label: "Defects Liability monitoring reports" },
      { key: "del.water_lessons_learned_report", label: "Final Lessons Learned report" },
      { key: "del.water_updated_ppm_schedules", label: "Updated Planned Preventative Maintenance (PPM) schedules" },
      { key: "del.water_end_of_defects_certificate", label: "End-of-Defects Certificate (if applicable)" },
    ],
  ];
  await createDeliverableTemplates(waterStageTemplates, waterDeliverableDefsByStage);

  // Drainage & Foul Water System Replacement — below-ground/foul
  // drainage, soil and waste pipework: flow paths, falls, and venting,
  // not water safety/Legionella (that's the Calorifier template above).
  // Added after a live "Main Kitchen drainage replacement" project got
  // wrongly matched to the calorifier template for lack of anywhere
  // better to go (confirmed by Kevin, 19 Aug 2026). Grounded in BS EN
  // 12056 (gravity drainage systems inside buildings), the Building
  // (Scotland) Regulations 2004 Technical Handbook Section 3
  // (Environment — drainage), SHTM 64 (Sanitary Assemblies), and —
  // where the drainage serves a kitchen/food-service area — trade
  // effluent consent under the Water Environment (Controlled
  // Activities) (Scotland) Regulations 2011.
  const drainageTemplate = await db.template.create({
    data: {
      key: "template.health.drainage_replacement",
      name: "Drainage & Foul Water System Replacement",
      description:
        "Below-ground and foul drainage replacement — soil/waste pipework, gullies, manholes, and flow-path/fall reconfiguration, in an operational healthcare environment. Not water storage/supply — see Calorifier & Hot Water System Replacement for that.",
      matchKeywords: ["drainage", "foul water", "foul drainage", "soil pipe", "waste pipe", "gully", "manhole", "flow path", "below ground drainage", "grease trap", "kitchen drainage"],
      sectorVariantId: health.id,
    },
  });
  const drainageStageTemplates = await createStageAndGateTemplates(drainageTemplate.id);

  const drainageDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.drainage_strategic_brief", label: "Strategic Brief — condition of existing drainage/foul water system and options appraisal" },
      { key: "del.drainage_high_level_risk_register", label: "High-level Risk Register — kitchen/service continuity and cross-contamination focus" },
      { key: "del.drainage_detailed_project_plan", label: "Detailed Project Plan" },
      { key: "del.drainage_flow_path_confirmation", label: "Confirmation of affected drainage zones and flow paths against BS EN 12056", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.drainage_outline_business_case", label: "Outline Business Case / funding confirmation" },
      { key: "del.drainage_stakeholder_map", label: "Initial Stakeholder Map, including Catering/Facilities and Estates" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.drainage_project_brief", label: "Project Brief — full scope, constraints, success criteria, kitchen/service closure rules" },
      { key: "del.drainage_cctv_survey", label: "Complete drainage survey and CCTV condition report of existing below-ground pipework" },
      { key: "del.drainage_preliminary_programme", label: "Preliminary Programme, including phased zone shutdown strategy" },
      { key: "del.drainage_hs_haiscribe", label: "Initial Health & Safety Strategy and HAI-SCRIBE assessment", description: "HAI-SCRIBE (SHFN 30) infection-risk assessment for construction/refurbishment in a healthcare setting.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.drainage_expanded_risk_register", label: "Expanded Risk Register" },
      { key: "del.drainage_detailed_project_plan_updated_briefing", label: "Updated Detailed Project Plan — full scope, methodology and resourcing" },
      { key: "del.drainage_stakeholder_engagement_plan", label: "Stakeholder Engagement Plan and early consultation records" },
      { key: "del.drainage_trade_effluent_confirmation", label: "Confirmation of trade effluent / grease-management requirements with Scottish Water", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.drainage_concept_design_report", label: "Concept Design Report — flow-path layout, fall gradients, venting strategy, temporary drainage arrangements" },
      { key: "del.drainage_outline_pipework_spec", label: "Outline pipework, gully and manhole specification" },
      { key: "del.drainage_preliminary_method_statements", label: "Preliminary Method Statements and high-level RAMS" },
      { key: "del.drainage_concept_invert_drawings", label: "Concept drainage schematics and invert-level drawings" },
      { key: "del.drainage_updated_programme_shutdowns", label: "Updated Programme showing phased zone shutdowns" },
      { key: "del.drainage_stakeholder_feedback_log", label: "Stakeholder consultation feedback log" },
      { key: "del.drainage_concept_risk_assessment", label: "Concept-level Risk Assessment" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.drainage_invert_level_drawings", label: "Coordinated below-ground drainage / invert-level drawings" },
      { key: "del.drainage_pipework_routing_falls", label: "Pipework routing, falls and containment proposals" },
      { key: "del.drainage_access_delivery_strategy", label: "Access, delivery and temporary works strategy for excavation/below-slab works" },
      { key: "del.drainage_fire_structural_assessment", label: "Fire compartmentation and structural impact assessment for below-slab penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.drainage_updated_risk_register_spatial", label: "Updated Risk Register and Method Statements reflecting spatial constraints" },
      { key: "del.drainage_detailed_project_plan_updated_spatial", label: "Updated Detailed Project Plan reflecting spatial constraints" },
      { key: "del.drainage_structure_confirmation", label: "Confirmation that existing structure/foundations can accommodate new drainage runs", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.drainage_full_technical_design_package", label: "Full Technical Design Package — detailed drawings, invert levels, specifications" },
      { key: "del.drainage_design_calculations", label: "Design calculations — flow rates, pipe sizing and falls to BS EN 12056" },
      { key: "del.drainage_pipework_spec_compliant", label: "Complete pipework and fittings specification compliant with SHTM 64 and the Building (Scotland) Regulations Section 3 (Environment)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.drainage_installation_method_statements", label: "Detailed Installation Method Statements, confined-space/excavation permit procedures and RAMS" },
      { key: "del.drainage_compliance_matrix", label: "Compliance Matrix — mapping against BS EN 12056, SHTM 64, Building (Scotland) Regulations, Water Environment (Controlled Activities) (Scotland) Regulations 2011, CDM 2015", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.drainage_pre_construction_information", label: "Pre-Construction Information (CDM)" },
      { key: "del.drainage_procurement_package", label: "Tender or direct-award procurement package" },
      { key: "del.drainage_updated_programme_resource_plan", label: "Updated Programme and Resource Plan" },
      { key: "del.drainage_design_risk_assessment_signed", label: "Design Risk Assessment signed by the Designer", bypassAuthority: "SRO" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.drainage_manufacturer_drawings_cert", label: "Manufacturer drawings and product certification for pipework and fittings" },
      { key: "del.drainage_delivery_storage_records", label: "Delivery and secure storage records" },
      { key: "del.drainage_construction_phase_plan", label: "Approved Construction Phase Plan / Method Statements for each shutdown" },
      { key: "del.drainage_permit_confined_space", label: "Permit-to-Work and confined-space entry certificates for below-ground works", bypassAuthority: "SRO" },
      { key: "del.drainage_progress_test_records", label: "Daily and shutdown progress / test records" },
      { key: "del.drainage_temp_arrangements_reinstatement", label: "Temporary catering/waste arrangements and reinstatement records after each shutdown" },
      { key: "del.drainage_as_installed_drawings_progressive", label: "Progressive as-installed drawings" },
      { key: "del.drainage_drain_test_cctv_evidence", label: "Evidence of drain testing (air/water test) and CCTV verification before backfill", description: "Critical verification step before below-ground pipework is covered — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.drainage_snagging_list", label: "Snagging list and resolution tracker" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.drainage_test_cctv_certificate", label: "Drain testing and CCTV survey certificate confirming compliant flow and no defects", bypassAuthority: "SRO" },
      { key: "del.drainage_commissioning_validation_reports", label: "Full Commissioning and Validation Reports — flow tests, fall verification, trap-seal checks" },
      { key: "del.drainage_as_built_drawings", label: "As-built drawings and invert-level schedules" },
      { key: "del.drainage_om_manuals", label: "Complete Operation & Maintenance (O&M) Manuals, including rodding-point/access schedules" },
      { key: "del.drainage_trade_effluent_handover", label: "Trade effluent consent finalised and grease-management regime handed to Catering/Facilities", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.drainage_training_records", label: "Training records for Estates and Catering staff" },
      { key: "del.drainage_final_risk_assessment_closed", label: "Final Risk Assessment and closed-out RAMS" },
      { key: "del.drainage_asset_data_cafm", label: "Asset data uploaded to CAFM / asset register" },
      { key: "del.drainage_acceptance_to_service_certificate", label: 'Formal "Acceptance to Service" certificate signed by the Client Authority', bypassAuthority: "SRO" },
      { key: "del.drainage_defects_liability_schedule", label: "Defects Liability Schedule" },
    ],
    // Gate 7 — Use
    [
      { key: "del.drainage_defects_monitoring_reports", label: "Defects Liability monitoring reports" },
      { key: "del.drainage_lessons_learned_report", label: "Final Lessons Learned report" },
      { key: "del.drainage_updated_ppm_schedules", label: "Updated Planned Preventative Maintenance (PPM) schedules, including drain-rodding regime" },
      { key: "del.drainage_end_of_defects_certificate", label: "End-of-Defects Certificate (if applicable)" },
    ],
  ];
  await createDeliverableTemplates(drainageStageTemplates, drainageDeliverableDefsByStage);

  // Cold Water Storage & Distribution Replacement — inlet mains, break/
  // storage tanks, filtration, and cold water distribution pipework:
  // tank inspection/cleaning and supply continuity, not the calorifier
  // template's hot-water/Legionella-at-temperature focus. Added after a
  // live "Main water tank replacement" project (2 inlet + 2 filtered
  // storage tanks) got wrongly matched to the calorifier template —
  // its description still said "hot/cold water storage" even after the
  // drainage-template fix narrowed its keywords (confirmed by Kevin,
  // 19 Aug 2026). Grounded in SHTM 04-01 Part B (water storage tank
  // operational management), BS 8558 (cold water services), and the
  // Water Supply (Water Fittings) (Scotland) Byelaws 2014 (WRAS-
  // approved fittings).
  const coldWaterTemplate = await db.template.create({
    data: {
      key: "template.health.cold_water_storage_replacement",
      name: "Cold Water Storage & Distribution Replacement",
      description:
        "Cold water storage and distribution replacement — inlet mains, break/storage tanks, filtration plant, and cold water distribution pipework, in an operational healthcare environment. Not hot water/calorifiers — see Calorifier & Hot Water System Replacement for that.",
      matchKeywords: ["cold water tank", "water storage tank", "inlet main", "water filtration", "cold water storage", "break tank", "cistern", "cold water main", "water inlet"],
      sectorVariantId: health.id,
    },
  });
  const coldWaterStageTemplates = await createStageAndGateTemplates(coldWaterTemplate.id);

  const coldWaterDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.coldwater_strategic_brief", label: "Strategic Brief — condition of existing inlet mains/storage tanks and options appraisal" },
      { key: "del.coldwater_high_level_risk_register", label: "High-level Risk Register — water supply continuity and cross-contamination focus" },
      { key: "del.coldwater_detailed_project_plan", label: "Detailed Project Plan" },
      { key: "del.coldwater_zone_confirmation", label: "Confirmation of affected water storage/distribution zones against SHTM 04-01 Part B", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.coldwater_outline_business_case", label: "Outline Business Case / funding confirmation" },
      { key: "del.coldwater_stakeholder_map", label: "Initial Stakeholder Map, including the Water Safety Group" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.coldwater_project_brief", label: "Project Brief — full scope, constraints, success criteria, phased shutdown rules" },
      { key: "del.coldwater_hygiene_survey", label: "Complete water hygiene survey and existing tank/main condition report" },
      { key: "del.coldwater_preliminary_programme", label: "Preliminary Programme, including phased zone-by-zone shutdown strategy" },
      { key: "del.coldwater_hs_haiscribe", label: "Initial Health & Safety Strategy and HAI-SCRIBE assessment", description: "HAI-SCRIBE (SHFN 30) infection-risk assessment for construction/refurbishment in a healthcare setting.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.coldwater_expanded_risk_register", label: "Expanded Risk Register" },
      { key: "del.coldwater_detailed_project_plan_updated_briefing", label: "Updated Detailed Project Plan — full scope, methodology and resourcing" },
      { key: "del.coldwater_stakeholder_engagement_plan", label: "Stakeholder Engagement Plan and early consultation records" },
      { key: "del.coldwater_continuity_confirmation", label: "Confirmation of continuity-of-supply arrangements during tank isolation", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.coldwater_concept_design_report", label: "Concept Design Report — tank/main topology, redundancy, temporary water supply strategy" },
      { key: "del.coldwater_outline_plant_spec", label: "Outline storage tank and filtration plant specification" },
      { key: "del.coldwater_preliminary_method_statements", label: "Preliminary Method Statements and high-level RAMS" },
      { key: "del.coldwater_concept_schematics", label: "Concept distribution schematics" },
      { key: "del.coldwater_updated_programme_shutdowns", label: "Updated Programme showing phased shutdowns" },
      { key: "del.coldwater_stakeholder_feedback_log", label: "Stakeholder consultation feedback log" },
      { key: "del.coldwater_concept_risk_assessment", label: "Concept-level Risk Assessment" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.coldwater_plant_room_drawings", label: "Coordinated plant room / tank room drawings" },
      { key: "del.coldwater_pipework_routing", label: "Inlet main and distribution pipework routing proposals" },
      { key: "del.coldwater_access_delivery_strategy", label: "Access, delivery and temporary works strategy" },
      { key: "del.coldwater_fire_structural_assessment", label: "Fire compartmentation and structural impact assessment for tank room penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.coldwater_updated_risk_register_spatial", label: "Updated Risk Register and Method Statements reflecting spatial constraints" },
      { key: "del.coldwater_detailed_project_plan_updated_spatial", label: "Updated Detailed Project Plan reflecting spatial constraints" },
      { key: "del.coldwater_structure_confirmation", label: "Confirmation that existing plant room/structure can support the new tanks (structural loading, access)", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.coldwater_full_technical_design_package", label: "Full Technical Design Package — detailed drawings, schematics, specifications" },
      { key: "del.coldwater_design_calculations", label: "Design calculations — storage capacity, demand profile, filtration duty, pump/booster duty" },
      { key: "del.coldwater_plant_spec_compliant", label: "Complete storage tank, filtration and pipework specification compliant with SHTM 04-01 Part B, BS 8558 and the Water Supply (Water Fittings) (Scotland) Byelaws 2014", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.coldwater_installation_method_statements", label: "Detailed Installation Method Statements and RAMS" },
      { key: "del.coldwater_compliance_matrix", label: "Compliance Matrix — mapping against SHTM 04-01, BS 8558, Water Byelaws, HSE ACOP L8, CDM 2015", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.coldwater_pre_construction_information", label: "Pre-Construction Information (CDM)" },
      { key: "del.coldwater_procurement_package", label: "Tender or direct-award procurement package" },
      { key: "del.coldwater_updated_programme_resource_plan", label: "Updated Programme and Resource Plan" },
      { key: "del.coldwater_design_risk_assessment_signed", label: "Design Risk Assessment signed by the Designer", bypassAuthority: "SRO" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.coldwater_manufacturer_drawings_cert", label: "Manufacturer drawings and product certification (WRAS-approved fittings) for tanks/filtration plant" },
      { key: "del.coldwater_delivery_storage_records", label: "Delivery and secure storage records" },
      { key: "del.coldwater_construction_phase_plan", label: "Approved Construction Phase Plan / Method Statements for each shutdown" },
      { key: "del.coldwater_permit_to_work_isolation", label: "Permit-to-Work and isolation certificates for every main/tank shutdown", bypassAuthority: "SRO" },
      { key: "del.coldwater_progress_test_records", label: "Daily and shutdown progress / test records" },
      { key: "del.coldwater_temp_supply_reinstatement", label: "Temporary water supply and reinstatement records after each shutdown" },
      { key: "del.coldwater_as_installed_drawings_progressive", label: "Progressive as-installed drawings" },
      { key: "del.coldwater_disinfection_evidence", label: "Evidence of disinfection/chlorination and sampling of new tanks/mains before reconnection", description: "Critical Legionella control step — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.coldwater_snagging_list", label: "Snagging list and resolution tracker" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.coldwater_hygiene_commissioning_cert", label: "Water hygiene commissioning certificate — disinfection, flushing, and sampling results", bypassAuthority: "SRO" },
      { key: "del.coldwater_commissioning_validation_reports", label: "Full Commissioning and Validation Reports — flow/pressure tests, filtration performance" },
      { key: "del.coldwater_as_built_drawings", label: "As-built drawings and distribution schematics" },
      { key: "del.coldwater_om_manuals", label: "Complete Operation & Maintenance (O&M) Manuals, including tank inspection/cleaning schedule" },
      { key: "del.coldwater_legionella_risk_assessment_updated", label: "Legionella risk assessment updated and water safety plan reissued", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.coldwater_training_records", label: "Training records for Estates staff" },
      { key: "del.coldwater_final_risk_assessment_closed", label: "Final Risk Assessment and closed-out RAMS" },
      { key: "del.coldwater_asset_data_cafm", label: "Asset data uploaded to CAFM / asset register" },
      { key: "del.coldwater_acceptance_to_service_certificate", label: 'Formal "Acceptance to Service" certificate signed by the Client Authority', bypassAuthority: "SRO" },
      { key: "del.coldwater_defects_liability_schedule", label: "Defects Liability Schedule" },
    ],
    // Gate 7 — Use
    [
      { key: "del.coldwater_defects_monitoring_reports", label: "Defects Liability monitoring reports" },
      { key: "del.coldwater_lessons_learned_report", label: "Final Lessons Learned report" },
      { key: "del.coldwater_updated_ppm_schedules", label: "Updated Planned Preventative Maintenance (PPM) schedules, including tank inspection/cleaning regime" },
      { key: "del.coldwater_end_of_defects_certificate", label: "End-of-Defects Certificate (if applicable)" },
    ],
  ];
  await createDeliverableTemplates(coldWaterStageTemplates, coldWaterDeliverableDefsByStage);

  // ── Compliance corpus: independently maintained, reused across every
  // programme type (ConfigSchema.html §04) — not authored per project.
  // Grounded in Complaince and Regulations.docx. Deliberately distinct
  // content from the delivery deliverables above, to keep the two
  // libraries genuinely separate rather than the same facts duplicated
  // under two engines. Not yet instantiated onto any live Gate — that
  // "merge at Stage instantiation" step (ConfigSchema.html §05) is the
  // next layer to build, once this corpus shape is proven.
  const scottishHealthCompliance = await db.complianceRuleSet.create({
    data: {
      key: "compliance.health.scotland_core",
      name: "Scottish NHS Hard FM — Core Compliance",
      sectorVariantId: health.id,
    },
  });
  await db.complianceRuleTemplate.createMany({
    data: [
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.building_warrant",
        label: "Building Warrant obtained from local Verifier before work starts",
        description: "Covers structure, fire, and energy — required before any notifiable work commences.",
        ruleRef: "Building (Scotland) Act 2003 / Building (Scotland) Regulations 2004",
        blocksGate: true,
        appliesToStageKeys: ["stage.technical_design"],
        appliesIfTags: [],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.fire_risk_assessment",
        label: "Fire risk assessment current and on file",
        description: "Required wherever works affect a compartment boundary, means of escape, or run in an occupied care environment.",
        ruleRef: "Fire (Scotland) Act 2005 / Ministerial Working Group guidance on combustibles",
        blocksGate: true,
        appliesToStageKeys: ["stage.spatial_coordination", "stage.manufacturing_construction"],
        appliesIfTags: ["occupied_during_works"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.haiscribe_review",
        label: "HAI-SCRIBE risk assessment reviewed for infection-control impact",
        description: "Healthcare Associated Infection System for Controlling Risk in the Built Environment — mitigates HAI risk from construction/refurbishment/maintenance activity.",
        ruleRef: "SHFN 30 / Healthcare Improvement Scotland",
        blocksGate: true,
        appliesToStageKeys: ["stage.spatial_coordination"],
        appliesIfTags: [],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.nhs_scotland_assure_sbar",
        label: "SBAR forms submitted to NHS Scotland Assure",
        description: "Mandatory design/construction review for National Treatment Centres — one SBAR form per relevant primary group (e.g. Water Safety, Ventilation, Infection Control).",
        ruleRef: "NHS Scotland Assure",
        blocksGate: true,
        appliesToStageKeys: ["stage.concept_design"],
        appliesIfTags: ["national_treatment_centre"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.legionella_water_safety",
        label: "Legionella risk assessment and water safety plan reviewed",
        description: "Required wherever works affect water storage, distribution, or temperature control — sentinel outlet monitoring and disinfection records must be current.",
        ruleRef: "SHTM 04-01 / HSE ACOP L8 / Water Supply (Water Fittings) (Scotland) Byelaws 2014",
        blocksGate: true,
        appliesToStageKeys: ["stage.spatial_coordination", "stage.manufacturing_construction"],
        appliesIfTags: ["water_systems_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.drainage_flow_design",
        label: "Drainage flow-path and fall design confirmed compliant",
        description: "Pipe sizing, falls, and venting for below-ground/foul drainage — a distinct discipline from water storage/safety, so tracked separately from the Legionella rule above.",
        ruleRef: "BS EN 12056 (Gravity drainage systems inside buildings) / Building (Scotland) Regulations 2004, Technical Handbook Section 3 (Environment)",
        blocksGate: true,
        appliesToStageKeys: ["stage.technical_design"],
        appliesIfTags: ["drainage_systems_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.trade_effluent_consent",
        label: "Trade effluent consent confirmed for kitchen/food-service drainage",
        description: "Fats, oils and grease from a kitchen discharging to foul drainage require a trade effluent consent, not just a building-standards drainage design.",
        ruleRef: "Water Environment (Controlled Activities) (Scotland) Regulations 2011 (CAR) / Scottish Water trade effluent consent",
        blocksGate: true,
        appliesToStageKeys: ["stage.preparation_briefing"],
        appliesIfTags: ["kitchen_drainage"],
      },
      // CDM 2015 duties triggered by the Project.worksType statutory
      // question (lib/cdm.ts), not free text. Two separate tags because
      // the two duties have different triggers: Principal Designer on
      // "more than one contractor" (so it also applies to
      // DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS, not just building
      // modification); planning permission only on an actual building
      // fabric change.
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.cdm_principal_designer_appointed",
        label: "Principal Designer appointed under CDM 2015",
        description: "Required as soon as practicable, and before design work begins, whenever more than one contractor is or will be working on the project.",
        ruleRef: "Construction (Design and Management) Regulations 2015, reg 5(1)",
        blocksGate: true,
        appliesToStageKeys: ["stage.preparation_briefing"],
        appliesIfTags: [CDM_PRINCIPAL_DESIGNER_TAG],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.planning_permission_confirmed",
        label: "Planning permission position confirmed (obtained, or confirmed not required)",
        description: "Structural, layout, or fabric changes may be notifiable development — the planning position must be confirmed before technical design proceeds.",
        ruleRef: "Town and Country Planning (Scotland) Act 1997",
        blocksGate: true,
        appliesToStageKeys: ["stage.concept_design"],
        appliesIfTags: [CDM_BUILDING_MODIFICATION_TAG],
      },
    ],
  });

  // ── Project: UPS Systems Replacement, excluding Gate 7 (Use) ─────
  const project = await db.project.create({
    data: {
      projectNumber: "20456",
      name: "UPS Systems Replacement – 4 Main Systems (12 units)",
      templateId: meTemplate.id,
      includedStageKeys: stageDefs.slice(0, 7).map((s) => s.key), // all but use
      // Forth Valley Royal Hospital is a live acute site, works run
      // alongside continuous clinical use — not a National Treatment
      // Centre, so the NHS Scotland Assure SBAR rule above deliberately
      // does not match this project (proves tag exclusion, not just
      // inclusion).
      tags: ["acute_hospital", "occupied_during_works"],
      // Like-for-like UPS/battery swap in the existing plant rooms — no
      // structural or fabric change, so planning permission never
      // arises. But 4 systems across 12 units needs both an M&E
      // contractor and a specialist battery-disposal contractor on
      // site, so a Principal Designer IS required — the live
      // demonstration that CDM's Principal Designer duty and "modifies
      // the building" are genuinely different triggers (see
      // CdmWorksType in schema.prisma). The water/drainage projects
      // below demonstrate the full BUILDING_MODIFICATION case instead.
      worksType: "DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS",
    },
  });

  await db.projectRoleAssignment.createMany({
    data: [
      { projectId: project.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.PM.id },
      { projectId: project.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.FM_CONTRACTOR.id },
      { projectId: project.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.SPONSOR.id },
      { projectId: project.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.CLIENT_AUTHORITY.id },
      { projectId: project.id, departmentId: buildCareCompliance.id, userId: gary.id, roleId: roles.COMPLIANCE_OFFICER.id },
      { projectId: project.id, departmentId: stAldwynEstates.id, userId: mark.id, roleId: roles.SRO.id },
      { projectId: project.id, departmentId: buildCareNorth.id, userId: alan.id, roleId: roles.AUTHORISED_PERSON.id },
      { projectId: project.id, departmentId: stAldwynEstates.id, userId: fiona.id, roleId: roles.AUTHORISING_ENGINEER.id },
      { projectId: project.id, departmentId: buildCareNorth.id, userId: ross.id, roleId: roles.PRINCIPAL_DESIGNER.id },
      { projectId: project.id, departmentId: buildCareFinance.id, userId: priya.id, roleId: roles.FINANCE.id },
    ],
  });

  // Instantiate stages 0–6 (Gate 7 / Use is excluded — simply never
  // instantiated, per ConfigSchema.html §03).
  for (let i = 0; i < 7; i++) {
    const def = stageDefs[i]!;
    const st = meStageTemplates[i]!;
    const stage = await db.stage.create({
      data: {
        projectId: project.id,
        sourceStageTemplateId: st.id,
        key: def.key,
        name: def.name,
        order: i,
      },
    });

    let gate;
    if (i === 0 || i === 1 || i === 2) {
      // Gates 0, 1 and 2: signed off — strategic case, briefing, and
      // concept design approved (the doc's "key go/no-go point").
      gate = await db.gate.create({
        data: { stageId: stage.id, key: def.gateKey, name: def.gateName, status: "SIGNED_OFF" },
      });
      await db.gateSignOff.create({
        data: { gateId: gate.id, decision: "APPROVED", signedOffById: david.id },
      });
    } else if (i === 3) {
      // Gate 3 — Spatial Coordination: in progress, the running
      // example from every other doc.
      gate = await db.gate.create({
        data: { stageId: stage.id, key: def.gateKey, name: def.gateName, status: "IN_PROGRESS" },
      });

      const evidenced: { key: string; label: string; fileName: string }[] = [
        { key: "del.plant_room_drawings", label: "Coordinated plant room / location drawings", fileName: "plant-room-layout-v2.pdf" },
        { key: "del.cable_routing_containment", label: "Cable routing and containment proposals", fileName: "cable-routing-containment-plan.pdf" },
        { key: "del.access_delivery_strategy", label: "Access, delivery and temporary works strategy", fileName: "access-delivery-strategy.pdf" },
        { key: "del.updated_risk_register_spatial", label: "Updated Risk Register and Method Statements reflecting spatial constraints", fileName: "risk-register-spatial-rev3.xlsx" },
        { key: "del.detailed_project_plan_updated_spatial", label: "Updated Detailed Project Plan reflecting spatial constraints", fileName: "detailed-project-plan-rev2.pdf" },
        { key: "del.infrastructure_confirmation", label: "Confirmation that existing infrastructure can support the new units (structural, electrical, thermal)", fileName: "infrastructure-capacity-confirmation.pdf" },
      ];
      for (const d of evidenced) {
        const deliverable = await db.deliverable.create({
          data: {
            gateId: gate.id,
            key: d.key,
            label: d.label,
            bypassAuthority: d.key === "del.infrastructure_confirmation" ? "COMPLIANCE_OFFICER" : "PM",
            status: "EVIDENCED",
          },
        });
        await db.evidenceFile.create({
          data: {
            deliverableId: deliverable.id,
            fileName: d.fileName,
            fileRef: `local://seed/${d.fileName}`,
            uploadedById: derek.id,
          },
        });
      }

      // Left PENDING deliberately — try the bypass flow against this
      // one (needs Compliance Officer or SRO, not the PM).
      await db.deliverable.create({
        data: {
          gateId: gate.id,
          key: "del.fire_compartmentation_assessment",
          label: "Fire compartmentation and ventilation impact assessment",
          description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — cannot be bypassed at PM level.",
          bypassAuthority: "SRO",
          status: "PENDING",
        },
      });
    } else {
      // Gates 4, 5 and 6: not started.
      gate = await db.gate.create({
        data: { stageId: stage.id, key: def.gateKey, name: def.gateName, status: "NOT_STARTED" },
      });
    }

    // Merge at Stage instantiation (ConfigSchema.html §05): copy in
    // every ComplianceRuleTemplate that matches this stage and the
    // project's tags. Seed.ts is the closest thing this Phase 1
    // scaffold has to a "create project" action, so it goes through
    // the same merge helper reinstateStage uses in actions.ts.
    const matchingRules = await matchingComplianceRuleTemplates(
      db,
      health.id,
      def.key,
      effectiveComplianceTags(project)
    );
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
          status: "PENDING" as const,
        })),
      });
    }
  }

  // A lesson learned on the UPS project's Gate 3 — deliberately the
  // same gate key ("stage.spatial_coordination") the Water and
  // Drainage projects also record a lesson against below, so
  // /lessons-learned demonstrates cross-project/cross-template
  // grouping, not just a per-project list.
  const upsSpatialGate = await db.gate.findFirstOrThrow({
    where: { stage: { projectId: project.id, key: "stage.spatial_coordination" } },
  });
  await db.lessonLearned.create({
    data: {
      gateId: upsSpatialGate.id,
      type: "TO_IMPROVE",
      text: "The SRO review for the fire compartmentation assessment wasn't booked until the deliverable was already flagged pending, adding avoidable delay — book that slot at Gate 2, not after Gate 3 starts.",
      recordedById: derek.id,
    },
  });

  // ── Second demo project: Water Systems Replacement, created live via
  // AI-assisted provisioning (ProvisioningModel.html) on 19 Aug 2026 and
  // kept as a permanent second example — the real Claude Opus 5 match,
  // reasoning, and tags from that run, replayed here so the demo is
  // reproducible without an API key. Instantiation goes through the same
  // instantiateStage helper approveProvisioning uses, not hand-rolled.
  const waterProject = await db.project.create({
    data: {
      projectNumber: "20777",
      name: "Ward 6-8 Calorifier Replacement",
      templateId: waterTemplate.id,
      includedStageKeys: stageDefs.map((s) => s.key), // provisioning defaults to all 8
      tags: ["occupied_during_works", "water_systems_affected"],
      // Rerouting distribution pipework across three wards means new
      // penetrations through structure/fabric, not a like-for-like
      // swap — the CDM 2015 statutory question (asked at creation,
      // independently of the LLM match above) answers
      // BUILDING_MODIFICATION here, so a Principal Designer and the
      // planning-permission check both get pulled in automatically.
      worksType: "BUILDING_MODIFICATION",
      status: "ACTIVE",
      createdById: derek.id,
      provisioningBrief:
        "Replace ageing calorifiers and hot water distribution pipework serving wards 6, 7 and 8, phased over consecutive weekends to avoid disrupting clinical services at this live acute hospital. Legionella risk needs careful management during and after the works.",
      provisioningMatchReasoning:
        "Project is calorifier and hot water pipework replacement with Legionella management — matches Water Systems Replacement. Site is a live acute hospital with phased weekend works around clinical services (occupied during works), and the works directly affect water systems. No mention of a National Treatment Centre.",
    },
  });

  await db.projectRoleAssignment.createMany({
    data: [
      { projectId: waterProject.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.PM.id },
      { projectId: waterProject.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.FM_CONTRACTOR.id },
      { projectId: waterProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.SPONSOR.id },
      { projectId: waterProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.CLIENT_AUTHORITY.id },
      { projectId: waterProject.id, departmentId: buildCareCompliance.id, userId: gary.id, roleId: roles.COMPLIANCE_OFFICER.id },
      { projectId: waterProject.id, departmentId: stAldwynEstates.id, userId: mark.id, roleId: roles.SRO.id },
      { projectId: waterProject.id, departmentId: buildCareFinance.id, userId: priya.id, roleId: roles.FINANCE.id },
      // Required by CDM 2015 — this project's worksType is
      // BUILDING_MODIFICATION, so a Principal Designer must be engaged.
      { projectId: waterProject.id, departmentId: buildCareNorth.id, userId: ross.id, roleId: roles.PRINCIPAL_DESIGNER.id },
    ],
  });

  await db.provisioningReview.create({
    data: { projectId: waterProject.id, decision: "APPROVED", reviewedById: gary.id },
  });

  const waterStageTemplatesFull = await db.stageTemplate.findMany({
    where: { templateId: waterTemplate.id },
    orderBy: { order: "asc" },
    include: { gateTemplate: { include: { deliverableTemplates: true } } },
  });
  for (let i = 0; i < waterStageTemplatesFull.length; i++) {
    await instantiateStage(db, {
      projectId: waterProject.id,
      projectTags: effectiveComplianceTags(waterProject),
      sectorVariantId: health.id,
      order: i,
      stageTemplate: waterStageTemplatesFull[i]!,
    });
  }

  const waterSpatialGate = await db.gate.findFirstOrThrow({
    where: { stage: { projectId: waterProject.id, key: "stage.spatial_coordination" } },
  });
  await db.lessonLearned.create({
    data: {
      gateId: waterSpatialGate.id,
      type: "WENT_WELL",
      text: "Circulating the coordinated riser drawings to Estates for comment before formal submission caught every spatial clash early — no rework needed after sign-off. Worth doing as standard practice.",
      recordedById: derek.id,
    },
  });

  // ── Third demo project: Drainage & Foul Water System Replacement,
  // originally created live via AI-assisted provisioning on 19 Aug 2026
  // — at the time, matched to the calorifier/water template for lack of
  // anywhere better to go, which is exactly the gap the Drainage
  // template above exists to close. Replayed here against the correct
  // template, same reproducible-without-an-API-key pattern as the water
  // project. Below-slab excavation into the existing kitchen floor to
  // re-lay pipework is a building-fabric modification, so worksType is
  // BUILDING_MODIFICATION — a second live demonstration of the CDM 2015
  // branch, independent of the water project's.
  const drainageProject = await db.project.create({
    data: {
      projectNumber: "55998",
      name: "Main Kitchen Drainage Replacement",
      templateId: drainageTemplate.id,
      includedStageKeys: stageDefs.map((s) => s.key), // provisioning defaults to all 8
      tags: ["occupied_during_works", "drainage_systems_affected", "kitchen_drainage"],
      worksType: "BUILDING_MODIFICATION",
      status: "ACTIVE",
      createdById: derek.id,
      provisioningBrief:
        "The main drainage system within Forth Valley Royal Hospital's kitchen needs removed and replaced — below-slab foul pipework has failed in multiple locations, requiring excavation and re-laying of drainage runs while the kitchen remains partially operational.",
      provisioningMatchReasoning:
        "Below-slab foul drainage removal and re-laying is a flow-path/falls problem (pipe sizing, gradients, venting), not a water storage or supply problem — matches Drainage & Foul Water System Replacement, not the calorifier template. Site is a live acute hospital kitchen with partial ongoing service (occupied during works). The drainage serves food-service areas, so trade effluent/grease requirements apply (kitchen drainage). Excavating and re-laying below-slab pipework alters the building fabric.",
    },
  });

  await db.projectRoleAssignment.createMany({
    data: [
      { projectId: drainageProject.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.PM.id },
      { projectId: drainageProject.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.FM_CONTRACTOR.id },
      { projectId: drainageProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.SPONSOR.id },
      { projectId: drainageProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.CLIENT_AUTHORITY.id },
      { projectId: drainageProject.id, departmentId: buildCareCompliance.id, userId: gary.id, roleId: roles.COMPLIANCE_OFFICER.id },
      { projectId: drainageProject.id, departmentId: stAldwynEstates.id, userId: mark.id, roleId: roles.SRO.id },
      { projectId: drainageProject.id, departmentId: buildCareFinance.id, userId: priya.id, roleId: roles.FINANCE.id },
      // Required by CDM 2015 — this project's worksType is
      // BUILDING_MODIFICATION, so a Principal Designer must be engaged.
      { projectId: drainageProject.id, departmentId: buildCareNorth.id, userId: ross.id, roleId: roles.PRINCIPAL_DESIGNER.id },
    ],
  });

  await db.provisioningReview.create({
    data: { projectId: drainageProject.id, decision: "APPROVED", reviewedById: gary.id },
  });

  const drainageStageTemplatesFull = await db.stageTemplate.findMany({
    where: { templateId: drainageTemplate.id },
    orderBy: { order: "asc" },
    include: { gateTemplate: { include: { deliverableTemplates: true } } },
  });
  for (let i = 0; i < drainageStageTemplatesFull.length; i++) {
    await instantiateStage(db, {
      projectId: drainageProject.id,
      projectTags: effectiveComplianceTags(drainageProject),
      sectorVariantId: health.id,
      order: i,
      stageTemplate: drainageStageTemplatesFull[i]!,
    });
  }

  const drainageBriefingGate = await db.gate.findFirstOrThrow({
    where: { stage: { projectId: drainageProject.id, key: "stage.preparation_briefing" } },
  });
  await db.lessonLearned.create({
    data: {
      gateId: drainageBriefingGate.id,
      type: "TO_IMPROVE",
      text: "Scottish Water's trade effluent consent process took longer than the preliminary programme assumed — start that application at Gate 0 alongside the strategic brief, not once briefing is underway.",
      recordedById: derek.id,
    },
  });

  // ── Fourth demo project: Cold Water Storage & Distribution
  // Replacement, originally created live via the managed project-number
  // flow on 19 Aug 2026 as project 30001 — at the time, matched to the
  // calorifier template because its description still over-claimed
  // "hot/cold water storage" scope, which is exactly the gap the Cold
  // Water template above exists to close. Replayed here against the
  // correct template, same reproducible pattern as the drainage
  // project. Kept as project number 30001 to match what was actually
  // issued — the counter below is seeded to 30001 (not 30000) so the
  // next real project correctly gets 30002, not a collision with this one.
  const coldWaterProject = await db.project.create({
    data: {
      projectNumber: "30001",
      name: "Main Water Tank Replacement for the Entire Hospital",
      templateId: coldWaterTemplate.id,
      includedStageKeys: stageDefs.map((s) => s.key), // provisioning defaults to all 8
      tags: ["water_systems_affected", "occupied_during_works"],
      // Replacing 4 large inlet/filtered storage tanks serving the
      // whole hospital needs a reinforced plant-room base and new
      // access/overflow arrangements — building fabric work, not a
      // like-for-like swap.
      worksType: "BUILDING_MODIFICATION",
      status: "ACTIVE",
      createdById: derek.id,
      provisioningBrief:
        "There are 2 main inlet water tanks and 2 filtered tanks, supplying the whole of the Hospital. Currently, they are leaking badly and need to be replaced.",
      provisioningMatchReasoning:
        "Replacement of leaking inlet and filtered cold water storage tanks serving the hospital — cold water storage/distribution plant, not calorifiers or hot water, and not drainage — matches Cold Water Storage & Distribution Replacement. Water systems clearly affected, and the hospital remains operational during works.",
    },
  });

  await db.projectRoleAssignment.createMany({
    data: [
      { projectId: coldWaterProject.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.PM.id },
      { projectId: coldWaterProject.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.FM_CONTRACTOR.id },
      { projectId: coldWaterProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.SPONSOR.id },
      { projectId: coldWaterProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.CLIENT_AUTHORITY.id },
      { projectId: coldWaterProject.id, departmentId: buildCareCompliance.id, userId: gary.id, roleId: roles.COMPLIANCE_OFFICER.id },
      { projectId: coldWaterProject.id, departmentId: stAldwynEstates.id, userId: mark.id, roleId: roles.SRO.id },
      { projectId: coldWaterProject.id, departmentId: buildCareFinance.id, userId: priya.id, roleId: roles.FINANCE.id },
      { projectId: coldWaterProject.id, departmentId: buildCareNorth.id, userId: ross.id, roleId: roles.PRINCIPAL_DESIGNER.id },
    ],
  });

  await db.provisioningReview.create({
    data: { projectId: coldWaterProject.id, decision: "APPROVED", reviewedById: gary.id },
  });

  const coldWaterStageTemplatesFull = await db.stageTemplate.findMany({
    where: { templateId: coldWaterTemplate.id },
    orderBy: { order: "asc" },
    include: { gateTemplate: { include: { deliverableTemplates: true } } },
  });
  for (let i = 0; i < coldWaterStageTemplatesFull.length; i++) {
    await instantiateStage(db, {
      projectId: coldWaterProject.id,
      projectTags: effectiveComplianceTags(coldWaterProject),
      sectorVariantId: health.id,
      order: i,
      stageTemplate: coldWaterStageTemplatesFull[i]!,
    });
  }

  console.log("Seed complete.");
  console.log("Dev users — switch between them with the header switcher:");
  console.log(`  PM:                    ${derek.name} <${derek.email}>`);
  console.log(`  Sponsor:               ${david.name} <${david.email}>`);
  console.log(`  Compliance Officer:    ${gary.name} <${gary.email}>`);
  console.log(`  SRO:                   ${mark.name} <${mark.email}>`);
  console.log(`  Authorised Person:     ${alan.name} <${alan.email}>`);
  console.log(`  Authorising Engineer:  ${fiona.name} <${fiona.email}>`);
  console.log(`  Principal Designer:    ${ross.name} <${ross.email}>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
