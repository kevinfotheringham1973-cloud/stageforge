/**
 * Applies the 2026-09-10 regulatory-coverage additions (PVG Scheme
 * membership, DSEAR, Radiation Protection Adviser shielding integrity,
 * six smaller content-depth fixes, three new templates, and a water
 * dispenser/HSG274 check) to an EXISTING database — safe to run against
 * an already-seeded install with real project data, not just a fresh one.
 *
 * seed.ts only ever runs once per install (see electron/main.js's
 * stageforge-seed-complete.marker check) — deliberately, after a real
 * half-seeded-database bug taught this team not to make reseeding
 * something that can happen by accident. That means an install that was
 * already seeded before this date never gets new seed.ts content without
 * a script like this one. Same idempotent-upsert pattern already
 * established by scripts/generate-england-variant.ts for the same class
 * of problem (propagating corpus changes into an existing database) —
 * safe to re-run any number of times; every write below either upserts
 * on a real unique key or checks existence before creating.
 *
 * Nothing here touches an existing Project, WorksPackage, or any
 * already-instantiated Gate/Deliverable/ComplianceRequirement row —
 * those are frozen at instantiation time per this schema's own design,
 * unaffected by template/rule changes made after the fact. New template
 * content only affects NEW projects created after this script runs.
 *
 * Usage: npm run sync:2026-09-10-compliance
 *
 * NOT run against any real database as part of building this script —
 * no install exists on the machine it was written on to safely test
 * against. Verified by careful construction against the real schema and
 * by TypeScript compiling clean (`npx tsc --noEmit`), not by execution.
 * Run it once against a real install's database and review the console
 * summary before trusting it beyond that.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

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
  section?: string;
  bypassAuthority?: string;
};

async function createStageAndGateTemplatesIfMissing(templateId: string) {
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

async function createDeliverableTemplatesFor(
  stageTemplatesForTemplate: Awaited<ReturnType<typeof createStageAndGateTemplatesIfMissing>>,
  deliverableDefsByStage: DeliverableDef[][]
) {
  for (let i = 0; i < stageTemplatesForTemplate.length; i++) {
    const gateTemplate = await db.gateTemplate.findUniqueOrThrow({
      where: { stageTemplateId: stageTemplatesForTemplate[i]!.id },
    });
    await db.deliverableTemplate.createMany({
      data: deliverableDefsByStage[i]!.map((d, order) => ({
        gateTemplateId: gateTemplate.id,
        order,
        key: d.key,
        label: d.label,
        description: d.description ?? null,
        section: d.section ?? null,
        bypassAuthority: d.bypassAuthority ?? "PM",
      })),
    });
  }
}

/** Creates a whole new Template (with its 8 stages/gates + deliverables) ONLY if
 * `key` doesn't already exist — the existence check is on the Template itself, not
 * per-row, since the intent is "this whole subtree either already landed, or it
 * hasn't" rather than partial re-creation. */
async function createTemplateIfMissing(
  key: string,
  data: { name: string; description: string; matchKeywords: string[]; sectorVariantId: string },
  deliverableDefsByStage: DeliverableDef[][]
) {
  const existing = await db.template.findUnique({ where: { key } });
  if (existing) {
    console.log(`  [skip] template already present: ${key}`);
    return;
  }
  const template = await db.template.create({ data: { key, ...data } });
  const stageTemplates = await createStageAndGateTemplatesIfMissing(template.id);
  await createDeliverableTemplatesFor(stageTemplates, deliverableDefsByStage);
  console.log(`  [added] template: ${key}`);
}

async function upsertComplianceRule(
  ruleSetId: string,
  data: {
    key: string;
    label: string;
    description: string;
    ruleRef: string;
    appliesToStageKeys: string[];
    appliesIfTags: string[];
  }
) {
  const existing = await db.complianceRuleTemplate.findUnique({
    where: { ruleSetId_key: { ruleSetId, key: data.key } },
  });
  if (existing) {
    console.log(`  [skip] compliance rule already present: ${data.key}`);
    return;
  }
  await db.complianceRuleTemplate.create({
    data: { ruleSetId, blocksGate: true, ...data },
  });
  console.log(`  [added] compliance rule: ${data.key}`);
}

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
  const health = await db.sectorVariant.findFirstOrThrow({ where: { key: { contains: "health" } } });

  console.log("== Cross-cutting compliance rules (compliance.health.scotland_core) ==");
  const ruleSet = await db.complianceRuleSet.findUniqueOrThrow({
    where: { key: "compliance.health.scotland_core" },
  });

  await upsertComplianceRule(ruleSet.id, {
    key: "comp.pvg_scheme_membership",
    label: "PVG Scheme membership evidenced for contractor personnel attending site",
    description:
      "Current PVG Scheme membership (Disclosure Scotland's 5-year membership product for regulated roles, legally required since the Disclosure (Scotland) Act 2020's 1 April 2025 commencement) must be evidenced for named contractor operatives before they attend an occupied hospital site — distinct from Level 1/Level 2 disclosure, and from general trade competency cards. Applies to every project: hospital circulation routes aren't cleanly separable from vulnerable-patient areas.",
    ruleRef: "Disclosure (Scotland) Act 2020 / PVG Scheme",
    appliesToStageKeys: ["stage.manufacturing_construction"],
    appliesIfTags: [],
  });

  await upsertComplianceRule(ruleSet.id, {
    key: "comp.dsear_risk_assessment",
    label: "DSEAR risk assessment completed for dangerous substances / explosive atmospheres",
    description:
      "Applies wherever the works involve a flammable or pressurised substance — refrigerant handling (including A2L refrigerants such as R32, in scope since DSEAR's 2015 amendment brought all 'gases under pressure' into scope regardless of flammability class), fuel supply/combustion, or compressed/medical gas — particularly where hot works occur on or near the same system. A distinct statutory risk assessment from the general fire risk assessment and the hot-works permit above.",
    ruleRef: "Dangerous Substances and Explosive Atmospheres Regulations 2002, as amended 2015",
    appliesToStageKeys: ["stage.manufacturing_construction"],
    appliesIfTags: ["dsear_dangerous_substances_affected"],
    // Consistent with comp.work_at_height_authorisation / comp.lone_working_arrangements:
    // default SRO override authority, not FIRE_OFFICER — the hazard is the dangerous
    // substance itself, and no SHTM/HTM-established AP exists for DSEAR the way it does
    // for fire/electrical/water.
  });

  await upsertComplianceRule(ruleSet.id, {
    key: "comp.rpa_shielding_integrity",
    label: "Radiation Protection Adviser (RPA) sign-off confirming shielding integrity unaffected",
    description:
      "Applies wherever works are in, adjacent to, above or below a room housing ionising-radiation imaging equipment (CT, X-ray, fluoroscopy, nuclear medicine — not MRI, which uses no ionising radiation). A separate gate from HAI-SCRIBE, not covered by it: a job can pass infection-control review cleanly and still risk breaching lead shielding integrity by drilling or fixing into a bounding wall, floor or ceiling.",
    ruleRef: "Ionising Radiations Regulations 2017 (IRR17)",
    appliesToStageKeys: ["stage.technical_design"],
    appliesIfTags: ["imaging_suite_adjacent_works"],
  });

  console.log("\n== Deliverable additions to existing templates ==");

  await appendDeliverable("template.health.boiler_heating_plant_replacement", "stage.technical_design", {
    key: "del.boiler_gas_safety_regs_compliance",
    section: "Technical Design Package",
    label: "Gas Safety (Installation and Use) Regulations 1998 compliance evidence",
    description: "Applies wherever new or retained boilers are gas-fired — a distinct statutory step from general Building Regulations compliance, not previously itemised separately.",
  });

  await appendDeliverable("template.health.medical_gas_systems_replacement", "stage.technical_design", {
    key: "del.medgas_agss_wel_exposure_control",
    section: "Technical Design Package",
    label: "AGSS occupational exposure control — Workplace Exposure Limit (WEL) monitoring evidence for waste anaesthetic gases",
    description: "COSHH — real quantified limits apply (100ppm nitrous oxide, 50ppm halogenated agents generally, 10ppm halothane specifically). The Outline MGPS strategy may name AGSS as part of the system, but exposure-limit monitoring is a distinct occupational-health step, not covered by general MGPS commissioning.",
  });

  await appendDeliverable("template.health.ventilation_systems_replacement", "stage.technical_design", {
    key: "del.ventilation_fire_damper_drop_test_regime",
    section: "Technical Design Package",
    label: "Fire damper annual drop-test regime specified",
    description: "BS 9999:2017 requires an annual drop test by a competent person — one of the most commonly-cited real compliance failures in UK healthcare estates (dampers painted over, boxed in, or simply never tested).",
  });

  await appendDeliverable("template.health.fire_alarm_detection_replacement", "stage.technical_design", {
    key: "del.firealarm_fire_damper_drop_test_regime",
    section: "Technical Design Package",
    label: "Fire damper annual drop-test regime specified (where dampers fall within this system's interface scope)",
    description: "BS 9999:2017 requires an annual drop test by a competent person — one of the most commonly-cited real compliance failures in UK healthcare estates.",
  });

  await appendDeliverable("template.health.electrical_services_replacement", "stage.use", {
    key: "del.electrical_thermal_imaging_survey",
    label: "Periodic thermal imaging survey of distribution boards/switchgear",
    description: "IET Guidance Note 3, BS 7671 — an approved test method for identifying overheating connections/overloaded circuits before failure, often also an insurance condition of cover. An ongoing O&M activity, not a one-off design deliverable — placed here at Use rather than Technical Design.",
  });

  await appendDeliverable("template.health.domestic_hot_cold_water_replacement", "stage.technical_design", {
    key: "del.water_rpz_backflow_prevention",
    section: "Technical Design Package",
    label: "RPZ valve installation and annual testing regime (backflow prevention)",
    description: "WRAS AIM 08-01 — required wherever a water system could backflow-contaminate the mains (lab/medical device connections). Distinct from the general Water Byelaws compliance item and from Legionella/water-safety control: a system can pass every Legionella check with a lapsed or absent RPZ test.",
  });

  await appendDeliverable("template.health.domestic_hot_cold_water_replacement", "stage.technical_design", {
    key: "del.water_dialysis_renal_treatment_requirements",
    section: "Technical Design Package",
    label: "Dialysis/renal water treatment requirements confirmed (if the system feeds a renal/haemodialysis unit)",
    description: "ISO 23500 — a patient-safety-critical water-quality standard distinct from general building water safety, since dialysis water enters the bloodstream directly during treatment.",
  });

  await appendDeliverable("template.health.domestic_hot_cold_water_replacement", "stage.technical_design", {
    key: "del.water_dispenser_legionella_biofilm_risk",
    section: "Technical Design Package",
    label: "Water dispenser/cooler Legionella and biofilm risk confirmed (reservoir-type vs mains-fed/point-of-use)",
    description: "HSG274 / HSE ACOP L8 — reservoir-type coolers are a named Legionella/biofilm risk (stored water, biofilm-prone internals) distinct from a mains-fed/point-of-use unit's continuous-flow lower risk. State which type is involved before treating a water dispenser as low-risk by default.",
  });

  console.log("\n== New templates (created whole, only if missing) ==");

  await createTemplateIfMissing(
    "template.health.automatic_doors_replacement",
    {
      name: "Automatic Doors Replacement",
      description:
        "Replacement, major upgrade or installation of automatic (power-operated) doors in hospital premises — sliding, swing, revolving and folding doorsets, including fire/smoke-resisting variants. Doors on isolation-room or theatre lobbies are part of pressure-cascade control, not just access control — a design/commissioning check distinct from general HAI-SCRIBE review.",
      matchKeywords: ["automatic door", "power-operated door", "sliding door", "revolving door", "folding door", "fire door", "smoke door", "doorset"],
      sectorVariantId: health.id,
    },
    [
      [
        { key: "del.autodoors_business_case", label: "Business case / need identification (door condition, safety, access control need)", description: "SHTM 00." },
        { key: "del.autodoors_strategic_brief", label: "Strategic brief & outcomes (safe operation, accessibility, escape-route compliance)" },
        { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
      ],
      [
        { key: "del.autodoors_project_brief", label: "Project Brief (scope of doorsets, fire/smoke rating, accessibility requirements)" },
        { key: "del.autodoors_condition_surveys", label: "Existing condition surveys (mechanism, safety sensors, fire/smoke seal condition)" },
        { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
        { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
        { key: "del.autodoors_imaging_adjacency_check", label: "Confirmation of whether any affected door adjoins an ionising-radiation imaging suite (CT/X-ray/fluoroscopy/nuclear medicine)", description: "Flags the door for the Radiation Protection Adviser (RPA) shielding-integrity compliance rule — a separate gate from HAI-SCRIBE, not covered by it." },
      ],
      [
        { key: "del.autodoors_concept_design_report", label: "Concept design options (door type, operation mode, fail-safe strategy)", description: "BS EN 16005." },
        { key: "del.autodoors_pressure_cascade_role", label: "Confirmation of whether the door forms part of a pressure-cascade boundary (isolation room / theatre lobby)", description: "SHTM 03-01 / HAI-SCRIBE — a pressure-cascade door needs its sealing/fail-safe function specified alongside its access-control function." },
        { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
        { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015." },
      ],
      [
        { key: "del.autodoors_coordinated_layout_drawings", label: "Coordinated design (door positions, swing/slide clearances, escape-route width)", description: "Building (Scotland) Regulations 2004 (means of escape)." },
        { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
        { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (fire/smoke-rated doorsets)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
        { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing strategy (principles only)" },
      ],
      [
        { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
        { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
        { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
        { key: "del.autodoors_detailed_specification", section: "Technical Design Package", label: "Detailed specification (door type, actuator, safety sensors, fail-safe/break-out operation)", description: "BS EN 16005." },
        { key: "del.autodoors_fire_smoke_doorset_spec", section: "Technical Design Package", label: "Fire/smoke-resisting doorset specification (where applicable)", description: "BS EN 16034." },
        { key: "del.autodoors_accessibility_compliance", section: "Technical Design Package", label: "Accessibility compliance confirmation (clear opening width, activation controls, timing)", description: "Equality Act 2010." },
        { key: "del.autodoors_rpa_shielding_check", section: "Technical Design Package", label: "Radiation Protection Adviser (RPA) sign-off confirming shielding integrity unaffected (where the door adjoins an imaging suite)", description: "IRR17 — see the imaging-adjacency check flagged at Gate 1. A separate gate from HAI-SCRIBE, not covered by it." },
        { key: "del.common_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
        { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
        { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
        { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
        { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
        { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
      ],
      [
        { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
        { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates" },
        { key: "del.autodoors_install_commissioning", label: "Installation, safety sensor commissioning and fail-safe/break-out testing" },
        { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
        { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant doorsets" },
      ],
      [
        { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports (force testing, safety sensor function, fire/smoke seal integrity)", description: "BS EN 16005 / BS EN 16034." },
        { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
        { key: "del.common_om_manuals", label: "Comprehensive O&M manuals" },
        { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
        { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
        { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
        { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      ],
      [
        { key: "del.autodoors_soft_landings_review", label: "Soft landings / post-occupancy review (reliability, user feedback)" },
        { key: "del.autodoors_ongoing_maintenance_regime", label: "Ongoing maintenance and periodic safety-function testing regime" },
        { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
        { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
      ],
    ]
  );

  await createTemplateIfMissing(
    "template.health.fume_cupboards_replacement",
    {
      name: "Fume Cupboards Replacement",
      description:
        "Installation, replacement or major upgrade of fume cupboards in hospital premises — laboratory, pathology and pharmacy fume cupboards, ducted and recirculating units, and associated Local Exhaust Ventilation (LEV). Face-velocity containment (0.4 m/s ±20%) and the COSHH-mandated 14-month LEV thorough-examination-and-test cycle are distinct statutory requirements, not covered by general commissioning.",
      matchKeywords: ["fume cupboard", "fume hood", "LEV", "local exhaust ventilation", "laboratory ventilation", "pathology fume extract", "pharmacy fume extract"],
      sectorVariantId: health.id,
    },
    [
      [
        { key: "del.fumecupboard_business_case", label: "Business case / need identification (cupboard condition, face-velocity performance, LEV test history, capacity)", description: "COSHH Regulation 9." },
        { key: "del.fumecupboard_strategic_brief", label: "Strategic brief & outcomes (containment performance, LEV compliance, capacity)" },
        { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
      ],
      [
        { key: "del.fumecupboard_project_brief", label: "Project Brief (scope of cupboards, ducted vs recirculating, capacity, substance/process inventory)", description: "COSHH." },
        { key: "del.fumecupboard_substance_process_confirmation", label: "Confirmation of which substances/processes the cupboard(s) serve (COSHH/DSEAR relevance)", description: "COSHH, DSEAR — flags the project for the DSEAR risk assessment compliance rule where flammable solvents are handled." },
        { key: "del.fumecupboard_condition_lev_history", label: "Existing condition surveys including face-velocity and LEV thorough examination/test history", description: "BS EN 14175, COSHH Regulation 9." },
        { key: "del.common_expanded_risk_register", label: "Expanded Risk Register (loss of containment, service continuity, DSEAR/flammable-substance risk)", description: "COSHH, DSEAR, CDM 2015." },
        { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      ],
      [
        { key: "del.fumecupboard_concept_design_report", label: "Concept design options (ducted vs recirculating, constant-air-volume vs variable-air-volume control)", description: "BS EN 14175." },
        { key: "del.fumecupboard_type_confirmation", label: "Confirmation of ducted versus recirculating type for each unit", description: "BS EN 14175." },
        { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
        { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, COSHH." },
      ],
      [
        { key: "del.fumecupboard_coordinated_layout_drawings", label: "Coordinated design (cupboard positions, extract ductwork routes, plant space)", description: "SHTM 03-01 where linked." },
        { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
        { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (ductwork penetrations)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
        { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing strategy (principles only)" },
      ],
      [
        { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
        { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
        { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
        { key: "del.fumecupboard_detailed_specification", section: "Technical Design Package", label: "Detailed specifications (cupboard, extract fan, controls, VAV system if applicable)", description: "BS EN 14175." },
        { key: "del.fumecupboard_face_velocity_design", section: "Technical Design Package", label: "Face-velocity and containment design confirmation (0.4 m/s ±20%)", description: "BS EN 14175." },
        { key: "del.fumecupboard_extract_ductwork_design", section: "Technical Design Package", label: "Extract ductwork schematics and electrical/controls design", description: "SHTM 06 series." },
        { key: "del.common_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
        { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, COSHH.", bypassAuthority: "SRO" },
        { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
        { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
        { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
        { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
      ],
      [
        { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
        { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates" },
        { key: "del.fumecupboard_install", label: "Installation of cupboard(s), extract ductwork, controls and VAV system if applicable" },
        { key: "del.fumecupboard_commissioning_face_velocity_test", label: "Commissioning face-velocity and containment testing", description: "BS EN 14175 — critical containment verification, cannot be bypassed at PM level.", bypassAuthority: "SRO" },
        { key: "del.fumecupboard_first_lev_test", label: "First LEV thorough examination and test (COSHH Regulation 9)", description: "HSG258 — a distinct statutory step from general commissioning.", bypassAuthority: "COMPLIANCE_OFFICER" },
        { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
        { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant cupboards" },
      ],
      [
        { key: "del.fumecupboard_full_commissioning_records", label: "Full commissioning records including LEV thorough examination and test certificate", description: "COSHH Regulation 9, HSG258." },
        { key: "del.fumecupboard_face_velocity_sash_verification", label: "Face-velocity verification across sash positions", description: "BS EN 14175." },
        { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
        { key: "del.common_om_manuals", label: "Comprehensive O&M manuals" },
        { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
        { key: "del.common_training_records", label: "Training & demonstration records for estates/lab staff" },
        { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
        { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      ],
      [
        { key: "del.fumecupboard_soft_landings_review", label: "Soft landings / post-occupancy review (containment performance, user feedback)" },
        { key: "del.fumecupboard_ongoing_lev_regime", label: "Ongoing LEV thorough examination and test regime in operation (at least every 14 months)", description: "COSHH Regulation 9, HSG258." },
        { key: "del.fumecupboard_periodic_face_velocity_checks", label: "Periodic face-velocity spot-checks", description: "BS EN 14175." },
        { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
        { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
      ],
    ]
  );

  await createTemplateIfMissing(
    "template.health.fire_curtains_replacement",
    {
      name: "Fire Curtains Replacement",
      description:
        "Installation, replacement or major upgrade of active fire curtain barrier assemblies in hospital premises — smoke/fire curtains at compartment lines, atria, and where used as an alternative to fixed fire-rated construction. BS 8524's own third-party certification scheme lapsed in June 2023 — confirm current certification status rather than assuming it's settled; the underlying maintenance/testing expectations in BS 8524-2 remain real and citable regardless.",
      matchKeywords: ["fire curtain", "smoke curtain", "active fire barrier", "compartment curtain", "atrium smoke curtain"],
      sectorVariantId: health.id,
    },
    [
      [
        { key: "del.firecurtain_business_case", label: "Business case / need identification (curtain condition, compartmentation risk)", description: "SHTM 80." },
        { key: "del.firecurtain_strategic_brief", label: "Strategic brief & outcomes (compartmentation integrity, smoke control performance)" },
        { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
      ],
      [
        { key: "del.firecurtain_project_brief", label: "Project Brief (scope of curtains, compartment lines/atria affected, smoke-control interface)" },
        { key: "del.firecurtain_condition_surveys", label: "Existing condition surveys and current certification status confirmation", description: "BS 8524-1 — confirm whether third-party certification for the existing/proposed product is current, given the scheme's June 2023 lapse; don't assume settled." },
        { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
        { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      ],
      [
        { key: "del.firecurtain_concept_design_report", label: "Concept design options (curtain type, smoke-control system interface, fail-safe/gravity-fail strategy)", description: "BS 8524-1." },
        { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
        { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015." },
      ],
      [
        { key: "del.firecurtain_coordinated_layout_drawings", label: "Coordinated design (curtain positions, headbox locations, structural fixings)" },
        { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
        { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
        { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing strategy (principles only)" },
      ],
      [
        { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
        { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
        { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
        { key: "del.firecurtain_detailed_specification", section: "Technical Design Package", label: "Detailed specification (curtain fabric rating, backup power for retract, smoke-resistance, gravity-failsafe)", description: "BS 8524-1." },
        { key: "del.firecurtain_smoke_control_interface", section: "Technical Design Package", label: "Smoke control system interface design (where the curtain forms part of a wider smoke control system)", description: "SHTM 03-01, SHTM 82 — requires quarterly testing once operational, per BS 8524." },
        { key: "del.common_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
        { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
        { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
        { key: "del.firecurtain_fsa_design_approval", label: "Fire Safety Advisor / stakeholder review and approval of design", description: "Only the site NHS Fire Officer can approve or reject fire-related design compliance, not the SRO or Compliance Officer.", bypassAuthority: "FIRE_OFFICER" },
        { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
        { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
        { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
      ],
      [
        { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
        { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates" },
        { key: "del.firecurtain_install", label: "Installation of curtain(s), headbox, guides and controls" },
        { key: "del.firecurtain_smoke_control_integration_testing", label: "Integration testing with the wider smoke control system (where applicable)", description: "SHTM 03-01/82 — critical for compartmentation reliance, cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
        { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
        { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant curtains" },
      ],
      [
        { key: "del.firecurtain_full_commissioning_records", label: "Full commissioning and functional test records (descent time, gravity-failsafe, backup power, smoke resistance)", description: "BS 8524-1/2." },
        { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
        { key: "del.common_om_manuals", label: "Comprehensive O&M manuals" },
        { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
        { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
        { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
        { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
        { key: "del.firecurtain_fsa_handover_acceptance", label: "Fire Safety Advisor formal handover acceptance", bypassAuthority: "FIRE_OFFICER" },
      ],
      [
        { key: "del.firecurtain_soft_landings_review", label: "Soft landings / post-occupancy review (reliability, user feedback)" },
        { key: "del.firecurtain_ongoing_testing_regime", label: "Ongoing quarterly test regime in operation where linked to a smoke control system, otherwise per BS 8524-2's maintenance schedule", description: "BS 8524-2." },
        { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
        { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
      ],
    ]
  );

  console.log("\nDone.");
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
