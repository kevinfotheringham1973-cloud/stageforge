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
import { generateEnglandVariant } from "../src/lib/englandConversion";
import {
  CDM_BUILDING_MODIFICATION_TAG,
  CDM_PRINCIPAL_DESIGNER_TAG,
  effectiveComplianceTags,
  HAISCRIBE_HIGH_INTENSITY_TAG,
} from "../src/lib/cdm";

const db = new PrismaClient();

async function main() {
  console.log("Seeding StageForge Phase 1 dev data…");

  // ── Managed project-number counter (lib/projectNumber.ts) — starts a
  // fresh block at 30001, deliberately unrelated to the ad-hoc numbers
  // the first three demo projects below already carry (20456, 20777,
  // 55998). Seeded to 30002, not 30000: the fourth and fifth demo
  // projects below are themselves the real projects issued 30001 and
  // 30002 live, so the counter has to already account for both numbers
  // being taken — otherwise the next real project created after a
  // reset would collide with one of them.
  await db.projectNumberCounter.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, value: 30002 },
  });

  // ── Roles (global, Phase 1's core eight, plus three project-specific
  // gate-approver roles named in the UPS example — informational only,
  // same non-bypass standing as FM Contractor / Client Authority) ────
  //
  // Authorised Person and Authorising Engineer are always discipline-
  // specific appointments in real NHS estates practice — someone's AP/AE
  // competency certificate names one engineering discipline, never a
  // bare "Authorised Person" (confirmed 19 Aug 2026). One Role
  // row per discipline rather than a field on the assignment: it's a
  // property of the person's standing appointment, the same way this
  // app already treats "PM" and "SRO" as distinct roles rather than one
  // role plus a type field.
  const roleDefs = [
    { key: "PM", name: "PM", category: "PROJECT_TEAM" as const },
    { key: "SPONSOR", name: "PS", category: "SENIOR_CONTRACTUAL" as const },
    { key: "SRO", name: "Senior Responsible Owner", category: "SENIOR_CONTRACTUAL" as const },
    { key: "FM_CONTRACTOR", name: "FM Contractor", category: "SENIOR_CONTRACTUAL" as const },
    { key: "CLIENT_AUTHORITY", name: "Client Authority", category: "SENIOR_CONTRACTUAL" as const },
    { key: "COMPLIANCE_OFFICER", name: "Compliance Officer", category: "PROJECT_TEAM" as const },
    { key: "RESOURCE_MANAGER", name: "Resource / Portfolio Manager", category: "PROJECT_TEAM" as const },
    { key: "FINANCE", name: "Finance", category: "PROJECT_TEAM" as const },
    { key: "AUTHORISED_PERSON_WATER", name: "AP (Water)", isExactMatchAuthority: true, category: "AUTHORISED_PERSON_ENGINEER" as const },
    { key: "AUTHORISED_PERSON_ELECTRICAL", name: "AP (Electrical)", isExactMatchAuthority: true, category: "AUTHORISED_PERSON_ENGINEER" as const },
    { key: "AUTHORISED_PERSON_MEDICAL_GASES", name: "AP (Medical Gases)", isExactMatchAuthority: true, category: "AUTHORISED_PERSON_ENGINEER" as const },
    // "Ventilation" here covers the combined Heating & Ventilation (H&V)
    // discipline — confirmed 21 Aug 2026: LTHW heating-circuit
    // isolation and hot-tapping fall under this AP, not Water AP. There
    // is deliberately no "AP (Gas)" — standard fuel gas/oil competency
    // comes from the external Gas Safe Register/OFTEC schemes, not a
    // Trust-appointed AP/AE, unlike Medical Gases above.
    { key: "AUTHORISED_PERSON_VENTILATION", name: "AP (Heating & Ventilation)", isExactMatchAuthority: true, category: "AUTHORISED_PERSON_ENGINEER" as const },
    { key: "AUTHORISING_ENGINEER_WATER", name: "AE (Water)", category: "AUTHORISED_PERSON_ENGINEER" as const },
    { key: "AUTHORISING_ENGINEER_ELECTRICAL", name: "AE (Electrical)", category: "AUTHORISED_PERSON_ENGINEER" as const },
    { key: "AUTHORISING_ENGINEER_MEDICAL_GASES", name: "AE (Medical Gases)", category: "AUTHORISED_PERSON_ENGINEER" as const },
    { key: "AUTHORISING_ENGINEER_VENTILATION", name: "AE (Heating & Ventilation)", category: "AUTHORISED_PERSON_ENGINEER" as const },
    { key: "PRINCIPAL_DESIGNER", name: "Principal Designer", category: "STATUTORY_OFFICER" as const },
    // The site NHS Fire Officer — the only authority that can approve
    // or reject fire-related compliance (confirmed 20 Aug
    // 2026: an SRO has no legal standing to assess fire safety). See
    // BypassAuthority.FIRE_OFFICER in schema.prisma.
    { key: "FIRE_OFFICER", name: "Fire Officer", isExactMatchAuthority: true, category: "STATUTORY_OFFICER" as const },
    // Clinical governance, not an engineering AP/AE — the named
    // sign-off DCB0129/DCB0160 requires for safety-related health IT
    // systems (nurse call, staff alert). Confirmed 21 Aug
    // 2026. See BypassAuthority.CLINICAL_SAFETY_OFFICER in schema.prisma.
    { key: "CLINICAL_SAFETY_OFFICER", name: "Clinical Safety Officer", isExactMatchAuthority: true, category: "STATUTORY_OFFICER" as const },
    // Information governance, not clinical or engineering — the named
    // DPO/Caldicott Guardian sign-off UK GDPR/the Data Protection Act
    // 2018 requires for DPIA, data retention/destruction, and CCTV/
    // access control acceptance. Confirmed 21 Aug 2026. See
    // BypassAuthority.INFORMATION_GOVERNANCE_OFFICER in schema.prisma.
    { key: "INFORMATION_GOVERNANCE_OFFICER", name: "Information Governance Officer", isExactMatchAuthority: true, category: "STATUTORY_OFFICER" as const },
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
      // Real address (25 Aug 2026): also Derek's real login, same reason
      // as Kevin/David below -- kept as Derek Gibb rather than merged
      // into an existing persona, since he's PM on almost the whole
      // portfolio already.
      email: "derek.g999@outlook.com",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const david = await db.user.create({
    data: {
      // Real name (25 Aug 2026): this persona IS Kevin's own real login
      // (see email below), so it shows his actual name rather than the
      // placeholder demo persona it started as.
      name: "Kevin Fotheringham",
      // Real address (20 Aug 2026): every other seeded persona is
      // an unroutable .example address, so this is the one demo user
      // scheduled-report sends actually land in an inbox for.
      email: "kevinfotheringham1973@gmail.com",
      homeDepartmentId: stAldwynEstates.id,
      // Also Kevin's real login since real auth (24 Aug 2026) -- needs
      // platform admin so he isn't locked out of admin-only screens and
      // the "view as" switcher under his own account.
      isPlatformAdmin: true,
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
      // Real address (25 Aug 2026): a real person's login deliberately
      // aliased onto this persona rather than shown under their own
      // name -- Kevin's call, not something to reverse without asking.
      email: "gaz808@gmail.com",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const alan = await db.user.create({
    data: {
      name: "Alan McGeachie",
      email: "alan.mcgeachie@staldwyn.example",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const bob = await db.user.create({
    data: {
      name: "Bob Smith",
      email: "bob.smith@buildcare.example",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const claire = await db.user.create({
    data: {
      name: "Claire Duncan",
      email: "claire.duncan@buildcare.example",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const dennis = await db.user.create({
    data: {
      name: "Dennis Kelly",
      email: "dennis.kelly@independent.example",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  // Real logins added 25 Aug 2026, consolidating PM and AP (Water) down
  // to one named holder each -- see lightingProject and the AP (Water)
  // reassignment near the end of this function.
  const javier = await db.user.create({
    data: {
      name: "Javier Carreno",
      email: "jjcarreno52@hotmail.com",
    },
  });
  const james = await db.user.create({
    data: {
      name: "James Slaven",
      email: "jamesslaven@msn.com",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const ross = await db.user.create({
    data: {
      name: "Ross Blair",
      email: "ross.blair@buildcare.example",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const andrea = await db.user.create({
    data: {
      name: "Andrea",
      email: "andrea@buildcare.example",
      homeDepartmentId: buildCareFinance.id,
    },
  });
  // Platform admin — deliberately not part of either company/department
  // structure (confirmed 20 Aug 2026: a dedicated admin
  // persona, not one of the project-delivery team wearing a second
  // hat). Only this flag can delete a project.
  const callum = await db.user.create({
    data: {
      name: "Callum Reid",
      email: "callum.reid@stageforge.example",
      isPlatformAdmin: true,
    },
  });
  // The share-link demo viewer (25 Aug 2026) -- resolved by
  // src/lib/shareLinks.ts for anyone visiting via a /share/<token> link.
  // Deliberately isPlatformAdmin: false with zero ProjectRoleAssignment
  // rows, so every existing write Server Action rejects it exactly like
  // any other signed-in person holding no role -- see ShareLink's schema
  // comment.
  await db.user.create({
    data: {
      name: "Demo Viewer",
      email: "demo-viewer@stageforge.example",
    },
  });
  // Named holders for the four authorities that had no seeded user as
  // of 21 Aug 2026 ("seed a user for the missing authorities") —
  // none of the five fixed demo projects below happen to gate anything
  // on Ventilation/Medical Gases/Clinical Safety/Information Governance,
  // so these are appointed but not yet assigned to a project, same
  // "manual per-project, only when relevant" pattern Bob/Claire/Ross
  // already follow (see the comment above roleDefs) — they won't show
  // a role label in the Acting-as dropdown until a project that
  // actually needs them assigns one. Engineering AP homed at the FM
  // contractor like Bob/Claire; the two governance roles homed at the
  // Trust like Mark/Alan, since DCB0160 clinical safety and information
  // governance sign-off are Trust functions, not contractor ones.
  const fiona = await db.user.create({
    data: {
      name: "Fiona Wallace",
      email: "fiona.wallace@buildcare.example",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const graeme = await db.user.create({
    data: {
      name: "Graeme Paterson",
      email: "graeme.paterson@buildcare.example",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const sarah = await db.user.create({
    data: {
      name: "Sarah Chen",
      email: "sarah.chen@staldwyn.example",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const neil = await db.user.create({
    data: {
      name: "Neil Forsyth",
      email: "neil.forsyth@staldwyn.example",
      homeDepartmentId: stAldwynEstates.id,
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
    bypassAuthority?:
      | "PM"
      | "COMPLIANCE_OFFICER"
      | "SRO"
      | "FIRE_OFFICER"
      | "AUTHORISED_PERSON_ELECTRICAL"
      | "AUTHORISED_PERSON_WATER"
      | "AUTHORISED_PERSON_VENTILATION"
      | "AUTHORISED_PERSON_MEDICAL_GASES"
      | "CLINICAL_SAFETY_OFFICER"
      | "INFORMATION_GOVERNANCE_OFFICER";
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

  // Electrical Services Replacement — formerly "M&E Systems
  // Replacement" (the original UPS Systems Replacement worked
  // example). Overwritten in place 21 Aug 2026 with the broader
  // Electrical Services content supplied (Electrical Systems.docx),
  // which supersedes the old UPS-only scope: LV distribution,
  // switchgear, UPS, IPS, standby generators, and associated controls.
  // Same Template row/id as before (only key/name/content changed), so
  // the live UPS demo project below (still instantiated from this
  // Template) keeps working — Deliverables are copied at instantiation
  // time, so its existing Gate data is unaffected either way; only
  // future projects matched to this Template see the new checklist.
  // Deliberately kept separate from Lighting & Electrical Distribution
  // Replacement below (confirmed 21 Aug 2026) even though
  // this new source document also covers emergency lighting design —
  // a small LED-only job shouldn't match a giant resilience/UPS/
  // generator checklist, so the two templates' descriptions cross-
  // reference each other to keep the LLM disambiguating by scope.
  const meTemplate = await db.template.create({
    data: {
      key: "template.health.electrical_services_replacement",
      name: "Electrical Services Replacement",
      description:
        "Electrical services replacement or major upgrade — LV distribution, switchgear, UPS/battery backup, IPS, standby generators, and associated controls/small power, in an operational healthcare environment. Covers emergency lighting DESIGN as part of overall resilience, but not a standalone lighting/luminaire retrofit — see Lighting & Electrical Distribution Replacement for a project that's only about lighting.",
      matchKeywords: ["UPS", "battery backup", "electrical replacement", "generator", "switchgear", "power resilience", "LV distribution", "IPS", "electrical services", "distribution board"],
      sectorVariantId: health.id,
    },
  });
  const meStageTemplates = await createStageAndGateTemplates(meTemplate.id);

  // Deliverable templates for every gate — overwritten 21 Aug 2026 from
  // Electrical Systems.docx, superseding the old UPS-only list
  // (which was itself from Example_Overview_Plan.docx §3). Keys
  // reprefixed del.electrical_* to match the rest of the library's
  // convention. bypassAuthority follows the same discipline mapping
  // established across every other template this week: permit-to-work/
  // isolation is AUTHORISED_PERSON_ELECTRICAL (the correction that
  // started this whole run of fixes, 21 Aug 2026), physical
  // safety-critical tests with no dedicated AP (UPS/generator
  // changeover, emergency lighting duration) are SRO, general
  // stakeholder/statutory-documentation checkpoints are
  // COMPLIANCE_OFFICER, and the Gate 3 fire item is FIRE_OFFICER — kept
  // as the exact same key/label/wording the old template used
  // ("del.electrical_fire_compartmentation_assessment", "Fire
  // compartmentation and ventilation impact assessment") so the live
  // UPS demo project's hand-authored Gate 3 narrative below (the
  // lesson-learned about booking the Fire Officer review earlier)
  // stays accurate without needing its own rewrite.
  const meDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.electrical_business_case", label: "Business case / need identification (system age, resilience, capacity, compliance, energy performance)", description: "SHTM 00, SHTM 06." },
      { key: "del.electrical_strategic_brief", label: "Strategic brief & project outcomes (clinical resilience, continuity of supply, future capacity)" },
      { key: "del.electrical_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.electrical_project_brief", label: "Project Brief (scope of electrical works, resilience requirements, critical areas)", description: "SHTM 00, SHTM 06." },
      { key: "del.electrical_condition_surveys", label: "Existing system condition surveys (LV/HV distribution, switchgear, UPS, IPS, generators, lighting, earthing)", description: "SHTM 06 series." },
      { key: "del.electrical_load_capacity_analysis", label: "Load assessment and residual capacity analysis", description: "SHTM 06." },
      { key: "del.electrical_expanded_risk_register", label: "Initial risk register (loss of supply, critical areas, temporary power, discrimination)", description: "SHTM 00, CDM 2015." },
      { key: "del.electrical_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.electrical_stakeholder_engagement", label: "Engagement with clinical, estates and IT stakeholders", description: "SHTM 00." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.electrical_concept_design_report", label: "Concept design options (resilience levels, UPS/IPS strategy, generator provision, distribution philosophy)", description: "SHTM 06." },
      { key: "del.electrical_outline_strategy", label: "Outline electrical strategy (primary/secondary supplies, essential vs non-essential)", description: "SHTM 06 series." },
      { key: "del.electrical_preliminary_single_line_diagrams", label: "Preliminary single-line diagrams and load schedules", description: "SHTM 06." },
      { key: "del.electrical_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.electrical_concept_risk_assessment", label: "Design risk assessment (high-level only)", description: "CDM 2015, SHTM 00, SHTM 06." },
      { key: "del.electrical_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination (the running mid-flight example)
    [
      { key: "del.electrical_coordinated_layout_drawings", label: "Coordinated design (switch rooms, distribution routes, generator location, UPS rooms, containment)", description: "SHTM 06." },
      { key: "del.electrical_mep_structural_coordination", label: "Spatial coordination with structure, mechanical services, fire compartments and other systems" },
      { key: "del.electrical_fire_compartmentation_assessment", label: "Fire compartmentation and ventilation impact assessment", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.electrical_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary supply strategy (principles only)" },
      { key: "del.electrical_emergency_power_confirmation", label: "Confirmation of emergency power provisions for critical areas — high-level temporary arrangements strategy only", description: "SHTM 06.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.electrical_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received. Everything up to and
    // including del.electrical_pre_contract_hold_point is
    // pre-appointment work; del.electrical_post_appointment_full_design
    // is the only item that happens after a contractor is appointed,
    // though it's still recorded under this same Gate 4.
    [
      { key: "del.electrical_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.electrical_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.electrical_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.electrical_discrimination_selectivity_studies", label: "Discrimination / selectivity studies and protection coordination", description: "SHTM 06, BS 7671." },
      { key: "del.electrical_ups_ips_autonomy_design", label: "UPS / IPS autonomy and configuration design", description: "SHTM 06." },
      { key: "del.electrical_generator_sizing_fuel_control", label: "Standby generator sizing, fuel storage and control philosophy", description: "SHTM 06." },
      { key: "del.electrical_emergency_lighting_design", label: "Emergency lighting design", description: "BS 5266, Firecode." },
      { key: "del.electrical_earthing_bonding_lightning_design", label: "Earthing, bonding and lightning protection design", description: "BS 7671, SHTM 06." },
      { key: "del.electrical_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.electrical_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.electrical_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 06.", bypassAuthority: "SRO" },
      { key: "del.electrical_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.electrical_stakeholder_design_approval", label: "Stakeholder review and approval of design", description: "SHTM 06.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.electrical_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.electrical_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.electrical_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.electrical_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.electrical_method_statements_temp_power", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary power arrangements", description: "Critical for continuity — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.electrical_material_equipment_certificates", label: "Material & equipment certificates (switchgear, UPS, generators, cable, luminaires)", description: "BS 7671, manufacturer certification." },
      { key: "del.electrical_permit_to_work_isolation", label: "Permit-to-Work and Isolation Certificates for every switch-out", bypassAuthority: "AUTHORISED_PERSON_ELECTRICAL" },
      { key: "del.electrical_distribution_equipment_install", label: "Installation of distribution equipment, containment, cabling, UPS, generators and lighting", description: "SHTM 06, BS 7671." },
      { key: "del.electrical_earthing_bonding_install_records", label: "Earthing and bonding installation records", description: "BS 7671." },
      { key: "del.electrical_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.electrical_temp_supply_hybrid_arrangements", label: "Temporary supply / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.electrical_decommissioning_records", label: "Decommissioning & strip-out records of redundant electrical equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.electrical_full_testing_commissioning_records", label: "Full testing & commissioning records (insulation resistance, continuity, earth loop, RCD, functional, load bank tests)", description: "SHTM 06, BS 7671." },
      { key: "del.electrical_discrimination_protection_proving", label: "Discrimination / protection proving records", description: "SHTM 06." },
      { key: "del.electrical_ups_ips_autonomy_changeover_tests", label: "UPS / IPS autonomy and changeover tests", description: "Critical life-safety verification, per SHTM 06 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.electrical_generator_load_changeover_tests", label: "Generator load and changeover tests", description: "Critical life-safety verification, per SHTM 06 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.electrical_emergency_lighting_duration_tests", label: "Emergency lighting duration and functional tests", description: "Critical means-of-escape verification, per BS 5266 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.electrical_eic_certificates", label: "As-fitted drawings, single-line diagrams, schedules and certification (Electrical Installation Certificate, etc.)", description: "BS 7671, SHTM 06.", bypassAuthority: "SRO" },
      { key: "del.electrical_om_manuals_logbooks", label: "Comprehensive O&M manuals and log books", description: "SHTM 06." },
      { key: "del.electrical_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with BS 7671, SHTM 06 series and manufacturer requirements" },
      { key: "del.electrical_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.electrical_training_records", label: "Training & demonstration records for estates staff", description: "SHTM 06." },
      { key: "del.electrical_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.electrical_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.electrical_formal_acceptance", label: "Formal client / Responsible Person acceptance", description: "SHTM 06.", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.electrical_soft_landings_review", label: "Soft landings / post-occupancy review (performance, resilience, energy, user feedback)", description: "SHTM 00." },
      { key: "del.electrical_updated_maintenance_regime", label: "Updated maintenance regime, inspection schedules and emergency procedures", description: "SHTM 06." },
      { key: "del.electrical_ongoing_statutory_inspection", label: "Ongoing statutory inspection and testing records", description: "Electricity at Work Regulations.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.electrical_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.electrical_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];

  await createDeliverableTemplates(meStageTemplates, meDeliverableDefsByStage);

  // Domestic Hot & Cold Water Systems Replacement — formerly "Calorifier
  // & Hot Water System Replacement". Overwritten in place 21 Aug 2026
  // with the combined content supplied (Domestic hot and cold
  // water systems.docx), which deliberately treats hot and cold
  // domestic water as one discipline (storage, distribution, TMVs,
  // temperature control, Legionella) — merging in the separate Cold
  // Water Storage & Distribution Replacement template below, which is
  // now retired (matchKeywords cleared to `[]`; listMatchableTemplates'
  // query excludes any Template with empty matchKeywords from every
  // provisioning dropdown entirely, so it can no longer be selected,
  // while its own live demo project keeps its already-instantiated Gate data
  // either way). Same reasoning as the Electrical Services merge
  // above: still genuinely distinct from drainage/foul water (a
  // flow-path/falls problem, not a storage/supply one) and from the
  // Boiler & Heating Plant Replacement template's LTHW space-heating
  // circuit, which is a different system despite also being "hot
  // water" in a loose sense. Grounded in SHTM 04-01 (Parts A–G), HSE
  // ACOP L8 / HSG 274, BS EN 806, BS 8558, Scottish Water Byelaws,
  // CDM 2015.
  //
  // Updated to V2.0 (Domestic hot and cold water systems_V2.0.docx,
  // 24 Aug 2026): the same Pre-Contract Hold Point governance rule
  // added to Boiler & Heating Plant Replacement (see that template's
  // comment for the full rationale) — no contractor appointment or
  // Gate 5 work until two competitive quotes, written PFI Board/NHS
  // lifecycle cost approval, and written WSG approval of a formal SBAR
  // are all in. Unlike Boiler, this template already had a live demo
  // project instantiated from it (#20777) by the time V2.0 landed, so
  // the DB-side migration script updated existing DeliverableTemplate
  // rows in place (relabelling del.water_full_technical_design_package
  // into the new pre-appointment "developed design" item, and
  // del.water_detailed_specifications into "Detailed Scope of Works")
  // rather than deleting anything — Deliverable.templateId has no
  // cascade, so deleting a DeliverableTemplate with a live instance
  // would have FK-failed. del.water_wsg_design_approval was similarly
  // repurposed into the new SBAR-submission step, with a genuinely new
  // del.water_wsg_written_approval item added for the approval itself.
  // Gate 6 already had "Formal Water Safety Group acceptance and
  // updated Water Safety Plan" from V1 — unlike Boiler, no Gate 7 → 6
  // move was needed here.
  const waterTemplate = await db.template.create({
    data: {
      key: "template.health.domestic_hot_cold_water_replacement",
      name: "Domestic Hot & Cold Water Systems Replacement",
      description:
        "Domestic hot and cold water system replacement or major upgrade — storage (calorifiers, break/storage tanks), distribution, pumping, temperature control, TMVs, monitoring and Legionella/water-safety measures, in an operational healthcare environment. Not drainage/foul water (see Drainage & Foul Water System Replacement) and not the LTHW space-heating circuit (see Boiler & Heating Plant Replacement) — both are different systems even though they also involve water or heat.",
      matchKeywords: ["calorifier", "hot water storage", "hot water cylinder", "Legionella", "hot water", "water safety", "water heater", "cold water tank", "water storage tank", "inlet main", "water filtration", "cold water storage", "break tank", "cistern", "cold water main", "water inlet", "TMV", "domestic water", "water distribution"],
      sectorVariantId: health.id,
    },
  });
  const waterStageTemplates = await createStageAndGateTemplates(waterTemplate.id);

  const waterDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.water_business_case", label: "Business case / need identification (system age, Legionella risk, temperature performance, resilience, water quality)", description: "SHTM 00, SHTM 04-01." },
      { key: "del.water_strategic_brief", label: "Strategic brief & project outcomes (patient safety, Legionella control, continuity of supply, energy efficiency)" },
      { key: "del.water_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 04-01." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.water_project_brief", label: "Project Brief (scope of hot & cold water works, temperature regime, TMV strategy, monitoring requirements)", description: "SHTM 00, SHTM 04-01." },
      { key: "del.water_condition_surveys", label: "Existing system condition surveys (storage, distribution, pumps, calorifiers, TMVs, dead legs, water quality baseline)", description: "SHTM 04-01 Part A & B." },
      { key: "del.water_risk_assessment_review", label: "Water risk assessment review and gap analysis", description: "SHTM 04-01, HSE ACOP L8." },
      { key: "del.water_expanded_risk_register", label: "Initial risk register (Legionella, loss of supply, temperature control, materials)", description: "SHTM 00, CDM 2015, SHTM 04-01." },
      { key: "del.water_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.water_wsg_engagement", label: "Early awareness engagement with Water Safety Group (WSG)", description: "SHTM 04-01 Part B — flags the project to WSG ahead of the formal SBAR submitted at Gate 4." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.water_concept_design_report", label: "Concept design options (storage vs instantaneous, central vs local, return systems, TMV strategy, monitoring)", description: "SHTM 04-01 Part A." },
      { key: "del.water_outline_system_strategy", label: "Outline water system strategy (temperatures, flow rates, resilience, stagnation prevention)", description: "SHTM 04-01 Part A." },
      { key: "del.water_preliminary_schematics_demand", label: "Preliminary schematics and load/demand assessment", description: "SHTM 04-01." },
      { key: "del.water_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.water_concept_risk_assessment", label: "Design risk assessment (including Legionella)", description: "CDM 2015, SHTM 00, SHTM 04-01." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.water_coordinated_layout_drawings", label: "Coordinated design (plant locations, pipe routes, storage vessels, pump rooms, access for maintenance)", description: "SHTM 04-01 Part A." },
      { key: "del.water_mep_structural_coordination", label: "Spatial coordination with structure, electrical, ventilation and other services" },
      { key: "del.water_fire_structural_assessment", label: "Fire compartmentation and structural impact assessment for pipework and storage vessel penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.water_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary supply strategy (principles only)" },
      { key: "del.water_monitoring_sampling_confirmation", label: "Confirmation of temperature monitoring and sampling point strategy", description: "SHTM 04-01.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design. Contains the Pre-Contract Hold Point
    // (V2.0) — same shape as the Boiler template's Gate 4: everything
    // up to and including del.water_pre_contract_hold_point is
    // pre-appointment "sufficient for accurate pricing" work;
    // del.water_post_appointment_full_design is the only item that
    // happens after a contractor is appointed, though it's still
    // recorded under this same Gate 4.
    [
      { key: "del.water_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.water_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.water_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.water_treatment_dosing_temp_strategy", label: "Water treatment / chemical dosing / temperature control strategy", description: "SHTM 04-01 Part A." },
      { key: "del.water_legionella_control_measures", label: "Legionella control measures and schematic risk assessment update", description: "SHTM 04-01, HSE ACOP L8." },
      { key: "del.water_monitoring_sampling_bms_design", label: "Temperature monitoring, sampling points and BMS integration design", description: "SHTM 04-01." },
      { key: "del.water_electrical_design", label: "Electrical design associated with pumps and controls", description: "SHTM 06 series." },
      { key: "del.water_byelaws_compliance_info", label: "Building Regulations / Water Byelaws compliance information", description: "Scottish Water Byelaws.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.water_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 04-01.", bypassAuthority: "SRO" },
      { key: "del.water_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.water_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — one of three conditions for the Pre-Contract Hold Point below." },
      { key: "del.water_sbar_submission_to_wsg", label: "Prepare and submit formal SBAR to the Water Safety Group", description: "Covering proposed works, water treatment strategy, risk assessment and temporary arrangements. SHTM 04-01 Part B." },
      { key: "del.water_wsg_written_approval", label: "Obtain written WSG approval / endorsement", description: "SHTM 04-01 — one of three conditions for the Pre-Contract Hold Point below.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.water_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until both PFI/NHS cost approval and Water Safety Group approval are received", description: "Clear commercial & governance cut-off. Requires the written WSG approval and a formal PFI Board/NHS lifecycle cost approval to both be in place before Gate 5 can begin.", bypassAuthority: "SRO" },
      { key: "del.water_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.water_method_statements_temp_supply", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary water supply arrangements", description: "Critical for continuity — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_material_equipment_certificates", label: "Material & equipment certificates (pipework, fittings, vessels, TMVs — WRAS approved where required)", description: "SHTM 04-01, Water Byelaws." },
      { key: "del.water_permit_to_work_isolation", label: "Permit-to-Work and Isolation Certificates for every zone/tank shutdown", bypassAuthority: "AUTHORISED_PERSON_ELECTRICAL" },
      { key: "del.water_pipework_storage_pump_install", label: "Installation of pipework, storage, pumps, TMVs, insulation and controls", description: "SHTM 04-01 Part A." },
      { key: "del.water_jointing_flushing_disinfection_records", label: "Jointing, flushing, cleaning and disinfection records", description: "Critical Legionella control step, per SHTM 04-01 Part D — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.water_sampling_microbiological_testing", label: "Water sampling and microbiological testing records (pre- and post-disinfection)", description: "Critical Legionella control step, per SHTM 04-01 Parts C & D — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.water_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.water_temp_supply_hybrid_arrangements", label: "Temporary supply / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_decommissioning_records", label: "Decommissioning & strip-out records of redundant water systems", description: "SHTM 04-01." },
    ],
    // Gate 6 — Handover
    [
      { key: "del.water_full_commissioning_validation_records", label: "Full commissioning & validation records (temperatures, flow rates, pressures, TMV performance, pump duties)", description: "SHTM 04-01 Part A." },
      { key: "del.water_final_disinfection_clearance_certs", label: "Final disinfection and microbiological clearance certificates", description: "Critical Legionella control step, per SHTM 04-01 Part D — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.water_temperature_profiling_balancing", label: "Temperature profiling and balancing records", description: "SHTM 04-01." },
      { key: "del.water_as_fitted_drawings", label: "As-fitted drawings, schematics, valve schedules and sampling point registers", description: "SHTM 04-01 Part A." },
      { key: "del.water_om_manuals_written_scheme", label: "Comprehensive O&M manuals, including Written Scheme of Control", description: "SHTM 04-01 Part B & G." },
      { key: "del.water_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with SHTM 04-01, HSE ACOP L8 / HSG 274 and Water Byelaws" },
      { key: "del.water_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.water_training_records", label: "Training & demonstration records for estates and clinical staff", description: "SHTM 04-01 Part B." },
      { key: "del.water_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.water_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.water_wsg_acceptance_updated_plan", label: "Formal Water Safety Group acceptance and updated Water Safety Plan", description: "SHTM 04-01.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.water_soft_landings_review", label: "Soft landings / post-occupancy review (temperature performance, water quality, user feedback)", description: "SHTM 00." },
      { key: "del.water_updated_water_safety_plan", label: "Updated Water Safety Plan / Written Scheme of Control", description: "SHTM 04-01 Parts B & G." },
      { key: "del.water_ongoing_monitoring_sampling_regime", label: "Ongoing monitoring, sampling and maintenance regime", description: "SHTM 04-01 Part B." },
      { key: "del.water_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.water_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(waterStageTemplates, waterDeliverableDefsByStage);

  // Drainage & Foul Water System Replacement — below-ground/foul
  // drainage, soil and waste pipework: flow paths, falls, and venting,
  // not water safety/Legionella (that's the Calorifier template above).
  // Added after a live "Main Kitchen drainage replacement" project got
  // wrongly matched to the calorifier template for lack of anywhere
  // better to go (confirmed 19 Aug 2026). Grounded in BS EN
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
        "Below-ground and foul drainage replacement — soil/waste pipework, gullies, manholes, and flow-path/fall reconfiguration, in an operational healthcare environment. Not water storage/supply — see Domestic Hot & Cold Water Systems Replacement for that. Not above-ground stacks/floor drains within the building — see Above-ground Drainage & Public Health Systems Replacement for that.",
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
      { key: "del.drainage_detailed_project_plan", label: "High Level Project Plan" },
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
      { key: "del.drainage_fire_structural_assessment", label: "Fire compartmentation and structural impact assessment for below-slab penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
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

  // Cold Water Storage & Distribution Replacement — RETIRED 21 Aug
  // 2026: merged into Domestic Hot & Cold Water Systems Replacement
  // above, which now covers this scope combined with hot water/
  // calorifiers, per the supplied source document treating both as
  // one discipline. matchKeywords cleared to `[]` so listMatchableTemplates'
  // `where: { matchKeywords: { isEmpty: false } }` query excludes this
  // Template from every provisioning dropdown entirely — it can never be
  // selected again. Row (and its DeliverableTemplates) kept, not
  // deleted: Project.templateId is a required FK, and the live "Main
  // Water Tank Replacement" demo project (#30001) below still
  // references this Template's id — deleting it would break that
  // project. Original content/history preserved below for the record.
  const coldWaterTemplate = await db.template.create({
    data: {
      key: "template.health.cold_water_storage_replacement",
      name: "Cold Water Storage & Distribution Replacement (retired — see Domestic Hot & Cold Water Systems Replacement)",
      description:
        "RETIRED 21 Aug 2026 — merged into Domestic Hot & Cold Water Systems Replacement. Kept only so project #30001 (created before the merge) keeps a valid templateId; not matchable by new projects (matchKeywords is empty).",
      matchKeywords: [],
      sectorVariantId: health.id,
    },
  });
  const coldWaterStageTemplates = await createStageAndGateTemplates(coldWaterTemplate.id);

  const coldWaterDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.coldwater_strategic_brief", label: "Strategic Brief — condition of existing inlet mains/storage tanks and options appraisal" },
      { key: "del.coldwater_high_level_risk_register", label: "High-level Risk Register — water supply continuity and cross-contamination focus" },
      { key: "del.coldwater_detailed_project_plan", label: "High Level Project Plan" },
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
      { key: "del.coldwater_fire_structural_assessment", label: "Fire compartmentation and structural impact assessment for tank room penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
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
      { key: "del.coldwater_permit_to_work_isolation", label: "Permit-to-Work and isolation certificates for every main/tank shutdown", bypassAuthority: "AUTHORISED_PERSON_ELECTRICAL" },
      { key: "del.coldwater_progress_test_records", label: "Daily and shutdown progress / test records" },
      { key: "del.coldwater_temp_supply_reinstatement", label: "Temporary water supply and reinstatement records after each shutdown" },
      { key: "del.coldwater_as_installed_drawings_progressive", label: "Progressive as-installed drawings" },
      { key: "del.coldwater_disinfection_evidence", label: "Evidence of disinfection/chlorination and sampling of new tanks/mains before reconnection", description: "Critical Legionella control step — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.coldwater_snagging_list", label: "Snagging list and resolution tracker" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.coldwater_hygiene_commissioning_cert", label: "Water hygiene commissioning certificate — disinfection, flushing, and sampling results", bypassAuthority: "AUTHORISED_PERSON_WATER" },
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

  // Lighting & Electrical Distribution Replacement — luminaire/LED
  // retrofit, lighting circuits, and emergency/escape lighting: BS 5266
  // (emergency lighting) and general lighting design are a genuinely
  // different discipline from standby power (UPS/generators), so this
  // isn't the M&E template even though both are "electrical". Added
  // after a live LED corridor-lighting project got wrongly matched to
  // M&E Systems Replacement for lack of anywhere better to go — its own
  // stored reasoning says "the others are all water/drainage" (confirmed
  // 20 Aug 2026). Grounded in BS 7671 (IET Wiring
  // Regulations), BS 5266 (emergency lighting), and BS EN 12464-1
  // (lighting of work places).
  const lightingTemplate = await db.template.create({
    data: {
      key: "template.health.lighting_replacement",
      name: "Lighting & Electrical Distribution Replacement",
      description:
        "Lighting and electrical distribution replacement — luminaire/LED retrofit, lighting circuits, and emergency/escape lighting, in an operational healthcare environment. Not standby power/switchgear/distribution resilience (UPS, generators, LV distribution) — see Electrical Services Replacement for that, even though that template also covers emergency lighting design as part of overall resilience.",
      matchKeywords: ["LED", "lighting", "luminaire", "light fitting", "emergency lighting", "corridor lighting", "lighting upgrade", "lighting retrofit"],
      sectorVariantId: health.id,
    },
  });
  const lightingStageTemplates = await createStageAndGateTemplates(lightingTemplate.id);

  const lightingDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.lighting_strategic_brief", label: "Strategic Brief — condition of existing lighting/luminaires and options appraisal" },
      { key: "del.lighting_high_level_risk_register", label: "High-level Risk Register — means-of-escape and clinical continuity focus" },
      { key: "del.lighting_detailed_project_plan", label: "High Level Project Plan" },
      { key: "del.lighting_zone_confirmation", label: "Confirmation of affected lighting circuits/emergency lighting zones against BS 5266", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.lighting_outline_business_case", label: "Outline Business Case / funding confirmation, including energy-saving case" },
      { key: "del.lighting_stakeholder_map", label: "Initial Stakeholder Map, including Fire Safety and Estates" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.lighting_project_brief", label: "Project Brief — full scope, constraints, success criteria, out-of-hours working rules" },
      { key: "del.lighting_survey", label: "Complete lighting survey and existing luminaire/circuit condition report" },
      { key: "del.lighting_preliminary_programme", label: "Preliminary Programme, including phased corridor-by-corridor working strategy" },
      { key: "del.lighting_hs_haiscribe", label: "Initial Health & Safety Strategy and HAI-SCRIBE assessment", description: "HAI-SCRIBE (SHFN 30) infection-risk assessment for construction/refurbishment in a healthcare setting.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.lighting_expanded_risk_register", label: "Expanded Risk Register" },
      { key: "del.lighting_detailed_project_plan_updated_briefing", label: "Updated Detailed Project Plan — full scope, methodology and resourcing" },
      { key: "del.lighting_stakeholder_engagement_plan", label: "Stakeholder Engagement Plan and early consultation records" },
      { key: "del.lighting_escape_continuity_confirmation", label: "Confirmation of emergency/escape lighting continuity arrangements during works", bypassAuthority: "SRO" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.lighting_concept_design_report", label: "Concept Design Report — luminaire selection, lighting layout, control strategy" },
      { key: "del.lighting_outline_luminaire_spec", label: "Outline LED luminaire and control gear specification" },
      { key: "del.lighting_preliminary_method_statements", label: "Preliminary Method Statements and high-level RAMS" },
      { key: "del.lighting_concept_layout_drawings", label: "Concept lighting layout drawings — lux levels, emergency lighting zones" },
      { key: "del.lighting_updated_programme_sections", label: "Updated Programme showing phased corridor sections" },
      { key: "del.lighting_stakeholder_feedback_log", label: "Stakeholder consultation feedback log" },
      { key: "del.lighting_concept_risk_assessment", label: "Concept-level Risk Assessment" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.lighting_coordinated_layout_drawings", label: "Coordinated lighting layout / containment drawings" },
      { key: "del.lighting_cable_routing_containment", label: "Cable routing and containment proposals" },
      { key: "del.lighting_access_delivery_strategy", label: "Access, delivery and temporary works strategy" },
      { key: "del.lighting_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for cable routing penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.lighting_updated_risk_register_spatial", label: "Updated Risk Register and Method Statements reflecting spatial constraints" },
      { key: "del.lighting_detailed_project_plan_updated_spatial", label: "Updated Detailed Project Plan reflecting spatial constraints" },
      { key: "del.lighting_circuit_capacity_confirmation", label: "Confirmation that existing circuits/distribution boards can support new LED loads", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.lighting_full_technical_design_package", label: "Full Technical Design Package — detailed lighting drawings, schematics, specifications" },
      { key: "del.lighting_design_calculations", label: "Design calculations — lux levels, glare, emergency lighting duration/coverage to BS 5266" },
      { key: "del.lighting_spec_compliant", label: "Complete luminaire and control gear specification compliant with BS 7671 and BS EN 12464-1", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.lighting_installation_method_statements", label: "Detailed Installation Method Statements and RAMS" },
      { key: "del.lighting_compliance_matrix", label: "Compliance Matrix — mapping against BS 7671, BS 5266, BS EN 12464-1, CDM 2015", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.lighting_pre_construction_information", label: "Pre-Construction Information (CDM)" },
      { key: "del.lighting_procurement_package", label: "Tender or direct-award procurement package" },
      { key: "del.lighting_updated_programme_resource_plan", label: "Updated Programme and Resource Plan" },
      { key: "del.lighting_design_risk_assessment_signed", label: "Design Risk Assessment signed by the Designer", bypassAuthority: "SRO" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.lighting_manufacturer_drawings_cert", label: "Manufacturer drawings and product certification for luminaires/control gear" },
      { key: "del.lighting_delivery_storage_records", label: "Delivery and secure storage records" },
      { key: "del.lighting_construction_phase_plan", label: "Approved Construction Phase Plan / Method Statements for each corridor section" },
      { key: "del.lighting_permit_to_work_isolation", label: "Permit-to-Work and isolation certificates for every circuit shutdown", bypassAuthority: "AUTHORISED_PERSON_ELECTRICAL" },
      { key: "del.lighting_progress_test_records", label: "Daily and section progress / test records" },
      { key: "del.lighting_temp_escape_arrangements", label: "Temporary lighting and means-of-escape arrangements during works", bypassAuthority: "SRO" },
      { key: "del.lighting_as_installed_drawings_progressive", label: "Progressive as-installed drawings" },
      { key: "del.lighting_emergency_test_evidence", label: "Evidence of emergency lighting duration testing before section handover", description: "Critical means-of-escape verification step — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.lighting_snagging_list", label: "Snagging list and resolution tracker" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.lighting_emergency_commissioning_cert", label: "Emergency lighting commissioning certificate — duration/illuminance test to BS 5266", bypassAuthority: "SRO" },
      { key: "del.lighting_commissioning_validation_reports", label: "Full Commissioning and Validation Reports — lux level verification, control system testing" },
      { key: "del.lighting_as_built_drawings", label: "As-built drawings and circuit schedules" },
      { key: "del.lighting_om_manuals", label: "Complete Operation & Maintenance (O&M) Manuals, including lamp/luminaire replacement schedule" },
      { key: "del.lighting_eic_certificates", label: "Electrical Installation Certificate(s) (EIC) issued under BS 7671", bypassAuthority: "SRO" },
      { key: "del.lighting_training_records", label: "Training records for Estates staff" },
      { key: "del.lighting_final_risk_assessment_closed", label: "Final Risk Assessment and closed-out RAMS" },
      { key: "del.lighting_asset_data_cafm", label: "Asset data uploaded to CAFM / asset register" },
      { key: "del.lighting_acceptance_to_service_certificate", label: 'Formal "Acceptance to Service" certificate signed by the Client Authority', bypassAuthority: "SRO" },
      { key: "del.lighting_defects_liability_schedule", label: "Defects Liability Schedule" },
    ],
    // Gate 7 — Use
    [
      { key: "del.lighting_defects_monitoring_reports", label: "Defects Liability monitoring reports" },
      { key: "del.lighting_lessons_learned_report", label: "Final Lessons Learned report" },
      { key: "del.lighting_updated_ppm_schedules", label: "Updated Planned Preventative Maintenance (PPM) schedules, including emergency lighting testing regime" },
      { key: "del.lighting_end_of_defects_certificate", label: "End-of-Defects Certificate (if applicable)" },
    ],
  ];
  await createDeliverableTemplates(lightingStageTemplates, lightingDeliverableDefsByStage);

  // ── 6th Template: Boiler & Heating Plant Replacement — LTHW/heating
  // plant (combustion, dual-fuel boilers, heating circuit), distinct
  // from domestic hot water storage/calorifiers (see Calorifier & Hot
  // Water System Replacement) and cold water storage. Content supplied
  // (Boiler_template.docx, 21 Aug 2026): a 3x 7MW dual-fuel
  // boiler replacement with temporary boilers for continuity of
  // heating. Grounded in SHTM 00, SHTM 04-01 (Parts A/B/D/E/G — LTHW
  // closed-system water safety), SHTM 06-01, CDM 2015, HSE ACOP L8 /
  // HSG 274, and PSSR. bypassAuthority follows the same discipline
  // split as every other template: isolation/hot-tapping of the LTHW
  // heating circuit is AUTHORISED_PERSON_VENTILATION (Heating &
  // Ventilation AP), not Water AP — confirmed 21 Aug 2026,
  // there is no separate "Gas AP" in the SHTM/HTM scheme (fuel gas/oil
  //
  // Updated to V2.0 (Boiler_template_V2.0.docx, 24 Aug 2026): the
  // source document added a "Pre-Contract Hold Point" governance rule
  // inside Gate 4 — no contractor appointment and no Gate 5 works may
  // start until (a) a minimum of two competitive quotes, (b) written
  // PFI Board/NHS lifecycle cost approval, and (c) written Water
  // Safety Group approval of a formal SBAR are all in place. Modelled
  // as five new Gate 4 deliverables (two competitive quotes, SBAR
  // submission, WSG written approval, PFI/NHS submission) plus the
  // hold point itself as a single SRO-tiered deliverable — this app has
  // no cross-deliverable dependency enforcement, so the hold point's
  // evidence is the PM/SRO's own written confirmation that both
  // approvals landed, same trust model as every other deliverable.
  // WSG written approval reuses COMPLIANCE_OFFICER, matching the
  // existing del.water_wsg_acceptance_updated_plan precedent in the
  // Domestic Hot & Cold Water template. Gate 4's old single
  // "full technical design drawings" item split in two: a pre-hold-point
  // "developed design sufficient for pricing" item (not full
  // construction-issue drawings) and a post-hold-point "complete full
  // technical drawings" item — matches V2's own pre/post-appointment
  // split. Also added: early WSG awareness engagement at Gate 1, and
  // moved "Updated Water Safety Plan" from Gate 7 (Use) to Gate 6
  // (Handover) as a mandatory WSG submission rather than the old
  // "if required" wording — both explicit in V2.
  // competency is the external Gas Safe Register/OFTEC schemes, not a
  // Trust-appointed AP/AE), so gas/oil connection items stay untiered
  // (PM-level, evidenced via contractor certification) rather than
  // inventing a bypass authority that doesn't exist in real appointment
  // schemes. Fire compartmentation item added for consistency with
  // every other template (21 Aug 2026) even though the source
  // document didn't list one — flue/plinth penetrations plausibly
  // affect compartmentation the same way cable routing or pipework
  // penetrations do elsewhere in the library.
  const boilerTemplate = await db.template.create({
    data: {
      key: "template.health.boiler_heating_plant_replacement",
      name: "Boiler & Heating Plant Replacement",
      description:
        "Boiler and heating plant replacement — LTHW (low temperature hot water) heating circuit, dual-fuel boilers, combustion/flue systems, and associated plant, in an operational healthcare environment. Not domestic hot/cold water — see Domestic Hot & Cold Water Systems Replacement for that.",
      matchKeywords: [
        "boiler",
        "boiler plant",
        "heating plant",
        "LTHW",
        "low temperature hot water",
        "dual-fuel boiler",
        "combustion",
        "flue",
        "gas boiler",
        "oil boiler",
        "plant room",
        "heating system replacement",
      ],
      sectorVariantId: health.id,
    },
  });
  const boilerStageTemplates = await createStageAndGateTemplates(boilerTemplate.id);

  const boilerDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.boiler_business_case", label: "Business case (valve isolation failure + boiler condition / end-of-life risk)", description: "SHTM 00 — Policies and principles." },
      { key: "del.boiler_strategic_brief", label: "Strategic brief & outcomes (continuous heating, full resilience, boiler replacement)" },
      { key: "del.boiler_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.boiler_project_brief", label: "Updated Project Brief (valve replacement + full boiler replacement)" },
      { key: "del.boiler_plant_condition_surveys", label: "Existing plant condition surveys (boilers, flues, gas/oil systems, foundations)", description: "SHTM 00, SHTM 04-01." },
      { key: "del.boiler_water_quality_baseline_sampling", label: "Initial water quality baseline sampling", description: "SHTM 04-01 Part A." },
      { key: "del.boiler_expanded_risk_register", label: "Risk register (heating continuity, temporary plant, gas/fuel, combustion, structural)", description: "SHTM 00, CDM 2015." },
      { key: "del.boiler_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.boiler_wsg_early_engagement", label: "Early awareness engagement with Water Safety Group", description: "SHTM 04-01 Part B — flags the project to WSG ahead of the formal SBAR submitted at Gate 4." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.boiler_concept_design_report", label: "Concept options for boiler replacement strategy (capacity, dual-fuel, efficiency, phasing)" },
      { key: "del.boiler_temporary_boiler_strategy", label: "Temporary boiler strategy (sizing, location, connections) to cover permanent boiler changeover", description: "SHTM 00, SHTM 04-01." },
      { key: "del.boiler_outline_mechanical_strategy", label: "Outline mechanical services strategy (new boilers, headers, valves, pumps, filtration, corrosion monitoring)", description: "SHTM 04-01 Part A." },
      { key: "del.boiler_flue_combustion_air_strategy", label: "Preliminary flue / combustion air / gas & oil supply strategy" },
      { key: "del.boiler_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.boiler_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.boiler_coordinated_layout_drawings", label: "Coordinated layout (new boiler positions, temporary boilers, pipework, flues, access)" },
      { key: "del.boiler_mep_structural_coordination", label: "Spatial coordination of mechanical, electrical, BMS, structural supports / plinths", description: "SHTM 06-01." },
      { key: "del.boiler_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for flue and plant penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.boiler_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing strategy (principles only)" },
      { key: "del.boiler_temp_boiler_siting_confirmation", label: "Confirmation of temporary boiler siting and permanent boiler plantroom arrangement", description: "High-level strategy only at this stage — no detailed method statements; those follow contractor appointment after the Gate 4 Pre-Contract Hold Point.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design. Contains the Pre-Contract Hold Point
    // (V2.0): everything up to and including
    // del.boiler_pre_contract_hold_point is pre-appointment "sufficient
    // for accurate pricing" work; del.boiler_post_appointment_full_design
    // is the only item that happens after a contractor is appointed,
    // though it's still recorded under this same Gate 4.
    [
      { key: "del.boiler_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.boiler_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.boiler_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.boiler_water_treatment_strategy", label: "Water treatment / chemical dosing / corrosion inhibitor strategy", description: "SHTM 04-01 Part A, BSRIA water treatment guidance." },
      { key: "del.boiler_bms_control_philosophy", label: "BMS control philosophy, sequences & point schedules (new boilers + retained systems)", description: "SHTM 06-01." },
      { key: "del.boiler_electrical_design", label: "Electrical design (boiler power, controls, temporary plant)", description: "SHTM 06-01." },
      { key: "del.boiler_flue_gas_oil_design", label: "Flue system design, combustion air, gas & oil supply modifications" },
      { key: "del.boiler_structural_support_design", label: "Structural / plinth / support design information" },
      { key: "del.boiler_thermal_insulation_spec", label: "Thermal insulation specification" },
      { key: "del.boiler_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.boiler_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.boiler_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 00.", bypassAuthority: "SRO" },
      { key: "del.boiler_tender_documentation", label: "Tender documentation / updated Scope of Works / pricing schedules" },
      { key: "del.boiler_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — one of three conditions for the Pre-Contract Hold Point below." },
      { key: "del.boiler_sbar_submission_to_wsg", label: "Prepare and submit formal SBAR to the Water Safety Group", description: "Covering proposed works, water treatment strategy, risk assessment and temporary arrangements. SHTM 04-01 Part B." },
      { key: "del.boiler_wsg_written_approval", label: "Obtain written WSG approval / endorsement", description: "SHTM 04-01 — one of three conditions for the Pre-Contract Hold Point below.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.boiler_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.boiler_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until both PFI/NHS cost approval and Water Safety Group approval are received", description: "Clear commercial & governance cut-off. Requires the written WSG approval and a formal PFI Board/NHS lifecycle cost approval to both be in place before Gate 5 can begin.", bypassAuthority: "SRO" },
      { key: "del.boiler_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.boiler_method_statements", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary works designs", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.boiler_temp_boiler_installation_commissioning", label: "Temporary boiler installation, connection, load testing & commissioning certificates", description: "SHTM 00." },
      { key: "del.boiler_hot_tapping_isolation_records", label: "Hot tapping / isolation verification records for the LTHW heating circuit", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.boiler_new_boiler_installation", label: "New permanent boiler delivery, installation, flue connections, gas/oil connections" },
      { key: "del.boiler_material_equipment_certificates", label: "Material & equipment certificates (boilers, valves, pumps, filtration, pipework)", description: "SHTM 04-01." },
      { key: "del.boiler_water_sampling_results", label: "Water sampling results (pre-, interim- and post-works)", description: "SHTM 04-01 Parts A/B/C." },
      { key: "del.boiler_flushing_cleaning_dosing_records", label: "System flushing, cleaning, chemical treatment & inhibitor dosing records", description: "Critical water-treatment step for a closed LTHW system, per SHTM 04-01 Part D — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.boiler_headers_valves_pumps_filtration_install", label: "Installation of new headers, valves, pumps, side-stream filtration & corrosion monitoring", description: "SHTM 04-01." },
      { key: "del.boiler_bms_installation_testing", label: "BMS installation, wiring, point-to-point testing & sequence proving", description: "SHTM 06-01." },
      { key: "del.boiler_eic_certificates", label: "Electrical installation & test certificates (BS 7671)", description: "SHTM 06-01.", bypassAuthority: "SRO" },
      { key: "del.boiler_combustion_safety_interlock_testing", label: "Combustion, efficiency, emissions and safety interlock testing of new boilers", description: "Critical combustion-safety verification step before the boilers can be relied on — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.boiler_thermal_insulation_completion", label: "Thermal insulation completion" },
      { key: "del.boiler_progress_records_quality_log", label: "Progress records, quality inspections & change control log" },
      { key: "del.boiler_decommissioning_records", label: "Decommissioning records for existing boilers (safe isolation, strip-out)", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.boiler_full_system_commissioning_records", label: "Full system testing & commissioning records (new boilers, LTHW circuit, pumps, controls)", description: "SHTM 04-01 Part A." },
      { key: "del.boiler_performance_efficiency_test_certs", label: "Boiler performance / efficiency / emissions test certificates" },
      { key: "del.boiler_balancing_flow_verification", label: "Balancing / flow verification data", description: "SHTM 04-01." },
      { key: "del.boiler_as_fitted_drawings", label: "As-fitted drawings & schematics (boilers, valves, isolation points, filtration, corrosion monitoring)", description: "SHTM 04-01." },
      { key: "del.boiler_om_manuals", label: "Comprehensive O&M manuals (including new boilers, temporary plant removal records)", description: "SHTM 00, SHTM 04-01 Part B." },
      { key: "del.boiler_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions for new boilers, temporary boilers, valves and filtration equipment" },
      { key: "del.boiler_pssr_written_scheme", label: "PSSR written scheme of examination updates for the new boilers (pressure systems)", description: "Pressure Systems Safety Regulations 2000 — a boiler is a pressure system requiring a competent person's written scheme before use.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.boiler_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.boiler_training_records", label: "Training & demonstration records for Serco / estates staff (new boilers & isolation procedures)", description: "SHTM 00." },
      { key: "del.boiler_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.boiler_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.boiler_final_water_quality_report", label: "Final water quality, inhibitor residual & corrosion monitoring baseline report", description: "SHTM 04-01." },
      { key: "del.boiler_temp_boiler_decommissioning_certs", label: "Temporary boiler decommissioning & site removal certificates" },
      { key: "del.boiler_updated_water_safety_plan_handover", label: "Updated Water Safety Plan / Written Scheme submitted to WSG", description: "SHTM 04-01 Parts B & G.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.boiler_soft_landings_review", label: "Soft landings / post-occupancy review (boiler performance, isolation capability, water quality)", description: "SHTM 00." },
      { key: "del.boiler_ongoing_monitoring_regime", label: "Ongoing monitoring regime (side-stream filtration, corrosion coupons, boiler efficiency)", description: "SHTM 04-01 Part B." },
      { key: "del.boiler_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.boiler_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(boilerStageTemplates, boilerDeliverableDefsByStage);

  // ── 7th Template: Ventilation & Air Handling Systems Replacement —
  // AHUs, ductwork, fans, filters, controls, distinct from the LTHW
  // heating side of the same source document, which the Boiler &
  // Heating Plant Replacement template above already covers. Content
  // supplied (Heating&Ventillation.docx, 21 Aug 2026) — a
  // combined heating-or-ventilation checklist deliberately split into
  // two templates (confirmed 21 Aug 2026) since a live
  // project matches one system type, not both, and the app's Template
  // model is one fixed deliverable set per Template. Grounded in
  // SHTM 00, SHTM 03-01 Parts A (design & validation) and B
  // (operational management & performance verification), SHTM 06-01,
  // CDM 2015. Isolation/shutdown and hygiene items use
  // AUTHORISED_PERSON_VENTILATION (Heating & Ventilation AP) — the
  // same appointment as the Boiler template's LTHW isolation items,
  // since it's one combined AP discipline (21 Aug 2026). No
  // PSSR compliance item here — the source document scopes PSSR to
  // heating (pressure systems) only, not ventilation. Fire
  // compartmentation item added at Gate 3 for consistency with every
  // other template, same as the Boiler template.
  //
  // Updated to V2.0 (Heating&Ventillation_V2.0.docx, 24 Aug 2026): the
  // revised source document dropped the heating half entirely (it's a
  // different SHTM — 03-01 vs Boiler's 04-01 — so V2.0 treats them as
  // fully separate documents now, not one dual-framed checklist), and
  // added the same Pre-Contract Hold Point governance rule as Boiler
  // and Domestic Hot & Cold Water: no contractor appointment or Gate 5
  // work until two competitive quotes, written PFI Board/NHS lifecycle
  // cost approval, and written Ventilation Safety Group (VSG) / IPC
  // approval of a formal SBAR are all in. Like Water (and unlike
  // Boiler), this template already has live instantiated Deliverable
  // rows across several projects (the Main Kitchen Refit package among
  // them), so the DB-side migration script updated existing
  // DeliverableTemplate rows in place rather than deleting anything —
  // del.ventilation_full_technical_design_package became the new
  // pre-appointment "developed design" item, del.ventilation_
  // detailed_plant_specifications became "Detailed Scope of Works",
  // and del.ventilation_vsg_engagement_approval was repurposed into
  // the new SBAR-submission step, with a genuinely new del.
  // ventilation_vsg_ipc_written_approval item added for the approval
  // itself, same shape as Water's WSG split.
  const ventilationTemplate = await db.template.create({
    data: {
      key: "template.health.ventilation_systems_replacement",
      name: "Ventilation & Air Handling Systems Replacement",
      description:
        "Ventilation and air handling system replacement — AHUs, ductwork, fans, filters, and associated controls, in an operational healthcare environment. Not heating/LTHW plant — see Boiler & Heating Plant Replacement for that, even though both disciplines share the Heating & Ventilation AP appointment.",
      matchKeywords: [
        "ventilation",
        "AHU",
        "air handling unit",
        "ductwork",
        "fan",
        "filter",
        "HVAC",
        "air handling",
        "ventilation replacement",
        "extract ventilation",
        "supply air",
      ],
      sectorVariantId: health.id,
    },
  });
  const ventilationStageTemplates = await createStageAndGateTemplates(ventilationTemplate.id);

  const ventilationDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.ventilation_business_case", label: "Business case / need identification (system condition, clinical risk, air quality, energy performance)", description: "SHTM 00, SHTM 03-01." },
      { key: "del.ventilation_strategic_brief", label: "Strategic brief & project outcomes (continuity of ventilation, resilience, clinical safety, efficiency)" },
      { key: "del.ventilation_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 03-01." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.ventilation_project_brief", label: "Project Brief (scope of ventilation replacement, critical areas, continuity requirements)", description: "SHTM 00, SHTM 03-01." },
      { key: "del.ventilation_condition_surveys_baseline", label: "Existing system condition surveys & baseline data (air volumes, pressures, filtration, hygiene)", description: "SHTM 03-01 Part A." },
      { key: "del.ventilation_expanded_risk_register", label: "Initial risk register (service continuity, infection control, access, temporary plant)", description: "SHTM 00, CDM 2015, HAI-SCRIBE." },
      { key: "del.ventilation_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.ventilation_vsg_early_engagement", label: "Early engagement with Ventilation Safety Group (VSG) / IPC", description: "SHTM 03-01, HAI-SCRIBE — flags the project to VSG/IPC ahead of the formal SBAR submitted at Gate 4." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.ventilation_concept_design_report", label: "Concept design options (phased replacement, temporary ventilation strategy, AHU type)" },
      { key: "del.ventilation_outline_services_strategy", label: "Outline ventilation strategy (air change rates, pressure regimes, filtration, resilience)", description: "SHTM 03-01 Part A." },
      { key: "del.ventilation_preliminary_schematics_load_assessment", label: "Preliminary schematics and load assessment", description: "SHTM 03-01." },
      { key: "del.ventilation_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.ventilation_concept_risk_assessment", label: "Design risk assessment (including infection control)", description: "CDM 2015, SHTM 00, HAI-SCRIBE." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.ventilation_coordinated_layout_drawings", label: "Coordinated design (AHU locations, duct routes, plant access, temporary arrangements)", description: "SHTM 03-01 Part A." },
      { key: "del.ventilation_mep_structural_coordination", label: "Spatial coordination with structure, electrical, BMS, fire compartments and other services", description: "SHTM 00." },
      { key: "del.ventilation_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for ductwork and fire-damper penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.ventilation_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary ventilation strategy (principles only)" },
      { key: "del.ventilation_critical_area_resilience_confirmation", label: "Confirmation of critical area resilience requirements", description: "SHTM 03-01." },
    ],
    // Gate 4 — Technical Design. Contains the Pre-Contract Hold Point
    // (V2.0) — same shape as Boiler and Water's Gate 4: everything up
    // to and including del.ventilation_pre_contract_hold_point is
    // pre-appointment "sufficient for accurate pricing" work;
    // del.ventilation_post_appointment_full_design is the only item
    // that happens after a contractor is appointed, though it's still
    // recorded under this same Gate 4.
    [
      { key: "del.ventilation_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.ventilation_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.ventilation_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.ventilation_filter_hygiene_strategy", label: "Filter & hygiene strategy", description: "SHTM 03-01." },
      { key: "del.ventilation_bms_control_philosophy", label: "BMS / controls philosophy and point schedules", description: "SHTM 06-01." },
      { key: "del.ventilation_electrical_design", label: "Electrical design associated with AHUs, fans and controls", description: "SHTM 06-01." },
      { key: "del.ventilation_duct_insulation_spec", label: "Duct insulation specification" },
      { key: "del.ventilation_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.ventilation_pre_construction_information", label: "Pre-Construction Information & input to Construction Phase Plan (CDM)", description: "CDM 2015." },
      { key: "del.ventilation_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 03-01, HAI-SCRIBE.", bypassAuthority: "SRO" },
      { key: "del.ventilation_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.ventilation_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — one of three conditions for the Pre-Contract Hold Point below." },
      { key: "del.ventilation_sbar_submission_to_vsg", label: "Prepare and submit formal SBAR (or equivalent) to the Ventilation Safety Group / IPC", description: "SHTM 03-01, HAI-SCRIBE." },
      { key: "del.ventilation_vsg_ipc_written_approval", label: "Obtain written VSG / IPC approval", description: "One of three conditions for the Pre-Contract Hold Point below.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.ventilation_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.ventilation_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until both PFI/NHS cost approval and VSG/IPC approval are received", description: "Clear commercial & governance cut-off. Requires the written VSG/IPC approval and a formal PFI Board/NHS lifecycle cost approval to both be in place before Gate 5 can begin.", bypassAuthority: "SRO" },
      { key: "del.ventilation_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.ventilation_method_statements", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary ventilation arrangements", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.ventilation_temp_plant_installation_commissioning", label: "Temporary plant installation, connection, testing & commissioning certificates (if used)", description: "SHTM 00." },
      { key: "del.ventilation_material_equipment_certificates", label: "Material & equipment certificates", description: "SHTM 03-01." },
      { key: "del.ventilation_shutdown_isolation_records", label: "Shutdown / isolation records for ventilation plant and ductwork", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.ventilation_plant_distribution_install", label: "Installation of new AHUs, ductwork, fans, filters, controls and associated works", description: "SHTM 03-01 Part A." },
      { key: "del.ventilation_cleanliness_hygiene_records", label: "Cleanliness & hygiene records during installation", description: "Critical infection-control step for ventilation hygiene, per SHTM 03-01 Part B — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.ventilation_bms_installation_testing", label: "BMS installation, wiring, point-to-point testing & sequence proving", description: "SHTM 06-01." },
      { key: "del.ventilation_eic_certificates", label: "Electrical installation & test certificates (BS 7671)", description: "SHTM 06-01.", bypassAuthority: "SRO" },
      { key: "del.ventilation_progress_records_quality_log", label: "Progress records, quality inspections & change control log" },
      { key: "del.ventilation_decommissioning_records", label: "Decommissioning & strip-out records of redundant plant", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.ventilation_full_system_commissioning_records", label: "Full system testing, commissioning and validation records", description: "SHTM 03-01 Part A." },
      { key: "del.ventilation_performance_verification_data", label: "Performance verification data (air volumes, pressures, filtration efficiency, etc.)", description: "SHTM 03-01." },
      { key: "del.ventilation_as_fitted_drawings", label: "As-fitted drawings & schematics", description: "SHTM 03-01." },
      { key: "del.ventilation_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00, SHTM 03-01 Part B." },
      { key: "del.ventilation_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions" },
      { key: "del.ventilation_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.ventilation_training_records", label: "Training & demonstration records for estates / operational staff", description: "SHTM 00." },
      { key: "del.ventilation_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.ventilation_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.ventilation_final_validation_report", label: "Final validation reports", description: "SHTM 03-01 Part A." },
      { key: "del.ventilation_temp_plant_decommissioning_certs", label: "Temporary plant decommissioning & removal certificates (if applicable)" },
      { key: "del.ventilation_vsg_ipc_acceptance", label: "Formal VSG / IPC acceptance", description: "SHTM 03-01 Part B.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.ventilation_soft_landings_review", label: "Soft landings / post-occupancy evaluation (performance, resilience, energy, clinical feedback)", description: "SHTM 00." },
      { key: "del.ventilation_management_arrangements", label: "Updated Ventilation management arrangements / Written Scheme", description: "SHTM 03-01 Part B." },
      { key: "del.ventilation_ongoing_monitoring_regime", label: "Ongoing monitoring, verification and maintenance regime", description: "SHTM 03-01 Part B." },
      { key: "del.ventilation_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.ventilation_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(ventilationStageTemplates, ventilationDeliverableDefsByStage);

  // ── 8th Template: Medical Gas Systems Replacement — Medical Gas
  // Pipeline Systems (MGPS): pipework, terminal units, ceiling
  // pendants/medical supply units, plant (manifold, VIE, compressors,
  // vacuum plant), alarms, and anaesthetic gas scavenging (AGSS).
  // Content supplied (Medical Gases.docx, 21 Aug 2026).
  // Grounded in SHTM 02-01 Parts A (design/installation/validation)
  // and B (operational management), SHTM 06-01 (pendant power/data),
  // SHTM 00, BS EN ISO 7396-1/9170/11197, CDM 2015. Unlike the Boiler
  // template's fuel gas (no Trust-appointed AP exists for that),
  // Medical Gases DOES have its own AP/AE appointment under SHTM/HTM
  // 02-01 — isolation under the MGPS Permit-to-Work system, and the
  // identity/purity/pressure test certification patient safety
  // depends on, both sit with AUTHORISED_PERSON_MEDICAL_GASES, not
  // SRO. Fire compartmentation item added at Gate 3 for consistency
  // with every other template, same as Boiler and Ventilation.
  //
  // Updated to V2.0 (Medical Gases_V2.0.docx, 24 Aug 2026): the same
  // Pre-Contract Hold Point governance rule as Boiler, Water, and
  // Ventilation — no contractor appointment or Gate 5 work until two
  // competitive quotes, written PFI Board/NHS lifecycle cost approval,
  // and written Medical Gas Safety Group (MGSG) / Authorised Person
  // (MGPS) approval of a formal SBAR are all in. Zero live Deliverable
  // instances existed for this template (never permanently demoed), so
  // the DB-side migration script deleted and recreated its
  // DeliverableTemplate rows per gate, same as Boiler — no in-place
  // update needed here, unlike Water/Ventilation. MGSG acceptance was
  // already at Gate 6 in V1, so no Gate 7 → 6 move needed (same as
  // Water, unlike Boiler).
  const medicalGasesTemplate = await db.template.create({
    data: {
      key: "template.health.medical_gas_systems_replacement",
      name: "Medical Gas Systems Replacement",
      description:
        "Medical Gas Pipeline System (MGPS) replacement or major modification — pipework, terminal units, ceiling pendants/medical supply units, plant (manifold, VIE, compressors, vacuum), alarms, and anaesthetic gas scavenging (AGSS), in an operational healthcare environment. Not standard fuel gas/oil for boiler plant — see Boiler & Heating Plant Replacement for that; medical gases have their own AP/AE appointment, fuel gas doesn't.",
      matchKeywords: [
        "medical gas",
        "MGPS",
        "medical gas pipeline",
        "pendant",
        "medical supply unit",
        "AGSS",
        "anaesthetic gas scavenging",
        "terminal unit",
        "oxygen supply",
        "vacuum plant",
        "manifold",
        "piped oxygen",
      ],
      sectorVariantId: health.id,
    },
  });
  const medicalGasesStageTemplates = await createStageAndGateTemplates(medicalGasesTemplate.id);

  const medicalGasesDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.medgas_business_case", label: "Business case / need identification (system age, compliance, clinical risk, pendant condition)", description: "SHTM 00, SHTM 02-01." },
      { key: "del.medgas_strategic_brief", label: "Strategic brief & project outcomes (continuity of supply, patient safety, resilience)" },
      { key: "del.medgas_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, Medical Gas Safety Group." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.medgas_project_brief", label: "Project Brief (scope of MGPS / pendant replacement, continuity requirements)" },
      { key: "del.medgas_condition_surveys", label: "Existing system condition surveys (pipework, terminal units, pendants, plant, alarms)", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_baseline_identity_quality_flow_testing", label: "Baseline identity, quality and flow testing records", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_expanded_risk_register", label: "Initial risk register (isolation risks, cross-connection, pendant structural loads)", description: "SHTM 00, CDM 2015, Medical Gas Safety Group." },
      { key: "del.medgas_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.medgas_mgsg_engagement", label: "Early engagement with Medical Gas Safety Group (MGSG) and Authorised Person (MGPS)", description: "SHTM 02-01." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.medgas_concept_design_report", label: "Concept design options (phased replacement, temporary gas supplies, pendant strategy)", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_outline_mgps_strategy", label: "Outline MGPS strategy (sources of supply, distribution, terminal units, pendants, AGSS)", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_pendant_selection_locations", label: "Preliminary pendant / medical supply unit selection and locations", description: "SHTM 02-01, BS EN ISO 11197." },
      { key: "del.medgas_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.medgas_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 02-01." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.medgas_coordinated_layout_drawings", label: "Coordinated design (pipe routes, plant locations, pendant positions, structural supports)", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_mep_structural_coordination", label: "Spatial coordination with structure, electrical, data, lighting and other services", description: "SHTM 06-01." },
      { key: "del.medgas_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for MGPS pipework and pendant penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.medgas_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / isolation strategy (principles only)" },
      { key: "del.medgas_temp_supply_confirmation", label: "Confirmation of temporary supply arrangements", description: "SHTM 02-01.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design. Contains the Pre-Contract Hold Point
    // (V2.0) — same shape as Boiler, Water, and Ventilation's Gate 4:
    // everything up to and including del.medgas_pre_contract_hold_point
    // is pre-appointment "sufficient for accurate pricing" work;
    // del.medgas_post_appointment_full_design is the only item that
    // happens after a contractor is appointed, though it's still
    // recorded under this same Gate 4.
    [
      { key: "del.medgas_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.medgas_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.medgas_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.medgas_pendant_structural_design", label: "Structural design information for pendant supports / ceiling fixings" },
      { key: "del.medgas_electrical_data_design", label: "Electrical & data design associated with pendants", description: "SHTM 06-01." },
      { key: "del.medgas_alarm_system_design", label: "Alarm system design and interface requirements", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.medgas_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.medgas_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 02-01.", bypassAuthority: "SRO" },
      { key: "del.medgas_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.medgas_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — one of three conditions for the Pre-Contract Hold Point below." },
      { key: "del.medgas_sbar_submission_to_mgsg", label: "Prepare and submit formal SBAR (or equivalent) to the Medical Gas Safety Group / Authorised Person (MGPS)", description: "SHTM 02-01." },
      { key: "del.medgas_mgsg_ap_written_approval", label: "Obtain written MGSG / AP (MGPS) approval", description: "One of three conditions for the Pre-Contract Hold Point below.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.medgas_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.medgas_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until both PFI/NHS cost approval and MGSG/AP approval are received", description: "Clear commercial & governance cut-off. Requires the written MGSG/AP (MGPS) approval and a formal PFI Board/NHS lifecycle cost approval to both be in place before Gate 5 can begin.", bypassAuthority: "SRO" },
      { key: "del.medgas_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.medgas_permit_to_work_isolation", label: "Contractor's detailed Method Statements, full RAMS, detailed phasing, isolation & Permit-to-Work procedures", description: "SHTM 02-01 Part B — all MGPS work is controlled via the Permit-to-Work system, overseen by the site Authorised Person (MGPS). Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "AUTHORISED_PERSON_MEDICAL_GASES" },
      { key: "del.medgas_temp_supply_design_install_validation", label: "Temporary medical gas supply arrangements (if required) — design, installation & validation", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_material_equipment_certificates", label: "Material & equipment certificates (pipework, fittings, terminal units, pendants, plant)", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_pipeline_valve_terminal_install", label: "Installation of new pipeline systems, valves, AVSUs and terminal units", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_pendant_install", label: "Installation of ceiling pendants / medical supply units (including structural fixings, gas hoses, electrical & data)", description: "SHTM 02-01, BS EN ISO 11197." },
      { key: "del.medgas_brazing_jointing_records", label: "Brazing / jointing records (oxygen-free nitrogen purged, fluxless)", description: "Critical contamination-control step for medical gas pipework, per SHTM 02-01 Part A — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_MEDICAL_GASES" },
      { key: "del.medgas_pressure_leak_purity_identity_testing", label: "Pressure testing, leakage testing and purity / identity testing records", description: "Critical patient-safety verification — a wrong gas identity or contaminated supply is life-threatening. Cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_MEDICAL_GASES" },
      { key: "del.medgas_alarm_install_testing", label: "Alarm system installation and testing", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_eic_certificates", label: "Electrical installation & test certificates associated with pendants (BS 7671)", description: "SHTM 06-01.", bypassAuthority: "SRO" },
      { key: "del.medgas_progress_records_quality_permit_log", label: "Progress records, quality inspections, change control log & Permit-to-Work records", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_decommissioning_records", label: "Decommissioning & strip-out records of redundant MGPS / pendants", description: "SHTM 02-01.", bypassAuthority: "AUTHORISED_PERSON_MEDICAL_GASES" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.medgas_full_validation_verification_records", label: "Full validation and verification records (carcass, system, performance)", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_identity_quality_flow_pressure_certs", label: "Identity, quality, flow and pressure test certificates for all gases and vacuum", description: "Critical patient-safety verification — a wrong or contaminated gas identity is life-threatening. Cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_MEDICAL_GASES" },
      { key: "del.medgas_pendant_performance_tests", label: "Pendant performance tests (movement, braking, hose integrity, terminal unit function)", description: "SHTM 02-01, manufacturer requirements." },
      { key: "del.medgas_as_fitted_drawings", label: "As-fitted drawings & schematics (including terminal unit schedules and pendant locations)", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_om_manuals", label: "Comprehensive O&M manuals (including pendant maintenance and hose life policy)", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions for pendants, terminal units and plant" },
      { key: "del.medgas_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.medgas_training_records", label: "Training & demonstration records for Authorised Persons, Competent Persons and clinical users", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.medgas_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.medgas_mgsg_acceptance_handover", label: "MGSG acceptance and formal handover of the MGPS", description: "SHTM 02-01.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.medgas_temp_supply_decommissioning_records", label: "Temporary supply decommissioning records (if applicable)", description: "SHTM 02-01." },
    ],
    // Gate 7 — Use
    [
      { key: "del.medgas_soft_landings_review", label: "Soft landings / post-occupancy review (system performance, pendant usability, alarm response)", description: "SHTM 00." },
      { key: "del.medgas_updated_operational_procedures", label: "Updated operational procedures, Permit-to-Work arrangements and Written Scheme", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_ongoing_ppm_regime", label: "Ongoing planned preventive maintenance regime (including pendant hose replacement schedule)", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.medgas_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(medicalGasesStageTemplates, medicalGasesDeliverableDefsByStage);

  // ── 9th Template: Fire Alarm & Detection Systems Replacement — CIE
  // (control and indicating equipment) panels, detectors, call points,
  // sounders/visual alarms, cause & effect interfaces (door release,
  // smoke control, lift recall, plant shutdown). Content supplied
  // (Fire Alarm & Detection.docx, 21 Aug 2026). Grounded in
  // SHTM 82 (NHSScotland Firecode: fire detection and alarm systems),
  // SHTM 81/83/86, BS 5839-1 (Category L1 addressable required
  // throughout hospitals), CDM 2015. Unlike every other template
  // added this week, this one needed no new BypassAuthority — its
  // "Fire Safety Advisor / Responsible Person" is exactly the site
  // FIRE_OFFICER role every other template already gates
  // compartmentation items to, so the statutory sign-off points here
  // (zone/compartment alignment, design approval, cause & effect
  // sign-off, fire risk assessment update, formal acceptance) all use
  // FIRE_OFFICER directly rather than inventing a new discipline. Also
  // no new ComplianceRuleTemplate — the existing comp.fire_risk_assessment
  // rule already covers the core statutory concern for any occupied
  // project; this template's own checklist covers the rest.
  const fireAlarmTemplate = await db.template.create({
    data: {
      key: "template.health.fire_alarm_detection_replacement",
      name: "Fire Alarm & Detection Systems Replacement",
      description:
        "Fire detection and alarm system replacement or major upgrade — control and indicating equipment (CIE) panels, detectors, call points, sounders/visual alarms, and cause & effect interfaces with door release, smoke control, lift recall and plant shutdown, in an operational healthcare environment. Distinct from the routine fire-compartmentation-impact-assessment item every other template carries for its own penetrations — this template is the fire alarm system itself.",
      matchKeywords: [
        "fire alarm",
        "fire detection",
        "smoke detector",
        "heat detector",
        "fire alarm panel",
        "CIE",
        "control and indicating equipment",
        "sounders",
        "call points",
        "BS 5839",
        "L1 fire alarm",
        "fire alarm upgrade",
        "UFAS",
      ],
      sectorVariantId: health.id,
    },
  });
  const fireAlarmStageTemplates = await createStageAndGateTemplates(fireAlarmTemplate.id);

  const fireAlarmDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.firealarm_business_case", label: "Business case / need identification (system age, reliability, UFAS performance, compliance)", description: "SHTM 00, SHTM 82." },
      { key: "del.firealarm_strategic_brief", label: "Strategic brief & project outcomes (life safety, continuity of protection, UFAS reduction)" },
      { key: "del.firealarm_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 86." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.firealarm_project_brief", label: "Project Brief (scope of system replacement / upgrade, continuity requirements)", description: "SHTM 00, SHTM 82." },
      { key: "del.firealarm_condition_survey", label: "Existing system condition survey (panels, detectors, call points, cabling, cause & effect)", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_baseline_ufas_analysis", label: "Baseline UFAS data and false alarm analysis", description: "SHTM 82." },
      { key: "del.firealarm_expanded_risk_register", label: "Initial risk register (protection during works, zone integrity, interface risks)", description: "SHTM 00, CDM 2015, SHTM 86." },
      { key: "del.firealarm_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.firealarm_fsa_engagement", label: "Engagement with Fire Safety Advisor / Fire Safety Group", description: "SHTM 82, SHTM 86." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.firealarm_concept_design_report", label: "Concept design options (full replacement vs phased upgrade, technology choice)", description: "SHTM 82." },
      { key: "del.firealarm_outline_detection_alarm_strategy", label: "Outline detection & alarm strategy (Category L1 addressable, zoning, interfaces)", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_detector_type_selection", label: "Preliminary detector type selection (multi-sensor preference to reduce UFAS)", description: "SHTM 82." },
      { key: "del.firealarm_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.firealarm_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 82." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.firealarm_coordinated_layout_drawings", label: "Coordinated design (device locations, cable routes, panel positions, zone plans)", description: "SHTM 82." },
      { key: "del.firealarm_mep_structural_coordination", label: "Spatial coordination with structure, ceilings, other services and fire compartments", description: "SHTM 81." },
      { key: "del.firealarm_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary cover strategy" },
      { key: "del.firealarm_zone_compartment_alignment_confirmation", label: "Confirmation of zone boundaries aligned to fire compartments", description: "Fire alarm zones must align with compartment/sub-compartment boundaries — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.firealarm_full_technical_design_package", label: "Full technical design drawings, schematics and zone plans", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_detailed_specifications", label: "Detailed specifications (CIE, detectors, manual call points, sounders, visual devices, cabling, power supplies)", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_cause_effect_matrix", label: "Cause & effect matrix / interface schedule (doors, plant, lifts, smoke control, etc.)", description: "SHTM 82." },
      { key: "del.firealarm_battery_power_supply_design", label: "Battery autonomy and power supply design", description: "BS 5839-1." },
      { key: "del.firealarm_ufas_reduction_strategy", label: "UFAS reduction strategy (detector selection, multi-criteria, verification technology)", description: "SHTM 82." },
      { key: "del.firealarm_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.firealarm_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.firealarm_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 82.", bypassAuthority: "SRO" },
      { key: "del.firealarm_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.firealarm_fsa_design_approval", label: "Fire Safety Advisor / stakeholder review and approval of design", description: "SHTM 82 — only the site NHS Fire Officer can approve or reject fire-related design compliance, not the SRO or Compliance Officer.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.firealarm_method_statements", label: "Contractor method statements, detailed phasing & temporary protection arrangements", description: "SHTM 82." },
      { key: "del.firealarm_material_equipment_certificates", label: "Material & equipment certificates (panels, detectors, devices, cable)", description: "BS 5839-1." },
      { key: "del.firealarm_cie_devices_install", label: "Installation of new control and indicating equipment (CIE), detectors, call points, sounders and visual alarms", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_cable_install_containment_labelling", label: "Cable installation, containment and labelling records", description: "BS 5839-1." },
      { key: "del.firealarm_interface_install_testing", label: "Interface installation and testing records", description: "SHTM 82." },
      { key: "del.firealarm_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.firealarm_temp_cover_hybrid_arrangements", label: "Temporary system cover / hybrid working arrangements (if phased)", description: "Adequate fire detection and alarm cover must be maintained throughout the works — cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firealarm_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.firealarm_full_commissioning_verification_records", label: "Full commissioning and verification records in accordance with BS 5839-1 and SHTM 82" },
      { key: "del.firealarm_cause_effect_testing_signoff", label: "Cause & effect testing and sign-off", description: "Critical life-safety verification — confirms fire alarm signals correctly trigger door release, smoke control, lift recall and plant shutdown. Cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firealarm_as_fitted_drawings", label: "As-fitted drawings, zone plans and device schedules", description: "SHTM 82." },
      { key: "del.firealarm_om_manuals_logbook", label: "Comprehensive O&M manuals and log book", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions and BS 5839-1 certification" },
      { key: "del.firealarm_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.firealarm_training_records", label: "Training & demonstration records for estates staff and fire response teams", description: "SHTM 82, SHTM 83." },
      { key: "del.firealarm_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.firealarm_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.firealarm_fsa_formal_acceptance", label: "Formal acceptance by Fire Safety Advisor / Responsible Person", description: "SHTM 82.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firealarm_updated_fire_risk_assessment", label: "Updated fire risk assessment reflecting the new system", description: "SHTM 86.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.firealarm_soft_landings_review", label: "Soft landings / post-occupancy review (system performance, UFAS rates, user feedback)", description: "SHTM 00." },
      { key: "del.firealarm_updated_fire_safety_management", label: "Updated fire safety management procedures and training materials", description: "SHTM 83." },
      { key: "del.firealarm_ongoing_ppm_testing_regime", label: "Ongoing planned preventive maintenance and testing regime", description: "BS 5839-1, SHTM 82." },
      { key: "del.firealarm_ufas_monitoring_action_plan", label: "UFAS monitoring and reduction action plan", description: "SHTM 82." },
      { key: "del.firealarm_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.firealarm_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(fireAlarmStageTemplates, fireAlarmDeliverableDefsByStage);

  // ── 10th Template: Lift & Vertical Transportation Replacement —
  // passenger, bed/passenger, firefighting, escape bed, and service
  // lifts. Content supplied (Lift_template.docx, 21 Aug
  // 2026). Grounded in SHTM 08-02 (Specialist services: Lifts), SFPN 3
  // (escape bed lifts), SHTM 81/Firecode (firefighting/escape lifts),
  // SHTM 06 series (electrical supplies), BS EN 81 series, CDM 2015.
  // Like the Boiler template's fuel gas, there is no Trust-appointed
  // "AP (Lifts)" — SHTM 08-02 doesn't establish an AP/AE appointment
  // the way 02-01/04-01/06-01/03-01 do, and the statutory LOLER
  // thorough examination is carried out by an external competent
  // person, not a Trust AP, so no new BypassAuthority was added.
  // Electrical items reuse the SRO tier every other template's EIC/
  // safety-critical-test items use; firefighting/escape-lift items
  // reuse FIRE_OFFICER, same as Fire Alarm's Fire Safety Advisor
  // items. New compliance rule comp.loler_thorough_examination,
  // tagged lifting_equipment_affected, mirrors comp.pssr_written_scheme's
  // pattern exactly — LOLER is as distinct a statutory regime for
  // lifts as PSSR is for boilers. Fire compartmentation item added at
  // Gate 3 for shaft/floor penetrations, alongside the source
  // document's own firefighting/escape-lift provisions confirmation —
  // two distinct fire concerns (structural compartmentation vs. the
  // lift's own fire/escape designation), both correctly Fire-Officer-gated.
  const liftTemplate = await db.template.create({
    data: {
      key: "template.health.lift_systems_replacement",
      name: "Lift & Vertical Transportation Replacement",
      description:
        "Lift and vertical transportation replacement, modernisation, or major upgrade — passenger, bed/passenger, firefighting, escape bed, and service lifts, in an operational healthcare environment. Covers shafts, cars, machine rooms/MRL, controllers, and associated fire/escape lift requirements.",
      matchKeywords: [
        "lift",
        "lifts",
        "vertical transportation",
        "elevator",
        "passenger lift",
        "bed lift",
        "firefighting lift",
        "escape lift",
        "lift modernisation",
        "lift replacement",
        "LOLER",
        "machine room",
      ],
      sectorVariantId: health.id,
    },
  });
  const liftStageTemplates = await createStageAndGateTemplates(liftTemplate.id);

  const liftDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.lift_business_case", label: "Business case / need identification (lift age, reliability, capacity, accessibility, compliance)", description: "SHTM 00, SHTM 08-02." },
      { key: "del.lift_strategic_brief", label: "Strategic brief & project outcomes (service continuity, patient movement, fire strategy, accessibility)" },
      { key: "del.lift_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.lift_project_brief", label: "Project Brief (scope: passenger, bed/passenger, firefighting, escape bed lifts etc.)", description: "SHTM 00, SHTM 08-02." },
      { key: "del.lift_condition_surveys", label: "Existing lift condition surveys (traffic analysis, performance, safety gear, controllers, doors)", description: "SHTM 08-02." },
      { key: "del.lift_baseline_traffic_residual_life", label: "Baseline traffic / usage data and residual life assessment", description: "SHTM 08-02." },
      { key: "del.lift_expanded_risk_register", label: "Initial risk register (service continuity, patient movement, fire strategy, structural)", description: "SHTM 00, CDM 2015." },
      { key: "del.lift_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.lift_fsa_engagement", label: "Engagement with Fire Safety Advisor (for firefighting / escape lifts)", description: "SHTM 81, SFPN 3." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.lift_concept_design_report", label: "Concept design options (full replacement vs modernisation, drive type, car sizes)", description: "SHTM 08-02." },
      { key: "del.lift_outline_lift_strategy", label: "Outline lift strategy (number, type, capacity, speed, grouping, fire/escape designation)", description: "SHTM 08-02." },
      { key: "del.lift_car_size_door_config", label: "Preliminary car sizes and door configurations (bed/passenger requirements)", description: "SHTM 08-02." },
      { key: "del.lift_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.lift_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 08-02." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.lift_coordinated_layout_drawings", label: "Coordinated design (shafts, machine rooms / MRL, landings, structural supports, overrun)", description: "SHTM 08-02." },
      { key: "del.lift_mep_structural_coordination", label: "Spatial coordination with structure, electrical, fire compartments and other services" },
      { key: "del.lift_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for lift shaft and landing penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.lift_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary cover strategy" },
      { key: "del.lift_firefighting_escape_provisions_confirmation", label: "Confirmation of firefighting / escape bed lift provisions", description: "SHTM 81, SFPN 3.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.lift_full_technical_design_package", label: "Full technical design drawings & schematics (shafts, cars, landings, machine rooms, interfaces)", description: "SHTM 08-02." },
      { key: "del.lift_detailed_specifications", label: "Detailed specifications (drive system, controller, doors, safety gear, finishes, communication systems)", description: "SHTM 08-02, BS EN 81 series." },
      { key: "del.lift_structural_design", label: "Structural design information (loads, fixings, machine room / pit)" },
      { key: "del.lift_electrical_design", label: "Electrical design (main supply, emergency supply, lighting, alarms)", description: "SHTM 06 series, SHTM 08-02." },
      { key: "del.lift_firefighting_escape_requirements", label: "Firefighting lift / escape bed lift specific requirements (controls, communications, power)", description: "SHTM 81, SFPN 3, BS EN 81-72." },
      { key: "del.lift_building_regs_compliance_info", label: "Building Regulations / statutory compliance information (including accessibility)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.lift_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.lift_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 08-02.", bypassAuthority: "SRO" },
      { key: "del.lift_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.lift_fsa_design_approval", label: "Stakeholder / Fire Safety Advisor review and approval of design", description: "SHTM 08-02 — only the site NHS Fire Officer can approve or reject fire-related design compliance, not the SRO or Compliance Officer.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.lift_method_statements", label: "Contractor method statements, detailed phasing & temporary vertical transportation arrangements", description: "SHTM 08-02." },
      { key: "del.lift_material_equipment_certificates", label: "Material & equipment certificates (drive, controller, safety components, doors, car)", description: "BS EN 81 series." },
      { key: "del.lift_shaft_structural_mrl_works", label: "Shaft preparation, structural works, machine room / MRL installation" },
      { key: "del.lift_equipment_install", label: "Installation of lift equipment (car, counterweight, ropes/jack, doors, controller)", description: "SHTM 08-02." },
      { key: "del.lift_electrical_install_emergency_supply_testing", label: "Electrical installation, emergency supply connections and testing", description: "SHTM 06 series.", bypassAuthority: "SRO" },
      { key: "del.lift_safety_gear_governor_overspeed_testing", label: "Safety gear, governor, buffer and overspeed testing records", description: "Critical life-safety verification — the mechanism that prevents uncontrolled car movement or free-fall, per BS EN 81 series. Cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.lift_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.lift_temp_cover_hybrid_arrangements", label: "Temporary cover / hybrid working arrangements (if phased)" },
      { key: "del.lift_decommissioning_records", label: "Decommissioning & strip-out records of redundant lift equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.lift_full_commissioning_validation_records", label: "Full commissioning, testing and validation records in accordance with SHTM 08-02 and BS EN 81" },
      { key: "del.lift_load_speed_levelling_door_safety_tests", label: "Load testing, speed, levelling accuracy, door operation and safety device tests", description: "Critical life-safety verification, per BS EN 81 series. Cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.lift_firefighting_escape_function_tests", label: "Firefighting / escape lift specific function tests (if applicable)", description: "SHTM 81, SFPN 3.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.lift_as_fitted_drawings", label: "As-fitted drawings, wiring diagrams and device schedules", description: "SHTM 08-02." },
      { key: "del.lift_om_manuals_logbook_rescue_procedures", label: "Comprehensive O&M manuals, log book and rescue procedures", description: "SHTM 08-02." },
      { key: "del.lift_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions and BS EN 81 certification" },
      { key: "del.lift_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.lift_training_records", label: "Training & demonstration records for estates staff and rescue teams", description: "SHTM 08-02." },
      { key: "del.lift_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.lift_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.lift_loler_thorough_examination", label: "Statutory thorough examination (LOLER) prior to use", description: "A lift is lifting equipment under LOLER — a competent person's thorough examination is a separate statutory step from SHTM 08-02/BS EN 81 commissioning.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.lift_formal_acceptance", label: "Formal acceptance by client / Responsible Person", description: "SHTM 08-02." },
    ],
    // Gate 7 — Use
    [
      { key: "del.lift_soft_landings_review", label: "Soft landings / post-occupancy review (performance, reliability, user feedback)", description: "SHTM 00." },
      { key: "del.lift_updated_ppm_regime", label: "Updated maintenance regime and planned preventive maintenance schedule", description: "SHTM 08-02." },
      { key: "del.lift_ongoing_loler_examination_records", label: "Ongoing thorough examination and inspection records (LOLER)", description: "Statutory requirement under LOLER — distinct from routine SHTM planned maintenance.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.lift_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.lift_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(liftStageTemplates, liftDeliverableDefsByStage);

  // ── 11th Template: Nurse Call & Staff Paging Systems Replacement —
  // patient-to-nurse call, staff emergency/attack alert, paging, and
  // bedhead communication, including integration with cardiac arrest
  // alerts and fire alarm interfaces. Content supplied
  // (Electronis communication systems.docx, 21 Aug 2026). Grounded in
  // SHTM 08-03 (Specialist services: Bedhead services), SHTM 08-01
  // (Acoustics), SHTM 06 series, CDM 2015. Unlike every other template
  // this week, the statutory sign-off here isn't an engineering AP/AE
  // or the Fire Officer — it's clinical governance: the source
  // document names "Clinical stakeholder review and approval" (design)
  // and "Clinical acceptance / sign-off" (handover, marked "Essential")
  // as the real checkpoints. Confirmed 21 Aug 2026: added
  // CLINICAL_SAFETY_OFFICER as a new BypassAuthority, since nurse
  // call/staff alert are safety-related health IT systems under NHS
  // Digital's DCB0129/DCB0160 clinical risk management standard, which
  // genuinely requires a named Clinical Safety Officer sign-off — a
  // real appointment, not an invented one, the same bar applied to
  // Medical Gases' AP and declined for a "Gas AP" or "Lifts AP". New
  // compliance rule comp.clinical_safety_case_dcb0160, tagged
  // health_it_clinical_safety_case_required (deliberately narrow —
  // see the rule's own comment for why). Fire compartmentation item
  // added at Gate 3 for cable-routing penetrations, per standing
  // library practice.
  const nurseCallTemplate = await db.template.create({
    data: {
      key: "template.health.nurse_call_staff_paging_replacement",
      name: "Nurse Call & Staff Paging Systems Replacement",
      description:
        "Nurse call and staff paging system replacement or major upgrade — patient-to-nurse call, staff emergency/attack alert, radio paging, and bedhead communication, including integration with cardiac arrest alerts and fire alarm interfaces, in an operational healthcare environment. Not the fire alarm system itself — see Fire Alarm & Detection Systems Replacement for that.",
      matchKeywords: [
        "nurse call",
        "staff paging",
        "staff alert",
        "staff attack",
        "bedhead",
        "call point",
        "cardiac arrest alert",
        "paging system",
        "radio paging",
        "SHTM 08-03",
      ],
      sectorVariantId: health.id,
    },
  });
  const nurseCallStageTemplates = await createStageAndGateTemplates(nurseCallTemplate.id);

  const nurseCallDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.nursecall_business_case", label: "Business case / need identification (system age, reliability, clinical risk, logging capability)", description: "SHTM 00, SHTM 08-03." },
      { key: "del.nursecall_strategic_brief", label: "Strategic brief & outcomes (patient safety, staff response times, resilience, audit trail)" },
      { key: "del.nursecall_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical risk." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.nursecall_project_brief", label: "Project Brief (nurse call scope, paging scope, integration requirements)", description: "SHTM 08-03." },
      { key: "del.nursecall_condition_survey_logging_analysis", label: "Existing system condition survey & call logging analysis", description: "SHTM 08-03." },
      { key: "del.nursecall_clinical_needs_assessment", label: "Clinical needs assessment (specialties, dependency levels, speech vs non-speech)", description: "SHTM 08-03." },
      { key: "del.nursecall_expanded_risk_register", label: "Initial risk register (service continuity, infection control, false calls)", description: "SHTM 00, CDM 2015." },
      { key: "del.nursecall_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.nursecall_concept_design_report", label: "Concept options (wired vs wireless, speech capability, paging integration, centralised logging)", description: "SHTM 08-03." },
      { key: "del.nursecall_outline_architecture_zoning", label: "Outline system architecture and zoning strategy", description: "SHTM 08-03." },
      { key: "del.nursecall_preliminary_device_schedule", label: "Preliminary device schedule (bedhead, WC, staff emergency, indicators, pagers)", description: "SHTM 08-03." },
      { key: "del.nursecall_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.nursecall_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 08-03." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.nursecall_coordinated_layout_drawings", label: "Coordinated design (device locations, cable routes / wireless coverage, staff bases, indicators)", description: "SHTM 08-03." },
      { key: "del.nursecall_mep_structural_coordination", label: "Spatial coordination with bedhead services, electrical, data and fire systems" },
      { key: "del.nursecall_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for cable routing penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.nursecall_updated_risk_register_spatial", label: "Updated cost plan, risk register & phasing / temporary cover strategy" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.nursecall_full_technical_design_package", label: "Full technical design drawings, schematics and device schedules", description: "SHTM 08-03." },
      { key: "del.nursecall_detailed_specifications", label: "Detailed specifications (call points, handsets, indicators, controllers, speech units, paging interfaces, logging software)", description: "SHTM 08-03." },
      { key: "del.nursecall_power_supply_resilience", label: "Power supply, resilience and backup arrangements", description: "SHTM 06 series." },
      { key: "del.nursecall_integration_design", label: "Integration design (cardiac arrest, fire alert, staff attack, BMS if required)", description: "SHTM 08-03." },
      { key: "del.nursecall_wireless_coverage_radio_survey", label: "Wireless coverage / radio survey (if applicable)", description: "Manufacturer requirements, radio licensing." },
      { key: "del.nursecall_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.nursecall_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.nursecall_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 08-03.", bypassAuthority: "SRO" },
      { key: "del.nursecall_tender_documentation", label: "Tender documentation / Scope of Works" },
      { key: "del.nursecall_clinical_design_approval", label: "Clinical stakeholder review and approval", description: "SHTM 08-03 — patient safety, staff response times, and audit-trail requirements need clinical sign-off, not just engineering sign-off.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.nursecall_method_statements", label: "Contractor method statements, phasing & temporary nurse call / paging cover" },
      { key: "del.nursecall_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer certification." },
      { key: "del.nursecall_devices_cabling_install", label: "Installation of devices, cabling / wireless infrastructure, controllers and indicators", description: "SHTM 08-03." },
      { key: "del.nursecall_integration_testing", label: "Integration testing with other systems" },
      { key: "del.nursecall_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.nursecall_temp_cover_arrangements", label: "Temporary system cover arrangements", description: "Critical for patient safety — nurse call and staff alert cover must be maintained throughout the works. Cannot be bypassed at PM level.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.nursecall_decommissioning_records", label: "Decommissioning records of redundant equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.nursecall_full_commissioning_functional_records", label: "Full commissioning, functional testing and validation records", description: "SHTM 08-03." },
      { key: "del.nursecall_call_logging_audit_verification", label: "Call logging, reporting and audit trail verification", description: "SHTM 08-03." },
      { key: "del.nursecall_as_fitted_drawings_config_records", label: "As-fitted drawings, device schedules and configuration records", description: "SHTM 08-03." },
      { key: "del.nursecall_om_manuals_user_guides", label: "Comprehensive O&M manuals and user guides", description: "SHTM 08-03." },
      { key: "del.nursecall_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer requirements and clinical risk assessments" },
      { key: "del.nursecall_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.nursecall_training_records", label: "Training & demonstration records for nursing and estates staff", description: "SHTM 08-03." },
      { key: "del.nursecall_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.nursecall_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.nursecall_clinical_acceptance_signoff", label: "Clinical acceptance / sign-off", description: "Essential — patient safety depends on clinical confirmation that the system meets the needs identified at briefing, not just that it passed engineering commissioning. Cannot be bypassed at PM level.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.nursecall_soft_landings_review", label: "Soft landings / post-occupancy review (response times, usability, false call rates)", description: "SHTM 00." },
      { key: "del.nursecall_updated_operational_procedures", label: "Updated operational procedures and call response protocols" },
      { key: "del.nursecall_ongoing_maintenance_logging_review", label: "Ongoing maintenance, testing and call logging review regime", description: "SHTM 08-03." },
      { key: "del.nursecall_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.nursecall_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(nurseCallStageTemplates, nurseCallDeliverableDefsByStage);

  // ── 12th Template: Building Management System (BMS) Replacement —
  // full replacement or major upgrade of the BMS/BEMS controls layer
  // (network, controllers, head-end, graphics, energy monitoring).
  // Content supplied (Building Management System Replacement.docx,
  // 21 Aug 2026). The source document is explicit that this is for a
  // standalone/major BMS project only — minor BMS point-additions for
  // new plant are already covered within each system-specific
  // template's own BMS/controls items (Boiler, Ventilation, etc.).
  // Grounded in SHTM 00, SHTM 06 series, CIBSE Guide H, BSRIA BG 1/BG 9,
  // BS EN ISO 16484, CDM 2015, plus references into every linked
  // system's own SHTM (03-01, 04-01, 08-02, 82) for integration only.
  // No new AP/AE — unlike Nurse Call, the design/handover approval
  // checkpoints here aren't clinical-specific (the source names
  // multiple co-equal stakeholders — estates, clinical, energy, IT/
  // cyber — not a single named clinical authority the way DCB0160
  // named one for nurse call), so they use COMPLIANCE_OFFICER, the
  // same tier as every other template's general design-approval/
  // statutory-documentation checkpoints. Point-to-point/alarm testing
  // uses SRO, matching the Boiler/Lift precedent for physical
  // safety-critical verification with no dedicated engineering AP.
  // New compliance rule comp.bms_cybersecurity_hardening, tagged
  // bms_network_systems_affected — cybersecurity is called out three
  // separate times in the source document as its own concern, distinct
  // from general commissioning, the same bar that justified PSSR/LOLER/
  // DCB0160 each getting their own rule. Fire compartmentation item
  // added at Gate 3 for network cable routing, per standing practice.
  const bmsTemplate = await db.template.create({
    data: {
      key: "template.health.bms_replacement",
      name: "Building Management System (BMS) Replacement",
      description:
        "Full replacement or major upgrade of a Building Management System / Building Energy Management System (BMS/BEMS) — network, controllers, head-end, graphics, energy monitoring, and integration with plant across the hospital, in an operational healthcare environment. For a standalone or major BMS project only — minor BMS point-additions for new plant are already covered within each system-specific template's own controls items (Boiler, Ventilation, etc.), not this one.",
      matchKeywords: [
        "BMS",
        "BEMS",
        "building management system",
        "building energy management system",
        "building automation",
        "controls upgrade",
        "head-end",
        "SCADA",
        "point schedule",
        "energy monitoring",
      ],
      sectorVariantId: health.id,
    },
  });
  const bmsStageTemplates = await createStageAndGateTemplates(bmsTemplate.id);

  const bmsDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.bms_business_case", label: "Business case / need identification (system age, reliability, energy performance, cybersecurity, expandability)", description: "SHTM 00." },
      { key: "del.bms_strategic_brief", label: "Strategic brief & project outcomes (resilience, energy management, critical alarms, future-proofing)" },
      { key: "del.bms_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.bms_project_brief", label: "Project Brief (scope of BMS replacement, integration requirements, energy monitoring needs)", description: "SHTM 00." },
      { key: "del.bms_condition_survey_point_audit", label: "Existing BMS condition survey, point schedule audit and residual life assessment" },
      { key: "del.bms_stakeholder_requirements_capture", label: "Stakeholder requirements capture (estates, clinical, energy, infection control, IT/cyber)", description: "SHTM 00." },
      { key: "del.bms_expanded_risk_register", label: "Initial risk register (loss of monitoring/control, critical plant, cybersecurity)", description: "SHTM 00, CDM 2015." },
      { key: "del.bms_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.bms_concept_design_report", label: "Concept design options (centralised vs distributed, open protocol, cloud/hybrid, energy analytics)", description: "SHTM 00, CIBSE Guide H." },
      { key: "del.bms_outline_architecture_resilience", label: "Outline system architecture, network topology and resilience strategy" },
      { key: "del.bms_point_schedule_integration_matrix", label: "High-level point schedule and integration matrix with other systems", description: "Linked system SHTMs." },
      { key: "del.bms_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.bms_concept_risk_assessment", label: "Design risk assessment (including cybersecurity)", description: "CDM 2015, SHTM 00." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.bms_coordinated_layout_drawings", label: "Coordinated design (controller locations, network routes, server/head-end rooms, HMI locations)", description: "SHTM 00." },
      { key: "del.bms_mep_structural_coordination", label: "Spatial coordination with electrical, data, plantrooms and other services", description: "SHTM 06 series." },
      { key: "del.bms_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for network cable routing penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.bms_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary monitoring strategy" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.bms_full_technical_design_package", label: "Full technical design drawings, network schematics and system architecture", description: "CIBSE / BSRIA." },
      { key: "del.bms_point_schedules_control_strategies", label: "Detailed point schedules, control strategies and cause-and-effect matrices", description: "Linked SHTMs (03-01, 04-01, etc.)." },
      { key: "del.bms_detailed_specifications", label: "Detailed specifications (controllers, sensors, actuators, servers, software, graphics, cybersecurity)", description: "Manufacturer and industry standards." },
      { key: "del.bms_integration_design", label: "Integration design with existing/new plant (boilers, AHUs, medical gases, fire, lifts, nurse call etc.)", description: "Relevant system SHTMs." },
      { key: "del.bms_energy_monitoring_analytics_spec", label: "Energy monitoring, reporting and analytics specification" },
      { key: "del.bms_cybersecurity_design", label: "Cybersecurity design and resilience measures", description: "Current NHS / national cyber resilience guidance." },
      { key: "del.bms_electrical_design", label: "Electrical design associated with BMS power and controls", description: "SHTM 06 series." },
      { key: "del.bms_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.bms_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.bms_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 00.", bypassAuthority: "SRO" },
      { key: "del.bms_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.bms_stakeholder_design_approval", label: "Stakeholder review and approval of design (including clinical & energy teams)", description: "SHTM 00.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.bms_method_statements_temp_control", label: "Contractor method statements, detailed phasing & temporary monitoring/control arrangements", description: "Critical for plant safety — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.bms_material_equipment_certificates", label: "Material & equipment certificates (controllers, sensors, software licences)" },
      { key: "del.bms_field_devices_network_install", label: "Installation of field devices, controllers, network infrastructure and head-end equipment" },
      { key: "del.bms_software_config_graphics_dev", label: "Software configuration, graphics development and control strategy implementation" },
      { key: "del.bms_integration_testing", label: "Integration testing with other building systems", description: "Linked SHTMs." },
      { key: "del.bms_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.bms_temp_monitoring_cover_arrangements", label: "Temporary BMS / monitoring cover arrangements", description: "Essential — continuity of monitoring and control of critical plant must be maintained throughout the works. Cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.bms_decommissioning_records", label: "Decommissioning records of redundant BMS equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.bms_full_commissioning_functional_records", label: "Full commissioning, functional testing and validation records", description: "CIBSE / BSRIA guidance." },
      { key: "del.bms_point_to_point_alarm_testing", label: "Point-to-point testing, control strategy proving and alarm testing", description: "Critical life-safety verification — confirms the system correctly monitors and alarms on critical plant failure. Cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.bms_graphics_ui_reporting_verification", label: "Graphics, user interface and reporting verification" },
      { key: "del.bms_cybersecurity_testing_hardening", label: "Cybersecurity testing and hardening confirmation", description: "Distinct from general functional commissioning — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.bms_as_fitted_drawings_config_backups", label: "As-fitted drawings, final point schedules, network diagrams and configuration backups" },
      { key: "del.bms_om_manuals_training_materials", label: "Comprehensive O&M manuals, user guides and training materials", description: "SHTM 00." },
      { key: "del.bms_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer requirements, cybersecurity standards and relevant SHTMs" },
      { key: "del.bms_disaster_recovery_arrangements", label: "Configuration backups and disaster recovery arrangements" },
      { key: "del.bms_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.bms_training_records", label: "Training & demonstration records for estates, energy and clinical users", description: "SHTM 00." },
      { key: "del.bms_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.bms_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.bms_formal_stakeholder_acceptance", label: "Formal client / stakeholder acceptance", description: "Essential.", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.bms_soft_landings_review", label: "Soft landings / post-occupancy evaluation (performance, usability, energy savings, alarm management)", description: "SHTM 00." },
      { key: "del.bms_updated_operational_procedures", label: "Updated operational procedures, alarm response protocols and energy reporting routines" },
      { key: "del.bms_ongoing_maintenance_cyber_regime", label: "Ongoing maintenance, software update and cybersecurity regime" },
      { key: "del.bms_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.bms_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(bmsStageTemplates, bmsDeliverableDefsByStage);

  // ── 13th Template: Chilled Water & Cooling Systems Replacement —
  // chillers, closed chilled-water (CHW) distribution circuit, pumps,
  // pressurisation, AHU cooling coils, free cooling, and refrigerant
  // plant. Content supplied (Chilled water  cooling systems.docx,
  // 21 Aug 2026). Grounded in SHTM 03-01 (strongly linked — cooling of
  // critical areas), SHTM 00, SHTM 06 series, CIBSE Guides B & H, BSRIA
  // guidance, F-Gas Regulations, CDM 2015. Genuinely distinct from
  // Ventilation & Air Handling Systems Replacement (that's the air-side
  // AHU/ductwork; this is the chiller plant and CHW circuit that feeds
  // AHU cooling coils) and from Boiler & Heating Plant Replacement
  // (heating, not cooling) — no supersede here, this is a clean new
  // addition. Reuses AUTHORISED_PERSON_VENTILATION for the closed
  // CHW circuit's critical water-treatment step, same reasoning as
  // Boiler's LTHW circuit — it's the same H&V engineering discipline.
  // New compliance rule comp.fgas_regulations_compliance, tagged
  // refrigerant_systems_affected — F-Gas is as distinct a statutory
  // regime for refrigerant-containing plant as PSSR is for pressure
  // systems or LOLER is for lifting equipment. Fire compartmentation
  // item added at Gate 3 for pipework penetrations, per standing
  // practice.
  const chilledWaterTemplate = await db.template.create({
    data: {
      key: "template.health.chilled_water_cooling_replacement",
      name: "Chilled Water & Cooling Systems Replacement",
      description:
        "Chilled water and cooling system replacement or major upgrade — chillers, chilled water (CHW) distribution, pumps, pressurisation, AHU cooling coils, free cooling, and associated controls, in an operational healthcare environment. Not the air-side AHU/ductwork itself — see Ventilation & Air Handling Systems Replacement for that. Not space heating — see Boiler & Heating Plant Replacement for that.",
      matchKeywords: [
        "chiller",
        "chilled water",
        "cooling system",
        "CHW",
        "cooling plant",
        "air-cooled chiller",
        "water-cooled chiller",
        "free cooling",
        "AHU cooling coil",
        "F-Gas",
        "comfort cooling",
        "critical cooling",
      ],
      sectorVariantId: health.id,
    },
  });
  const chilledWaterStageTemplates = await createStageAndGateTemplates(chilledWaterTemplate.id);

  const chilledWaterDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.chilledwater_business_case", label: "Business case / need identification (system age, capacity, resilience, energy performance, critical cooling risks)", description: "SHTM 00, SHTM 03-01." },
      { key: "del.chilledwater_strategic_brief", label: "Strategic brief & project outcomes (clinical resilience, continuity of cooling, energy efficiency, future capacity)" },
      { key: "del.chilledwater_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 03-01." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.chilledwater_project_brief", label: "Project Brief (scope of chilled water / cooling works, resilience requirements, critical areas)", description: "SHTM 00, SHTM 03-01." },
      { key: "del.chilledwater_condition_surveys", label: "Existing system condition surveys (chillers, CHW pipework, pumps, pressurisation, coils, water quality)" },
      { key: "del.chilledwater_load_capacity_analysis", label: "Cooling load assessment and residual capacity analysis", description: "CIBSE." },
      { key: "del.chilledwater_expanded_risk_register", label: "Initial risk register (loss of cooling, critical areas, water treatment, refrigerants)", description: "SHTM 00, CDM 2015." },
      { key: "del.chilledwater_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.chilledwater_stakeholder_engagement", label: "Engagement with clinical, estates and energy stakeholders", description: "SHTM 00." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.chilledwater_concept_design_report", label: "Concept design options (chiller type, air-cooled vs water-cooled, free cooling, resilience philosophy, distribution strategy)", description: "SHTM 03-01, CIBSE." },
      { key: "del.chilledwater_outline_cooling_strategy", label: "Outline cooling strategy (temperatures, flow rates, primary/secondary, buffer vessels)", description: "CIBSE." },
      { key: "del.chilledwater_preliminary_schematics_load", label: "Preliminary schematics and load schedules" },
      { key: "del.chilledwater_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.chilledwater_concept_risk_assessment", label: "Design risk assessment (high-level only)", description: "CDM 2015, SHTM 00." },
      { key: "del.chilledwater_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.chilledwater_coordinated_layout_drawings", label: "Coordinated design (chiller locations, pipe routes, pump rooms, access, external plant)", description: "SHTM 00." },
      { key: "del.chilledwater_mep_structural_coordination", label: "Spatial coordination with structure, electrical, ventilation, fire compartments and other services", description: "SHTM 00." },
      { key: "del.chilledwater_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for pipework penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.chilledwater_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary cooling strategy (principles only)" },
      { key: "del.chilledwater_resilience_freecooling_confirmation", label: "Confirmation of resilience and free-cooling provisions — high-level temporary arrangements strategy only", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.chilledwater_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.chilledwater_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.chilledwater_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.chilledwater_treatment_corrosion_strategy", label: "Water treatment / chemical dosing / corrosion and microbiological control strategy", description: "BSRIA, SHTM 04-01 principles." },
      { key: "del.chilledwater_control_strategy_bms_schedules", label: "Control strategy, sequences and BMS point schedules", description: "SHTM 03-01 linked, CIBSE Guide H." },
      { key: "del.chilledwater_electrical_design", label: "Electrical design associated with chillers, pumps and controls", description: "SHTM 06 series." },
      { key: "del.chilledwater_refrigerant_fgas_management", label: "Refrigerant management and F-Gas compliance (if applicable)", description: "F-Gas Regulations." },
      { key: "del.chilledwater_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.chilledwater_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 00.", bypassAuthority: "SRO" },
      { key: "del.chilledwater_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.chilledwater_stakeholder_design_approval", label: "Stakeholder review and approval of design", description: "SHTM 00.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.chilledwater_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.chilledwater_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.chilledwater_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.chilledwater_method_statements_temp_cooling", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary cooling arrangements", description: "Critical for clinical areas — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_material_equipment_certificates", label: "Material & equipment certificates (chillers, pumps, pipework, valves, insulation)", description: "Manufacturer certification." },
      { key: "del.chilledwater_chillers_pipework_install", label: "Installation of chillers, pipework, pumps, pressurisation units, insulation and controls" },
      { key: "del.chilledwater_pressure_testing_flushing_dosing", label: "Pressure testing, flushing, cleaning and chemical treatment records", description: "Critical water-treatment step for a closed chilled water system, per BSRIA guidance — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.chilledwater_water_sampling_quality_records", label: "Water sampling and quality records" },
      { key: "del.chilledwater_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.chilledwater_temp_cooling_hybrid_arrangements", label: "Temporary cooling / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_decommissioning_records", label: "Decommissioning & strip-out records of redundant cooling equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.chilledwater_full_commissioning_validation_records", label: "Full commissioning & validation records (flow rates, temperatures, pressures, chiller performance, control sequences)", description: "CIBSE, BSRIA." },
      { key: "del.chilledwater_performance_testing_partload", label: "Performance testing at part-load and design conditions" },
      { key: "del.chilledwater_water_treatment_verification_baseline", label: "Water treatment verification and baseline quality report", description: "Critical water-treatment step for a closed chilled water system — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.chilledwater_as_fitted_drawings_control_logic", label: "As-fitted drawings, schematics, valve schedules and control logic" },
      { key: "del.chilledwater_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.chilledwater_fgas_register_leak_check", label: "F-Gas register and leak-check compliance confirmed (where applicable)", description: "F-Gas Regulations — distinct statutory step from general commissioning.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with CIBSE, BSRIA, F-Gas (where applicable) and manufacturer requirements" },
      { key: "del.chilledwater_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.chilledwater_training_records", label: "Training & demonstration records for estates and energy staff", description: "SHTM 00." },
      { key: "del.chilledwater_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.chilledwater_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.chilledwater_formal_stakeholder_acceptance", label: "Formal client / stakeholder acceptance", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.chilledwater_soft_landings_review", label: "Soft landings / post-occupancy review (cooling performance, energy, resilience, user feedback)", description: "SHTM 00." },
      { key: "del.chilledwater_updated_maintenance_regime", label: "Updated maintenance regime, water treatment programme and monitoring procedures" },
      { key: "del.chilledwater_ongoing_performance_energy_monitoring", label: "Ongoing performance and energy monitoring" },
      { key: "del.chilledwater_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.chilledwater_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(chilledWaterStageTemplates, chilledWaterDeliverableDefsByStage);

  // ── 14th Template: Steam Systems Replacement — steam generation,
  // distribution, condensate recovery, pressure reducing stations,
  // humidification, and sterile-services steam supply. Content
  // supplied (Steam Systems.docx, 21 Aug 2026). Squarely a
  // Pressure Systems Safety Regulations (PSSR) discipline — the source
  // document states plainly "Steam systems are pressure systems and
  // fall under PSSR" and "A Written Scheme of Examination is
  // mandatory" — distinct from Boiler & Heating Plant Replacement's
  // LTHW space-heating circuit despite both being "boilers" in the
  // loose sense: steam generation/distribution/condensate serves
  // sterile services, humidification and process loads, not space
  // heating, and runs at a different pressure regime entirely. No new
  // BypassAuthority — the doc's authority figure is PSSR's own
  // "Competent Person", the same external statutory role (not a
  // Trust-appointed AP) that LOLER's thorough examination used for
  // lifts. No new compliance rule either — reuses the existing
  // comp.pssr_written_scheme rule built for the Boiler template
  // (tagged pressure_systems_affected), since this is the same
  // statutory regime, not a separate one. Physical safety-critical
  // tests with no dedicated AP (NDT/pressure/welding records, safety
  // valve certification) use SRO, matching the Boiler/Lift/BMS
  // precedent. Fire compartmentation item added at Gate 3 for
  // pipework penetrations, per standing practice.
  const steamTemplate = await db.template.create({
    data: {
      key: "template.health.steam_systems_replacement",
      name: "Steam Systems Replacement",
      description:
        "Steam system replacement or major upgrade — steam generation, distribution, condensate recovery, pressure reducing stations (PRVs), humidification, and sterile-services steam supply, in an operational healthcare environment. Not the LTHW space-heating circuit — see Boiler & Heating Plant Replacement for that, even though both are pressure-systems/PSSR-governed plant.",
      matchKeywords: [
        "steam",
        "steam boiler",
        "steam generation",
        "condensate",
        "pressure reducing station",
        "PRV",
        "sterile services steam",
        "humidification steam",
        "steam distribution",
        "Written Scheme of Examination",
      ],
      sectorVariantId: health.id,
    },
  });
  const steamStageTemplates = await createStageAndGateTemplates(steamTemplate.id);

  const steamDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.steam_business_case", label: "Business case / need identification (system age, reliability, safety, energy efficiency, residual life)", description: "SHTM 00, PSSR." },
      { key: "del.steam_strategic_brief", label: "Strategic brief & project outcomes (safety, continuity of supply, compliance, energy performance)" },
      { key: "del.steam_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.steam_project_brief", label: "Project Brief (scope of steam generation, distribution, condensate and user modifications)", description: "SHTM 00." },
      { key: "del.steam_condition_surveys", label: "Existing system condition surveys (boilers, distribution, PRVs, traps, condensate, water treatment)", description: "PSSR." },
      { key: "del.steam_written_scheme_review", label: "Review of existing Written Scheme of Examination and inspection history", description: "PSSR." },
      { key: "del.steam_expanded_risk_register", label: "Initial risk register (pressure system failure, loss of steam, burns, water treatment)", description: "SHTM 00, CDM 2015, PSSR." },
      { key: "del.steam_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.steam_competent_person_engagement", label: "Engagement with Competent Person, estates and clinical stakeholders", description: "PSSR." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.steam_concept_design_report", label: "Concept design options (boiler type, pressure levels, distribution strategy, condensate recovery, resilience)", description: "CIBSE, manufacturer data." },
      { key: "del.steam_outline_system_strategy", label: "Outline steam system strategy (generation, distribution, reduction, condensate)" },
      { key: "del.steam_preliminary_schematics_load", label: "Preliminary schematics and load assessment" },
      { key: "del.steam_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.steam_concept_risk_assessment", label: "Design risk assessment (including pressure system hazards, high-level only)", description: "CDM 2015, PSSR." },
      { key: "del.steam_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.steam_coordinated_layout_drawings", label: "Coordinated design (boiler plant, pipe routes, PRV stations, condensate receiver locations, access)", description: "SHTM 00." },
      { key: "del.steam_mep_structural_coordination", label: "Spatial coordination with structure, electrical, ventilation and other services", description: "SHTM 00." },
      { key: "del.steam_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for pipework penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.steam_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary steam strategy (principles only)" },
      { key: "del.steam_critical_user_resilience_confirmation", label: "Confirmation of critical user resilience requirements — high-level temporary arrangements strategy only", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.steam_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.steam_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.steam_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.steam_pressure_system_design_safety_schedule", label: "Pressure system design and safety device schedule", description: "PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_water_treatment_blowdown_strategy", label: "Water treatment / chemical dosing / blowdown strategy", description: "Manufacturer / BESSafe principles." },
      { key: "del.steam_control_strategy_bms_integration", label: "Control strategy, sequences and BMS integration" },
      { key: "del.steam_electrical_design", label: "Electrical design associated with boilers, pumps and controls", description: "SHTM 06 series." },
      { key: "del.steam_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.steam_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, PSSR.", bypassAuthority: "SRO" },
      { key: "del.steam_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.steam_competent_person_design_review", label: "Competent Person review of design (where required under Written Scheme)", description: "PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.steam_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.steam_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.steam_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.steam_method_statements_temp_steam", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary steam arrangements", description: "Critical for process users — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_material_equipment_certificates", label: "Material & equipment certificates (boilers, pipework, valves, safety devices)", description: "PED / BS EN standards." },
      { key: "del.steam_boilers_pipework_prv_install", label: "Installation of boilers, pipework, PRVs, traps, insulation and controls" },
      { key: "del.steam_ndt_pressure_welding_records", label: "NDT, pressure testing and welding records", description: "Critical life-safety verification for a pressure system, per PSSR / BS standards — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.steam_water_treatment_install_dosing", label: "Water treatment system installation and initial dosing records" },
      { key: "del.steam_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.steam_temp_steam_hybrid_arrangements", label: "Temporary steam / hybrid working arrangements (if phased)", description: "Essential where required — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_decommissioning_records", label: "Decommissioning & strip-out records of redundant steam equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.steam_full_commissioning_validation_records", label: "Full commissioning & validation records (pressure, temperature, safety device function, control sequences)", description: "Manufacturer data, CIBSE." },
      { key: "del.steam_safety_valve_setting_certification", label: "Safety valve setting and certification", description: "Critical life-safety verification for a pressure system, per PSSR — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.steam_performance_testing_boilers_distribution", label: "Performance testing of boilers and distribution" },
      { key: "del.steam_updated_written_scheme", label: "Updated Written Scheme of Examination", description: "PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_as_fitted_drawings_pressure_docs", label: "As-fitted drawings, schematics, valve schedules and pressure system documentation", description: "PSSR." },
      { key: "del.steam_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.steam_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with PSSR, PED, relevant BS EN standards and manufacturer requirements" },
      { key: "del.steam_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.steam_training_records", label: "Training & demonstration records for estates staff", description: "SHTM 00." },
      { key: "del.steam_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.steam_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.steam_formal_acceptance", label: "Formal client / Competent Person acceptance", description: "PSSR.", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.steam_soft_landings_review", label: "Soft landings / post-occupancy review (performance, reliability, safety, energy)", description: "SHTM 00." },
      { key: "del.steam_updated_written_scheme_inspection_regime", label: "Updated Written Scheme of Examination and inspection regime", description: "Statutory requirement under PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_ongoing_treatment_maintenance_examination", label: "Ongoing water treatment, maintenance and statutory examination programme", description: "Statutory requirement under PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.steam_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(steamStageTemplates, steamDeliverableDefsByStage);

  // ── 15th Template: Fire Suppression Systems Replacement —
  // sprinklers, water mist, gaseous suppression, foam systems and
  // associated controls/interfaces. Content supplied (Fire
  // Supression System.docx, 21 Aug 2026). Companion to Fire Alarm &
  // Detection Systems Replacement (built earlier this session) but
  // genuinely distinct: this is active suppression/extinguishing
  // hardware, that was detection/alarm sensing hardware — the two
  // systems interface with each other (cause & effect) but are
  // different disciplines. Grounded in NHSScotland Firecode (SHTM 81,
  // SHTM 82 for the interface, SHTM 86 fire risk assessment), BS EN
  // 12845 (sprinklers), BS EN 15004/ISO 14520 (gaseous), CDM 2015. Same
  // pattern as Fire Alarm: no new BypassAuthority or Role — every
  // statutory checkpoint here is the existing FIRE_OFFICER authority
  // (the source document's "Fire Safety Advisor / Authorising
  // Engineer" is that same site fire authority) — and no new
  // ComplianceRuleTemplate, since comp.fire_risk_assessment already
  // covers the core statutory concern for any occupied project.
  const fireSuppressionTemplate = await db.template.create({
    data: {
      key: "template.health.fire_suppression_replacement",
      name: "Fire Suppression Systems Replacement",
      description:
        "Fire suppression system replacement or major upgrade — sprinklers, water mist, gaseous suppression, foam systems, and associated controls/interfaces, in an operational healthcare environment. Not fire detection/alarm hardware (panels, detectors, call points) — see Fire Alarm & Detection Systems Replacement for that, even though the two systems interface with each other.",
      matchKeywords: [
        "sprinkler",
        "fire suppression",
        "water mist",
        "gaseous suppression",
        "gas suppression",
        "foam system",
        "fire sprinkler",
        "suppression system",
        "BS EN 12845",
        "fire extinguishing",
      ],
      sectorVariantId: health.id,
    },
  });
  const fireSuppressionStageTemplates = await createStageAndGateTemplates(fireSuppressionTemplate.id);

  const fireSuppressionDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.firesuppression_business_case", label: "Business case / need identification (system age, reliability, coverage, compliance with current fire strategy)", description: "SHTM 00, SHTM 81." },
      { key: "del.firesuppression_strategic_brief", label: "Strategic brief & project outcomes (life safety, property protection, business continuity, compliance)" },
      { key: "del.firesuppression_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 86." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.firesuppression_project_brief", label: "Project Brief (scope of suppression works — sprinkler / water mist / gas / foam, areas covered)", description: "SHTM 00, SHTM 81." },
      { key: "del.firesuppression_condition_surveys", label: "Existing system condition surveys (pipework, valves, pump sets, cylinders, nozzles, interfaces)", description: "SHTM 81." },
      { key: "del.firesuppression_strategy_risk_assessment_review", label: "Review of current fire strategy and fire risk assessment", description: "SHTM 81, SHTM 86." },
      { key: "del.firesuppression_expanded_risk_register", label: "Initial risk register (loss of protection, false discharge, water damage, clinical impact)", description: "SHTM 00, CDM 2015, SHTM 86." },
      { key: "del.firesuppression_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.firesuppression_fsa_engagement", label: "Formal engagement with Fire Safety Advisor / Authorising Engineer", description: "SHTM 81, SHTM 86." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.firesuppression_concept_design_report", label: "Concept design options (sprinkler vs water mist vs gaseous, coverage extent, resilience)", description: "SHTM 81, BS EN 12845 / relevant standards." },
      { key: "del.firesuppression_outline_strategy", label: "Outline suppression strategy aligned with fire strategy and compartmentation", description: "SHTM 81." },
      { key: "del.firesuppression_preliminary_layouts_hazard_class", label: "Preliminary schematic layouts and hazard classification", description: "Relevant BS EN standards." },
      { key: "del.firesuppression_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.firesuppression_concept_risk_assessment", label: "Design risk assessment (high-level only)", description: "CDM 2015, SHTM 00, SHTM 81." },
      { key: "del.firesuppression_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.firesuppression_coordinated_layout_drawings", label: "Coordinated design (pipe routes, valve sets, pump rooms, cylinder locations, nozzle positions)", description: "SHTM 81." },
      { key: "del.firesuppression_mep_structural_coordination", label: "Spatial coordination with structure, ceilings, other services and fire compartments", description: "SHTM 81." },
      { key: "del.firesuppression_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary protection strategy (principles only)" },
      { key: "del.firesuppression_alarm_interface_confirmation", label: "Confirmation of interface requirements with fire alarm system — high-level temporary arrangements strategy only", description: "SHTM 82.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.firesuppression_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.firesuppression_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.firesuppression_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.firesuppression_hydraulic_agent_calculations", label: "Hydraulic calculations (sprinkler / water mist) or agent quantity calculations (gaseous)", description: "BS EN 12845 or BS EN 15004." },
      { key: "del.firesuppression_cause_effect_matrix", label: "Cause & effect / interface matrix with fire detection & alarm system", description: "SHTM 82." },
      { key: "del.firesuppression_water_agent_storage_design", label: "Water supply / storage or agent storage design", description: "Relevant standards." },
      { key: "del.firesuppression_building_regs_compliance_info", label: "Building Regulations / Fire Standards compliance information", description: "Building Standards (Scotland).", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.firesuppression_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.firesuppression_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 81.", bypassAuthority: "SRO" },
      { key: "del.firesuppression_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.firesuppression_fsa_design_approval", label: "Fire Safety Advisor / Authorising Engineer review and approval of design", description: "SHTM 81, SHTM 86 — only the site NHS Fire Officer can approve or reject fire-related design compliance, not the SRO or Compliance Officer.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.firesuppression_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.firesuppression_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.firesuppression_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.firesuppression_method_statements_temp_protection", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary protection arrangements", description: "Critical for life safety — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_material_equipment_certificates", label: "Material & equipment certificates (pipework, valves, pumps, cylinders, nozzles)", description: "Relevant standards." },
      { key: "del.firesuppression_pipework_valves_nozzles_install", label: "Installation of pipework, valve sets, pumps, cylinders, nozzles and controls", description: "Relevant BS EN standards." },
      { key: "del.firesuppression_pressure_flushing_integrity_testing", label: "Pressure testing, flushing and integrity testing records", description: "Critical life-safety verification of the suppression system's physical integrity, per BS EN 12845 / relevant standards. Cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_alarm_interface_preliminary_testing", label: "Interface installation and preliminary testing with fire alarm system", description: "SHTM 82." },
      { key: "del.firesuppression_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.firesuppression_temp_protection_hybrid_arrangements", label: "Temporary protection / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_decommissioning_records", label: "Decommissioning & strip-out records of redundant suppression equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.firesuppression_full_commissioning_certification_records", label: "Full commissioning, testing and certification records", description: "Relevant BS EN / ISO standards." },
      { key: "del.firesuppression_discharge_performance_verification", label: "Hydraulic / agent discharge performance verification (where safe and appropriate)", description: "Critical life-safety verification — confirms the suppression system will actually discharge and perform as designed. Cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_cause_effect_alarm_testing", label: "Interface and cause-and-effect testing with fire detection & alarm system", description: "Critical life-safety verification, per SHTM 82. Cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_as_fitted_drawings_calc_packages", label: "As-fitted drawings, schematics, valve schedules and calculation packages", description: "SHTM 81." },
      { key: "del.firesuppression_om_manuals_logbooks", label: "Comprehensive O&M manuals and log books", description: "SHTM 00." },
      { key: "del.firesuppression_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with SHTM 81, relevant BS EN / ISO standards and the building fire strategy" },
      { key: "del.firesuppression_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.firesuppression_training_records", label: "Training & demonstration records for estates and fire response teams", description: "SHTM 81, SHTM 83." },
      { key: "del.firesuppression_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.firesuppression_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.firesuppression_fsa_formal_acceptance", label: "Formal acceptance by Fire Safety Advisor / Authorising Engineer", description: "SHTM 81, SHTM 86.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_updated_fire_risk_assessment", label: "Updated fire risk assessment reflecting the new system", description: "SHTM 86.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.firesuppression_soft_landings_review", label: "Soft landings / post-occupancy review (system performance, false discharge risk, user feedback)", description: "SHTM 00." },
      { key: "del.firesuppression_updated_maintenance_regime", label: "Updated maintenance, inspection and testing regime", description: "Relevant BS EN standards, SHTM 81." },
      { key: "del.firesuppression_ongoing_alarm_interface_testing", label: "Ongoing interface testing with fire alarm system", description: "SHTM 82." },
      { key: "del.firesuppression_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.firesuppression_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(fireSuppressionStageTemplates, fireSuppressionDeliverableDefsByStage);

  // ── 16th Template: Security Systems Replacement — CCTV, access
  // control, intruder detection, staff attack/panic systems, control
  // room equipment and associated networks. Content supplied
  // (Security Systems.docx, 21 Aug 2026). Grounded in NHS Scotland
  // Security Standards, SHTM 00, BS EN standards for CCTV/access
  // control/intruder alarms, NHS cybersecurity guidance, UK GDPR/Data
  // Protection Act 2018, CDM 2015. Introduces
  // INFORMATION_GOVERNANCE_OFFICER (21 Aug 2026) — a genuinely
  // distinct authority from Clinical Safety Officer: DPIA sign-off,
  // data retention/destruction, and formal system acceptance sit with
  // a named DPO/Caldicott Guardian appointment under UK GDPR, not
  // clinical risk management or an engineering AP. New compliance rule
  // comp.security_dpia_completed, tagged
  // personal_data_processing_system_affected. Fire compartmentation
  // item added at Gate 3 for cable-routing penetrations, per standing
  // practice. Deliberately notes the "staff attack" terminology
  // overlap with the Nurse Call & Staff Paging template in its own
  // description — the source document itself lists "Nurse Call /
  // Staff Attack overlap" as a linked system, so this is a genuine
  // real-world ambiguity for the LLM/Compliance-Officer-review step to
  // resolve by context, not something keyword-tuning alone can fix.
  const securityTemplate = await db.template.create({
    data: {
      key: "template.health.security_systems_replacement",
      name: "Security Systems Replacement",
      description:
        "Security system replacement or major upgrade — CCTV, access control, intruder detection, staff attack/panic systems, control room equipment, and associated networks, in an operational healthcare environment. Note: staff attack/panic alarms genuinely overlap with the Nurse Call & Staff Paging template — a project centred on bedhead/clinical call points matches that template, one centred on CCTV/access control/security infrastructure matches this one.",
      matchKeywords: [
        "CCTV",
        "access control",
        "intruder detection",
        "intruder alarm",
        "security system",
        "panic alarm",
        "staff attack",
        "door entry",
        "security camera",
        "control room",
        "DPIA",
      ],
      sectorVariantId: health.id,
    },
  });
  const securityStageTemplates = await createStageAndGateTemplates(securityTemplate.id);

  const securityDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.security_business_case", label: "Business case / need identification (system age, coverage gaps, reliability, compliance, risk profile)", description: "SHTM 00." },
      { key: "del.security_strategic_brief", label: "Strategic brief & project outcomes (staff/patient safety, asset protection, situational awareness, compliance)" },
      { key: "del.security_risk_operational_impact_assessment", label: "High-level security risk and operational impact assessment", description: "NHS Scotland Security Standards." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.security_project_brief", label: "Project Brief (scope: CCTV, access control, intruder, staff attack, control room)", description: "SHTM 00." },
      { key: "del.security_condition_surveys", label: "Existing system condition surveys (cameras, readers, panels, recording, networks, coverage)" },
      { key: "del.security_risk_assessment_gap_analysis", label: "Security risk assessment review and gap analysis", description: "NHS Scotland Security Standards." },
      { key: "del.security_expanded_risk_register", label: "Initial risk register (loss of coverage, data protection, cybersecurity, operational impact)", description: "SHTM 00, CDM 2015." },
      { key: "del.security_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.security_stakeholder_engagement", label: "Engagement with Security, IT/Cyber, Information Governance, Estates and clinical stakeholders", description: "Critical." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.security_concept_design_report", label: "Concept design options (camera technology, access control architecture, integration, cloud vs on-premise)", description: "BS EN standards." },
      { key: "del.security_outline_strategy", label: "Outline security strategy (coverage, detection, response, recording, retention)", description: "NHS Scotland Security Standards." },
      { key: "del.security_preliminary_layouts", label: "Preliminary layouts (camera locations, access points, control room)" },
      { key: "del.security_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.security_concept_risk_assessment", label: "Design risk assessment (including privacy and cybersecurity)", description: "CDM 2015, GDPR." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.security_coordinated_layout_drawings", label: "Coordinated design (camera positions, reader locations, cabling routes, control room, equipment rooms)" },
      { key: "del.security_mep_structural_coordination", label: "Spatial coordination with structure, ceilings, lighting, other services and fire compartments", description: "SHTM 00." },
      { key: "del.security_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for cable routing penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.security_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary coverage strategy" },
      { key: "del.security_network_power_resilience_confirmation", label: "Confirmation of network and power resilience requirements", description: "SHTM 06 linked.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.security_full_technical_design_package", label: "Full technical design drawings, schematics, camera schedules and access control schedules", description: "BS EN standards." },
      { key: "del.security_detailed_specifications", label: "Detailed specifications (cameras, recorders/VMS, readers, controllers, detectors, software, networks)", description: "Manufacturer and BS EN standards." },
      { key: "del.security_network_cybersecurity_design", label: "Network architecture, cybersecurity design and hardening measures", description: "NHS cyber standards." },
      { key: "del.security_dpia", label: "Data protection / privacy impact assessment (DPIA) for CCTV and access control", description: "GDPR / UK Data Protection Act 2018.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.security_recording_retention_audit_design", label: "Recording, retention, export and audit trail design", description: "Information Governance.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.security_electrical_design", label: "Electrical design associated with power and backup", description: "SHTM 06 series." },
      { key: "del.security_interface_design_other_systems", label: "Interface design with other systems (fire, BMS, nurse call, lifts if required)" },
      { key: "del.security_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.security_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.security_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.security_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.security_stakeholder_design_approval", label: "Stakeholder review and approval of design (Security, IG, Cyber, Estates)", description: "Essential.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.security_method_statements_temp_coverage", label: "Contractor method statements, detailed phasing & temporary security coverage arrangements", description: "Critical — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.security_material_equipment_certificates", label: "Material & equipment certificates (cameras, recorders, readers, controllers, software licences)", description: "Manufacturer certification." },
      { key: "del.security_cameras_readers_networks_install", label: "Installation of cameras, readers, detectors, cabling, control equipment and networks" },
      { key: "del.security_network_config_cyber_hardening_testing", label: "Network configuration, cybersecurity hardening and testing records", description: "Cyber standards.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.security_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.security_temp_coverage_hybrid_arrangements", label: "Temporary coverage / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.security_decommissioning_secure_destruction_records", label: "Decommissioning & secure destruction records of redundant equipment and data", description: "GDPR / Information Governance.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.security_full_commissioning_functional_records", label: "Full commissioning, functional testing and performance verification records", description: "BS EN / manufacturer data." },
      { key: "del.security_coverage_image_quality_recording_verification", label: "Camera coverage, image quality and recording verification" },
      { key: "del.security_access_control_antipassback_audit_testing", label: "Access control, anti-passback, audit trail and integration testing" },
      { key: "del.security_cybersecurity_vulnerability_confirmation", label: "Cybersecurity testing and vulnerability confirmation", description: "NHS cyber standards — cannot be bypassed at PM level.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.security_as_fitted_drawings_config_backups", label: "As-fitted drawings, camera schedules, access schedules, network diagrams and configuration backups" },
      { key: "del.security_om_manuals_admin_docs", label: "Comprehensive O&M manuals, user guides and administrator documentation", description: "SHTM 00." },
      { key: "del.security_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with NHS Scotland Security Standards, BS EN standards, cybersecurity requirements and GDPR" },
      { key: "del.security_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.security_training_records", label: "Training & demonstration records for Security, Estates and Control Room staff" },
      { key: "del.security_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.security_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.security_formal_acceptance", label: "Formal acceptance by Security, Information Governance and client", description: "Essential.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.security_updated_dpia_retention_policies", label: "Updated DPIA and data retention policies", description: "GDPR / Information Governance.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.security_soft_landings_review", label: "Soft landings / post-occupancy review (coverage effectiveness, usability, false alarms, user feedback)", description: "SHTM 00." },
      { key: "del.security_updated_operational_procedures", label: "Updated operational procedures, monitoring protocols and incident response", description: "NHS Scotland Security Standards." },
      { key: "del.security_ongoing_maintenance_cyber_data_regime", label: "Ongoing maintenance, software update, cybersecurity and data management regime" },
      { key: "del.security_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.security_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(securityStageTemplates, securityDeliverableDefsByStage);

  // ── 17th Template: Pneumatic Tube System (PTS) Replacement — tube
  // network, stations, blowers/compressors, carriers, control system
  // and software, for transporting specimens, blood products,
  // medicines and documents between departments (lab, pharmacy, blood
  // bank, theatres). Content supplied (Pneumatic_Tube_System.docx,
  // 21 Aug 2026). Grounded in manufacturer standards, SHTM 00,
  // Infection Prevention & Control (IPC) requirements, SHTM 06 series,
  // SHTM 08-01 (acoustics, where relevant), CDM 2015. Reuses the
  // existing CLINICAL_SAFETY_OFFICER authority (added for Nurse Call)
  // rather than inventing a new one — carrier tracking/prioritisation
  // and "Clinical and IPC stakeholder review/approval" is the same
  // kind of clinical-governance concern (misrouted or contaminated
  // specimens/blood products is a direct patient-safety risk), not an
  // engineering AP, Fire Officer, or Information Governance matter. No
  // new compliance rule either — where a project's PTS control/
  // tracking software is genuinely safety-related health IT, it can
  // share the existing comp.clinical_safety_case_dcb0160 rule (tagged
  // health_it_clinical_safety_case_required) the same way Nurse Call
  // does, rather than duplicating it. Physical integrity tests
  // (leakage/pressure) use SRO, matching the Boiler/Lift/Steam
  // precedent for safety-critical physical verification with no
  // dedicated AP. Fire compartmentation item added at Gate 3 for tube
  // routing penetrations, per standing practice.
  const ptsTemplate = await db.template.create({
    data: {
      key: "template.health.pneumatic_tube_system_replacement",
      name: "Pneumatic Tube System Replacement",
      description:
        "Pneumatic tube system (PTS) replacement or major upgrade — tube network, stations, blowers/compressors, carriers, control system and software, for transporting specimens, blood products, medicines and documents between departments (laboratory, pharmacy, blood bank, theatres, wards), in an operational healthcare environment. Not a communications/alerting system — see Nurse Call & Staff Paging Systems Replacement for that.",
      matchKeywords: [
        "pneumatic tube",
        "PTS",
        "specimen transport",
        "carrier system",
        "tube station",
        "blood transport",
        "pharmacy transport",
        "sample transport",
        "tube network",
      ],
      sectorVariantId: health.id,
    },
  });
  const ptsStageTemplates = await createStageAndGateTemplates(ptsTemplate.id);

  const ptsDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.pts_business_case", label: "Business case / need identification (system age, reliability, capacity, downtime impact, clinical risk)", description: "SHTM 00." },
      { key: "del.pts_strategic_brief", label: "Strategic brief & project outcomes (clinical turnaround times, resilience, expandable network, infection control)" },
      { key: "del.pts_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical risk." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.pts_project_brief", label: "Project Brief (scope of network, stations, capacity, priority routing, integration needs)", description: "SHTM 00." },
      { key: "del.pts_condition_surveys", label: "Existing system condition surveys (tubes, stations, blowers, carriers, control system, leakage, performance)", description: "Manufacturer standards." },
      { key: "del.pts_clinical_workflow_demand_analysis", label: "Clinical workflow and demand analysis (lab, pharmacy, blood bank, theatres, wards)", description: "Clinical stakeholders." },
      { key: "del.pts_expanded_risk_register", label: "Initial risk register (loss of service, specimen integrity, infection, noise, access)", description: "SHTM 00, CDM 2015, IPC." },
      { key: "del.pts_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.pts_clinical_stakeholder_engagement", label: "Engagement with Pathology, Pharmacy, Blood Bank, Theatres, Critical Care, IPC and Estates", description: "Essential." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.pts_concept_design_report", label: "Concept design options (network topology, station types, blower strategy, carrier technology, software)", description: "Manufacturer standards." },
      { key: "del.pts_outline_system_strategy", label: "Outline system strategy (routing, prioritisation, redundancy, future expansion)", description: "Clinical requirements." },
      { key: "del.pts_preliminary_station_routing", label: "Preliminary station location plan and tube routing strategy" },
      { key: "del.pts_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.pts_concept_risk_assessment", label: "Design risk assessment (including clinical and IPC risks, high-level only)", description: "CDM 2015, IPC." },
      { key: "del.pts_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.pts_coordinated_layout_drawings", label: "Coordinated design (tube routes, station locations, blower plant, access for maintenance)" },
      { key: "del.pts_mep_structural_coordination", label: "Spatial coordination with structure, ceilings, other services, fire compartments and clinical layouts", description: "SHTM 00." },
      { key: "del.pts_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for tube routing penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.pts_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary transport strategy (principles only)" },
      { key: "del.pts_critical_dept_resilience_confirmation", label: "Confirmation of critical department resilience requirements — high-level temporary arrangements strategy only", description: "Clinical stakeholders.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.pts_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.pts_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.pts_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.pts_tracking_prioritisation_alarm_design", label: "Carrier tracking, prioritisation, alarm and audit trail design", description: "Clinical requirements." },
      { key: "del.pts_power_control_network_design", label: "Power, control and network design", description: "SHTM 06 series." },
      { key: "del.pts_infection_control_cleanability", label: "Infection control and cleanability features", description: "IPC guidance.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_noise_vibration_considerations", label: "Noise and vibration considerations", description: "SHTM 08-01, where relevant." },
      { key: "del.pts_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.pts_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.pts_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, IPC.", bypassAuthority: "SRO" },
      { key: "del.pts_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.pts_clinical_ipc_design_approval", label: "Clinical and IPC stakeholder review and approval of design", description: "Essential.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.pts_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.pts_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.pts_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.pts_method_statements_temp_transport", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary specimen/medicine transport arrangements", description: "Critical for clinical service — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_material_equipment_certificates", label: "Material & equipment certificates (tubing, stations, blowers, carriers, software)", description: "Manufacturer certification." },
      { key: "del.pts_network_stations_install", label: "Installation of tube network, stations, diverters, blower plant and controls", description: "Manufacturer standards." },
      { key: "del.pts_pressure_leakage_integrity_testing", label: "Pressure / leakage testing and integrity records", description: "Critical physical integrity verification, per manufacturer standards — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.pts_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.pts_temp_transport_hybrid_arrangements", label: "Temporary transport / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_decommissioning_records", label: "Decommissioning & strip-out records of redundant pneumatic tube equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.pts_full_commissioning_functional_records", label: "Full commissioning, functional testing and performance verification records", description: "Manufacturer data." },
      { key: "del.pts_transit_prioritisation_tracking_tests", label: "Carrier transit time, prioritisation, tracking and empty carrier management tests", description: "Critical clinical workflow verification — confirms urgent specimens/blood products are correctly prioritised and tracked. Cannot be bypassed at PM level.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_leakage_pressure_integrity_verification", label: "Leakage, pressure and system integrity verification", description: "Critical physical integrity verification — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.pts_as_fitted_drawings_config_records", label: "As-fitted drawings, network schematics, station schedules and configuration records" },
      { key: "del.pts_om_manuals_admin_docs", label: "Comprehensive O&M manuals, user guides and administrator documentation", description: "SHTM 00." },
      { key: "del.pts_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer requirements, clinical risk assessments and infection control standards" },
      { key: "del.pts_config_backups_documentation", label: "Full system configuration backups and documentation" },
      { key: "del.pts_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.pts_training_records", label: "Training & demonstration records for clinical users, porters and estates staff", description: "Essential." },
      { key: "del.pts_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.pts_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.pts_formal_clinical_client_acceptance", label: "Formal clinical and client acceptance", description: "Essential.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.pts_soft_landings_review", label: "Soft landings / post-occupancy review (transit times, reliability, usability, clinical feedback)", description: "SHTM 00." },
      { key: "del.pts_updated_operational_procedures", label: "Updated operational procedures, prioritisation rules and contingency plans", description: "Clinical stakeholders." },
      { key: "del.pts_ongoing_maintenance_hygiene_monitoring", label: "Ongoing maintenance, carrier hygiene and performance monitoring regime", description: "Manufacturer standards, IPC." },
      { key: "del.pts_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.pts_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(ptsStageTemplates, ptsDeliverableDefsByStage);

  // ── 18th Template: Above-ground Drainage & Public Health Systems
  // Replacement — foul/soil & waste stacks, vents, floor drains,
  // channels, interceptors and access points WITHIN the building,
  // deliberately distinct from the existing Drainage & Foul Water
  // System Replacement template above, which is below-ground
  // (excavation, manholes, flow-path/falls). Content supplied
  // (Above_Ground.docx, 21 Aug 2026). Grounded in Building Standards
  // (Scotland) Section 3 Environment, BS EN 12056 (the same standard
  // the below-ground template already cites), IPC requirements, SHTM
  // 04-01 principles where water systems interface, CDM 2015. No new
  // BypassAuthority — follows the below-ground template's own
  // authority pattern closely: Fire Officer at Gate 3, and SRO for the
  // critical air/water testing verification (matching that template's
  // drain-test/CCTV precedent) since there's no dedicated AP for
  // public-health drainage, same reasoning as Boiler/Lift/Steam's
  // physical-integrity tests.
  const aboveGroundDrainageTemplate = await db.template.create({
    data: {
      key: "template.health.above_ground_drainage_replacement",
      name: "Above-ground Drainage & Public Health Systems Replacement",
      description:
        "Above-ground drainage and public health system replacement or major upgrade — foul/soil and waste stacks, vents, floor drains, channels, interceptors, and access points within the building, in an operational healthcare environment. Not below-ground excavated drainage (manholes, flow-path/falls) — see Drainage & Foul Water System Replacement for that.",
      matchKeywords: [
        "above ground drainage",
        "soil stack",
        "waste stack",
        "vent stack",
        "floor drain",
        "anti-siphonage",
        "rodding point",
        "drainage stack",
        "public health drainage",
        "interceptor",
      ],
      sectorVariantId: health.id,
    },
  });
  const aboveGroundDrainageStageTemplates = await createStageAndGateTemplates(aboveGroundDrainageTemplate.id);

  const aboveGroundDrainageDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.abovedrainage_business_case", label: "Business case / need identification (system age, blockages, odours, capacity, maintainability, compliance)", description: "SHTM 00." },
      { key: "del.abovedrainage_strategic_brief", label: "Strategic brief & project outcomes (reliability, maintainability, infection control, odour control, future flexibility)" },
      { key: "del.abovedrainage_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, IPC." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.abovedrainage_project_brief", label: "Project Brief (scope of foul, waste, vent and associated drainage works)", description: "SHTM 00." },
      { key: "del.abovedrainage_condition_surveys", label: "Existing system condition surveys (stacks, branches, floor drains, access points, known problem areas)" },
      { key: "del.abovedrainage_blockage_history_review", label: "Review of historical blockage, flooding or odour issues" },
      { key: "del.abovedrainage_expanded_risk_register", label: "Initial risk register (loss of service, flooding, infection, odour, access for maintenance)", description: "SHTM 00, CDM 2015, IPC." },
      { key: "del.abovedrainage_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.abovedrainage_stakeholder_engagement", label: "Engagement with Estates, IPC, clinical and housekeeping stakeholders", description: "Important." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.abovedrainage_concept_design_report", label: "Concept design options (stack strategy, materials, access provision, future flexibility)", description: "BS EN 12056." },
      { key: "del.abovedrainage_outline_strategy", label: "Outline drainage strategy (foul, waste, venting, gradients, capacity)", description: "Building Standards (Scotland)." },
      { key: "del.abovedrainage_preliminary_layouts_schedules", label: "Preliminary schematic layouts and stack schedules" },
      { key: "del.abovedrainage_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.abovedrainage_concept_risk_assessment", label: "Design risk assessment (including maintenance access and IPC)", description: "CDM 2015, IPC." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.abovedrainage_coordinated_layout_drawings", label: "Coordinated design (stack locations, branch routes, floor drains, access points, plant interfaces)", description: "BS EN 12056." },
      { key: "del.abovedrainage_mep_structural_coordination", label: "Spatial coordination with structure, other services, ceilings and clinical layouts", description: "SHTM 00." },
      { key: "del.abovedrainage_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for stack and floor drain penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.abovedrainage_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary drainage strategy" },
      { key: "del.abovedrainage_access_maintenance_confirmation", label: "Confirmation of access and maintenance strategy", description: "Critical for long-term performance.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.abovedrainage_full_technical_design_package", label: "Full technical design drawings, schematics, stack schedules and drain schedules", description: "BS EN 12056, Building Standards." },
      { key: "del.abovedrainage_detailed_specifications", label: "Detailed specifications (pipework materials, fittings, floor drains, channels, traps, access fittings, insulation if required)", description: "BS EN 12056." },
      { key: "del.abovedrainage_venting_antisiphonage_strategy", label: "Venting strategy and anti-siphonage measures", description: "BS EN 12056." },
      { key: "del.abovedrainage_access_rodding_cleaning_design", label: "Access, rodding and cleaning point design", description: "Maintainability focus." },
      { key: "del.abovedrainage_belowground_interface_design", label: "Interface design with below-ground drainage and sanitary fittings" },
      { key: "del.abovedrainage_building_standards_compliance_info", label: "Building Standards (Scotland) compliance information", description: "Section 3 Environment.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.abovedrainage_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.abovedrainage_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, IPC.", bypassAuthority: "SRO" },
      { key: "del.abovedrainage_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.abovedrainage_stakeholder_design_approval", label: "Stakeholder review and approval of design (Estates, IPC)", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.abovedrainage_method_statements_temp_arrangements", label: "Contractor method statements, detailed phasing & temporary drainage arrangements", description: "Important for operational areas." },
      { key: "del.abovedrainage_material_equipment_certificates", label: "Material & equipment certificates (pipework, fittings, drains, traps)", description: "Manufacturer / BS EN standards." },
      { key: "del.abovedrainage_pipework_stacks_install", label: "Installation of above-ground drainage pipework, stacks, branches, floor drains and access fittings", description: "BS EN 12056." },
      { key: "del.abovedrainage_gradient_support_jointing_records", label: "Gradient, support and jointing quality records" },
      { key: "del.abovedrainage_air_water_testing_records", label: "Air / water testing records", description: "Critical verification step before drainage is relied upon, per BS EN 12056 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.abovedrainage_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.abovedrainage_temp_drainage_hybrid_arrangements", label: "Temporary drainage / hybrid working arrangements (if phased)", description: "Where required." },
      { key: "del.abovedrainage_decommissioning_records", label: "Decommissioning & strip-out records of redundant drainage systems" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.abovedrainage_full_testing_commissioning_records", label: "Full testing and commissioning records (air tests, water tests, performance verification)", description: "Critical verification step, per BS EN 12056 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.abovedrainage_as_fitted_drawings_registers", label: "As-fitted drawings, schematics, stack schedules and access point registers", description: "Essential for future maintenance." },
      { key: "del.abovedrainage_om_manuals_cleaning_procedures", label: "Comprehensive O&M manuals, including cleaning and maintenance procedures", description: "SHTM 00." },
      { key: "del.abovedrainage_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with Building Standards (Scotland), BS EN 12056 and manufacturer requirements" },
      { key: "del.abovedrainage_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.abovedrainage_training_records", label: "Training & demonstration records for estates and facilities staff" },
      { key: "del.abovedrainage_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.abovedrainage_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.abovedrainage_formal_acceptance", label: "Formal client / Estates acceptance", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.abovedrainage_soft_landings_review", label: "Soft landings / post-occupancy review (blockages, odours, maintainability, user feedback)", description: "SHTM 00." },
      { key: "del.abovedrainage_updated_maintenance_cleaning_regime", label: "Updated maintenance and cleaning regime" },
      { key: "del.abovedrainage_ongoing_inspection_monitoring", label: "Ongoing inspection and performance monitoring" },
      { key: "del.abovedrainage_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.abovedrainage_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(aboveGroundDrainageStageTemplates, aboveGroundDrainageDeliverableDefsByStage);

  // ── 19th Template: Compressed Air Systems Replacement (Non-Medical)
  // — compressors, receivers, distribution pipework, filters, dryers,
  // pressure regulation and controls. Content supplied
  // (Compressed_Air.docx, 21 Aug 2026) — the 17th and final system on
  // his own "Summary Table — All Hard FM Systems Completed" tracker
  // (Template_Summary.docx), which cross-checked cleanly against every
  // template already built this session. The source document is
  // explicit: medical compressed air is out of scope here — it falls
  // under Medical Gas Pipeline Systems (SHTM 02-01), already covered.
  // Grounded in PSSR 2000, SHTM 00, CIBSE Guides, BS EN standards, ISO
  // 8573 (air quality classes), SHTM 06 series, CDM 2015. Same pattern
  // as Steam: no new BypassAuthority (PSSR's "Competent Person" is the
  // same external statutory role used there and for LOLER/lifts), and
  // reuses the existing comp.pssr_written_scheme compliance rule
  // (tagged pressure_systems_affected) rather than duplicating it —
  // "may fall under PSSR" here is conditional on pressure/volume, but
  // when it does apply it's the identical regime. Physical
  // safety-critical tests (pressure testing, safety valve
  // certification) use SRO, matching the Boiler/Lift/Steam precedent.
  // Fire compartmentation item added at Gate 3 for pipework
  // penetrations, per standing practice.
  const compressedAirTemplate = await db.template.create({
    data: {
      key: "template.health.compressed_air_systems_replacement",
      name: "Compressed Air Systems Replacement (Non-Medical)",
      description:
        "Non-medical compressed air system replacement or major upgrade — compressors, receivers, distribution pipework, filters, dryers, pressure regulation, and associated controls, in an operational healthcare environment. Not medical compressed air — see Medical Gas Systems Replacement for that (SHTM 02-01).",
      matchKeywords: [
        "compressed air",
        "air compressor",
        "compressor",
        "receiver",
        "air dryer",
        "instrument air",
        "workshop air",
        "non-medical compressed air",
        "PSSR",
      ],
      sectorVariantId: health.id,
    },
  });
  const compressedAirStageTemplates = await createStageAndGateTemplates(compressedAirTemplate.id);

  const compressedAirDeliverableDefsByStage: DeliverableDef[][] = [
    // Gate 0 — Strategic Definition
    [
      { key: "del.compressedair_business_case", label: "Business case / need identification (system age, reliability, capacity, air quality, energy performance, safety)", description: "SHTM 00, PSSR." },
      { key: "del.compressedair_strategic_brief", label: "Strategic brief & project outcomes (reliability, air quality, safety, energy efficiency, compliance)" },
      { key: "del.compressedair_operational_impact_assessment", label: "High-level operational impact assessment", description: "SHTM 00." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.compressedair_project_brief", label: "Project Brief (scope of generation, treatment, distribution and user modifications)", description: "SHTM 00." },
      { key: "del.compressedair_condition_surveys", label: "Existing system condition surveys (compressors, receivers, dryers, filters, pipework, pressure, air quality)" },
      { key: "del.compressedair_written_scheme_review", label: "Review of existing Written Scheme of Examination (if applicable) and inspection history", description: "PSSR." },
      { key: "del.compressedair_expanded_risk_register", label: "Initial risk register (pressure system failure, loss of supply, air quality, noise, oil carry-over)", description: "SHTM 00, CDM 2015, PSSR." },
      { key: "del.compressedair_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.compressedair_competent_person_engagement", label: "Engagement with Estates, users (workshops, laboratories, etc.) and Competent Person (if required)", description: "PSSR." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.compressedair_concept_design_report", label: "Concept design options (compressor type, central vs local, treatment train, distribution strategy, resilience)", description: "CIBSE, manufacturer data." },
      { key: "del.compressedair_outline_strategy", label: "Outline compressed air strategy (pressure levels, air quality class, duty/standby, storage)", description: "ISO 8573 air quality classes, where relevant." },
      { key: "del.compressedair_preliminary_schematics_demand", label: "Preliminary schematics and demand assessment" },
      { key: "del.compressedair_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.compressedair_concept_risk_assessment", label: "Design risk assessment (including pressure system hazards)", description: "CDM 2015, PSSR." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.compressedair_coordinated_layout_drawings", label: "Coordinated design (compressor plant location, receiver siting, pipe routes, access, ventilation/cooling)", description: "SHTM 00." },
      { key: "del.compressedair_mep_structural_coordination", label: "Spatial coordination with structure, electrical, ventilation and other services", description: "SHTM 00." },
      { key: "del.compressedair_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment for pipework penetrations", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.compressedair_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary supply strategy" },
      { key: "del.compressedair_critical_user_confirmation", label: "Confirmation of critical user requirements", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.compressedair_full_technical_design_package", label: "Full technical design drawings, schematics and pipework layouts", description: "CIBSE, manufacturer data." },
      { key: "del.compressedair_detailed_specifications", label: "Detailed specifications (compressors, receivers, dryers, filters, pipework, valves, regulators, controls)", description: "Relevant BS EN standards." },
      { key: "del.compressedair_air_treatment_quality_spec", label: "Air treatment and quality specification (dryness, filtration, oil content)", description: "ISO 8573, where applicable." },
      { key: "del.compressedair_pressure_system_design_safety_schedule", label: "Pressure system design and safety device schedule", description: "PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.compressedair_control_strategy_bms_integration", label: "Control strategy, sequencing and BMS integration (if required)" },
      { key: "del.compressedair_electrical_design", label: "Electrical design associated with compressors and controls", description: "SHTM 06 series." },
      { key: "del.compressedair_noise_ventilation_heat_rejection", label: "Noise, ventilation and heat rejection design" },
      { key: "del.compressedair_building_regs_compliance_info", label: "Building Regulations / statutory compliance information", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.compressedair_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.compressedair_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, PSSR.", bypassAuthority: "SRO" },
      { key: "del.compressedair_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.compressedair_competent_person_design_review", label: "Competent Person review of design (where required under Written Scheme)", description: "PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.compressedair_method_statements_temp_arrangements", label: "Contractor method statements, detailed phasing & temporary compressed air arrangements", description: "Where operationally required." },
      { key: "del.compressedair_material_equipment_certificates", label: "Material & equipment certificates (compressors, receivers, dryers, filters, pipework, safety devices)", description: "PED / BS EN standards." },
      { key: "del.compressedair_compressors_treatment_install", label: "Installation of compressors, treatment plant, receivers, pipework and controls" },
      { key: "del.compressedair_pressure_flushing_purity_testing", label: "Pressure testing, flushing and purity testing records", description: "Critical life-safety verification for a pressure system, per relevant standards — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.compressedair_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.compressedair_temp_supply_hybrid_arrangements", label: "Temporary supply / hybrid working arrangements (if phased)", description: "Where required." },
      { key: "del.compressedair_decommissioning_records", label: "Decommissioning & strip-out records of redundant compressed air equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.compressedair_full_commissioning_validation_records", label: "Full commissioning & validation records (pressure, flow, air quality, control sequences, safety devices)", description: "Manufacturer data, CIBSE." },
      { key: "del.compressedair_safety_valve_setting_certification", label: "Safety valve setting and certification", description: "Critical life-safety verification for a pressure system, per PSSR — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.compressedair_air_quality_verification_testing", label: "Air quality verification testing (particles, humidity, oil content as applicable)", description: "ISO 8573, where relevant." },
      { key: "del.compressedair_updated_written_scheme", label: "Updated Written Scheme of Examination (if applicable)", description: "PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.compressedair_as_fitted_drawings_pressure_docs", label: "As-fitted drawings, schematics, valve schedules and pressure system documentation", description: "PSSR." },
      { key: "del.compressedair_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.compressedair_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with PSSR, PED, relevant BS EN standards, ISO 8573 (where applicable) and manufacturer requirements" },
      { key: "del.compressedair_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.compressedair_training_records", label: "Training & demonstration records for estates and user staff" },
      { key: "del.compressedair_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.compressedair_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.compressedair_formal_acceptance", label: "Formal client / Competent Person acceptance", description: "PSSR, where applicable.", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.compressedair_soft_landings_review", label: "Soft landings / post-occupancy review (performance, reliability, air quality, energy, user feedback)", description: "SHTM 00." },
      { key: "del.compressedair_updated_written_scheme_inspection_regime", label: "Updated Written Scheme of Examination and inspection regime (if applicable)", description: "Statutory requirement under PSSR, where it applies.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.compressedair_ongoing_maintenance_examination", label: "Ongoing maintenance, filter/dryer servicing and statutory examination programme", description: "PSSR / manufacturer, where applicable.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.compressedair_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.compressedair_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ];
  await createDeliverableTemplates(compressedAirStageTemplates, compressedAirDeliverableDefsByStage);

  // ── 20th–22nd Templates: Room or Ward Refresh, Mental Health Unit
  // Ligature & Room Refresh, and Theatre Refresh — split from a single
  // "Room, Ward or Theatre Refresh" template (22 Aug 2026,
  // after that first draft was already built and briefly live-tested)
  // once it was clear the source document itself ("Room,Ward or
  // Theatre Refresh.docx" — supplied but not flagged until after that
  // first draft existed) names three genuinely distinct project types,
  // not one: "Safe ligature improvements... Standard room refreshes...
  // Theatre refreshes". Kept as one merged template, a plain ward
  // repaint would show ligature risk assessments and SRO-tiered
  // ligature/tool-control sign-offs that have nothing to do with it —
  // exactly the "don't show irrelevant items" problem already being
  // designed out elsewhere in this session (see the New Project form's
  // dynamic bundling checkboxes). Splitting also means the PM picks the
  // right one directly from the System/Template dropdown, the same way
  // every other discipline in this library works — not something the
  // LLM has to disambiguate between three similarly-worded options
  // after the fact. All three share the same base structure (RIBA
  // gates, fire compartmentation as Gate 3 standing practice, HAI-SCRIBE
  // reuse) and all three are in HAISCRIBE_HIGH_INTENSITY_TEMPLATE_KEYS
  // (lib/cdm.ts) — the source document's "HAI-SCRIBE must be applied
  // rigorously (High involvement expected)" is stated as a blanket
  // principle covering all three project types, not just the ligature
  // one. Only the Mental Health Unit template carries: the ligature
  // risk assessment (Gate 1), the ligature safety verification/clinical
  // sign-off (Gate 6, SRO — same "life-safety, cannot be bypassed at PM
  // level" tier as pressure/LOLER-adjacent items elsewhere), and the
  // Gate 5 tool-control/room-security item added directly (22 Aug
  // 2026, beyond the source document): rooms actively being worked on
  // in an MHU must never be left open or unattended, since contractor
  // tools/sharps left accessible are as much a patient (and contractor)
  // safety risk as the fixed ligature points themselves — also SRO.
  // Only the Theatre template carries the ultra-clean ventilation
  // validation item (Gate 6), tiered to AUTHORISED_PERSON_VENTILATION
  // like every other genuine ventilation-performance validation in this
  // library, even though this template doesn't replace the ventilation
  // system itself. No new BypassAuthority needed anywhere.

  const roomOrWardRefreshTemplate = await db.template.create({
    data: {
      key: "template.health.room_ward_refresh",
      name: "Room or Ward Refresh",
      description:
        "Refurbishment or refresh of a general ward, room, or clinical area — redecoration, flooring, wall cladding, doors, windows, ceilings, and fixed furniture/fittings, in an operational healthcare environment. Not a Mental Health Unit ligature project (see Mental Health Unit Ligature & Room Refresh) or a theatre refresh (see Theatre Refresh), and not a plant or M&E system replacement — see the relevant system template for that; this template treats those services as interfaces to manage and reinstate, not systems it replaces.",
      matchKeywords: [
        "ward refresh",
        "room refresh",
        "ward refurbishment",
        "room refurbishment",
        "clinical area refurbishment",
        "redecoration",
        "flooring",
        "wall cladding",
        "altro",
        "fixtures and fittings",
        "fixed furniture",
        "nurse station refresh",
        "decant",
      ],
      sectorVariantId: health.id,
    },
  });
  const roomOrWardRefreshStageTemplates = await createStageAndGateTemplates(roomOrWardRefreshTemplate.id);
  await createDeliverableTemplates(roomOrWardRefreshStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.wardrefresh_business_case", label: "Business case / need identification (condition, clinical functionality, infection risk)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.wardrefresh_strategic_brief", label: "Strategic brief & project outcomes (patient safety, clinical environment, infection control)", description: "SHTM 00." },
      { key: "del.wardrefresh_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical and infection prevention & control (IPC) input." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.wardrefresh_project_brief", label: "Project Brief (scope: finishes, rooms/wards affected)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.wardrefresh_condition_surveys", label: "Existing condition surveys (fabric, doors, windows, finishes, known risks)" },
      { key: "del.wardrefresh_expanded_risk_register", label: "Initial risk register (infection, clinical disruption, fire, asbestos)", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.wardrefresh_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.wardrefresh_stakeholder_engagement", label: "Early engagement with Clinical, IPC, Estates and Soft FM teams", description: "Essential." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.wardrefresh_concept_design_report", label: "Concept design options (finishes strategy, phasing, decant requirements)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.wardrefresh_infection_control_strategy", label: "Outline clinical environment strategy (infection control, cleanability, durability)", description: "IPC." },
      { key: "del.wardrefresh_preliminary_finishes_schedule", label: "Preliminary room data sheets / layouts" },
      { key: "del.wardrefresh_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.wardrefresh_concept_risk_assessment", label: "Design risk assessment (including HAI risks, high-level only)", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.wardrefresh_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.wardrefresh_coordinated_layout_drawings", label: "Coordinated design (doors, windows, layouts, finishes interfaces with services)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.wardrefresh_mep_structural_coordination", label: "Spatial coordination with existing M&E services and clinical flows", description: "SHTM 00." },
      { key: "del.wardrefresh_fire_compartmentation_assessment", label: "Fire compartmentation and means of escape impact assessment", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.wardrefresh_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / decant strategy (principles only)" },
      { key: "del.wardrefresh_critical_user_confirmation", label: "Confirmation of temporary clinical arrangements — high-level strategy only", description: "Clinical stakeholders.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.wardrefresh_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.wardrefresh_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.wardrefresh_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.wardrefresh_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.wardrefresh_mep_interface_design", label: "Interface design with ventilation, medical gases, electrical, nurse call, drainage and fire systems", description: "SHTM 03-01 (ventilation), SHTM 02-01 (medical gas), SHTM 06 series (electrical), SHTM 08-03 (nurse call), SHTM 04-01 (drainage/water)." },
      { key: "del.wardrefresh_infection_control_design_review", label: "HAI-SCRIBE Stage 2 design review and infection control measures", description: "HAI-SCRIBE Stage 2.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.wardrefresh_fire_strategy_means_of_escape", label: "Fire strategy and means of escape implications", description: "Firecode.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.wardrefresh_building_regs_compliance_info", label: "Building Standards / statutory compliance information", description: "Building Standards (Scotland).", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.wardrefresh_pre_construction_information", label: "Pre-construction information & input to Construction Phase Plan", description: "CDM 2015." },
      { key: "del.wardrefresh_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, HAI-SCRIBE.", bypassAuthority: "SRO" },
      { key: "del.wardrefresh_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.wardrefresh_clinical_stakeholder_design_approval", label: "Clinical and IPC stakeholder review and approval of design", description: "Essential.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.wardrefresh_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.wardrefresh_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.wardrefresh_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.wardrefresh_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.wardrefresh_method_statements_decant_arrangements", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary clinical arrangements", description: "Critical. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.wardrefresh_material_product_certificates", label: "Material & product certificates (flooring, cladding, doors, windows)", description: "Manufacturer." },
      { key: "del.wardrefresh_finishes_furniture_install", label: "Installation of doors, windows, ironmongery, flooring, wall cladding and associated works" },
      { key: "del.wardrefresh_protection_existing_services", label: "Protection of existing services and clinical areas", description: "HAI-SCRIBE Stage 3." },
      { key: "del.wardrefresh_infection_control_construction_measures", label: "Dust, water and infection control measures during construction", description: "HAI-SCRIBE Stage 3.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.wardrefresh_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.wardrefresh_temp_clinical_continuity_records", label: "Temporary arrangements and clinical continuity records", description: "Essential." },
      { key: "del.wardrefresh_decommissioning_records", label: "Decommissioning / strip-out records of redundant finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.wardrefresh_full_commissioning_validation_records", label: "Full inspection, snagging and quality verification records" },
      { key: "del.wardrefresh_infection_control_validation", label: "Cleaning, terminal clean and IPC clearance", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.wardrefresh_as_fitted_drawings_om_manuals", label: "As-fitted drawings, schedules and product information" },
      { key: "del.wardrefresh_om_manuals", label: "Comprehensive O&M manuals and maintenance information for new finishes and fittings", description: "SHTM 00." },
      { key: "del.wardrefresh_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.wardrefresh_training_records", label: "Training & demonstration records for clinical, Soft FM and Estates staff" },
      { key: "del.wardrefresh_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.wardrefresh_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.wardrefresh_formal_acceptance", label: "Formal clinical, IPC and client acceptance", description: "Essential.", bypassAuthority: "SRO" },
      { key: "del.wardrefresh_haiscribe_stage4_precheck", label: "HAI-SCRIBE Stage 4 pre-handover check completion", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.wardrefresh_soft_landings_review", label: "Soft landings / post-occupancy review (clinical functionality, cleanability, user feedback)", description: "SHTM 00, HAI-SCRIBE Stage 4." },
      { key: "del.wardrefresh_updated_operational_cleaning_procedures", label: "Updated operational and cleaning procedures", description: "IPC / Soft FM." },
      { key: "del.wardrefresh_ongoing_maintenance_regime", label: "Ongoing maintenance and inspection regime for finishes" },
      { key: "del.wardrefresh_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.wardrefresh_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ]);

  const mhuLigatureTemplate = await db.template.create({
    data: {
      key: "template.health.mhu_ligature_room_refresh",
      name: "Mental Health Unit Ligature & Room Refresh",
      description:
        "Refurbishment or refresh of a Mental Health Unit room or ward including safe ligature improvements — anti-ligature doors, windows, ensuite fittings, flooring, wall cladding, decoration, and fixed furniture, in an operational healthcare environment. For a general (non-MHU) ward/room refresh see Room or Ward Refresh; for a theatre refresh see Theatre Refresh. Not a plant or M&E system replacement — see the relevant system template for that.",
      matchKeywords: [
        "ligature",
        "anti-ligature",
        "safe ligature",
        "ligature risk",
        "ligature improvements",
        "mental health unit",
        "MHU",
        "mental health ward refresh",
        "psychiatric ward refresh",
      ],
      sectorVariantId: health.id,
    },
  });
  const mhuLigatureStageTemplates = await createStageAndGateTemplates(mhuLigatureTemplate.id);
  await createDeliverableTemplates(mhuLigatureStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.mhu_business_case", label: "Business case / need identification (condition, ligature risk, clinical functionality, infection risk)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.mhu_strategic_brief", label: "Strategic brief & project outcomes (patient safety, clinical environment, infection control, ligature reduction)", description: "SHTM 00." },
      { key: "del.mhu_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical and infection prevention & control (IPC) input." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.mhu_project_brief", label: "Project Brief (scope: ligature works, finishes, rooms affected)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.mhu_condition_surveys", label: "Existing condition surveys (fabric, doors, windows, ensuites, finishes, known risks)" },
      { key: "del.mhu_ligature_risk_assessment", label: "Ligature risk assessment (Mental Health Unit areas)", description: "Design guidance for Mental Health environments and anti-ligature product standards.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.mhu_expanded_risk_register", label: "Initial risk register (ligature, infection, clinical disruption, fire, asbestos)", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.mhu_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.mhu_stakeholder_engagement", label: "Early engagement with Clinical, IPC, Mental Health, Estates and Soft FM teams", description: "Essential." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.mhu_concept_design_report", label: "Concept design options (ligature solutions, finishes strategy, phasing, decant requirements)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.mhu_infection_control_strategy", label: "Outline clinical environment strategy (infection control, cleanability, durability)", description: "IPC." },
      { key: "del.mhu_preliminary_finishes_schedule", label: "Preliminary room data sheets / layouts" },
      { key: "del.mhu_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.mhu_concept_risk_assessment", label: "Design risk assessment (including ligature and HAI risks, high-level only)", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.mhu_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.mhu_coordinated_layout_drawings", label: "Coordinated design (doors, windows, ensuite layouts, finishes interfaces with services)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.mhu_mep_structural_coordination", label: "Spatial coordination with existing M&E services and clinical flows", description: "SHTM 00." },
      { key: "del.mhu_fire_compartmentation_assessment", label: "Fire compartmentation and means of escape impact assessment", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.mhu_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / decant strategy (principles only)" },
      { key: "del.mhu_critical_user_confirmation", label: "Confirmation of temporary clinical arrangements — high-level strategy only", description: "Clinical stakeholders.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.mhu_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.mhu_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.mhu_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.mhu_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.mhu_mep_interface_design", label: "Interface design with ventilation, medical gases, electrical, nurse call, drainage and fire systems", description: "SHTM 03-01 (ventilation), SHTM 02-01 (medical gas), SHTM 06 series (electrical), SHTM 08-03 (nurse call), SHTM 04-01 (drainage/water)." },
      { key: "del.mhu_infection_control_design_review", label: "HAI-SCRIBE Stage 2 design review and infection control measures", description: "HAI-SCRIBE Stage 2.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.mhu_fire_strategy_means_of_escape", label: "Fire strategy and means of escape implications", description: "Firecode.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.mhu_building_regs_compliance_info", label: "Building Standards / statutory compliance information", description: "Building Standards (Scotland).", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.mhu_pre_construction_information", label: "Pre-construction information & input to Construction Phase Plan", description: "CDM 2015." },
      { key: "del.mhu_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, HAI-SCRIBE.", bypassAuthority: "SRO" },
      { key: "del.mhu_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.mhu_clinical_stakeholder_design_approval", label: "Clinical, IPC and Mental Health stakeholder review and approval of design", description: "Essential.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.mhu_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.mhu_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.mhu_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.mhu_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.mhu_method_statements_decant_arrangements", label: "Contractor's detailed Method Statements, full RAMS, decant and temporary clinical arrangements", description: "Critical. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.mhu_tool_control_room_security", label: "Contractor tool control and room security procedure", description: "Rooms under works must never be left open or unattended, and every tool and sharp item must be signed in, signed out, and accounted for at all times — a patient and contractor safety control distinct from general site security.", bypassAuthority: "SRO" },
      { key: "del.mhu_material_product_certificates", label: "Material & product certificates (anti-ligature items, flooring, cladding, doors, windows)", description: "Manufacturer." },
      { key: "del.mhu_finishes_furniture_install", label: "Installation of doors, windows, ironmongery, flooring, wall cladding and associated works" },
      { key: "del.mhu_protection_existing_services", label: "Protection of existing services and clinical areas", description: "HAI-SCRIBE Stage 3." },
      { key: "del.mhu_infection_control_construction_measures", label: "Dust, water and infection control measures during construction", description: "HAI-SCRIBE Stage 3.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.mhu_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.mhu_temp_clinical_continuity_records", label: "Temporary arrangements and clinical continuity records", description: "Essential." },
      { key: "del.mhu_decommissioning_records", label: "Decommissioning / strip-out records of redundant finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.mhu_full_commissioning_validation_records", label: "Full inspection, snagging and quality verification records" },
      { key: "del.mhu_ligature_safety_verification", label: "Ligature safety verification and clinical sign-off", description: "Life-safety verification for at-risk patients — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.mhu_infection_control_validation", label: "Cleaning, terminal clean and IPC clearance", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.mhu_as_fitted_drawings_om_manuals", label: "As-fitted drawings, schedules and product information" },
      { key: "del.mhu_om_manuals", label: "Comprehensive O&M manuals and maintenance information for new finishes and fittings", description: "SHTM 00." },
      { key: "del.mhu_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.mhu_training_records", label: "Training & demonstration records for clinical, Soft FM and Estates staff" },
      { key: "del.mhu_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.mhu_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.mhu_formal_acceptance", label: "Formal clinical, IPC and client acceptance", description: "Essential.", bypassAuthority: "SRO" },
      { key: "del.mhu_haiscribe_stage4_precheck", label: "HAI-SCRIBE Stage 4 pre-handover check completion", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.mhu_soft_landings_review", label: "Soft landings / post-occupancy review (clinical functionality, ligature safety, cleanability, user feedback)", description: "SHTM 00, HAI-SCRIBE Stage 4." },
      { key: "del.mhu_updated_operational_cleaning_procedures", label: "Updated operational and cleaning procedures", description: "IPC / Soft FM." },
      { key: "del.mhu_ongoing_maintenance_regime", label: "Ongoing maintenance and inspection regime for anti-ligature items and finishes" },
      { key: "del.mhu_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.mhu_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ]);

  const theatreRefreshTemplate = await db.template.create({
    data: {
      key: "template.health.theatre_refresh",
      name: "Theatre Refresh",
      description:
        "Refurbishment or refresh of an operating theatre — finishes, wall/ceiling cladding, doors, and fixed furniture, plus validation of any disturbed ventilation/medical gas/electrical interfaces, in an operational healthcare environment. For a general (non-theatre) ward/room refresh see Room or Ward Refresh; for Mental Health Unit ligature work see Mental Health Unit Ligature & Room Refresh. Not a plant or M&E system replacement — see the relevant system template for that.",
      matchKeywords: [
        "theatre refresh",
        "theatre refurbishment",
        "operating theatre refresh",
        "theatre finishes",
        "laminar flow",
        "ultra-clean ventilation",
        "theatre validation",
      ],
      sectorVariantId: health.id,
    },
  });
  const theatreRefreshStageTemplates = await createStageAndGateTemplates(theatreRefreshTemplate.id);
  await createDeliverableTemplates(theatreRefreshStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.theatrerefresh_business_case", label: "Business case / need identification (condition, clinical functionality, infection risk)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.theatrerefresh_strategic_brief", label: "Strategic brief & project outcomes (patient safety, clinical environment, infection control)", description: "SHTM 00." },
      { key: "del.theatrerefresh_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical and infection prevention & control (IPC) input." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.theatrerefresh_project_brief", label: "Project Brief (scope: finishes, theatres affected)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.theatrerefresh_condition_surveys", label: "Existing condition surveys (fabric, doors, finishes, known risks)" },
      { key: "del.theatrerefresh_expanded_risk_register", label: "Initial risk register (infection, clinical disruption, fire, asbestos)", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.theatrerefresh_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.theatrerefresh_stakeholder_engagement", label: "Early engagement with Clinical, IPC, Estates and Soft FM teams", description: "Essential." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.theatrerefresh_concept_design_report", label: "Concept design options (finishes strategy, phasing, decant requirements)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.theatrerefresh_infection_control_strategy", label: "Outline clinical environment strategy (infection control, cleanability, durability)", description: "IPC." },
      { key: "del.theatrerefresh_preliminary_finishes_schedule", label: "Preliminary room data sheets / layouts" },
      { key: "del.theatrerefresh_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.theatrerefresh_concept_risk_assessment", label: "Design risk assessment (including HAI risks, high-level only)", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.theatrerefresh_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.theatrerefresh_coordinated_layout_drawings", label: "Coordinated design (doors, layouts, finishes interfaces with services)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.theatrerefresh_mep_structural_coordination", label: "Spatial coordination with existing M&E services and clinical flows", description: "SHTM 00." },
      { key: "del.theatrerefresh_fire_compartmentation_assessment", label: "Fire compartmentation and means of escape impact assessment", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.theatrerefresh_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / decant strategy (principles only)" },
      { key: "del.theatrerefresh_critical_user_confirmation", label: "Confirmation of temporary clinical arrangements — high-level strategy only", description: "Clinical stakeholders.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.theatrerefresh_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.theatrerefresh_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.theatrerefresh_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.theatrerefresh_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle approval below." },
      { key: "del.theatrerefresh_mep_interface_design", label: "Interface design with ventilation, medical gases, electrical, nurse call, drainage and fire systems", description: "SHTM 03-01 (ventilation), SHTM 02-01 (medical gas), SHTM 06 series (electrical), SHTM 08-03 (nurse call), SHTM 04-01 (drainage/water)." },
      { key: "del.theatrerefresh_infection_control_design_review", label: "HAI-SCRIBE Stage 2 design review and infection control measures", description: "HAI-SCRIBE Stage 2.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.theatrerefresh_fire_strategy_means_of_escape", label: "Fire strategy and means of escape implications", description: "Firecode.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.theatrerefresh_building_regs_compliance_info", label: "Building Standards / statutory compliance information", description: "Building Standards (Scotland).", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.theatrerefresh_pre_construction_information", label: "Pre-construction information & input to Construction Phase Plan", description: "CDM 2015." },
      { key: "del.theatrerefresh_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, HAI-SCRIBE.", bypassAuthority: "SRO" },
      { key: "del.theatrerefresh_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.theatrerefresh_clinical_stakeholder_design_approval", label: "Clinical and IPC stakeholder review and approval of design", description: "Essential.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.theatrerefresh_competitive_quotations", label: "Obtain minimum of two competitive quotations", description: "Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.theatrerefresh_pfi_nhs_lifecycle_submission", label: "Submit quotations, cost comparison, contingency and recommendation to PFI Board / NHS for lifecycle approval" },
      { key: "del.theatrerefresh_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.theatrerefresh_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.theatrerefresh_method_statements_decant_arrangements", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary clinical arrangements", description: "Critical. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.theatrerefresh_material_product_certificates", label: "Material & product certificates (theatre-grade finishes, cladding, doors)", description: "Manufacturer." },
      { key: "del.theatrerefresh_finishes_furniture_install", label: "Installation of doors, ironmongery, wall/ceiling cladding and associated works" },
      { key: "del.theatrerefresh_protection_existing_services", label: "Protection of existing services and clinical areas", description: "HAI-SCRIBE Stage 3." },
      { key: "del.theatrerefresh_infection_control_construction_measures", label: "Dust, water and infection control measures during construction", description: "HAI-SCRIBE Stage 3.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.theatrerefresh_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.theatrerefresh_temp_clinical_continuity_records", label: "Temporary arrangements and clinical continuity records", description: "Essential." },
      { key: "del.theatrerefresh_decommissioning_records", label: "Decommissioning / strip-out records of redundant finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.theatrerefresh_full_commissioning_validation_records", label: "Full inspection, snagging and quality verification records" },
      { key: "del.theatrerefresh_ventilation_validation", label: "Ultra-clean ventilation validation (air changes, filtration integrity, laminar flow performance where fitted)", description: "SHTM 03-01, Part B (specialised ventilation) — required wherever finishes/ceiling works disturb the theatre's ventilation canopy or envelope.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.theatrerefresh_infection_control_validation", label: "Cleaning, terminal clean and IPC clearance", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.theatrerefresh_as_fitted_drawings_om_manuals", label: "As-fitted drawings, schedules and product information" },
      { key: "del.theatrerefresh_om_manuals", label: "Comprehensive O&M manuals and maintenance information for new finishes and fittings", description: "SHTM 00." },
      { key: "del.theatrerefresh_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.theatrerefresh_training_records", label: "Training & demonstration records for clinical, Soft FM and Estates staff" },
      { key: "del.theatrerefresh_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.theatrerefresh_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.theatrerefresh_formal_acceptance", label: "Formal clinical, IPC and client acceptance", description: "Essential.", bypassAuthority: "SRO" },
      { key: "del.theatrerefresh_haiscribe_stage4_precheck", label: "HAI-SCRIBE Stage 4 pre-handover check completion", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.theatrerefresh_soft_landings_review", label: "Soft landings / post-occupancy review (clinical functionality, cleanability, user feedback)", description: "SHTM 00, HAI-SCRIBE Stage 4." },
      { key: "del.theatrerefresh_updated_operational_cleaning_procedures", label: "Updated operational and cleaning procedures", description: "IPC / Soft FM." },
      { key: "del.theatrerefresh_ongoing_maintenance_regime", label: "Ongoing maintenance and inspection regime for finishes" },
      { key: "del.theatrerefresh_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.theatrerefresh_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ]);

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
        // Only the site NHS Fire Officer can approve/reject fire
        // compliance — not the SRO, unlike every other rule in this set.
        overrideAuthority: "FIRE_OFFICER",
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
        // Worked example (23 Aug 2026) for multi-party approval: the
        // Compliance Officer enforces the base requirement, but the
        // Client Authority (the NHS side) also independently signs off
        // the same submission before it's truly done — see
        // ComplianceRuleTemplate.additionalApproverRoleKeys.
        additionalApproverRoleKeys: ["CLIENT_AUTHORITY"],
      },
      // Every project gets the baseline HAI-SCRIBE check above at
      // Spatial Coordination. The HAI-SCRIBE vs RIBA intensity
      // matrix (21 Aug 2026) shows five systems — Ventilation, Medical
      // Gases, Domestic Hot & Cold Water, Chilled Water/Cooling, and
      // Above-ground Drainage — sustain "High" HAI-SCRIBE/IPC
      // involvement across RIBA 2–6, not just the one Spatial
      // Coordination checkpoint every other template gets. This rule
      // adds that sustained coverage for those five (via
      // HAISCRIBE_HIGH_INTENSITY_TAG, derived deterministically from
      // Template.key in lib/cdm.ts's effectiveComplianceTags — see
      // that file for why this isn't left to the LLM). RIBA 7 (Use)
      // deliberately excluded — no other compliance rule in this
      // corpus targets stage.use, and Gates there don't carry the same
      // sign-off weight.
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.haiscribe_high_intensity_review",
        label: "HAI-SCRIBE / IPC review — sustained high-intensity involvement",
        description: "This system is rated High HAI-SCRIBE/Infection Prevention & Control involvement across most of the project lifecycle, not just at Spatial Coordination — Concept Design through Handover all need an active IPC review checkpoint, per the HAI-SCRIBE vs RIBA intensity matrix.",
        ruleRef: "SHFN 30 / Healthcare Improvement Scotland",
        blocksGate: true,
        appliesToStageKeys: ["stage.concept_design", "stage.technical_design", "stage.manufacturing_construction", "stage.handover"],
        appliesIfTags: [HAISCRIBE_HIGH_INTENSITY_TAG],
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
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.pssr_written_scheme",
        label: "Written Scheme of Examination in place for pressure systems",
        description: "Boilers, steam plant, and compressed air systems above the PSSR threshold are pressure systems — a competent person's written scheme of examination must cover them before they're brought into service, distinct from and in addition to any SHTM water-safety or electrical compliance.",
        ruleRef: "Pressure Systems Safety Regulations 2000 (PSSR), reg 8",
        blocksGate: true,
        appliesToStageKeys: ["stage.handover"],
        appliesIfTags: ["pressure_systems_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.mgps_validation_verification",
        label: "Medical Gas Pipeline System validated and verified before clinical use",
        description: "Identity, purity, flow and pressure of every gas and vacuum outlet must be tested and certified to SHTM 02-01 Part A before a Medical Gas Pipeline System is relied on clinically — a wrong or contaminated gas identity is life-threatening, so this is tracked separately from general commissioning sign-off.",
        ruleRef: "SHTM 02-01 Part A / BS EN ISO 7396-1",
        blocksGate: true,
        appliesToStageKeys: ["stage.handover"],
        appliesIfTags: ["medical_gas_systems_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.loler_thorough_examination",
        label: "LOLER thorough examination completed before the lift is brought into use",
        description: "A lift is lifting equipment under LOLER — a competent person's thorough examination is a separate statutory step from SHTM 08-02/BS EN 81 commissioning, and must be current before the lift is relied on.",
        ruleRef: "Lifting Operations and Lifting Equipment Regulations 1998 (LOLER), reg 9",
        blocksGate: true,
        appliesToStageKeys: ["stage.handover"],
        appliesIfTags: ["lifting_equipment_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.work_at_height_authorisation",
        label: "Work at Height risk assessment, RAMS and permit authorised before elevated/roof-level work starts",
        description: "Applies wherever the works involve roof-level plant, external elevated access, or work above ground level (MEWP, scaffold, fragile-roof or edge-protection risk) — a distinct statutory duty from the general Designer's Risk Assessment under CDM, and from any system-specific isolation permit. No SHTM/HTM scheme establishes a Trust-appointed \"AP (Height)\" the way it does for electrical/water/medical gases, so this stays on the default SRO override authority, same reasoning as comp.loler_thorough_examination above.",
        ruleRef: "Work at Height Regulations 2005",
        blocksGate: true,
        appliesToStageKeys: ["stage.manufacturing_construction"],
        appliesIfTags: ["work_at_height_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.hot_works_permit",
        label: "Hot works permit authorised before welding/grinding/naked-flame work starts",
        description: "Welding, grinding, brazing, and other naked-flame or spark-generating work is a distinct fire-ignition risk in an occupied healthcare building — a signed hot-works permit (isolation of the area, fire watch, extinguishing equipment) is required before work starts, on top of the general fire risk assessment. Tied to the Fire Officer, same authority as every other fire-domain rule in this set, not SRO.",
        ruleRef: "Fire (Scotland) Act 2005 / Joint Code of Practice on the Protection from Fire of Construction Sites — hot-work permit control",
        blocksGate: true,
        appliesToStageKeys: ["stage.manufacturing_construction"],
        appliesIfTags: ["hot_works_affected"],
        overrideAuthority: "FIRE_OFFICER",
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.lone_working_arrangements",
        label: "Lone working risk assessment and safe system of work confirmed for out-of-hours/isolated tasks",
        description: "Out-of-hours, isolated-plant-room, or single-operative tasks need their own risk assessment and check-in/emergency-contact arrangement — a distinct duty from the general Designer's Risk Assessment or a task-specific method statement. No dedicated authority exists for this the way it does for electrical/water/fire, so it stays on the default SRO override authority.",
        ruleRef: "Management of Health and Safety at Work Regulations 1999, reg 3 / HSE INDG73 (Lone working)",
        blocksGate: true,
        appliesToStageKeys: ["stage.manufacturing_construction"],
        appliesIfTags: ["lone_working_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.asbestos_refurb_demolition_survey",
        label: "Asbestos refurbishment/demolition survey completed and management plan confirmed before intrusive work starts",
        description: "Any intrusive work on fabric built or altered before the year 2000 needs a refurbishment/demolition survey — a distinct statutory step from the general risk register, and from the routine asbestos management survey/register that already covers non-intrusive occupation. Must be current and its findings reflected in the works method statement before intrusive work starts.",
        ruleRef: "Control of Asbestos Regulations 2012, reg 5",
        blocksGate: true,
        appliesToStageKeys: ["stage.manufacturing_construction"],
        appliesIfTags: ["asbestos_refurb_demolition_survey_required"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.clinical_safety_case_dcb0160",
        label: "Clinical Safety Case completed and Clinical Safety Officer sign-off obtained",
        description: "Nurse call and staff alert systems are safety-related health IT systems under NHS Digital's clinical risk management standard — a documented Clinical Safety Case and named Clinical Safety Officer sign-off is required before go-live, distinct from general commissioning.",
        ruleRef: "DCB0160 — Clinical Risk Management: its Application in the Deployment and Use of Health IT Systems",
        blocksGate: true,
        appliesToStageKeys: ["stage.handover"],
        // Deliberately narrow, DCB0160-specific tag name — not
        // "clinical_safety_critical_system_affected", which an LLM
        // over-applied to a lift project on the reasoning that bed
        // lifts are "clinically critical" too (true, but irrelevant to
        // DCB0160, which is specifically about health IT systems).
        // Confirmed by live testing, 21 Aug 2026.
        appliesIfTags: ["health_it_clinical_safety_case_required"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.bms_cybersecurity_hardening",
        label: "BMS/BEMS cybersecurity testing and hardening confirmed before go-live",
        description: "A Building Management System is a networked control system for critical plant (heating, ventilation, medical gases, fire interfaces) — cybersecurity hardening and penetration/vulnerability testing must be confirmed before it's relied on, distinct from general functional commissioning.",
        ruleRef: "NHS Scotland cyber resilience framework / Data Security and Protection Toolkit",
        blocksGate: true,
        appliesToStageKeys: ["stage.handover"],
        appliesIfTags: ["bms_network_systems_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.fgas_regulations_compliance",
        label: "F-Gas register and leak-check compliance confirmed (where refrigerant-containing equipment is fitted)",
        description: "Chillers and other refrigerant-containing plant fall under the F-Gas Regulations — certified handling, leak-check records, and F-Gas register entries are a distinct statutory step from general commissioning, required before the equipment is relied on.",
        ruleRef: "F-Gas Regulations (EU) 517/2014 as retained in UK law",
        blocksGate: true,
        appliesToStageKeys: ["stage.handover"],
        appliesIfTags: ["refrigerant_systems_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.security_dpia_completed",
        label: "Data Protection Impact Assessment (DPIA) completed and Information Governance sign-off obtained",
        description: "CCTV and access control involve systematic monitoring and processing of personal data — a DPIA and named Information Governance sign-off is a distinct statutory step from general commissioning, required before the system goes live.",
        ruleRef: "UK GDPR Article 35 / Data Protection Act 2018",
        blocksGate: true,
        appliesToStageKeys: ["stage.handover"],
        appliesIfTags: ["personal_data_processing_system_affected"],
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
      // UPS/battery/switchgear replacement is an electrical system —
      // both AP and AE hold the Electrical discipline appointment here.
      { projectId: project.id, departmentId: buildCareNorth.id, userId: bob.id, roleId: roles.AUTHORISED_PERSON_ELECTRICAL.id },
      { projectId: project.id, departmentId: stAldwynEstates.id, userId: dennis.id, roleId: roles.AUTHORISING_ENGINEER_ELECTRICAL.id },
      { projectId: project.id, departmentId: buildCareNorth.id, userId: ross.id, roleId: roles.PRINCIPAL_DESIGNER.id },
      { projectId: project.id, departmentId: buildCareFinance.id, userId: andrea.id, roleId: roles.FINANCE.id },
      { projectId: project.id, departmentId: stAldwynEstates.id, userId: alan.id, roleId: roles.FIRE_OFFICER.id },
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
      // concept design approved (the doc's "key go/no-go point"). A
      // signed-off gate can't have gotten there with an outstanding
      // deliverable (isGateReadyForSponsor), so every item from the
      // template's checklist for this stage is created EVIDENCED, not
      // left empty — the gap where these gates showed zero deliverables
      // at all was a seed-data omission, not a real state (confirmed by
      // 20 Aug 2026).
      gate = await db.gate.create({
        data: { stageId: stage.id, key: def.gateKey, name: def.gateName, status: "SIGNED_OFF" },
      });
      await db.gateSignOff.create({
        data: { gateId: gate.id, decision: "APPROVED", signedOffById: david.id },
      });

      for (const d of meDeliverableDefsByStage[i]!) {
        const fileName = `${d.key.replace(/^del\./, "").replace(/_/g, "-")}.pdf`;
        const deliverable = await db.deliverable.create({
          data: {
            gateId: gate.id,
            key: d.key,
            label: d.label,
            description: d.description,
            bypassAuthority: d.bypassAuthority ?? "PM",
            status: "EVIDENCED",
          },
        });
        await db.evidenceFile.create({
          data: {
            deliverableId: deliverable.id,
            fileName,
            fileRef: `local://seed/${fileName}`,
            uploadedById: d.bypassAuthority === "COMPLIANCE_OFFICER" ? gary.id : derek.id,
          },
        });
      }
    } else if (i === 3) {
      // Gate 3 — Spatial Coordination: in progress, the running
      // example from every other doc.
      gate = await db.gate.create({
        data: { stageId: stage.id, key: def.gateKey, name: def.gateName, status: "IN_PROGRESS" },
      });

      const evidenced: { key: string; label: string; fileName: string }[] = [
        { key: "del.electrical_coordinated_layout_drawings", label: "Coordinated design (switch rooms, distribution routes, generator location, UPS rooms, containment)", fileName: "switch-room-layout-v2.pdf" },
        { key: "del.electrical_mep_structural_coordination", label: "Spatial coordination with structure, mechanical services, fire compartments and other systems", fileName: "mep-structural-coordination.pdf" },
        { key: "del.electrical_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary supply strategy", fileName: "risk-register-spatial-rev3.xlsx" },
        { key: "del.electrical_emergency_power_confirmation", label: "Confirmation of emergency power provisions for critical areas", fileName: "emergency-power-confirmation.pdf" },
      ];
      for (const d of evidenced) {
        const deliverable = await db.deliverable.create({
          data: {
            gateId: gate.id,
            key: d.key,
            label: d.label,
            bypassAuthority: d.key === "del.electrical_emergency_power_confirmation" ? "COMPLIANCE_OFFICER" : "PM",
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
      // one (needs the Fire Officer, not the PM or even the SRO).
      await db.deliverable.create({
        data: {
          gateId: gate.id,
          key: "del.electrical_fire_compartmentation_assessment",
          label: "Fire compartmentation and ventilation impact assessment",
          description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.",
          bypassAuthority: "FIRE_OFFICER",
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
      effectiveComplianceTags(project, meTemplate.key)
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

      // Gates 0–2 are signed off, so whatever the corpus just matched
      // for this stage can't be left PENDING either — same reasoning
      // as the deliverables above.
      if (i === 0 || i === 1 || i === 2) {
        const created = await db.complianceRequirement.findMany({ where: { gateId: gate.id } });
        for (const c of created) {
          const fileName = `${c.key.replace(/^comp\./, "").replace(/_/g, "-")}-evidence.pdf`;
          await db.complianceEvidenceFile.create({
            data: {
              complianceRequirementId: c.id,
              fileName,
              fileRef: `local://seed/${fileName}`,
              uploadedById: gary.id,
            },
          });
        }
        await db.complianceRequirement.updateMany({
          where: { gateId: gate.id },
          data: { status: "EVIDENCED" },
        });
      }
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
      // A second PM, added live 25 Aug 2026 (originally Priya
      // Anand-Rao, a live-only user never in this seed, then
      // reassigned to Javier when Kevin consolidated PM duties down
      // to Derek + Javier only) -- kept here as its own row rather
      // than replacing Derek's, since live has both.
      { projectId: waterProject.id, departmentId: stAldwynEstates.id, userId: javier.id, roleId: roles.PM.id },
      { projectId: waterProject.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.FM_CONTRACTOR.id },
      { projectId: waterProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.SPONSOR.id },
      { projectId: waterProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.CLIENT_AUTHORITY.id },
      { projectId: waterProject.id, departmentId: buildCareCompliance.id, userId: gary.id, roleId: roles.COMPLIANCE_OFFICER.id },
      { projectId: waterProject.id, departmentId: stAldwynEstates.id, userId: mark.id, roleId: roles.SRO.id },
      { projectId: waterProject.id, departmentId: buildCareFinance.id, userId: andrea.id, roleId: roles.FINANCE.id },
      { projectId: waterProject.id, departmentId: stAldwynEstates.id, userId: alan.id, roleId: roles.FIRE_OFFICER.id },
      // Required by CDM 2015 — this project's worksType is
      // BUILDING_MODIFICATION, so a Principal Designer must be engaged.
      { projectId: waterProject.id, departmentId: buildCareNorth.id, userId: ross.id, roleId: roles.PRINCIPAL_DESIGNER.id },
      // Isolating plant for a shutdown is an electrical isolation
      // regardless of which system it serves, so it's the site
      // AP(Electrical) — not AP(Water) — who signs the permit-to-work.
      // AP(Water) covers disinfection/chlorination and hygiene
      // commissioning sign-off (21 Aug 2026).
      { projectId: waterProject.id, departmentId: buildCareNorth.id, userId: bob.id, roleId: roles.AUTHORISED_PERSON_ELECTRICAL.id },
      // AP (Water) is James Slaven, not listed here -- see the
      // portfolio-wide reassignment near the end of this function.
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
      projectTags: effectiveComplianceTags(waterProject, waterTemplate.key),
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
      { projectId: drainageProject.id, departmentId: buildCareFinance.id, userId: andrea.id, roleId: roles.FINANCE.id },
      { projectId: drainageProject.id, departmentId: stAldwynEstates.id, userId: alan.id, roleId: roles.FIRE_OFFICER.id },
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
      projectTags: effectiveComplianceTags(drainageProject, drainageTemplate.key),
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
      { projectId: coldWaterProject.id, departmentId: buildCareFinance.id, userId: andrea.id, roleId: roles.FINANCE.id },
      { projectId: coldWaterProject.id, departmentId: stAldwynEstates.id, userId: alan.id, roleId: roles.FIRE_OFFICER.id },
      { projectId: coldWaterProject.id, departmentId: buildCareNorth.id, userId: ross.id, roleId: roles.PRINCIPAL_DESIGNER.id },
      { projectId: coldWaterProject.id, departmentId: buildCareNorth.id, userId: bob.id, roleId: roles.AUTHORISED_PERSON_ELECTRICAL.id },
      // AP (Water) is James Slaven, not listed here -- see the
      // portfolio-wide reassignment near the end of this function.
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
      projectTags: effectiveComplianceTags(coldWaterProject, coldWaterTemplate.key),
      sectorVariantId: health.id,
      order: i,
      stageTemplate: coldWaterStageTemplatesFull[i]!,
    });
  }

  // ── Fifth demo project: Lighting & Electrical Distribution
  // Replacement, originally created live via the managed project-number
  // flow on 20 Aug 2026 as project 30002 — at the time, matched to the
  // M&E Systems Replacement template for lack of anywhere better to go,
  // which is exactly the gap the Lighting template above exists to
  // close. Replayed here against the correct template, same
  // reproducible pattern as the drainage/cold-water projects. worksType
  // stays DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS to match what was
  // actually selected — a like-for-like LED retrofit needs an
  // electrician and a specialist waste-disposal contractor for the
  // fluorescent tubes, but doesn't touch the building fabric.
  const lightingProject = await db.project.create({
    data: {
      projectNumber: "30002",
      name: "LED Upgrade Throughout Hospital Corridors and Avenues",
      templateId: lightingTemplate.id,
      includedStageKeys: stageDefs.map((s) => s.key), // provisioning defaults to all 8
      tags: ["occupied_during_works"],
      worksType: "DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS",
      status: "ACTIVE",
      createdById: dennis.id,
      provisioningBrief:
        "Aligning with Net Zero, this project consists of replacing all fluorescent lights in the hospital corridors and avenues with LED alternatives.",
      provisioningMatchReasoning:
        "Fluorescent-to-LED retrofit is a lighting and electrical distribution problem — luminaires, lighting circuits, and emergency/escape lighting — not standby power (UPS/generators), so matches Lighting & Electrical Distribution Replacement rather than M&E Systems Replacement. Hospital corridors remain in use during works, hence occupied_during_works.",
    },
  });

  await db.projectRoleAssignment.createMany({
    data: [
      // Dennis was "acting as" when the real project was created live —
      // createProvisioningDraft assigns PM to the creator, not always
      // Derek (confirmed 20 Aug 2026, after this gap caused
      // canSetGateTimeline to look "broken" when acting as anyone else).
      // PM reassigned to Javier 25 Aug 2026, when Kevin consolidated PM
      // duties down to Derek + Javier only -- createdById above stays
      // Dennis, since that's a historical fact about who created the
      // project, not a current role.
      { projectId: lightingProject.id, departmentId: stAldwynEstates.id, userId: javier.id, roleId: roles.PM.id },
      { projectId: lightingProject.id, departmentId: buildCareNorth.id, userId: derek.id, roleId: roles.FM_CONTRACTOR.id },
      { projectId: lightingProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.SPONSOR.id },
      { projectId: lightingProject.id, departmentId: stAldwynEstates.id, userId: david.id, roleId: roles.CLIENT_AUTHORITY.id },
      { projectId: lightingProject.id, departmentId: buildCareCompliance.id, userId: gary.id, roleId: roles.COMPLIANCE_OFFICER.id },
      { projectId: lightingProject.id, departmentId: stAldwynEstates.id, userId: mark.id, roleId: roles.SRO.id },
      { projectId: lightingProject.id, departmentId: buildCareFinance.id, userId: andrea.id, roleId: roles.FINANCE.id },
      { projectId: lightingProject.id, departmentId: stAldwynEstates.id, userId: alan.id, roleId: roles.FIRE_OFFICER.id },
      { projectId: lightingProject.id, departmentId: buildCareNorth.id, userId: bob.id, roleId: roles.AUTHORISED_PERSON_ELECTRICAL.id },
      { projectId: lightingProject.id, departmentId: stAldwynEstates.id, userId: dennis.id, roleId: roles.AUTHORISING_ENGINEER_ELECTRICAL.id },
      { projectId: lightingProject.id, departmentId: buildCareNorth.id, userId: ross.id, roleId: roles.PRINCIPAL_DESIGNER.id },
    ],
  });

  await db.provisioningReview.create({
    data: { projectId: lightingProject.id, decision: "APPROVED", reviewedById: gary.id },
  });

  const lightingStageTemplatesFull = await db.stageTemplate.findMany({
    where: { templateId: lightingTemplate.id },
    orderBy: { order: "asc" },
    include: { gateTemplate: { include: { deliverableTemplates: true } } },
  });
  for (let i = 0; i < lightingStageTemplatesFull.length; i++) {
    await instantiateStage(db, {
      projectId: lightingProject.id,
      projectTags: effectiveComplianceTags(lightingProject, lightingTemplate.key),
      sectorVariantId: health.id,
      order: i,
      stageTemplate: lightingStageTemplatesFull[i]!,
    });
  }

  // ── Resource/capacity view: realistic % FTE allocation per
  // delivery-facing person across the live projects, including one
  // deliberate over-100% case (Derek, PM/FM Contractor spread across
  // all 5) — that flagging is the entire point of /resources, so the
  // seed should always demonstrate it rather than leave everyone at 0%.
  const resourceAllocations: { user: typeof derek; project: typeof project; pct: number }[] = [
    { user: derek, project, pct: 30 }, // UPS (20456)
    { user: derek, project: waterProject, pct: 15 }, // Calorifier (20777)
    { user: derek, project: coldWaterProject, pct: 20 }, // Cold water tank (30001)
    { user: derek, project: lightingProject, pct: 15 }, // LED (30002)
    { user: derek, project: drainageProject, pct: 30 }, // Kitchen drainage (55998)
    { user: ross, project, pct: 15 },
    { user: ross, project: waterProject, pct: 10 },
    { user: ross, project: lightingProject, pct: 15 },
    { user: ross, project: drainageProject, pct: 10 },
    { user: bob, project, pct: 20 },
    { user: bob, project: lightingProject, pct: 20 },
    { user: dennis, project, pct: 15 },
    { user: dennis, project: lightingProject, pct: 25 },
  ];
  for (const a of resourceAllocations) {
    await db.resourceAllocation.create({
      data: { userId: a.user.id, projectId: a.project.id, allocationPercent: a.pct, updatedById: derek.id },
    });
  }

  // James Slaven replaces Claire Duncan as AP (Water) across the entire
  // portfolio (25 Aug 2026) -- a live bulk reassignment mirrored here as
  // one pass over every project that exists by this point, rather than
  // threaded into each project's own hardcoded role list above (see
  // waterProject/coldWaterProject, where Claire's old
  // AUTHORISED_PERSON_WATER row was simply removed). skipDuplicates
  // guards against ever running this twice against the same DB.
  const allProjectsForWaterAP = await db.project.findMany({ select: { id: true } });
  await db.projectRoleAssignment.createMany({
    data: allProjectsForWaterAP.map((p) => ({
      projectId: p.id,
      departmentId: buildCareNorth.id,
      userId: james.id,
      roleId: roles.AUTHORISED_PERSON_WATER.id,
    })),
    skipDuplicates: true,
  });

  // ── Portfolio view: a scheduled report demonstrating the SRO's
  // actual request (20 Aug 2026) — "every Friday to specific staff".
  await db.scheduledReport.create({
    data: {
      label: "Weekly SRO portfolio summary",
      dayOfWeek: 5, // Friday
      recipientUserIds: [mark.id, gary.id, david.id],
      createdById: mark.id,
    },
  });

  // Generates the "health_england" SectorVariant (22 templates, 17
  // compliance rules) from the Scotland corpus just seeded above, via
  // the same conversion engine a live DB re-runs with `npm run
  // england:generate` — see src/lib/englandConversion.ts. Its Templates
  // are seeded with empty matchKeywords, so this stays invisible in the
  // project-creation dropdown until a real England tenant needs it.
  const englandResult = await generateEnglandVariant(db);

  console.log("Seed complete.");
  console.log(
    `England variant: ${englandResult.templatesCreated} templates, ${englandResult.rulesCreated} compliance rules.`
  );
  console.log("Dev users — switch between them with the header switcher:");
  console.log(`  PM:                    ${derek.name} <${derek.email}>`);
  console.log(`  Sponsor:               ${david.name} <${david.email}>`);
  console.log(`  Compliance Officer:    ${gary.name} <${gary.email}>`);
  console.log(`  SRO:                   ${mark.name} <${mark.email}>`);
  console.log(`  Authorised Person (Electrical):    ${bob.name} <${bob.email}>`);
  console.log(`  Authorising Engineer (Electrical): ${dennis.name} <${dennis.email}>`);
  console.log(`  Principal Designer:    ${ross.name} <${ross.email}>`);
  console.log(`  Platform Admin:        ${callum.name} <${callum.email}>`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
