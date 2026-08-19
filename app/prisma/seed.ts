// Seed data — the same running example used throughout the PRD, Data
// Model, Config Schema, and the design screens: Serco Health : FVRH
// Scotland delivering the UPS Systems Replacement (4 systems, 12
// units) for FVRH NHS at Forth Valley Royal Hospital. Stage/gate
// structure and deliverables follow the RIBA Plan of Work 2020,
// matching the worked example in Example_Overview_Plan.docx.

import { PrismaClient } from "@prisma/client";
import { matchingComplianceRuleTemplates } from "../src/lib/compliance";

const db = new PrismaClient();

async function main() {
  console.log("Seeding StageForge Phase 1 dev data…");

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

  // ── Template: one Health template, Gateway-Review shaped ─────────
  const template = await db.template.create({
    data: {
      key: "template.health.me_systems_replacement",
      name: "M&E Systems Replacement",
      sectorVariantId: health.id,
    },
  });

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

  const stageTemplates = [];
  for (let i = 0; i < stageDefs.length; i++) {
    const def = stageDefs[i]!;
    const st = await db.stageTemplate.create({
      data: { templateId: template.id, key: def.key, name: def.name, order: i },
    });
    await db.gateTemplate.create({
      data: { stageTemplateId: st.id, key: def.gateKey, name: def.gateName },
    });
    stageTemplates.push(st);
  }

  // Deliverable templates for every gate — the full mandatory-deliverables
  // list per RIBA stage from the UPS Systems Replacement worked example
  // (Example_Overview_Plan.docx §3). bypassAuthority reflects which items
  // carry statutory/safety weight (SRO), compliance documentation
  // (Compliance Officer), or ordinary delivery (PM).
  type DeliverableDef = {
    key: string;
    label: string;
    description?: string;
    bypassAuthority?: "PM" | "COMPLIANCE_OFFICER" | "SRO";
  };
  const deliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.strategic_brief", label: "Strategic Brief — clinical risk of existing systems and options appraisal" },
      { key: "del.high_level_risk_register", label: "High-level Risk Register — patient safety and power continuity focus" },
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

  for (let i = 0; i < stageTemplates.length; i++) {
    const gateTemplate = await db.gateTemplate.findUniqueOrThrow({
      where: { stageTemplateId: stageTemplates[i]!.id },
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
    ],
  });

  // ── Project: UPS Systems Replacement, excluding Gate 7 (Use) ─────
  const project = await db.project.create({
    data: {
      projectNumber: "20456",
      name: "UPS Systems Replacement – 4 Main Systems (12 units)",
      templateId: template.id,
      includedStageKeys: stageDefs.slice(0, 7).map((s) => s.key), // all but use
      // Forth Valley Royal Hospital is a live acute site, works run
      // alongside continuous clinical use — not a National Treatment
      // Centre, so the NHS Scotland Assure SBAR rule above deliberately
      // does not match this project (proves tag exclusion, not just
      // inclusion).
      tags: ["acute_hospital", "occupied_during_works"],
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
    ],
  });

  // Instantiate stages 0–6 (Gate 7 / Use is excluded — simply never
  // instantiated, per ConfigSchema.html §03).
  for (let i = 0; i < 7; i++) {
    const def = stageDefs[i]!;
    const st = stageTemplates[i]!;
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
      project.tags
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
