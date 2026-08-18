// Seed data — the same running example used throughout the PRD, Data
// Model, Config Schema, and the design screens: BuildCare FM Ltd
// delivering Ward 12 HVAC Replacement for St Aldwyn NHS Trust.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("Seeding StageForge Phase 1 dev data…");

  // ── Roles (global, Phase 1's core eight) ──────────────────────────
  const roleDefs = [
    { key: "PM", name: "Project Manager" },
    { key: "SPONSOR", name: "Project Sponsor" },
    { key: "SRO", name: "Senior Responsible Owner" },
    { key: "FM_CONTRACTOR", name: "FM Contractor" },
    { key: "CLIENT_AUTHORITY", name: "Client Authority" },
    { key: "COMPLIANCE_OFFICER", name: "Compliance Officer" },
    { key: "RESOURCE_MANAGER", name: "Resource / Portfolio Manager" },
    { key: "FINANCE", name: "Finance" },
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
    data: { name: "BuildCare FM Ltd", type: "FM_CONTRACTOR" },
  });
  const buildCareNorth = await db.department.create({
    data: { companyId: buildCare.id, name: "North Region" },
  });
  const buildCareCompliance = await db.department.create({
    data: { companyId: buildCare.id, name: "Central Compliance" },
  });

  const stAldwyn = await db.company.create({
    data: { name: "St Aldwyn NHS Foundation Trust", type: "CLIENT_AUTHORITY" },
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

  // ── Template: one Health template, Gateway-Review shaped ─────────
  const template = await db.template.create({
    data: {
      key: "template.health.ward_refurbishment",
      name: "Ward Refurbishment",
      sectorVariantId: health.id,
    },
  });

  const stageDefs = [
    { key: "stage.strategic_assessment", name: "Strategic Assessment", gateKey: "gate.g0_strategic_assessment", gateName: "Gate 0 — Strategic Assessment" },
    { key: "stage.business_justification", name: "Business Justification", gateKey: "gate.g1_business_justification", gateName: "Gate 1 — Business Justification" },
    { key: "stage.design_planning", name: "Design & Planning", gateKey: "gate.g2_delivery_strategy", gateName: "Gate 2 — Delivery Strategy" },
    { key: "stage.investment_decision", name: "Investment Decision", gateKey: "gate.g3_investment_decision", gateName: "Gate 3 — Investment Decision" },
    { key: "stage.readiness_for_service", name: "Readiness for Service", gateKey: "gate.g4_readiness_for_service", gateName: "Gate 4 — Readiness for Service" },
    { key: "stage.operations_review", name: "Operations Review", gateKey: "gate.g5_operations_review", gateName: "Gate 5 — Operations Review" },
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

  // Deliverable templates for Gate 2 only — enough to prove the shape.
  const gate2Template = await db.gateTemplate.findUniqueOrThrow({
    where: { stageTemplateId: stageTemplates[2]!.id },
  });
  await db.deliverableTemplate.createMany({
    data: [
      {
        gateTemplateId: gate2Template.id,
        key: "del.detailed_design_pack",
        label: "Detailed design pack signed off by Client Authority",
        bypassAuthority: "PM",
      },
      {
        gateTemplateId: gate2Template.id,
        key: "del.cost_plan_updated",
        label: "Cost plan updated to RIBA Stage 3 estimate",
        bypassAuthority: "PM",
      },
      {
        gateTemplateId: gate2Template.id,
        key: "del.asbestos_survey",
        label: "Asbestos survey completed before any intrusive works",
        description: "Statutory duty under CAR 2012 — cannot be bypassed at PM level.",
        bypassAuthority: "SRO",
      },
    ],
  });

  // Gate 5 (Operations Review) is excluded from this project by
  // default, but carries its own template so reinstating it later
  // produces a real, non-empty gate.
  const gate5Template = await db.gateTemplate.findUniqueOrThrow({
    where: { stageTemplateId: stageTemplates[5]!.id },
  });
  await db.deliverableTemplate.create({
    data: {
      gateTemplateId: gate5Template.id,
      key: "del.post_occupancy_review",
      label: "Post-occupancy review report completed",
      bypassAuthority: "PM",
    },
  });

  // ── Project: Ward 12 HVAC Replacement, excluding Gate 5 ──────────
  const project = await db.project.create({
    data: {
      projectNumber: "20456",
      name: "Ward 12 HVAC Replacement",
      templateId: template.id,
      includedStageKeys: stageDefs.slice(0, 5).map((s) => s.key), // all but operations_review
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
    ],
  });

  // Instantiate stages 0–4 (Gate 5 / Operations Review is excluded —
  // simply never instantiated, per ConfigSchema.html §03).
  for (let i = 0; i < 5; i++) {
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

    if (i === 0 || i === 1) {
      // Gates 0 and 1: signed off.
      const gate = await db.gate.create({
        data: { stageId: stage.id, key: def.gateKey, name: def.gateName, status: "SIGNED_OFF" },
      });
      await db.gateSignOff.create({
        data: { gateId: gate.id, decision: "APPROVED", signedOffById: david.id },
      });
    } else if (i === 2) {
      // Gate 2: in progress — the running example from every other doc.
      const gate = await db.gate.create({
        data: { stageId: stage.id, key: def.gateKey, name: def.gateName, status: "IN_PROGRESS" },
      });

      const designPack = await db.deliverable.create({
        data: {
          gateId: gate.id,
          key: "del.detailed_design_pack",
          label: "Detailed design pack signed off by Client Authority",
          bypassAuthority: "PM",
          status: "EVIDENCED",
        },
      });
      await db.evidenceFile.create({
        data: {
          deliverableId: designPack.id,
          fileName: "design-pack-v3.pdf",
          fileRef: "local://seed/design-pack-v3.pdf",
          uploadedById: derek.id,
        },
      });

      const costPlan = await db.deliverable.create({
        data: {
          gateId: gate.id,
          key: "del.cost_plan_updated",
          label: "Cost plan updated to RIBA Stage 3 estimate",
          bypassAuthority: "PM",
          status: "EVIDENCED",
        },
      });
      await db.evidenceFile.create({
        data: {
          deliverableId: costPlan.id,
          fileName: "cost-plan-stage3.xlsx",
          fileRef: "local://seed/cost-plan-stage3.xlsx",
          uploadedById: derek.id,
        },
      });

      // Left PENDING deliberately — try the bypass flow against this
      // one (needs Compliance Officer or SRO, not the PM).
      await db.deliverable.create({
        data: {
          gateId: gate.id,
          key: "del.asbestos_survey",
          label: "Asbestos survey completed before any intrusive works",
          description: "Statutory duty under CAR 2012 — cannot be bypassed at PM level.",
          bypassAuthority: "SRO",
          status: "PENDING",
        },
      });
    } else {
      // Gates 3 and 4: not started.
      await db.gate.create({
        data: { stageId: stage.id, key: def.gateKey, name: def.gateName, status: "NOT_STARTED" },
      });
    }
  }

  console.log("Seed complete.");
  console.log("Dev users — switch between them with the header switcher:");
  console.log(`  PM:                 ${derek.name} <${derek.email}>`);
  console.log(`  Sponsor:            ${david.name} <${david.email}>`);
  console.log(`  Compliance Officer: ${gary.name} <${gary.email}>`);
  console.log(`  SRO:                ${mark.name} <${mark.email}>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
