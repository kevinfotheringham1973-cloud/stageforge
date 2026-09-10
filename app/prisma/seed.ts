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
import type { DbClient } from "../src/lib/db";
import { matchingComplianceRuleTemplates } from "../src/lib/compliance";
import { instantiateStage } from "../src/lib/instantiation";
import { generateEnglandVariant, seedEnglandDemo } from "../src/lib/englandConversion";
import {
  CDM_BUILDING_MODIFICATION_TAG,
  CDM_F10_NOTIFIABLE_TAG,
  CDM_PRINCIPAL_DESIGNER_TAG,
  effectiveComplianceTags,
  HAISCRIBE_HIGH_INTENSITY_TAG,
} from "../src/lib/cdm";

const db = new PrismaClient();

// The desktop build's first-run seed used to be able to leave a
// database with, say, one User row and nothing else -- whatever
// seedBody happened to have created before something interrupted it
// (the process force-quit, the machine losing power, Windows Defender
// killing the process mid-scan, ...). Found live (29 Aug 2026,
// packaging the Microsoft Store submission): the app's own first-run
// check only asks "does a Postgres cluster already exist here", not
// "did seeding actually finish", so a half-seeded database like that
// silently stays half-seeded forever -- every later launch sees the
// cluster already exists and never retries. Worse, seedBody's ~200
// `db.user.create()` / `db.template.create()` etc. calls aren't
// idempotent, so even a deliberate retry against that same half-seeded
// database would immediately crash again on the first already-existing
// row it tries to recreate.
//
// Wrapping the entire seed in one Postgres transaction fixes the root
// cause instead of trying to detect and repair partial states after
// the fact: if anything interrupts seedBody -- a thrown error, or the
// whole process (and therefore its DB connection) dying outright --
// Postgres itself rolls the whole transaction back the moment that
// connection drops, with no cooperation from this process required.
// The database is left in exactly one of two states, never a third:
// fully seeded, or exactly as empty as before seeding was attempted.
// That in turn makes main.js's separate seed-completion marker (see
// its own comment) always safe to act on -- if the marker's missing,
// a retry is guaranteed to be starting from a genuinely clean slate.
async function main() {
  await db.$transaction((tx) => seedBody(tx), { timeout: 300_000, maxWait: 10_000 });
}

async function seedBody(db: DbClient) {
  console.log("Seeding StageForge Phase 1 dev data…");

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
    // Distinct statutory duty under PSSR (Pressure Systems Safety
    // Regulations 2000) and LOLER (Lifting Operations and Lifting
    // Equipment Regulations 1998) — found missing 26 Aug 2026 while
    // cross-checking "Project Roles and Responsibilities Template.docx"
    // against the live deliverables: several boiler/steam/compressed
    // air/lift items already named "a competent person's written
    // scheme"/"thorough examination" in their own description text, but
    // were gated on COMPLIANCE_OFFICER or SRO — neither of whom actually
    // holds this competency. Same isExactMatchAuthority treatment as
    // Fire Officer/AP: SRO has no standing to substitute for it.
    { key: "COMPETENT_PERSON", name: "Competent Person (PSSR/LOLER)", isExactMatchAuthority: true, category: "AUTHORISED_PERSON_ENGINEER" as const },
    { key: "PRINCIPAL_DESIGNER", name: "Principal Designer", category: "STATUTORY_OFFICER" as const },
    // CDM 2015 reg 5(1) requires the client to appoint BOTH a Principal
    // Designer and a Principal Contractor whenever more than one
    // contractor is or will be working — same trigger, distinct duty
    // holder (construction-phase management vs pre-construction design
    // coordination). Distinct from the existing FM_CONTRACTOR role
    // (SENIOR_CONTRACTUAL) — that's the company-level commercial
    // relationship (Serco), not the project-specific CDM duty holder
    // (27 Aug 2026, Sample_Template_Documents/
    // Ward3_Construction_Phase_Plan_Document_v2.0.pdf, where a named
    // Serco individual holds the PC appointment on one project).
    { key: "PRINCIPAL_CONTRACTOR", name: "Principal Contractor", category: "STATUTORY_OFFICER" as const },
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

  // ── Managed project-number counter (lib/projectNumber.ts) — one row
  // per SectorVariant (28 Aug 2026, see the schema's own comment), not
  // a single global row: England's block below gets its own. Scotland's
  // starts a fresh block at 30001, deliberately unrelated to the
  // ad-hoc numbers the first three demo projects below already carry
  // (20456, 20777, 55998). Seeded to 30002, not 30000: the fourth and
  // fifth demo projects below are themselves the real projects issued
  // 30001 and 30002 live, so the counter has to already account for
  // both numbers being taken — otherwise the next real project created
  // after a reset would collide with one of them.
  await db.projectNumberCounter.upsert({
    where: { sectorVariantId: health.id },
    update: {},
    create: { sectorVariantId: health.id, value: 30002 },
  });

  // ── Companies & departments ────────────────────────────────────
  const buildCare = await db.company.create({
    data: { name: "Serco Health : FVRH Scotland", type: "FM_CONTRACTOR" },
  });
  const buildCareNorth = await db.department.create({
    data: { companyId: buildCare.id, name: "Estates & Facilities" },
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
      // Stable lookup key for standardTeam.ts's STANDARD_TEAM_SCOTLAND --
      // not email, see User.seedKey's own schema comment for why.
      seedKey: "fm_contractor_scotland",
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
      // Stable lookup key for standardTeam.ts's STANDARD_TEAM_SCOTLAND --
      // not email, see User.seedKey's own schema comment for why.
      seedKey: "sponsor_client_authority_scotland",
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
      seedKey: "compliance_officer_scotland",
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
      seedKey: "sro_scotland",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const alan = await db.user.create({
    data: {
      name: "Alan McGeachie",
      email: "alan.mcgeachie@staldwyn.example",
      seedKey: "fire_officer_scotland",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const bob = await db.user.create({
    data: {
      name: "Bob Smith",
      email: "bob.smith@buildcare.example",
      seedKey: "ap_electrical_scotland",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const claire = await db.user.create({
    data: {
      name: "Claire Duncan",
      email: "claire.duncan@buildcare.example",
      seedKey: "ap_water_scotland",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const dennis = await db.user.create({
    data: {
      name: "Dennis Kelly",
      email: "dennis.kelly@independent.example",
      seedKey: "ae_electrical_scotland",
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
      seedKey: "principal_designer_scotland",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const andrea = await db.user.create({
    data: {
      name: "Andrea",
      email: "andrea@buildcare.example",
      seedKey: "finance_scotland",
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
      // One user, two roles (AP and AE Ventilation) -- disciplineTeam.ts's
      // CANDIDATES_SCOTLAND uses this same seedKey under both role keys.
      seedKey: "ap_ae_ventilation_scotland",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const graeme = await db.user.create({
    data: {
      name: "Graeme Paterson",
      email: "graeme.paterson@buildcare.example",
      seedKey: "ap_medical_gases_scotland",
      homeDepartmentId: buildCareNorth.id,
    },
  });
  const sarah = await db.user.create({
    data: {
      name: "Sarah Chen",
      email: "sarah.chen@staldwyn.example",
      seedKey: "clinical_safety_officer_scotland",
      homeDepartmentId: stAldwynEstates.id,
    },
  });
  const neil = await db.user.create({
    data: {
      name: "Neil Forsyth",
      email: "neil.forsyth@staldwyn.example",
      seedKey: "information_governance_officer_scotland",
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
    // Shared-heading label for grouping several of this same
    // template's own Gate 4 design-output items into one visual box
    // (27 Aug 2026, external review feedback — see
    // DeliverableTemplate.section in schema.prisma). Undefined for
    // nearly every item; only set on discipline-specific design
    // outputs at Gate 4.
    section?: string;
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
      | "INFORMATION_GOVERNANCE_OFFICER"
      | "COMPETENT_PERSON";
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
        data: deliverableDefsByStage[i]!.map((d, order) => ({
          gateTemplateId: gateTemplate.id,
          order,
          key: d.key,
          label: d.label,
          description: d.description,
          section: d.section ?? null,
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.electrical_project_brief", label: "Project Brief (scope of electrical works, resilience requirements, critical areas)", description: "SHTM 00, SHTM 06." },
      { key: "del.electrical_condition_surveys", label: "Existing system condition surveys (LV/HV distribution, switchgear, UPS, IPS, generators, lighting, earthing)", description: "SHTM 06 series." },
      { key: "del.electrical_load_capacity_analysis", label: "Load assessment and residual capacity analysis", description: "SHTM 06." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.electrical_stakeholder_engagement", label: "Engagement with clinical, estates and IT stakeholders", description: "SHTM 00." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.electrical_concept_design_report", label: "Concept design options (resilience levels, UPS/IPS strategy, generator provision, distribution philosophy)", description: "SHTM 06." },
      { key: "del.electrical_outline_strategy", label: "Outline electrical strategy (primary/secondary supplies, essential vs non-essential)", description: "SHTM 06 series." },
      { key: "del.electrical_preliminary_single_line_diagrams", label: "Preliminary single-line diagrams and load schedules", description: "SHTM 06." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 06." },
      { key: "del.electrical_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination (the running mid-flight example)
    [
      { key: "del.electrical_coordinated_layout_drawings", label: "Coordinated design (switch rooms, distribution routes, generator location, UPS rooms, containment)", description: "SHTM 06." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
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
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.electrical_discrimination_selectivity_studies", section: "Technical Design Package", label: "Discrimination / selectivity studies and protection coordination", description: "SHTM 06, BS 7671." },
      { key: "del.electrical_ups_ips_autonomy_design", section: "Technical Design Package", label: "UPS / IPS autonomy and configuration design", description: "SHTM 06." },
      { key: "del.electrical_generator_sizing_fuel_control", section: "Technical Design Package", label: "Standby generator sizing, fuel storage and control philosophy", description: "SHTM 06." },
      { key: "del.electrical_emergency_lighting_design", section: "Technical Design Package", label: "Emergency lighting design", description: "BS 5266, Firecode." },
      { key: "del.electrical_earthing_bonding_lightning_design", section: "Technical Design Package", label: "Earthing, bonding and lightning protection design", description: "BS 7671, SHTM 06." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 06.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.electrical_stakeholder_design_approval", label: "Stakeholder review and approval of design", description: "SHTM 06.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical for continuity — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "BS 7671, manufacturer certification." },
      { key: "del.electrical_permit_to_work_isolation", label: "Permit-to-Work and Isolation Certificates for every switch-out", bypassAuthority: "AUTHORISED_PERSON_ELECTRICAL" },
      { key: "del.electrical_distribution_equipment_install", label: "Installation of distribution equipment, containment, cabling, UPS, generators and lighting", description: "SHTM 06, BS 7671." },
      { key: "del.electrical_earthing_bonding_install_records", label: "Earthing and bonding installation records", description: "BS 7671." },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.electrical_temp_supply_hybrid_arrangements", label: "Temporary supply / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.electrical_discrimination_protection_proving", label: "Discrimination / protection proving records", description: "SHTM 06." },
      { key: "del.electrical_ups_ips_autonomy_changeover_tests", label: "UPS / IPS autonomy and changeover tests", description: "Critical life-safety verification, per SHTM 06 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.electrical_generator_load_changeover_tests", label: "Generator load and changeover tests", description: "Critical life-safety verification, per SHTM 06 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.electrical_emergency_lighting_duration_tests", label: "Emergency lighting duration and functional tests", description: "Critical means-of-escape verification, per BS 5266 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.electrical_eic_certificates", label: "As-fitted drawings, single-line diagrams, schedules and certification (Electrical Installation Certificate, etc.)", description: "BS 7671, SHTM 06.", bypassAuthority: "SRO" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 06." },
      { key: "del.electrical_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with BS 7671, SHTM 06 series and manufacturer requirements" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.electrical_formal_acceptance", label: "Formal client / Responsible Person acceptance", description: "SHTM 06.", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.electrical_soft_landings_review", label: "Soft landings / post-occupancy review (performance, resilience, energy, user feedback)", description: "SHTM 00." },
      { key: "del.electrical_updated_maintenance_regime", label: "Updated maintenance regime, inspection schedules and emergency procedures", description: "SHTM 06." },
      { key: "del.electrical_ongoing_statutory_inspection", label: "Ongoing statutory inspection and testing records", description: "Electricity at Work Regulations.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.electrical_thermal_imaging_survey", label: "Periodic thermal imaging survey of distribution boards/switchgear", description: "IET Guidance Note 3, BS 7671 — an approved test method for identifying overheating connections/overloaded circuits before failure, often also an insurance condition of cover. An ongoing O&M activity, not a one-off design deliverable — placed here at Use rather than Technical Design." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 04-01." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.water_project_brief", label: "Project Brief (scope of hot & cold water works, temperature regime, TMV strategy, monitoring requirements)", description: "SHTM 00, SHTM 04-01." },
      { key: "del.water_condition_surveys", label: "Existing system condition surveys (storage, distribution, pumps, calorifiers, TMVs, dead legs, water quality baseline)", description: "SHTM 04-01 Part A & B." },
      { key: "del.water_risk_assessment_review", label: "Water risk assessment review and gap analysis", description: "SHTM 04-01, HSE ACOP L8." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.water_wsg_engagement", label: "Early awareness engagement with Water Safety Group (WSG)", description: "SHTM 04-01 Part B — flags the project to WSG ahead of the formal SBAR submitted at Gate 4." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.water_concept_design_report", label: "Concept design options (storage vs instantaneous, central vs local, return systems, TMV strategy, monitoring)", description: "SHTM 04-01 Part A." },
      { key: "del.water_outline_system_strategy", label: "Outline water system strategy (temperatures, flow rates, resilience, stagnation prevention)", description: "SHTM 04-01 Part A." },
      { key: "del.water_preliminary_schematics_demand", label: "Preliminary schematics and load/demand assessment", description: "SHTM 04-01." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 04-01." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.water_coordinated_layout_drawings", label: "Coordinated design (plant locations, pipe routes, storage vessels, pump rooms, access for maintenance)", description: "SHTM 04-01 Part A." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
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
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.water_treatment_dosing_temp_strategy", section: "Technical Design Package", label: "Water treatment / chemical dosing / temperature control strategy", description: "SHTM 04-01 Part A." },
      { key: "del.water_legionella_control_measures", section: "Technical Design Package", label: "Legionella control measures and schematic risk assessment update", description: "SHTM 04-01, HSE ACOP L8." },
      { key: "del.water_monitoring_sampling_bms_design", section: "Technical Design Package", label: "Temperature monitoring, sampling points and BMS integration design", description: "SHTM 04-01." },
      { key: "del.water_electrical_design", section: "Technical Design Package", label: "Electrical design associated with pumps and controls", description: "SHTM 06 series." },
      { key: "del.water_byelaws_compliance_info", label: "Building Regulations / Water Byelaws compliance information", description: "Scottish Water Byelaws.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_rpz_backflow_prevention", section: "Technical Design Package", label: "RPZ valve installation and annual testing regime (backflow prevention)", description: "WRAS AIM 08-01 — required wherever a water system could backflow-contaminate the mains (lab/medical device connections). Distinct from the general Water Byelaws compliance item above and from Legionella/water-safety control: a system can pass every Legionella check with a lapsed or absent RPZ test." },
      { key: "del.water_dialysis_renal_treatment_requirements", section: "Technical Design Package", label: "Dialysis/renal water treatment requirements confirmed (if the system feeds a renal/haemodialysis unit)", description: "ISO 23500 — a patient-safety-critical water-quality standard distinct from general building water safety, since dialysis water enters the bloodstream directly during treatment." },
      { key: "del.water_dispenser_legionella_biofilm_risk", section: "Technical Design Package", label: "Water dispenser/cooler Legionella and biofilm risk confirmed (reservoir-type vs mains-fed/point-of-use)", description: "HSG274 / HSE ACOP L8 — reservoir-type coolers are a named Legionella/biofilm risk (stored water, biofilm-prone internals) distinct from a mains-fed/point-of-use unit's continuous-flow lower risk. State which type is involved before treating a water dispenser as low-risk by default." },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 04-01.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.water_sbar_submission_to_wsg", label: "Prepare and submit formal SBAR to the Water Safety Group", description: "Covering proposed works, water treatment strategy, risk assessment and temporary arrangements. SHTM 04-01 Part B." },
      { key: "del.water_wsg_written_approval", label: "Obtain written WSG approval / endorsement", description: "SHTM 04-01 — one of two conditions for the Pre-Contract Hold Point below.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until both PFI/NHS cost approval and Water Safety Group approval are received", description: "Clear commercial & governance cut-off. Requires the written WSG approval and a formal PFI Board/NHS lifecycle cost approval to both be in place before Gate 5 can begin.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical for continuity — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "SHTM 04-01, Water Byelaws." },
      { key: "del.water_permit_to_work_isolation", label: "Permit-to-Work and Isolation Certificates for every zone/tank shutdown", bypassAuthority: "AUTHORISED_PERSON_ELECTRICAL" },
      { key: "del.water_pipework_storage_pump_install", label: "Installation of pipework, storage, pumps, TMVs, insulation and controls", description: "SHTM 04-01 Part A." },
      { key: "del.water_jointing_flushing_disinfection_records", label: "Jointing, flushing, cleaning and disinfection records", description: "Critical Legionella control step, per SHTM 04-01 Part D — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.water_sampling_microbiological_testing", label: "Water sampling and microbiological testing records (pre- and post-disinfection)", description: "Critical Legionella control step, per SHTM 04-01 Parts C & D — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.water_temp_supply_hybrid_arrangements", label: "Temporary supply / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.water_decommissioning_records", label: "Decommissioning & strip-out records of redundant water systems", description: "SHTM 04-01." },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.water_final_disinfection_clearance_certs", label: "Final disinfection and microbiological clearance certificates", description: "Critical Legionella control step, per SHTM 04-01 Part D — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.water_temperature_profiling_balancing", label: "Temperature profiling and balancing records", description: "SHTM 04-01." },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 04-01 Part A." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 04-01 Part B & G." },
      { key: "del.water_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with SHTM 04-01, HSE ACOP L8 / HSG 274 and Water Byelaws" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.water_wsg_acceptance_updated_plan", label: "Formal Water Safety Group acceptance and updated Water Safety Plan", description: "SHTM 04-01.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.water_soft_landings_review", label: "Soft landings / post-occupancy review (temperature performance, water quality, user feedback)", description: "SHTM 00." },
      { key: "del.water_updated_water_safety_plan", label: "Updated Water Safety Plan / Written Scheme of Control", description: "SHTM 04-01 Parts B & G." },
      { key: "del.water_ongoing_monitoring_sampling_regime", label: "Ongoing monitoring, sampling and maintenance regime", description: "SHTM 04-01 Part B." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_high_level_risk_register", label: "High-level Risk Register" },
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
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
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
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.drainage_invert_level_drawings", label: "Coordinated below-ground drainage / invert-level drawings" },
      { key: "del.drainage_pipework_routing_falls", label: "Pipework routing, falls and containment proposals" },
      { key: "del.drainage_access_delivery_strategy", label: "Access, delivery and temporary works strategy for excavation/below-slab works" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.drainage_detailed_project_plan_updated_spatial", label: "Updated Detailed Project Plan reflecting spatial constraints" },
      { key: "del.drainage_structure_confirmation", label: "Confirmation that existing structure/foundations can accommodate new drainage runs", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.drainage_full_technical_design_package", section: "Technical Design Package", label: "Full Technical Design Package — detailed drawings, invert levels, specifications" },
      { key: "del.drainage_design_calculations", section: "Technical Design Package", label: "Design calculations — flow rates, pipe sizing and falls to BS EN 12056" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.drainage_pipework_spec_compliant", section: "Technical Design Package", label: "Complete pipework and fittings specification compliant with SHTM 64 and the Building (Scotland) Regulations Section 3 (Environment)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.drainage_installation_method_statements", label: "Detailed Installation Method Statements, confined-space/excavation permit procedures and RAMS" },
      { key: "del.drainage_compliance_matrix", label: "Compliance Matrix — mapping against BS EN 12056, SHTM 64, Building (Scotland) Regulations, Water Environment (Controlled Activities) (Scotland) Regulations 2011, CDM 2015", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)" },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.drainage_procurement_package", label: "Tender or direct-award procurement package" },
      { key: "del.drainage_updated_programme_resource_plan", label: "Updated Programme and Resource Plan" },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
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
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 64." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 64." },
      { key: "del.drainage_trade_effluent_handover", label: "Trade effluent consent finalised and grease-management regime handed to Catering/Facilities", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
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
      { key: "del.common_high_level_risk_register", label: "High-level Risk Register" },
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
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
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
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.coldwater_plant_room_drawings", label: "Coordinated plant room / tank room drawings" },
      { key: "del.coldwater_pipework_routing", label: "Inlet main and distribution pipework routing proposals" },
      { key: "del.coldwater_access_delivery_strategy", label: "Access, delivery and temporary works strategy" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
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
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)" },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.coldwater_procurement_package", label: "Tender or direct-award procurement package" },
      { key: "del.coldwater_updated_programme_resource_plan", label: "Updated Programme and Resource Plan" },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
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
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 04-01 Part B." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 04-01 Part B." },
      { key: "del.coldwater_legionella_risk_assessment_updated", label: "Legionella risk assessment updated and water safety plan reissued", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
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
      { key: "del.common_high_level_risk_register", label: "High-level Risk Register" },
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
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
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
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.lighting_coordinated_layout_drawings", label: "Coordinated lighting layout / containment drawings" },
      { key: "del.lighting_cable_routing_containment", label: "Cable routing and containment proposals" },
      { key: "del.lighting_access_delivery_strategy", label: "Access, delivery and temporary works strategy" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.lighting_detailed_project_plan_updated_spatial", label: "Updated Detailed Project Plan reflecting spatial constraints" },
      { key: "del.lighting_circuit_capacity_confirmation", label: "Confirmation that existing circuits/distribution boards can support new LED loads", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.lighting_full_technical_design_package", section: "Technical Design Package", label: "Full Technical Design Package — detailed lighting drawings, schematics, specifications" },
      { key: "del.lighting_design_calculations", section: "Technical Design Package", label: "Design calculations — lux levels, glare, emergency lighting duration/coverage to BS 5266" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.lighting_spec_compliant", section: "Technical Design Package", label: "Complete luminaire and control gear specification compliant with BS 7671 and BS EN 12464-1", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.lighting_installation_method_statements", label: "Detailed Installation Method Statements and RAMS" },
      { key: "del.lighting_compliance_matrix", label: "Compliance Matrix — mapping against BS 7671, BS 5266, BS EN 12464-1, CDM 2015", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)" },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.lighting_procurement_package", label: "Tender or direct-award procurement package" },
      { key: "del.lighting_updated_programme_resource_plan", label: "Updated Programme and Resource Plan" },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
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
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "BS 7671, BS 5266." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "BS 7671, BS 5266." },
      { key: "del.lighting_eic_certificates", label: "Electrical Installation Certificate(s) (EIC) issued under BS 7671", bypassAuthority: "SRO" },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
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
      { key: "del.boiler_business_case", label: "Business case (valve isolation failure + boiler condition / end-of-life risk)", description: "SHTM 00 — Policies and principles. PM check: clear problem statement, consequences of doing nothing, and why action is needed now." },
      { key: "del.boiler_strategic_brief", label: "Strategic brief & outcomes (continuous heating, full resilience, boiler replacement)", description: "PM check: measurable outcomes (continuous heating, resilience, boiler replacement)." },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.boiler_project_brief", label: "Updated Project Brief (valve replacement + full boiler replacement)", description: "PM check: scope clearly covers both valve and full boiler replacement." },
      { key: "del.boiler_plant_condition_surveys", label: "Existing plant condition surveys (boilers, flues, gas/oil systems, foundations)", description: "SHTM 00, SHTM 04-01. PM check: actual survey reports with condition evidence, not just a summary." },
      { key: "del.boiler_water_quality_baseline_sampling", label: "Initial water quality baseline sampling", description: "SHTM 04-01 Part A. PM check: baseline results captured before any work starts." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.boiler_wsg_early_engagement", label: "Early awareness engagement with Water Safety Group", description: "SHTM 04-01 Part B — flags the project to WSG ahead of the formal SBAR submitted at Gate 4." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.boiler_concept_design_report", label: "Concept options for boiler replacement strategy (capacity, dual-fuel, efficiency, phasing)", description: "PM check: realistic options considered, with a preferred direction emerging — not full construction detail at this stage." },
      { key: "del.boiler_temporary_boiler_strategy", label: "Temporary boiler strategy (sizing, location, connections) to cover permanent boiler changeover", description: "SHTM 00, SHTM 04-01. PM check: confirms size, location and how heating is maintained throughout changeover." },
      { key: "del.boiler_outline_mechanical_strategy", label: "Outline mechanical services strategy (new boilers, headers, valves, pumps, filtration, corrosion monitoring)", description: "SHTM 04-01 Part A. PM check: high-level description of new plant and key components is enough at this stage." },
      { key: "del.boiler_flue_combustion_air_strategy", label: "Preliminary flue / combustion air / gas & oil supply strategy", description: "PM check: early consideration of flues, combustion air and fuel supply — preliminary only." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.boiler_coordinated_layout_drawings", label: "Coordinated layout (new boiler positions, temporary boilers, pipework, flues, access)", description: "PM check: shows new boiler positions, temporary boilers, main routes and access." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 06-01." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.boiler_temp_boiler_siting_confirmation", label: "Confirmation of temporary boiler siting and permanent boiler plantroom arrangement", description: "High-level strategy only at this stage — no detailed method statements; those follow contractor appointment after the Gate 4 Pre-Contract Hold Point.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design. Contains the Pre-Contract Hold Point
    // (V2.0): everything up to and including
    // del.boiler_pre_contract_hold_point is pre-appointment "sufficient
    // for accurate pricing" work; del.boiler_post_appointment_full_design
    // is the only item that happens after a contractor is appointed,
    // though it's still recorded under this same Gate 4.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.boiler_water_treatment_strategy", section: "Technical Design Package", label: "Water treatment / chemical dosing / corrosion inhibitor strategy", description: "SHTM 04-01 Part A, BSRIA water treatment guidance. PM check: suitable for Water Safety Group review." },
      { key: "del.boiler_bms_control_philosophy", section: "Technical Design Package", label: "BMS control philosophy, sequences & point schedules (new boilers + retained systems)", description: "SHTM 06-01. PM check: sufficient for pricing and coordination at this stage, not full construction detail." },
      { key: "del.boiler_electrical_design", section: "Technical Design Package", label: "Electrical design (boiler power, controls, temporary plant)", description: "SHTM 06-01. PM check: sufficient for pricing and coordination at this stage, not full construction detail." },
      { key: "del.boiler_flue_gas_oil_design", section: "Technical Design Package", label: "Flue system design, combustion air, gas & oil supply modifications", description: "PM check: sufficient for pricing and coordination at this stage, not full construction detail." },
      { key: "del.boiler_gas_safety_regs_compliance", section: "Technical Design Package", label: "Gas Safety (Installation and Use) Regulations 1998 compliance evidence", description: "Applies wherever new or retained boilers are gas-fired — a distinct statutory step from general Building Regulations compliance, not previously itemised separately." },
      { key: "del.boiler_structural_support_design", section: "Technical Design Package", label: "Structural / plinth / support design information", description: "PM check: sufficient for pricing and coordination at this stage, not full construction detail." },
      { key: "del.boiler_thermal_insulation_spec", section: "Technical Design Package", label: "Thermal insulation specification", description: "PM check: sufficient for pricing and coordination at this stage, not full construction detail." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 00.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.boiler_sbar_submission_to_wsg", label: "Prepare and submit formal SBAR to the Water Safety Group", description: "Covering proposed works, water treatment strategy, risk assessment and temporary arrangements. SHTM 04-01 Part B. PM check: a real written SBAR document, not just a verbal update." },
      { key: "del.boiler_wsg_written_approval", label: "Obtain written WSG approval / endorsement", description: "SHTM 04-01 — one of two conditions for the Pre-Contract Hold Point below. PM check: needs a signed or minuted approval — a verbal steer isn't enough.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.boiler_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until both PFI/NHS cost approval and Water Safety Group approval are received", description: "Clear commercial & governance cut-off. Requires the written WSG approval and a formal PFI Board/NHS lifecycle cost approval to both be in place before Gate 5 can begin.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.boiler_temp_boiler_installation_commissioning", label: "Temporary boiler installation, connection, load testing & commissioning certificates", description: "SHTM 00." },
      { key: "del.boiler_hot_tapping_isolation_records", label: "Hot tapping / isolation verification records for the LTHW heating circuit", description: "PM check: proof isolations were carried out safely and verified, not just planned.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.boiler_new_boiler_installation", label: "New permanent boiler delivery, installation, flue connections, gas/oil connections", description: "PM check: delivery, installation, flue and fuel connection evidence." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "SHTM 04-01." },
      { key: "del.boiler_water_sampling_results", label: "Water sampling results (pre-, interim- and post-works)", description: "SHTM 04-01 Parts A/B/C. PM check: shows water quality was actually monitored throughout, not just at the end." },
      { key: "del.boiler_flushing_cleaning_dosing_records", label: "System flushing, cleaning, chemical treatment & inhibitor dosing records", description: "Critical water-treatment step for a closed LTHW system, per SHTM 04-01 Part D — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.boiler_headers_valves_pumps_filtration_install", label: "Installation of new headers, valves, pumps, side-stream filtration & corrosion monitoring", description: "SHTM 04-01." },
      { key: "del.boiler_bms_installation_testing", label: "BMS installation, wiring, point-to-point testing & sequence proving", description: "SHTM 06-01. PM check: point-to-point testing evidence, not just a completion statement." },
      { key: "del.boiler_eic_certificates", label: "Electrical installation & test certificates (BS 7671)", description: "SHTM 06-01. PM check: real BS 7671 test certificates on file.", bypassAuthority: "SRO" },
      { key: "del.boiler_combustion_safety_interlock_testing", label: "Combustion, efficiency, emissions and safety interlock testing of new boilers", description: "Critical combustion-safety verification step before the boilers can be relied on — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.boiler_thermal_insulation_completion", label: "Thermal insulation completion" },
      { key: "del.boiler_progress_records_quality_log", label: "Progress records, quality inspections & change control log", description: "PM check: live records of what's actually happening on site, kept up to date." },
      { key: "del.boiler_decommissioning_records", label: "Decommissioning records for existing boilers (safe isolation, strip-out)", description: "PM check: safe isolation and strip-out evidence for the old boilers.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.boiler_performance_efficiency_test_certs", label: "Boiler performance / efficiency / emissions test certificates", description: "PM check: proof the new boilers meet the required performance, not just that they're installed." },
      { key: "del.boiler_balancing_flow_verification", label: "Balancing / flow verification data", description: "SHTM 04-01. PM check: confirms the system is genuinely hydraulically balanced." },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 04-01." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00, SHTM 04-01 Part B." },
      { key: "del.boiler_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions for new boilers, temporary boilers, valves and filtration equipment" },
      { key: "del.boiler_pssr_written_scheme", label: "PSSR written scheme of examination updates for the new boilers (pressure systems)", description: "Pressure Systems Safety Regulations 2000 — a boiler is a pressure system requiring a competent person's written scheme before use.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.boiler_final_water_quality_report", label: "Final water quality, inhibitor residual & corrosion monitoring baseline report", description: "SHTM 04-01. PM check: a real new baseline taken after the works, not a repeat of the pre-works figures." },
      { key: "del.boiler_temp_boiler_decommissioning_certs", label: "Temporary boiler decommissioning & site removal certificates", description: "PM check: confirms temporary plant has been safely removed from site." },
      { key: "del.boiler_updated_water_safety_plan_handover", label: "Updated Water Safety Plan / Written Scheme submitted to WSG", description: "SHTM 04-01 Parts B & G. PM check: a genuine formal close-out with the Water Safety Group, not just a notification.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.boiler_soft_landings_review", label: "Soft landings / post-occupancy review (boiler performance, isolation capability, water quality)", description: "SHTM 00." },
      { key: "del.boiler_ongoing_monitoring_regime", label: "Ongoing monitoring regime (side-stream filtration, corrosion coupons, boiler efficiency)", description: "SHTM 04-01 Part B." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 03-01." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.ventilation_project_brief", label: "Project Brief (scope of ventilation replacement, critical areas, continuity requirements)", description: "SHTM 00, SHTM 03-01." },
      { key: "del.ventilation_condition_surveys_baseline", label: "Existing system condition surveys & baseline data (air volumes, pressures, filtration, hygiene)", description: "SHTM 03-01 Part A." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.ventilation_vsg_early_engagement", label: "Early engagement with Ventilation Safety Group (VSG) / IPC", description: "SHTM 03-01, HAI-SCRIBE — flags the project to VSG/IPC ahead of the formal SBAR submitted at Gate 4." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.ventilation_concept_design_report", label: "Concept design options (phased replacement, temporary ventilation strategy, AHU type)" },
      { key: "del.ventilation_outline_services_strategy", label: "Outline ventilation strategy (air change rates, pressure regimes, filtration, resilience)", description: "SHTM 03-01 Part A." },
      { key: "del.ventilation_preliminary_schematics_load_assessment", label: "Preliminary schematics and load assessment", description: "SHTM 03-01." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, HAI-SCRIBE." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.ventilation_coordinated_layout_drawings", label: "Coordinated design (AHU locations, duct routes, plant access, temporary arrangements)", description: "SHTM 03-01 Part A." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
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
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.ventilation_filter_hygiene_strategy", section: "Technical Design Package", label: "Filter & hygiene strategy", description: "SHTM 03-01." },
      { key: "del.ventilation_bms_control_philosophy", section: "Technical Design Package", label: "BMS / controls philosophy and point schedules", description: "SHTM 06-01." },
      { key: "del.ventilation_electrical_design", section: "Technical Design Package", label: "Electrical design associated with AHUs, fans and controls", description: "SHTM 06-01." },
      { key: "del.ventilation_duct_insulation_spec", section: "Technical Design Package", label: "Duct insulation specification" },
      { key: "del.ventilation_fire_damper_drop_test_regime", section: "Technical Design Package", label: "Fire damper annual drop-test regime specified", description: "BS 9999:2017 requires an annual drop test by a competent person — one of the most commonly-cited real compliance failures in UK healthcare estates (dampers painted over, boxed in, or simply never tested)." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 03-01, HAI-SCRIBE.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.ventilation_sbar_submission_to_vsg", label: "Prepare and submit formal SBAR (or equivalent) to the Ventilation Safety Group / IPC", description: "SHTM 03-01, HAI-SCRIBE." },
      { key: "del.ventilation_vsg_ipc_written_approval", label: "Obtain written VSG / IPC approval", description: "One of two conditions for the Pre-Contract Hold Point below.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.ventilation_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until both PFI/NHS cost approval and VSG/IPC approval are received", description: "Clear commercial & governance cut-off. Requires the written VSG/IPC approval and a formal PFI Board/NHS lifecycle cost approval to both be in place before Gate 5 can begin.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.ventilation_temp_plant_installation_commissioning", label: "Temporary plant installation, connection, testing & commissioning certificates (if used)", description: "SHTM 00." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "SHTM 03-01." },
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
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.ventilation_performance_verification_data", label: "Performance verification data (air volumes, pressures, filtration efficiency, etc.)", description: "SHTM 03-01." },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 03-01." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00, SHTM 03-01 Part B." },
      { key: "del.ventilation_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.ventilation_final_validation_report", label: "Final validation reports", description: "SHTM 03-01 Part A." },
      { key: "del.ventilation_temp_plant_decommissioning_certs", label: "Temporary plant decommissioning & removal certificates (if applicable)" },
      { key: "del.ventilation_vsg_ipc_acceptance", label: "Formal VSG / IPC acceptance", description: "SHTM 03-01 Part B.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.ventilation_soft_landings_review", label: "Soft landings / post-occupancy evaluation (performance, resilience, energy, clinical feedback)", description: "SHTM 00." },
      { key: "del.ventilation_management_arrangements", label: "Updated Ventilation management arrangements / Written Scheme", description: "SHTM 03-01 Part B." },
      { key: "del.ventilation_ongoing_monitoring_regime", label: "Ongoing monitoring, verification and maintenance regime", description: "SHTM 03-01 Part B." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, Medical Gas Safety Group." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.medgas_project_brief", label: "Project Brief (scope of MGPS / pendant replacement, continuity requirements)" },
      { key: "del.medgas_condition_surveys", label: "Existing system condition surveys (pipework, terminal units, pendants, plant, alarms)", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_baseline_identity_quality_flow_testing", label: "Baseline identity, quality and flow testing records", description: "SHTM 02-01 Part A." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.medgas_mgsg_engagement", label: "Early engagement with Medical Gas Safety Group (MGSG) and Authorised Person (MGPS)", description: "SHTM 02-01." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.medgas_concept_design_report", label: "Concept design options (phased replacement, temporary gas supplies, pendant strategy)", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_outline_mgps_strategy", label: "Outline MGPS strategy (sources of supply, distribution, terminal units, pendants, AGSS)", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_pendant_selection_locations", label: "Preliminary pendant / medical supply unit selection and locations", description: "SHTM 02-01, BS EN ISO 11197." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 02-01." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.medgas_coordinated_layout_drawings", label: "Coordinated design (pipe routes, plant locations, pendant positions, structural supports)", description: "SHTM 02-01 Part A." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 06-01." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
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
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.medgas_pendant_structural_design", section: "Technical Design Package", label: "Structural design information for pendant supports / ceiling fixings" },
      { key: "del.medgas_electrical_data_design", section: "Technical Design Package", label: "Electrical & data design associated with pendants", description: "SHTM 06-01." },
      { key: "del.medgas_alarm_system_design", section: "Technical Design Package", label: "Alarm system design and interface requirements", description: "SHTM 02-01 Part A." },
      { key: "del.medgas_agss_wel_exposure_control", section: "Technical Design Package", label: "AGSS occupational exposure control — Workplace Exposure Limit (WEL) monitoring evidence for waste anaesthetic gases", description: "COSHH — real quantified limits apply (100ppm nitrous oxide, 50ppm halogenated agents generally, 10ppm halothane specifically). The Outline MGPS strategy above may name AGSS as part of the system, but exposure-limit monitoring is a distinct occupational-health step, not covered by general MGPS commissioning." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 02-01.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.medgas_sbar_submission_to_mgsg", label: "Prepare and submit formal SBAR (or equivalent) to the Medical Gas Safety Group / Authorised Person (MGPS)", description: "SHTM 02-01." },
      { key: "del.medgas_mgsg_ap_written_approval", label: "Obtain written MGSG / AP (MGPS) approval", description: "One of two conditions for the Pre-Contract Hold Point below.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.medgas_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until both PFI/NHS cost approval and MGSG/AP approval are received", description: "Clear commercial & governance cut-off. Requires the written MGSG/AP (MGPS) approval and a formal PFI Board/NHS lifecycle cost approval to both be in place before Gate 5 can begin.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.medgas_permit_to_work_isolation", label: "Contractor's detailed Method Statements, full RAMS, detailed phasing, isolation & Permit-to-Work procedures", description: "SHTM 02-01 Part B — all MGPS work is controlled via the Permit-to-Work system, overseen by the site Authorised Person (MGPS). Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "AUTHORISED_PERSON_MEDICAL_GASES" },
      { key: "del.medgas_temp_supply_design_install_validation", label: "Temporary medical gas supply arrangements (if required) — design, installation & validation", description: "SHTM 02-01 Part A." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "SHTM 02-01 Part A." },
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
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 02-01 Part A." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions for pendants, terminal units and plant" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.medgas_mgsg_acceptance_handover", label: "MGSG acceptance and formal handover of the MGPS", description: "SHTM 02-01.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.medgas_temp_supply_decommissioning_records", label: "Temporary supply decommissioning records (if applicable)", description: "SHTM 02-01." },
    ],
    // Gate 7 — Use
    [
      { key: "del.medgas_soft_landings_review", label: "Soft landings / post-occupancy review (system performance, pendant usability, alarm response)", description: "SHTM 00." },
      { key: "del.medgas_updated_operational_procedures", label: "Updated operational procedures, Permit-to-Work arrangements and Written Scheme", description: "SHTM 02-01 Part B." },
      { key: "del.medgas_ongoing_ppm_regime", label: "Ongoing planned preventive maintenance regime (including pendant hose replacement schedule)", description: "SHTM 02-01 Part B." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.firealarm_business_case", label: "Business case / need identification (system age, reliability, UFAS performance, compliance)", description: "SHTM 00, SHTM 82, SHTM 85 (fire precautions in existing healthcare premises — the applicable Firecode volume for a retrofit into an occupied hospital)." },
      { key: "del.firealarm_strategic_brief", label: "Strategic brief & project outcomes (life safety, continuity of protection, UFAS reduction)" },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 86." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.firealarm_project_brief", label: "Project Brief (scope of system replacement / upgrade, continuity requirements)", description: "SHTM 00, SHTM 82." },
      { key: "del.firealarm_condition_survey", label: "Existing system condition survey (panels, detectors, call points, cabling, cause & effect)", description: "SHTM 82, SHTM 85, BS 5839-1." },
      { key: "del.firealarm_baseline_ufas_analysis", label: "Baseline UFAS data and false alarm analysis", description: "SHTM 82." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.firealarm_fsa_engagement", label: "Engagement with Fire Safety Advisor / Fire Safety Group", description: "SHTM 82, SHTM 86." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.firealarm_concept_design_report", label: "Concept design options (full replacement vs phased upgrade, technology choice)", description: "SHTM 82." },
      { key: "del.firealarm_outline_detection_alarm_strategy", label: "Outline detection & alarm strategy (Category L1 addressable, zoning, interfaces)", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_detector_type_selection", label: "Preliminary detector type selection (multi-sensor preference to reduce UFAS)", description: "SHTM 82." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 82." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.firealarm_coordinated_layout_drawings", label: "Coordinated design (device locations, cable routes, panel positions, zone plans)", description: "SHTM 82." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 81." },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.firealarm_zone_compartment_alignment_confirmation", label: "Confirmation of zone boundaries aligned to fire compartments", description: "Fire alarm zones must align with compartment/sub-compartment boundaries — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.firealarm_full_technical_design_package", section: "Technical Design Package", label: "Full technical design drawings, schematics and zone plans", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_detailed_specifications", section: "Technical Design Package", label: "Detailed specifications (CIE, detectors, manual call points, sounders, visual devices, cabling, power supplies)", description: "SHTM 82, BS 5839-1." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.firealarm_cause_effect_matrix", section: "Technical Design Package", label: "Cause & effect matrix / interface schedule (doors, plant, lifts, smoke control, etc.)", description: "SHTM 82." },
      { key: "del.firealarm_battery_power_supply_design", section: "Technical Design Package", label: "Battery autonomy and power supply design", description: "BS 5839-1." },
      { key: "del.firealarm_ufas_reduction_strategy", section: "Technical Design Package", label: "UFAS reduction strategy (detector selection, multi-criteria, verification technology)", description: "SHTM 82." },
      { key: "del.firealarm_fire_damper_drop_test_regime", section: "Technical Design Package", label: "Fire damper annual drop-test regime specified (where dampers fall within this system's interface scope)", description: "BS 9999:2017 requires an annual drop test by a competent person — one of the most commonly-cited real compliance failures in UK healthcare estates." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 82.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.firealarm_fsa_design_approval", label: "Fire Safety Advisor / stakeholder review and approval of design", description: "SHTM 82 — only the site NHS Fire Officer can approve or reject fire-related design compliance, not the SRO or Compliance Officer.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "SHTM 82." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "BS 5839-1." },
      { key: "del.firealarm_cie_devices_install", label: "Installation of new control and indicating equipment (CIE), detectors, call points, sounders and visual alarms", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_cable_install_containment_labelling", label: "Cable installation, containment and labelling records", description: "BS 5839-1." },
      { key: "del.firealarm_interface_install_testing", label: "Interface installation and testing records", description: "SHTM 82." },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.firealarm_temp_cover_hybrid_arrangements", label: "Temporary system cover / hybrid working arrangements (if phased)", description: "Adequate fire detection and alarm cover must be maintained throughout the works — cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.firealarm_cause_effect_testing_signoff", label: "Cause & effect testing and sign-off", description: "Critical life-safety verification — confirms fire alarm signals correctly trigger door release, smoke control, lift recall and plant shutdown. Cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 82." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 82, BS 5839-1." },
      { key: "del.firealarm_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions and BS 5839-1 certification" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.firealarm_fsa_formal_acceptance", label: "Formal acceptance by Fire Safety Advisor / Responsible Person", description: "SHTM 82.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firealarm_updated_fire_risk_assessment", label: "Updated fire risk assessment reflecting the new system", description: "SHTM 86.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.firealarm_soft_landings_review", label: "Soft landings / post-occupancy review (system performance, UFAS rates, user feedback)", description: "SHTM 00." },
      { key: "del.firealarm_updated_fire_safety_management", label: "Updated fire safety management procedures and training materials", description: "SHTM 83." },
      { key: "del.firealarm_ongoing_ppm_testing_regime", label: "Ongoing planned preventive maintenance and testing regime", description: "BS 5839-1, SHTM 82." },
      { key: "del.firealarm_ufas_monitoring_action_plan", label: "UFAS monitoring and reduction action plan", description: "SHTM 82." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.lift_project_brief", label: "Project Brief (scope: passenger, bed/passenger, firefighting, escape bed lifts etc.)", description: "SHTM 00, SHTM 08-02." },
      { key: "del.lift_condition_surveys", label: "Existing lift condition surveys (traffic analysis, performance, safety gear, controllers, doors)", description: "SHTM 08-02." },
      { key: "del.lift_baseline_traffic_residual_life", label: "Baseline traffic / usage data and residual life assessment", description: "SHTM 08-02." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.lift_fsa_engagement", label: "Engagement with Fire Safety Advisor (for firefighting / escape lifts)", description: "SHTM 81, SFPN 3." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.lift_concept_design_report", label: "Concept design options (full replacement vs modernisation, drive type, car sizes)", description: "SHTM 08-02." },
      { key: "del.lift_outline_lift_strategy", label: "Outline lift strategy (number, type, capacity, speed, grouping, fire/escape designation)", description: "SHTM 08-02." },
      { key: "del.lift_car_size_door_config", label: "Preliminary car sizes and door configurations (bed/passenger requirements)", description: "SHTM 08-02." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 08-02." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.lift_coordinated_layout_drawings", label: "Coordinated design (shafts, machine rooms / MRL, landings, structural supports, overrun)", description: "SHTM 08-02." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.lift_firefighting_escape_provisions_confirmation", label: "Confirmation of firefighting / escape bed lift provisions", description: "SHTM 81, SFPN 3.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.lift_full_technical_design_package", section: "Technical Design Package", label: "Full technical design drawings & schematics (shafts, cars, landings, machine rooms, interfaces)", description: "SHTM 08-02." },
      { key: "del.lift_detailed_specifications", section: "Technical Design Package", label: "Detailed specifications (drive system, controller, doors, safety gear, finishes, communication systems)", description: "SHTM 08-02, BS EN 81 series. Note: BS EN ISO 8100-1 (design/installation) and 8100-2 (component calculation/testing/documentation) are replacing BS EN 81-20/-50 (publication ~March 2026, harmonisation ~Q3 2026, 36-month dual-validity transition) — confirm which standard a tendered lift package is certified against." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.lift_structural_design", section: "Technical Design Package", label: "Structural design information (loads, fixings, machine room / pit)" },
      { key: "del.lift_electrical_design", section: "Technical Design Package", label: "Electrical design (main supply, emergency supply, lighting, alarms)", description: "SHTM 06 series, SHTM 08-02." },
      { key: "del.lift_firefighting_escape_requirements", section: "Technical Design Package", label: "Firefighting lift / escape bed lift specific requirements (controls, communications, power)", description: "SHTM 81, SFPN 3, BS EN 81-72." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 08-02.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.lift_fsa_design_approval", label: "Stakeholder / Fire Safety Advisor review and approval of design", description: "SHTM 08-02 — only the site NHS Fire Officer can approve or reject fire-related design compliance, not the SRO or Compliance Officer.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "SHTM 08-02." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "BS EN 81 series." },
      { key: "del.lift_shaft_structural_mrl_works", label: "Shaft preparation, structural works, machine room / MRL installation" },
      { key: "del.lift_equipment_install", label: "Installation of lift equipment (car, counterweight, ropes/jack, doors, controller)", description: "SHTM 08-02." },
      { key: "del.lift_electrical_install_emergency_supply_testing", label: "Electrical installation, emergency supply connections and testing", description: "SHTM 06 series.", bypassAuthority: "SRO" },
      { key: "del.lift_safety_gear_governor_overspeed_testing", label: "Safety gear, governor, buffer and overspeed testing records", description: "Critical life-safety verification — the mechanism that prevents uncontrolled car movement or free-fall, per BS EN 81 series. Cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.lift_temp_cover_hybrid_arrangements", label: "Temporary cover / hybrid working arrangements (if phased)" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.lift_load_speed_levelling_door_safety_tests", label: "Load testing, speed, levelling accuracy, door operation and safety device tests", description: "Critical life-safety verification, per BS EN 81 series. Cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.lift_firefighting_escape_function_tests", label: "Firefighting / escape lift specific function tests (if applicable)", description: "SHTM 81, SFPN 3.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 08-02." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 08-02." },
      { key: "del.lift_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer instructions and BS EN 81 certification" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.lift_loler_thorough_examination", label: "Statutory thorough examination (LOLER) prior to use", description: "A lift is lifting equipment under LOLER — a competent person's thorough examination is a separate statutory step from SHTM 08-02/BS EN 81 commissioning.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.lift_formal_acceptance", label: "Formal acceptance by client / Responsible Person", description: "SHTM 08-02." },
    ],
    // Gate 7 — Use
    [
      { key: "del.lift_soft_landings_review", label: "Soft landings / post-occupancy review (performance, reliability, user feedback)", description: "SHTM 00." },
      { key: "del.lift_updated_ppm_regime", label: "Updated maintenance regime and planned preventive maintenance schedule", description: "SHTM 08-02." },
      { key: "del.lift_ongoing_loler_examination_records", label: "Ongoing thorough examination and inspection records (LOLER)", description: "Statutory requirement under LOLER — distinct from routine SHTM planned maintenance.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical risk." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.nursecall_project_brief", label: "Project Brief (nurse call scope, paging scope, integration requirements)", description: "SHTM 08-03." },
      { key: "del.nursecall_condition_survey_logging_analysis", label: "Existing system condition survey & call logging analysis", description: "SHTM 08-03." },
      { key: "del.nursecall_clinical_needs_assessment", label: "Clinical needs assessment (specialties, dependency levels, speech vs non-speech)", description: "SHTM 08-03." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.nursecall_concept_design_report", label: "Concept options (wired vs wireless, speech capability, paging integration, centralised logging)", description: "SHTM 08-03." },
      { key: "del.nursecall_outline_architecture_zoning", label: "Outline system architecture and zoning strategy", description: "SHTM 08-03." },
      { key: "del.nursecall_preliminary_device_schedule", label: "Preliminary device schedule (bedhead, WC, staff emergency, indicators, pagers)", description: "SHTM 08-03." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 08-03." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.nursecall_coordinated_layout_drawings", label: "Coordinated design (device locations, cable routes / wireless coverage, staff bases, indicators)", description: "SHTM 08-03." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.nursecall_full_technical_design_package", section: "Technical Design Package", label: "Full technical design drawings, schematics and device schedules", description: "SHTM 08-03." },
      { key: "del.nursecall_detailed_specifications", section: "Technical Design Package", label: "Detailed specifications (call points, handsets, indicators, controllers, speech units, paging interfaces, logging software)", description: "SHTM 08-03." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.nursecall_power_supply_resilience", section: "Technical Design Package", label: "Power supply, resilience and backup arrangements", description: "SHTM 06 series." },
      { key: "del.nursecall_integration_design", section: "Technical Design Package", label: "Integration design (cardiac arrest, fire alert, staff attack, BMS if required)", description: "SHTM 08-03." },
      { key: "del.nursecall_wireless_coverage_radio_survey", section: "Technical Design Package", label: "Wireless coverage / radio survey (if applicable)", description: "Manufacturer requirements, radio licensing." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 08-03.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.nursecall_clinical_design_approval", label: "Clinical stakeholder review and approval", description: "SHTM 08-03 — patient safety, staff response times, and audit-trail requirements need clinical sign-off, not just engineering sign-off.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer certification." },
      { key: "del.nursecall_devices_cabling_install", label: "Installation of devices, cabling / wireless infrastructure, controllers and indicators", description: "SHTM 08-03." },
      { key: "del.nursecall_integration_testing", label: "Integration testing with other systems" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.nursecall_temp_cover_arrangements", label: "Temporary system cover arrangements", description: "Critical for patient safety — nurse call and staff alert cover must be maintained throughout the works. Cannot be bypassed at PM level.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.nursecall_call_logging_audit_verification", label: "Call logging, reporting and audit trail verification", description: "SHTM 08-03." },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 08-03." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 08-03." },
      { key: "del.nursecall_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer requirements and clinical risk assessments" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.nursecall_clinical_acceptance_signoff", label: "Clinical acceptance / sign-off", description: "Essential — patient safety depends on clinical confirmation that the system meets the needs identified at briefing, not just that it passed engineering commissioning. Cannot be bypassed at PM level.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.nursecall_soft_landings_review", label: "Soft landings / post-occupancy review (response times, usability, false call rates)", description: "SHTM 00." },
      { key: "del.nursecall_updated_operational_procedures", label: "Updated operational procedures and call response protocols" },
      { key: "del.nursecall_ongoing_maintenance_logging_review", label: "Ongoing maintenance, testing and call logging review regime", description: "SHTM 08-03." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.bms_project_brief", label: "Project Brief (scope of BMS replacement, integration requirements, energy monitoring needs)", description: "SHTM 00." },
      { key: "del.bms_condition_survey_point_audit", label: "Existing BMS condition survey, point schedule audit and residual life assessment" },
      { key: "del.bms_stakeholder_requirements_capture", label: "Stakeholder requirements capture (estates, clinical, energy, infection control, IT/cyber)", description: "SHTM 00." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.bms_concept_design_report", label: "Concept design options (centralised vs distributed, open protocol, cloud/hybrid, energy analytics)", description: "SHTM 00, CIBSE Guide H." },
      { key: "del.bms_outline_architecture_resilience", label: "Outline system architecture, network topology and resilience strategy" },
      { key: "del.bms_point_schedule_integration_matrix", label: "High-level point schedule and integration matrix with other systems", description: "Linked system SHTMs." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.bms_coordinated_layout_drawings", label: "Coordinated design (controller locations, network routes, server/head-end rooms, HMI locations)", description: "SHTM 00." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 06 series." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.bms_full_technical_design_package", section: "Technical Design Package", label: "Full technical design drawings, network schematics and system architecture", description: "CIBSE / BSRIA." },
      { key: "del.bms_point_schedules_control_strategies", section: "Technical Design Package", label: "Detailed point schedules, control strategies and cause-and-effect matrices", description: "Linked SHTMs (03-01, 04-01, etc.)." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.bms_detailed_specifications", section: "Technical Design Package", label: "Detailed specifications (controllers, sensors, actuators, servers, software, graphics, cybersecurity)", description: "Manufacturer and industry standards." },
      { key: "del.bms_integration_design", section: "Technical Design Package", label: "Integration design with existing/new plant (boilers, AHUs, medical gases, fire, lifts, nurse call etc.)", description: "Relevant system SHTMs." },
      { key: "del.bms_energy_monitoring_analytics_spec", section: "Technical Design Package", label: "Energy monitoring, reporting and analytics specification" },
      { key: "del.bms_cybersecurity_design", section: "Technical Design Package", label: "Cybersecurity design and resilience measures", description: "NIS Regulations 2018 (NHS boards as Operators of Essential Services), assessed against the Scottish Public Sector Cyber Resilience Framework (PSCRF) v2.0 — NHS Scotland is transitioning toward NCSC's Cyber Assessment Framework (CAF)." },
      { key: "del.bms_electrical_design", section: "Technical Design Package", label: "Electrical design associated with BMS power and controls", description: "SHTM 06 series." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 00.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.bms_stakeholder_design_approval", label: "Stakeholder review and approval of design (including clinical & energy teams)", description: "SHTM 00.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical for plant safety — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates" },
      { key: "del.bms_field_devices_network_install", label: "Installation of field devices, controllers, network infrastructure and head-end equipment" },
      { key: "del.bms_software_config_graphics_dev", label: "Software configuration, graphics development and control strategy implementation" },
      { key: "del.bms_integration_testing", label: "Integration testing with other building systems", description: "Linked SHTMs." },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.bms_temp_monitoring_cover_arrangements", label: "Temporary BMS / monitoring cover arrangements", description: "Essential — continuity of monitoring and control of critical plant must be maintained throughout the works. Cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.bms_point_to_point_alarm_testing", label: "Point-to-point testing, control strategy proving and alarm testing", description: "Critical life-safety verification — confirms the system correctly monitors and alarms on critical plant failure. Cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.bms_graphics_ui_reporting_verification", label: "Graphics, user interface and reporting verification" },
      { key: "del.bms_cybersecurity_testing_hardening", label: "Cybersecurity testing and hardening confirmation", description: "Distinct from general functional commissioning — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.bms_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer requirements, cybersecurity standards and relevant SHTMs" },
      { key: "del.bms_disaster_recovery_arrangements", label: "Configuration backups and disaster recovery arrangements" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.bms_formal_stakeholder_acceptance", label: "Formal client / stakeholder acceptance", description: "Essential.", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.bms_soft_landings_review", label: "Soft landings / post-occupancy evaluation (performance, usability, energy savings, alarm management)", description: "SHTM 00." },
      { key: "del.bms_updated_operational_procedures", label: "Updated operational procedures, alarm response protocols and energy reporting routines" },
      { key: "del.bms_ongoing_maintenance_cyber_regime", label: "Ongoing maintenance, software update and cybersecurity regime" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 03-01." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.chilledwater_project_brief", label: "Project Brief (scope of chilled water / cooling works, resilience requirements, critical areas)", description: "SHTM 00, SHTM 03-01." },
      { key: "del.chilledwater_condition_surveys", label: "Existing system condition surveys (chillers, CHW pipework, pumps, pressurisation, coils, water quality)" },
      { key: "del.chilledwater_load_capacity_analysis", label: "Cooling load assessment and residual capacity analysis", description: "CIBSE." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.chilledwater_stakeholder_engagement", label: "Engagement with clinical, estates and energy stakeholders", description: "SHTM 00." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.chilledwater_concept_design_report", label: "Concept design options (chiller type, air-cooled vs water-cooled, free cooling, resilience philosophy, distribution strategy)", description: "SHTM 03-01, CIBSE." },
      { key: "del.chilledwater_outline_cooling_strategy", label: "Outline cooling strategy (temperatures, flow rates, primary/secondary, buffer vessels)", description: "CIBSE." },
      { key: "del.chilledwater_preliminary_schematics_load", label: "Preliminary schematics and load schedules" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00." },
      { key: "del.chilledwater_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.chilledwater_coordinated_layout_drawings", label: "Coordinated design (chiller locations, pipe routes, pump rooms, access, external plant)", description: "SHTM 00." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.chilledwater_resilience_freecooling_confirmation", label: "Confirmation of resilience and free-cooling provisions — high-level temporary arrangements strategy only", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.chilledwater_treatment_corrosion_strategy", section: "Technical Design Package", label: "Water treatment / chemical dosing / corrosion and microbiological control strategy", description: "BSRIA, SHTM 04-01 principles." },
      { key: "del.chilledwater_legionella_biocide_dosing_regime", section: "Technical Design Package", label: "Legionella / biocide dosing regime design for any wet cooling tower or evaporative condenser element", description: "HSE ACOP L8 / HSG274 — distinct from the closed-loop chilled-water-circuit water treatment above; evaporative cooling towers are one of the best-documented Legionella risk vectors in UK building services." },
      { key: "del.chilledwater_control_strategy_bms_schedules", section: "Technical Design Package", label: "Control strategy, sequences and BMS point schedules", description: "SHTM 03-01 linked, CIBSE Guide H." },
      { key: "del.chilledwater_electrical_design", section: "Technical Design Package", label: "Electrical design associated with chillers, pumps and controls", description: "SHTM 06 series." },
      { key: "del.chilledwater_refrigerant_fgas_management", section: "Technical Design Package", label: "Refrigerant management and F-Gas compliance (if applicable)", description: "F-Gas Regulations." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 00.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.chilledwater_stakeholder_design_approval", label: "Stakeholder review and approval of design", description: "SHTM 00.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical for clinical areas — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer certification." },
      { key: "del.chilledwater_chillers_pipework_install", label: "Installation of chillers, pipework, pumps, pressurisation units, insulation and controls" },
      { key: "del.chilledwater_pressure_testing_flushing_dosing", label: "Pressure testing, flushing, cleaning and chemical treatment records", description: "Critical water-treatment step for a closed chilled water system, per BSRIA guidance — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.chilledwater_water_sampling_quality_records", label: "Water sampling and quality records" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.chilledwater_temp_cooling_hybrid_arrangements", label: "Temporary cooling / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.chilledwater_performance_testing_partload", label: "Performance testing at part-load and design conditions" },
      { key: "del.chilledwater_water_treatment_verification_baseline", label: "Water treatment verification and baseline quality report", description: "Critical water-treatment step for a closed chilled water system — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.chilledwater_fgas_register_leak_check", label: "F-Gas register and leak-check compliance confirmed (where applicable)", description: "F-Gas Regulations — distinct statutory step from general commissioning.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_cooling_tower_notification", label: "Local authority notification of notifiable cooling tower / evaporative condenser confirmed (where applicable)", description: "Notification of Cooling Towers and Evaporative Condensers Regulations 1992 (as amended), alongside HSE ACOP L8 / HSG274 — distinct statutory step from general commissioning.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.chilledwater_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with CIBSE, BSRIA, F-Gas (where applicable) and manufacturer requirements" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.chilledwater_formal_stakeholder_acceptance", label: "Formal client / stakeholder acceptance", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.chilledwater_soft_landings_review", label: "Soft landings / post-occupancy review (cooling performance, energy, resilience, user feedback)", description: "SHTM 00." },
      { key: "del.chilledwater_updated_maintenance_regime", label: "Updated maintenance regime, water treatment programme and monitoring procedures" },
      { key: "del.chilledwater_ongoing_performance_energy_monitoring", label: "Ongoing performance and energy monitoring" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.steam_project_brief", label: "Project Brief (scope of steam generation, distribution, condensate and user modifications)", description: "SHTM 00." },
      { key: "del.steam_condition_surveys", label: "Existing system condition surveys (boilers, distribution, PRVs, traps, condensate, water treatment)", description: "PSSR." },
      { key: "del.steam_written_scheme_review", label: "Review of existing Written Scheme of Examination and inspection history", description: "PSSR." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.steam_competent_person_engagement", label: "Engagement with Competent Person, estates and clinical stakeholders", description: "PSSR." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.steam_concept_design_report", label: "Concept design options (boiler type, pressure levels, distribution strategy, condensate recovery, resilience)", description: "CIBSE, manufacturer data." },
      { key: "del.steam_outline_system_strategy", label: "Outline steam system strategy (generation, distribution, reduction, condensate)" },
      { key: "del.steam_preliminary_schematics_load", label: "Preliminary schematics and load assessment" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, PSSR." },
      { key: "del.steam_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.steam_coordinated_layout_drawings", label: "Coordinated design (boiler plant, pipe routes, PRV stations, condensate receiver locations, access)", description: "SHTM 00." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.steam_critical_user_resilience_confirmation", label: "Confirmation of critical user resilience requirements — high-level temporary arrangements strategy only", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.steam_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.steam_pressure_system_design_safety_schedule", section: "Technical Design Package", label: "Pressure system design and safety device schedule", description: "PSSR.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.steam_water_treatment_blowdown_strategy", section: "Technical Design Package", label: "Water treatment / chemical dosing / blowdown strategy", description: "Manufacturer / BESSafe principles." },
      { key: "del.steam_control_strategy_bms_integration", section: "Technical Design Package", label: "Control strategy, sequences and BMS integration" },
      { key: "del.steam_electrical_design", section: "Technical Design Package", label: "Electrical design associated with boilers, pumps and controls", description: "SHTM 06 series." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, PSSR.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.steam_competent_person_design_review", label: "Competent Person review of design (where required under Written Scheme)", description: "PSSR.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical for process users — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "PED / BS EN standards." },
      { key: "del.steam_boilers_pipework_prv_install", label: "Installation of boilers, pipework, PRVs, traps, insulation and controls" },
      { key: "del.steam_ndt_pressure_welding_records", label: "NDT, pressure testing and welding records", description: "Critical life-safety verification for a pressure system, per PSSR / BS standards — cannot be bypassed at PM level.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.steam_water_treatment_install_dosing", label: "Water treatment system installation and initial dosing records" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.steam_temp_steam_hybrid_arrangements", label: "Temporary steam / hybrid working arrangements (if phased)", description: "Essential where required — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.steam_safety_valve_setting_certification", label: "Safety valve setting and certification", description: "Critical life-safety verification for a pressure system, per PSSR — cannot be bypassed at PM level.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.steam_performance_testing_boilers_distribution", label: "Performance testing of boilers and distribution" },
      { key: "del.steam_updated_written_scheme", label: "Updated Written Scheme of Examination", description: "PSSR.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "PSSR." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.steam_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with PSSR, PED, relevant BS EN standards and manufacturer requirements" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.steam_formal_acceptance", label: "Formal client / Competent Person acceptance", description: "PSSR.", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.steam_soft_landings_review", label: "Soft landings / post-occupancy review (performance, reliability, safety, energy)", description: "SHTM 00." },
      { key: "del.steam_updated_written_scheme_inspection_regime", label: "Updated Written Scheme of Examination and inspection regime", description: "Statutory requirement under PSSR.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.steam_ongoing_treatment_maintenance_examination", label: "Ongoing water treatment, maintenance and statutory examination programme", description: "Statutory requirement under PSSR.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.firesuppression_business_case", label: "Business case / need identification (system age, reliability, coverage, compliance with current fire strategy)", description: "SHTM 00, SHTM 81, SHTM 85 (fire precautions in existing healthcare premises — the applicable Firecode volume for a retrofit into an occupied hospital)." },
      { key: "del.firesuppression_strategic_brief", label: "Strategic brief & project outcomes (life safety, property protection, business continuity, compliance)" },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, SHTM 86." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.firesuppression_project_brief", label: "Project Brief (scope of suppression works — sprinkler / water mist / gas / foam, areas covered)", description: "SHTM 00, SHTM 81." },
      { key: "del.firesuppression_condition_surveys", label: "Existing system condition surveys (pipework, valves, pump sets, cylinders, nozzles, interfaces)", description: "SHTM 81, SHTM 85." },
      { key: "del.firesuppression_strategy_risk_assessment_review", label: "Review of current fire strategy and fire risk assessment", description: "SHTM 81, SHTM 86." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.firesuppression_fsa_engagement", label: "Formal engagement with Fire Safety Advisor / Authorising Engineer", description: "SHTM 81, SHTM 86." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.firesuppression_concept_design_report", label: "Concept design options (sprinkler vs water mist vs gaseous, coverage extent, resilience)", description: "SHTM 81, BS EN 12845 / relevant standards." },
      { key: "del.firesuppression_outline_strategy", label: "Outline suppression strategy aligned with fire strategy and compartmentation", description: "SHTM 81." },
      { key: "del.firesuppression_preliminary_layouts_hazard_class", label: "Preliminary schematic layouts and hazard classification", description: "Relevant BS EN standards." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, SHTM 00, SHTM 81." },
      { key: "del.firesuppression_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.firesuppression_coordinated_layout_drawings", label: "Coordinated design (pipe routes, valve sets, pump rooms, cylinder locations, nozzle positions)", description: "SHTM 81." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 81." },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.firesuppression_alarm_interface_confirmation", label: "Confirmation of interface requirements with fire alarm system — high-level temporary arrangements strategy only", description: "SHTM 82.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.firesuppression_hydraulic_agent_calculations", section: "Technical Design Package", label: "Hydraulic calculations (sprinkler / water mist) or agent quantity calculations (gaseous)", description: "BS EN 12845 or BS EN 15004." },
      { key: "del.firesuppression_cause_effect_matrix", section: "Technical Design Package", label: "Cause & effect / interface matrix with fire detection & alarm system", description: "SHTM 82." },
      { key: "del.firesuppression_water_agent_storage_design", section: "Technical Design Package", label: "Water supply / storage or agent storage design", description: "Relevant standards." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, SHTM 81.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.firesuppression_fsa_design_approval", label: "Fire Safety Advisor / Authorising Engineer review and approval of design", description: "SHTM 81, SHTM 86 — only the site NHS Fire Officer can approve or reject fire-related design compliance, not the SRO or Compliance Officer.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.firesuppression_method_statements_temp_protection", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary protection arrangements", description: "Critical for life safety — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Relevant standards." },
      { key: "del.firesuppression_pipework_valves_nozzles_install", label: "Installation of pipework, valve sets, pumps, cylinders, nozzles and controls", description: "Relevant BS EN standards." },
      { key: "del.firesuppression_pressure_flushing_integrity_testing", label: "Pressure testing, flushing and integrity testing records", description: "Critical life-safety verification of the suppression system's physical integrity, per BS EN 12845 / relevant standards. Cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_alarm_interface_preliminary_testing", label: "Interface installation and preliminary testing with fire alarm system", description: "SHTM 82." },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.firesuppression_temp_protection_hybrid_arrangements", label: "Temporary protection / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.firesuppression_discharge_performance_verification", label: "Hydraulic / agent discharge performance verification (where safe and appropriate)", description: "Critical life-safety verification — confirms the suppression system will actually discharge and perform as designed. Cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_cause_effect_alarm_testing", label: "Interface and cause-and-effect testing with fire detection & alarm system", description: "Critical life-safety verification, per SHTM 82. Cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "SHTM 81." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.firesuppression_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with SHTM 81, relevant BS EN / ISO standards and the building fire strategy" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.firesuppression_fsa_formal_acceptance", label: "Formal acceptance by Fire Safety Advisor / Authorising Engineer", description: "SHTM 81, SHTM 86.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.firesuppression_updated_fire_risk_assessment", label: "Updated fire risk assessment reflecting the new system", description: "SHTM 86.", bypassAuthority: "FIRE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.firesuppression_soft_landings_review", label: "Soft landings / post-occupancy review (system performance, false discharge risk, user feedback)", description: "SHTM 00." },
      { key: "del.firesuppression_updated_maintenance_regime", label: "Updated maintenance, inspection and testing regime", description: "Relevant BS EN standards, SHTM 81." },
      { key: "del.firesuppression_ongoing_alarm_interface_testing", label: "Ongoing interface testing with fire alarm system", description: "SHTM 82." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.security_stakeholder_engagement", label: "Engagement with Security, IT/Cyber, Information Governance, Estates and clinical stakeholders", description: "Critical." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.security_concept_design_report", label: "Concept design options (camera technology, access control architecture, integration, cloud vs on-premise)", description: "BS EN standards." },
      { key: "del.security_outline_strategy", label: "Outline security strategy (coverage, detection, response, recording, retention)", description: "NHS Scotland Security Standards." },
      { key: "del.security_preliminary_layouts", label: "Preliminary layouts (camera locations, access points, control room)" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, GDPR." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.security_coordinated_layout_drawings", label: "Coordinated design (camera positions, reader locations, cabling routes, control room, equipment rooms)" },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.security_network_power_resilience_confirmation", label: "Confirmation of network and power resilience requirements", description: "SHTM 06 linked.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.security_full_technical_design_package", section: "Technical Design Package", label: "Full technical design drawings, schematics, camera schedules and access control schedules", description: "BS EN standards." },
      { key: "del.security_detailed_specifications", section: "Technical Design Package", label: "Detailed specifications (cameras, recorders/VMS, readers, controllers, detectors, software, networks)", description: "Manufacturer and BS EN standards." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.security_network_cybersecurity_design", section: "Technical Design Package", label: "Network architecture, cybersecurity design and hardening measures", description: "NHS cyber standards." },
      { key: "del.security_dpia", label: "Data protection / privacy impact assessment (DPIA) for CCTV and access control", description: "GDPR / UK Data Protection Act 2018.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.security_recording_retention_audit_design", section: "Technical Design Package", label: "Recording, retention, export and audit trail design", description: "Information Governance.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.security_electrical_design", section: "Technical Design Package", label: "Electrical design associated with power and backup", description: "SHTM 06 series." },
      { key: "del.security_interface_design_other_systems", section: "Technical Design Package", label: "Interface design with other systems (fire, BMS, nurse call, lifts if required)" },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.security_stakeholder_design_approval", label: "Stakeholder review and approval of design (Security, IG, Cyber, Estates)", description: "Essential.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer certification." },
      { key: "del.security_cameras_readers_networks_install", label: "Installation of cameras, readers, detectors, cabling, control equipment and networks" },
      { key: "del.security_network_config_cyber_hardening_testing", label: "Network configuration, cybersecurity hardening and testing records", description: "Cyber standards.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.security_temp_coverage_hybrid_arrangements", label: "Temporary coverage / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.security_decommissioning_secure_destruction_records", label: "Decommissioning & secure destruction records of redundant equipment and data", description: "GDPR / Information Governance.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.security_coverage_image_quality_recording_verification", label: "Camera coverage, image quality and recording verification" },
      { key: "del.security_access_control_antipassback_audit_testing", label: "Access control, anti-passback, audit trail and integration testing" },
      { key: "del.security_cybersecurity_vulnerability_confirmation", label: "Cybersecurity testing and vulnerability confirmation", description: "NHS cyber standards — cannot be bypassed at PM level.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.security_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with NHS Scotland Security Standards, BS EN standards, cybersecurity requirements and GDPR" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.security_formal_acceptance", label: "Formal acceptance by Security, Information Governance and client", description: "Essential.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
      { key: "del.security_updated_dpia_retention_policies", label: "Updated DPIA and data retention policies", description: "GDPR / Information Governance.", bypassAuthority: "INFORMATION_GOVERNANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.security_soft_landings_review", label: "Soft landings / post-occupancy review (coverage effectiveness, usability, false alarms, user feedback)", description: "SHTM 00." },
      { key: "del.security_updated_operational_procedures", label: "Updated operational procedures, monitoring protocols and incident response", description: "NHS Scotland Security Standards." },
      { key: "del.security_ongoing_maintenance_cyber_data_regime", label: "Ongoing maintenance, software update, cybersecurity and data management regime" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical risk." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.pts_project_brief", label: "Project Brief (scope of network, stations, capacity, priority routing, integration needs)", description: "SHTM 00." },
      { key: "del.pts_condition_surveys", label: "Existing system condition surveys (tubes, stations, blowers, carriers, control system, leakage, performance)", description: "Manufacturer standards." },
      { key: "del.pts_clinical_workflow_demand_analysis", label: "Clinical workflow and demand analysis (lab, pharmacy, blood bank, theatres, wards)", description: "Clinical stakeholders." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.pts_clinical_stakeholder_engagement", label: "Engagement with Pathology, Pharmacy, Blood Bank, Theatres, Critical Care, IPC and Estates", description: "Essential." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.pts_concept_design_report", label: "Concept design options (network topology, station types, blower strategy, carrier technology, software)", description: "Manufacturer standards." },
      { key: "del.pts_outline_system_strategy", label: "Outline system strategy (routing, prioritisation, redundancy, future expansion)", description: "Clinical requirements." },
      { key: "del.pts_preliminary_station_routing", label: "Preliminary station location plan and tube routing strategy" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, IPC." },
      { key: "del.pts_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.pts_coordinated_layout_drawings", label: "Coordinated design (tube routes, station locations, blower plant, access for maintenance)" },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.pts_critical_dept_resilience_confirmation", label: "Confirmation of critical department resilience requirements — high-level temporary arrangements strategy only", description: "Clinical stakeholders.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.pts_tracking_prioritisation_alarm_design", section: "Technical Design Package", label: "Carrier tracking, prioritisation, alarm and audit trail design", description: "Clinical requirements." },
      { key: "del.pts_power_control_network_design", section: "Technical Design Package", label: "Power, control and network design", description: "SHTM 06 series." },
      { key: "del.pts_infection_control_cleanability", section: "Technical Design Package", label: "Infection control and cleanability features", description: "IPC guidance.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_noise_vibration_considerations", section: "Technical Design Package", label: "Noise and vibration considerations", description: "SHTM 08-01, where relevant." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, IPC.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.pts_clinical_ipc_design_approval", label: "Clinical and IPC stakeholder review and approval of design", description: "Essential.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.pts_method_statements_temp_transport", label: "Contractor's detailed Method Statements, full RAMS and detailed temporary specimen/medicine transport arrangements", description: "Critical for clinical service — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer certification." },
      { key: "del.pts_network_stations_install", label: "Installation of tube network, stations, diverters, blower plant and controls", description: "Manufacturer standards." },
      { key: "del.pts_pressure_leakage_integrity_testing", label: "Pressure / leakage testing and integrity records", description: "Critical physical integrity verification, per manufacturer standards — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.pts_temp_transport_hybrid_arrangements", label: "Temporary transport / hybrid working arrangements (if phased)", description: "Essential — cannot be bypassed at PM level.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.pts_transit_prioritisation_tracking_tests", label: "Carrier transit time, prioritisation, tracking and empty carrier management tests", description: "Critical clinical workflow verification — confirms urgent specimens/blood products are correctly prioritised and tracked. Cannot be bypassed at PM level.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
      { key: "del.pts_leakage_pressure_integrity_verification", label: "Leakage, pressure and system integrity verification", description: "Critical physical integrity verification — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.pts_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with manufacturer requirements, clinical risk assessments and infection control standards" },
      { key: "del.pts_config_backups_documentation", label: "Full system configuration backups and documentation" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.pts_formal_clinical_client_acceptance", label: "Formal clinical and client acceptance", description: "Essential.", bypassAuthority: "CLINICAL_SAFETY_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.pts_soft_landings_review", label: "Soft landings / post-occupancy review (transit times, reliability, usability, clinical feedback)", description: "SHTM 00." },
      { key: "del.pts_updated_operational_procedures", label: "Updated operational procedures, prioritisation rules and contingency plans", description: "Clinical stakeholders." },
      { key: "del.pts_ongoing_maintenance_hygiene_monitoring", label: "Ongoing maintenance, carrier hygiene and performance monitoring regime", description: "Manufacturer standards, IPC." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "SHTM 00, IPC." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.abovedrainage_project_brief", label: "Project Brief (scope of foul, waste, vent and associated drainage works)", description: "SHTM 00." },
      { key: "del.abovedrainage_condition_surveys", label: "Existing system condition surveys (stacks, branches, floor drains, access points, known problem areas)" },
      { key: "del.abovedrainage_blockage_history_review", label: "Review of historical blockage, flooding or odour issues" },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.abovedrainage_stakeholder_engagement", label: "Engagement with Estates, IPC, clinical and housekeeping stakeholders", description: "Important." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.abovedrainage_concept_design_report", label: "Concept design options (stack strategy, materials, access provision, future flexibility)", description: "BS EN 12056." },
      { key: "del.abovedrainage_outline_strategy", label: "Outline drainage strategy (foul, waste, venting, gradients, capacity)", description: "Building Standards (Scotland)." },
      { key: "del.abovedrainage_preliminary_layouts_schedules", label: "Preliminary schematic layouts and stack schedules" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, IPC." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.abovedrainage_coordinated_layout_drawings", label: "Coordinated design (stack locations, branch routes, floor drains, access points, plant interfaces)", description: "BS EN 12056." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.abovedrainage_access_maintenance_confirmation", label: "Confirmation of access and maintenance strategy", description: "Critical for long-term performance.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.abovedrainage_full_technical_design_package", section: "Technical Design Package", label: "Full technical design drawings, schematics, stack schedules and drain schedules", description: "BS EN 12056, Building Standards." },
      { key: "del.abovedrainage_detailed_specifications", section: "Technical Design Package", label: "Detailed specifications (pipework materials, fittings, floor drains, channels, traps, access fittings, insulation if required)", description: "BS EN 12056." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.abovedrainage_venting_antisiphonage_strategy", section: "Technical Design Package", label: "Venting strategy and anti-siphonage measures", description: "BS EN 12056." },
      { key: "del.abovedrainage_access_rodding_cleaning_design", section: "Technical Design Package", label: "Access, rodding and cleaning point design", description: "Maintainability focus." },
      { key: "del.abovedrainage_belowground_interface_design", section: "Technical Design Package", label: "Interface design with below-ground drainage and sanitary fittings" },
      { key: "del.abovedrainage_building_standards_compliance_info", label: "Building Standards (Scotland) compliance information", description: "Section 3 Environment.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, IPC.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.abovedrainage_stakeholder_design_approval", label: "Stakeholder review and approval of design (Estates, IPC)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Important for operational areas." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer / BS EN standards." },
      { key: "del.abovedrainage_pipework_stacks_install", label: "Installation of above-ground drainage pipework, stacks, branches, floor drains and access fittings", description: "BS EN 12056." },
      { key: "del.abovedrainage_gradient_support_jointing_records", label: "Gradient, support and jointing quality records" },
      { key: "del.abovedrainage_air_water_testing_records", label: "Air / water testing records", description: "Critical verification step before drainage is relied upon, per BS EN 12056 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.abovedrainage_temp_drainage_hybrid_arrangements", label: "Temporary drainage / hybrid working arrangements (if phased)", description: "Where required." },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.abovedrainage_full_testing_commissioning_records", label: "Full testing and commissioning records (air tests, water tests, performance verification)", description: "Critical verification step, per BS EN 12056 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "Essential for future maintenance." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.abovedrainage_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with Building Standards (Scotland), BS EN 12056 and manufacturer requirements" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.abovedrainage_formal_acceptance", label: "Formal client / Estates acceptance", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.abovedrainage_soft_landings_review", label: "Soft landings / post-occupancy review (blockages, odours, maintainability, user feedback)", description: "SHTM 00." },
      { key: "del.abovedrainage_updated_maintenance_cleaning_regime", label: "Updated maintenance and cleaning regime" },
      { key: "del.abovedrainage_ongoing_inspection_monitoring", label: "Ongoing inspection and performance monitoring" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.compressedair_competent_person_engagement", label: "Engagement with Estates, users (workshops, laboratories, etc.) and Competent Person (if required)", description: "PSSR." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.compressedair_concept_design_report", label: "Concept design options (compressor type, central vs local, treatment train, distribution strategy, resilience)", description: "CIBSE, manufacturer data." },
      { key: "del.compressedair_outline_strategy", label: "Outline compressed air strategy (pressure levels, air quality class, duty/standby, storage)", description: "ISO 8573 air quality classes, where relevant." },
      { key: "del.compressedair_preliminary_schematics_demand", label: "Preliminary schematics and demand assessment" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, PSSR." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.compressedair_coordinated_layout_drawings", label: "Coordinated design (compressor plant location, receiver siting, pipe routes, access, ventilation/cooling)", description: "SHTM 00." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.compressedair_critical_user_confirmation", label: "Confirmation of critical user requirements", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 4 — Technical Design
    [
      { key: "del.compressedair_full_technical_design_package", section: "Technical Design Package", label: "Full technical design drawings, schematics and pipework layouts", description: "CIBSE, manufacturer data." },
      { key: "del.compressedair_detailed_specifications", section: "Technical Design Package", label: "Detailed specifications (compressors, receivers, dryers, filters, pipework, valves, regulators, controls)", description: "Relevant BS EN standards." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.compressedair_air_treatment_quality_spec", section: "Technical Design Package", label: "Air treatment and quality specification (dryness, filtration, oil content)", description: "ISO 8573, where applicable." },
      { key: "del.compressedair_pressure_system_design_safety_schedule", section: "Technical Design Package", label: "Pressure system design and safety device schedule", description: "PSSR.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.compressedair_control_strategy_bms_integration", section: "Technical Design Package", label: "Control strategy, sequencing and BMS integration (if required)" },
      { key: "del.compressedair_electrical_design", section: "Technical Design Package", label: "Electrical design associated with compressors and controls", description: "SHTM 06 series." },
      { key: "del.compressedair_noise_ventilation_heat_rejection", section: "Technical Design Package", label: "Noise, ventilation and heat rejection design" },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, PSSR.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.compressedair_competent_person_design_review", label: "Competent Person review of design (where required under Written Scheme)", description: "PSSR.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Where operationally required." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "PED / BS EN standards." },
      { key: "del.compressedair_compressors_treatment_install", label: "Installation of compressors, treatment plant, receivers, pipework and controls" },
      { key: "del.compressedair_pressure_flushing_purity_testing", label: "Pressure testing, flushing and purity testing records", description: "Critical life-safety verification for a pressure system, per relevant standards — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.compressedair_temp_supply_hybrid_arrangements", label: "Temporary supply / hybrid working arrangements (if phased)", description: "Where required." },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.compressedair_safety_valve_setting_certification", label: "Safety valve setting and certification", description: "Critical life-safety verification for a pressure system, per PSSR — cannot be bypassed at PM level.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.compressedair_air_quality_verification_testing", label: "Air quality verification testing (particles, humidity, oil content as applicable)", description: "ISO 8573, where relevant." },
      { key: "del.compressedair_updated_written_scheme", label: "Updated Written Scheme of Examination (if applicable)", description: "PSSR.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules", description: "PSSR." },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.compressedair_manufacturer_instructions_compliance_evidence", label: "Evidence of compliance with PSSR, PED, relevant BS EN standards, ISO 8573 (where applicable) and manufacturer requirements" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.compressedair_formal_acceptance", label: "Formal client / Competent Person acceptance", description: "PSSR, where applicable.", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.compressedair_soft_landings_review", label: "Soft landings / post-occupancy review (performance, reliability, air quality, energy, user feedback)", description: "SHTM 00." },
      { key: "del.compressedair_updated_written_scheme_inspection_regime", label: "Updated Written Scheme of Examination and inspection regime (if applicable)", description: "Statutory requirement under PSSR, where it applies.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.compressedair_ongoing_maintenance_examination", label: "Ongoing maintenance, filter/dryer servicing and statutory examination programme", description: "PSSR / manufacturer, where applicable.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical and infection prevention & control (IPC) input." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.wardrefresh_project_brief", label: "Project Brief (scope: finishes, rooms/wards affected)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.wardrefresh_condition_surveys", label: "Existing condition surveys (fabric, doors, windows, finishes, known risks)" },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.wardrefresh_stakeholder_engagement", label: "Early engagement with Clinical, IPC, Estates and Soft FM teams", description: "Essential." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.wardrefresh_concept_design_report", label: "Concept design options (finishes strategy, phasing, decant requirements)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.wardrefresh_infection_control_strategy", label: "Outline clinical environment strategy (infection control, cleanability, durability)", description: "IPC." },
      { key: "del.wardrefresh_preliminary_finishes_schedule", label: "Preliminary room data sheets / layouts" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.wardrefresh_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.wardrefresh_coordinated_layout_drawings", label: "Coordinated design (doors, windows, layouts, finishes interfaces with services)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.wardrefresh_critical_user_confirmation", label: "Confirmation of temporary clinical arrangements — high-level strategy only", description: "Clinical stakeholders.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.wardrefresh_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_mep_interface_design", label: "Interface design with ventilation, medical gases, electrical, nurse call, drainage and fire systems", description: "SHTM 03-01 (ventilation), SHTM 02-01 (medical gas), SHTM 06 series (electrical), SHTM 08-03 (nurse call), SHTM 04-01 (drainage/water)." },
      { key: "del.common_infection_control_design_review", label: "HAI-SCRIBE Stage 2 design review and infection control measures", description: "HAI-SCRIBE Stage 2.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_fire_strategy_means_of_escape", label: "Fire strategy and means of escape implications", description: "Firecode.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, HAI-SCRIBE.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.wardrefresh_clinical_stakeholder_design_approval", label: "Clinical and IPC stakeholder review and approval of design", description: "Essential.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer." },
      { key: "del.wardrefresh_finishes_furniture_install", label: "Installation of doors, windows, ironmongery, flooring, wall cladding and associated works" },
      { key: "del.wardrefresh_protection_existing_services", label: "Protection of existing services and clinical areas", description: "HAI-SCRIBE Stage 3." },
      { key: "del.common_infection_control_construction_measures", label: "Dust, water and infection control measures during construction", description: "HAI-SCRIBE Stage 3.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.wardrefresh_temp_clinical_continuity_records", label: "Temporary arrangements and clinical continuity records", description: "Essential." },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.wardrefresh_infection_control_validation", label: "Cleaning, terminal clean and IPC clearance", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.wardrefresh_formal_acceptance", label: "Formal clinical, IPC and client acceptance", description: "Essential.", bypassAuthority: "SRO" },
      { key: "del.wardrefresh_haiscribe_stage4_precheck", label: "HAI-SCRIBE Stage 4 pre-handover check completion", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.wardrefresh_soft_landings_review", label: "Soft landings / post-occupancy review (clinical functionality, cleanability, user feedback)", description: "SHTM 00, HAI-SCRIBE Stage 4." },
      { key: "del.wardrefresh_updated_operational_cleaning_procedures", label: "Updated operational and cleaning procedures", description: "IPC / Soft FM." },
      { key: "del.wardrefresh_ongoing_maintenance_regime", label: "Ongoing maintenance and inspection regime for finishes" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical and infection prevention & control (IPC) input." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.mhu_project_brief", label: "Project Brief (scope: ligature works, finishes, rooms affected)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.mhu_condition_surveys", label: "Existing condition surveys (fabric, doors, windows, ensuites, finishes, known risks)" },
      { key: "del.mhu_ligature_risk_assessment", label: "Ligature risk assessment (Mental Health Unit areas)", description: "HBN 03-01 'Mental Health – Adult Acute Units' (NHS National Services Scotland / Health Facilities Scotland), applied via the NHSScotland Mental Health Built Environment (mHBE) Quality and Safety Policy Letter and Assessment Toolkit.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.mhu_stakeholder_engagement", label: "Early engagement with Clinical, IPC, Mental Health, Estates and Soft FM teams", description: "Essential." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.mhu_concept_design_report", label: "Concept design options (ligature solutions, finishes strategy, phasing, decant requirements)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.mhu_infection_control_strategy", label: "Outline clinical environment strategy (infection control, cleanability, durability)", description: "IPC." },
      { key: "del.mhu_preliminary_finishes_schedule", label: "Preliminary room data sheets / layouts" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.mhu_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.mhu_coordinated_layout_drawings", label: "Coordinated design (doors, windows, ensuite layouts, finishes interfaces with services)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.mhu_critical_user_confirmation", label: "Confirmation of temporary clinical arrangements — high-level strategy only", description: "Clinical stakeholders.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.mhu_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_mep_interface_design", label: "Interface design with ventilation, medical gases, electrical, nurse call, drainage and fire systems", description: "SHTM 03-01 (ventilation), SHTM 02-01 (medical gas), SHTM 06 series (electrical), SHTM 08-03 (nurse call), SHTM 04-01 (drainage/water)." },
      { key: "del.common_infection_control_design_review", label: "HAI-SCRIBE Stage 2 design review and infection control measures", description: "HAI-SCRIBE Stage 2.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_fire_strategy_means_of_escape", label: "Fire strategy and means of escape implications", description: "Firecode.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, HAI-SCRIBE.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.mhu_clinical_stakeholder_design_approval", label: "Clinical, IPC and Mental Health stakeholder review and approval of design", description: "Essential.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.mhu_tool_control_room_security", label: "Contractor tool control and room security procedure", description: "Rooms under works must never be left open or unattended, and every tool and sharp item must be signed in, signed out, and accounted for at all times — a patient and contractor safety control distinct from general site security.", bypassAuthority: "SRO" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer." },
      { key: "del.mhu_finishes_furniture_install", label: "Installation of doors, windows, ironmongery, flooring, wall cladding and associated works" },
      { key: "del.mhu_protection_existing_services", label: "Protection of existing services and clinical areas", description: "HAI-SCRIBE Stage 3." },
      { key: "del.common_infection_control_construction_measures", label: "Dust, water and infection control measures during construction", description: "HAI-SCRIBE Stage 3.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.mhu_temp_clinical_continuity_records", label: "Temporary arrangements and clinical continuity records", description: "Essential." },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.mhu_ligature_safety_verification", label: "Ligature safety verification and clinical sign-off", description: "Life-safety verification for at-risk patients — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.mhu_infection_control_validation", label: "Cleaning, terminal clean and IPC clearance", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.mhu_formal_acceptance", label: "Formal clinical, IPC and client acceptance", description: "Essential.", bypassAuthority: "SRO" },
      { key: "del.mhu_haiscribe_stage4_precheck", label: "HAI-SCRIBE Stage 4 pre-handover check completion", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.mhu_soft_landings_review", label: "Soft landings / post-occupancy review (clinical functionality, ligature safety, cleanability, user feedback)", description: "SHTM 00, HAI-SCRIBE Stage 4." },
      { key: "del.mhu_updated_operational_cleaning_procedures", label: "Updated operational and cleaning procedures", description: "IPC / Soft FM." },
      { key: "del.mhu_ongoing_maintenance_regime", label: "Ongoing maintenance and inspection regime for anti-ligature items and finishes" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
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
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment", description: "Clinical and infection prevention & control (IPC) input." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.theatrerefresh_project_brief", label: "Project Brief (scope: finishes, theatres affected)", description: "SHTM 00, HAI-SCRIBE Stage 1." },
      { key: "del.theatrerefresh_condition_surveys", label: "Existing condition surveys (fabric, doors, finishes, known risks)" },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.theatrerefresh_stakeholder_engagement", label: "Early engagement with Clinical, IPC, Estates and Soft FM teams", description: "Essential." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.theatrerefresh_concept_design_report", label: "Concept design options (finishes strategy, phasing, decant requirements)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.theatrerefresh_infection_control_strategy", label: "Outline clinical environment strategy (infection control, cleanability, durability)", description: "IPC." },
      { key: "del.theatrerefresh_preliminary_finishes_schedule", label: "Preliminary room data sheets / layouts" },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.theatrerefresh_outline_construction_phasing_principles", label: "Outline construction / phasing principles (no method statements)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.theatrerefresh_coordinated_layout_drawings", label: "Coordinated design (doors, layouts, finishes interfaces with services)", description: "HAI-SCRIBE Stage 2." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services", description: "SHTM 00." },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (penetrations and means of escape)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing / temporary works strategy (principles only)" },
      { key: "del.theatrerefresh_critical_user_confirmation", label: "Confirmation of temporary clinical arrangements — high-level strategy only", description: "Clinical stakeholders.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.theatrerefresh_competitive_quoting_preparation", label: "Preparation for competitive quoting" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Contains the
    // Pre-Contract Hold Point — no contractor appointment or Gate 5
    // work until 2+ competitive quotes and written PFI Board/NHS
    // lifecycle cost approval are received.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works", description: "Clear boundaries for what is and isn't included in the appointed contractor's price." },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency", description: "A realistic budget envelope for the PFI Board / NHS lifecycle cost approval — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_mep_interface_design", label: "Interface design with ventilation, medical gases, electrical, nurse call, drainage and fire systems", description: "SHTM 03-01 (ventilation), SHTM 02-01 (medical gas), SHTM 06 series (electrical), SHTM 08-03 (nurse call), SHTM 04-01 (drainage/water)." },
      { key: "del.common_infection_control_design_review", label: "HAI-SCRIBE Stage 2 design review and infection control measures", description: "HAI-SCRIBE Stage 2.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_fire_strategy_means_of_escape", label: "Fire strategy and means of escape implications", description: "Firecode.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, HAI-SCRIBE.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.theatrerefresh_clinical_stakeholder_design_approval", label: "Clinical and IPC stakeholder review and approval of design", description: "Essential.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM (Planned Preventative Maintenance) documentation and current compliance status for the existing plant being replaced. Critical commercial requirement — a condition for the Pre-Contract Hold Point below." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off — no construction or detailed contractor documentation until this approval is received.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details", description: "Post-appointment activity, still recorded under Gate 4 — follows contractor appointment once the Pre-Contract Hold Point above clears." },
    ],
    // Gate 5 — Manufacturing & Construction. Only starts once the Gate
    // 4 Pre-Contract Hold Point is cleared and a contractor is onboarded.
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Critical. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates", description: "Manufacturer." },
      { key: "del.theatrerefresh_finishes_furniture_install", label: "Installation of doors, ironmongery, wall/ceiling cladding and associated works" },
      { key: "del.theatrerefresh_protection_existing_services", label: "Protection of existing services and clinical areas", description: "HAI-SCRIBE Stage 3." },
      { key: "del.common_infection_control_construction_measures", label: "Dust, water and infection control measures during construction", description: "HAI-SCRIBE Stage 3.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.theatrerefresh_temp_clinical_continuity_records", label: "Temporary arrangements and clinical continuity records", description: "Essential." },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant equipment, finishes and fittings" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports" },
      { key: "del.theatrerefresh_ventilation_validation", label: "Ultra-clean ventilation validation (air changes, filtration integrity, laminar flow performance where fitted)", description: "SHTM 03-01, Part B (specialised ventilation) — required wherever finishes/ceiling works disturb the theatre's ventilation canopy or envelope.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.theatrerefresh_infection_control_validation", label: "Cleaning, terminal clean and IPC clearance", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals", description: "SHTM 00." },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.theatrerefresh_formal_acceptance", label: "Formal clinical, IPC and client acceptance", description: "Essential.", bypassAuthority: "SRO" },
      { key: "del.theatrerefresh_haiscribe_stage4_precheck", label: "HAI-SCRIBE Stage 4 pre-handover check completion", description: "HAI-SCRIBE Stage 4.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 7 — Use
    [
      { key: "del.theatrerefresh_soft_landings_review", label: "Soft landings / post-occupancy review (clinical functionality, cleanability, user feedback)", description: "SHTM 00, HAI-SCRIBE Stage 4." },
      { key: "del.theatrerefresh_updated_operational_cleaning_procedures", label: "Updated operational and cleaning procedures", description: "IPC / Soft FM." },
      { key: "del.theatrerefresh_ongoing_maintenance_regime", label: "Ongoing maintenance and inspection regime for finishes" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report", description: "SHTM 00." },
    ],
  ]);

  // ── Templates 22-24: Automatic Doors, Fume Cupboards, Fire Curtains —
  // three real gaps found the same session as the PVG/DSEAR/RPA
  // compliance rules above: no live template existed for any of these
  // three, matching the same gap found and fixed in the Document_Outlines
  // docx reference checklists (Automatic Doors.docx, Fume Cupboards.docx,
  // Fire Curtains.docx — read in full for their real content, not
  // guessed). PVG/DSEAR/RPA are deliberately NOT duplicated into any of
  // these three as DeliverableTemplate rows — the three ComplianceRuleTemplate
  // rules above already cover every template automatically (PVG via its
  // empty appliesIfTags; DSEAR/RPA whenever a project against one of
  // these templates gets tagged accordingly at provisioning time).
  const autoDoorsTemplate = await db.template.create({
    data: {
      key: "template.health.automatic_doors_replacement",
      name: "Automatic Doors Replacement",
      description:
        "Replacement, major upgrade or installation of automatic (power-operated) doors in hospital premises — sliding, swing, revolving and folding doorsets, including fire/smoke-resisting variants. Doors on isolation-room or theatre lobbies are part of pressure-cascade control, not just access control — a design/commissioning check distinct from general HAI-SCRIBE review.",
      matchKeywords: ["automatic door", "power-operated door", "sliding door", "revolving door", "folding door", "fire door", "smoke door", "doorset"],
      sectorVariantId: health.id,
    },
  });
  const autoDoorsStageTemplates = await createStageAndGateTemplates(autoDoorsTemplate.id);
  await createDeliverableTemplates(autoDoorsStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.autodoors_business_case", label: "Business case / need identification (door condition, safety, access control need)", description: "SHTM 00." },
      { key: "del.autodoors_strategic_brief", label: "Strategic brief & outcomes (safe operation, accessibility, escape-route compliance)" },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.autodoors_project_brief", label: "Project Brief (scope of doorsets, fire/smoke rating, accessibility requirements)" },
      { key: "del.autodoors_condition_surveys", label: "Existing condition surveys (mechanism, safety sensors, fire/smoke seal condition)" },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.autodoors_imaging_adjacency_check", label: "Confirmation of whether any affected door adjoins an ionising-radiation imaging suite (CT/X-ray/fluoroscopy/nuclear medicine)", description: "Flags the door for the Radiation Protection Adviser (RPA) shielding-integrity compliance rule — a separate gate from HAI-SCRIBE, not covered by it." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.autodoors_concept_design_report", label: "Concept design options (door type, operation mode, fail-safe strategy)", description: "BS EN 16005." },
      { key: "del.autodoors_pressure_cascade_role", label: "Confirmation of whether the door forms part of a pressure-cascade boundary (isolation room / theatre lobby)", description: "SHTM 03-01 / HAI-SCRIBE — a pressure-cascade door needs its sealing/fail-safe function specified alongside its access-control function." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.autodoors_coordinated_layout_drawings", label: "Coordinated design (door positions, swing/slide clearances, escape-route width)", description: "Building (Scotland) Regulations 2004 (means of escape)." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (fire/smoke-rated doorsets)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing strategy (principles only)" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.autodoors_detailed_specification", section: "Technical Design Package", label: "Detailed specification (door type, actuator, safety sensors, fail-safe/break-out operation)", description: "BS EN 16005." },
      { key: "del.autodoors_fire_smoke_doorset_spec", section: "Technical Design Package", label: "Fire/smoke-resisting doorset specification (where applicable)", description: "BS EN 16034." },
      { key: "del.autodoors_accessibility_compliance", section: "Technical Design Package", label: "Accessibility compliance confirmation (clear opening width, activation controls, timing)", description: "Equality Act 2010." },
      { key: "del.autodoors_rpa_shielding_check", section: "Technical Design Package", label: "Radiation Protection Adviser (RPA) sign-off confirming shielding integrity unaffected (where the door adjoins an imaging suite)", description: "IRR17 — see the imaging-adjacency check flagged at Gate 1. A separate gate from HAI-SCRIBE, not covered by it." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates" },
      { key: "del.autodoors_install_commissioning", label: "Installation, safety sensor commissioning and fail-safe/break-out testing" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant doorsets" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.common_full_commissioning_records", label: "Full Commissioning and Validation Reports (force testing, safety sensor function, fire/smoke seal integrity)", description: "BS EN 16005 / BS EN 16034." },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and schedules" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
    ],
    // Gate 7 — Use
    [
      { key: "del.autodoors_soft_landings_review", label: "Soft landings / post-occupancy review (reliability, user feedback)" },
      { key: "del.autodoors_ongoing_maintenance_regime", label: "Ongoing maintenance and periodic safety-function testing regime" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const fumeCupboardsTemplate = await db.template.create({
    data: {
      key: "template.health.fume_cupboards_replacement",
      name: "Fume Cupboards Replacement",
      description:
        "Installation, replacement or major upgrade of fume cupboards in hospital premises — laboratory, pathology and pharmacy fume cupboards, ducted and recirculating units, and associated Local Exhaust Ventilation (LEV). Face-velocity containment (0.4 m/s ±20%) and the COSHH-mandated 14-month LEV thorough-examination-and-test cycle are distinct statutory requirements, not covered by general commissioning.",
      matchKeywords: ["fume cupboard", "fume hood", "LEV", "local exhaust ventilation", "laboratory ventilation", "pathology fume extract", "pharmacy fume extract"],
      sectorVariantId: health.id,
    },
  });
  const fumeCupboardsStageTemplates = await createStageAndGateTemplates(fumeCupboardsTemplate.id);
  await createDeliverableTemplates(fumeCupboardsStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.fumecupboard_business_case", label: "Business case / need identification (cupboard condition, face-velocity performance, LEV test history, capacity)", description: "COSHH Regulation 9." },
      { key: "del.fumecupboard_strategic_brief", label: "Strategic brief & outcomes (containment performance, LEV compliance, capacity)" },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.fumecupboard_project_brief", label: "Project Brief (scope of cupboards, ducted vs recirculating, capacity, substance/process inventory)", description: "COSHH." },
      { key: "del.fumecupboard_substance_process_confirmation", label: "Confirmation of which substances/processes the cupboard(s) serve (COSHH/DSEAR relevance)", description: "COSHH, DSEAR — flags the project for the DSEAR risk assessment compliance rule where flammable solvents are handled." },
      { key: "del.fumecupboard_condition_lev_history", label: "Existing condition surveys including face-velocity and LEV thorough examination/test history", description: "BS EN 14175, COSHH Regulation 9." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register (loss of containment, service continuity, DSEAR/flammable-substance risk)", description: "COSHH, DSEAR, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.fumecupboard_concept_design_report", label: "Concept design options (ducted vs recirculating, constant-air-volume vs variable-air-volume control)", description: "BS EN 14175." },
      { key: "del.fumecupboard_type_confirmation", label: "Confirmation of ducted versus recirculating type for each unit", description: "BS EN 14175." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, COSHH." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.fumecupboard_coordinated_layout_drawings", label: "Coordinated design (cupboard positions, extract ductwork routes, plant space)", description: "SHTM 03-01 where linked." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment (ductwork penetrations)", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing strategy (principles only)" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.fumecupboard_detailed_specification", section: "Technical Design Package", label: "Detailed specifications (cupboard, extract fan, controls, VAV system if applicable)", description: "BS EN 14175." },
      { key: "del.fumecupboard_face_velocity_design", section: "Technical Design Package", label: "Face-velocity and containment design confirmation (0.4 m/s ±20%)", description: "BS EN 14175." },
      { key: "del.fumecupboard_extract_ductwork_design", section: "Technical Design Package", label: "Extract ductwork schematics and electrical/controls design", description: "SHTM 06 series." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015, COSHH.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates" },
      { key: "del.fumecupboard_install", label: "Installation of cupboard(s), extract ductwork, controls and VAV system if applicable" },
      { key: "del.fumecupboard_commissioning_face_velocity_test", label: "Commissioning face-velocity and containment testing", description: "BS EN 14175 — critical containment verification, cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.fumecupboard_first_lev_test", label: "First LEV thorough examination and test (COSHH Regulation 9)", description: "HSG258 — a distinct statutory step from general commissioning.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant cupboards" },
    ],
    // Gate 6 — Handover
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
    // Gate 7 — Use
    [
      { key: "del.fumecupboard_soft_landings_review", label: "Soft landings / post-occupancy review (containment performance, user feedback)" },
      { key: "del.fumecupboard_ongoing_lev_regime", label: "Ongoing LEV thorough examination and test regime in operation (at least every 14 months)", description: "COSHH Regulation 9, HSG258." },
      { key: "del.fumecupboard_periodic_face_velocity_checks", label: "Periodic face-velocity spot-checks", description: "BS EN 14175." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const fireCurtainsTemplate = await db.template.create({
    data: {
      key: "template.health.fire_curtains_replacement",
      name: "Fire Curtains Replacement",
      description:
        "Installation, replacement or major upgrade of active fire curtain barrier assemblies in hospital premises — smoke/fire curtains at compartment lines, atria, and where used as an alternative to fixed fire-rated construction. BS 8524's own third-party certification scheme lapsed in June 2023 — confirm current certification status rather than assuming it's settled; the underlying maintenance/testing expectations in BS 8524-2 remain real and citable regardless.",
      matchKeywords: ["fire curtain", "smoke curtain", "active fire barrier", "compartment curtain", "atrium smoke curtain"],
      sectorVariantId: health.id,
    },
  });
  const fireCurtainsStageTemplates = await createStageAndGateTemplates(fireCurtainsTemplate.id);
  await createDeliverableTemplates(fireCurtainsStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.firecurtain_business_case", label: "Business case / need identification (curtain condition, compartmentation risk)", description: "SHTM 80." },
      { key: "del.firecurtain_strategic_brief", label: "Strategic brief & outcomes (compartmentation integrity, smoke control performance)" },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level clinical / operational impact assessment" },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.firecurtain_project_brief", label: "Project Brief (scope of curtains, compartment lines/atria affected, smoke-control interface)" },
      { key: "del.firecurtain_condition_surveys", label: "Existing condition surveys and current certification status confirmation", description: "BS 8524-1 — confirm whether third-party certification for the existing/proposed product is current, given the scheme's June 2023 lapse; don't assume settled." },
      { key: "del.common_expanded_risk_register", label: "Expanded Risk Register", description: "SHTM 00, CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.firecurtain_concept_design_report", label: "Concept design options (curtain type, smoke-control system interface, fail-safe/gravity-fail strategy)", description: "BS 8524-1." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.firecurtain_coordinated_layout_drawings", label: "Coordinated design (curtain positions, headbox locations, structural fixings)" },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and other building services" },
      { key: "del.common_fire_compartmentation_assessment", label: "Fire compartmentation impact assessment", description: "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register & high-level phasing strategy (principles only)" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.firecurtain_detailed_specification", section: "Technical Design Package", label: "Detailed specification (curtain fabric rating, backup power for retract, smoke-resistance, gravity-failsafe)", description: "BS 8524-1." },
      { key: "del.firecurtain_smoke_control_interface", section: "Technical Design Package", label: "Smoke control system interface design (where the curtain forms part of a wider smoke control system)", description: "SHTM 03-01, SHTM 82 — requires quarterly testing once operational, per BS 8524." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.firecurtain_fsa_design_approval", label: "Fire Safety Advisor / stakeholder review and approval of design", description: "Only the site NHS Fire Officer can approve or reject fire-related design compliance, not the SRO or Compliance Officer.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Contractor's detailed Method Statements and full RAMS", description: "Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared." },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates" },
      { key: "del.firecurtain_install", label: "Installation of curtain(s), headbox, guides and controls" },
      { key: "del.firecurtain_smoke_control_integration_testing", label: "Integration testing with the wider smoke control system (where applicable)", description: "SHTM 03-01/82 — critical for compartmentation reliance, cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & strip-out records of redundant curtains" },
    ],
    // Gate 6 — Handover
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
    // Gate 7 — Use
    [
      { key: "del.firecurtain_soft_landings_review", label: "Soft landings / post-occupancy review (reliability, user feedback)" },
      { key: "del.firecurtain_ongoing_testing_regime", label: "Ongoing quarterly test regime in operation where linked to a smoke control system, otherwise per BS 8524-2's maintenance schedule", description: "BS 8524-2." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const cateringTemplate = await db.template.create({
    data: {
      key: "template.health.catering_kitchen_equipment_replacement",
      name: "Catering / Kitchen Equipment Replacement",
      description:
        "Replacement or major upgrade of hospital catering/kitchen plant — cooking appliances (ovens, fryers, griddles, combi-ovens), warewashers, refrigeration/cold storage, and kitchen extract ductwork, in an operational healthcare environment. Not the foul/grease drainage or trade effluent consent process — see Drainage & Foul Water System Replacement for that. Not the cooking-line fire-suppression system's own design standard — see Fire Suppression Systems Replacement for that, though this checklist covers the extract-fan/gas-interlock interface.",
      matchKeywords: ["catering equipment", "kitchen equipment", "commercial kitchen", "combi-oven", "warewasher", "kitchen extract", "grease duct", "cold room", "walk-in fridge", "catering refrigeration"],
      sectorVariantId: health.id,
    },
  });
  const cateringStageTemplates = await createStageAndGateTemplates(cateringTemplate.id);
  await createDeliverableTemplates(cateringStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.catering_business_case", label: "Business case / need identification (appliance age, reliability, capacity, extract system condition)" },
      { key: "del.catering_strategic_brief", label: "Strategic brief & project outcomes (food-service continuity, catering operational impact)" },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level operational impact assessment (affected kitchen areas, food-service continuity, Food Standards Scotland interface)", description: "Food Hygiene (Scotland) Regulations." },
      { key: "del.catering_gas_electric_split_confirmation", label: "Confirmation of which appliances are gas-fired versus electric", description: "Gas Safety (Installation and Use) Regulations 1998." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.catering_project_brief", label: "Project Brief (appliance schedule, gas/electric split, extract and refrigeration scope)" },
      { key: "del.catering_condition_surveys", label: "Existing condition surveys (appliances, extract canopies/ductwork, refrigeration plant)", description: "BESA DW/172." },
      { key: "del.catering_ductwork_cleaning_record_review", label: "Extract ductwork condition and last cleaning record review", description: "BESA TR19." },
      { key: "del.common_expanded_risk_register", label: "Initial risk register (food-service continuity, extract fire risk, gas safety)", description: "CDM 2015." },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
      { key: "del.catering_stakeholder_engagement", label: "Engagement with Catering/Facilities, Estates, Environmental Health / Food Standards Scotland and Fire Safety Advisor" },
      { key: "del.catering_trade_effluent_baseline", label: "Confirmation of existing trade effluent consent baseline", description: "See Drainage & Foul Water System Replacement checklist." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.catering_concept_design_report", label: "Concept design options (appliance types, extract system routing, refrigeration layout)", description: "BESA DW/172." },
      { key: "del.catering_temp_catering_strategy", label: "Outline temporary catering strategy to maintain food service during works" },
      { key: "del.catering_fire_suppression_concept", label: "Outline fire-suppression strategy for the cooking line (wet-chemical/Ansul-type extinguishing system with extract-fan and gas-supply interlock)", description: "BS EN 12845 — see Fire Suppression Systems Replacement checklist." },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015." },
      { key: "del.common_outline_specs_cost_plan", label: "Outline specifications & preliminary cost plan" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.catering_coordinated_layout_drawings", label: "Coordinated design (extract ductwork routing and fire compartmentation per DW/172, refrigeration plant room location, gas pipework routing)", description: "BESA DW/172." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure, fire compartmentation and adjacent clinical/public areas" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan, risk register and temporary catering continuity phasing" },
      { key: "del.catering_trade_effluent_interface", label: "Confirmation of trade effluent/grease-management interface with the drainage works (if concurrent)", description: "See Drainage & Foul Water System Replacement checklist." },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.catering_full_technical_design", section: "Technical Design Package", label: "Full technical design drawings, appliance schedules and extract ductwork design", description: "BESA DW/172." },
      { key: "del.catering_gas_safety_design", section: "Technical Design Package", label: "Gas safety design — pipework, ventilation and appliance installation compliant with statutory requirements", description: "Gas Safety (Installation and Use) Regulations 1998." },
      { key: "del.catering_fire_suppression_interlock_design", section: "Technical Design Package", label: "Fire-suppression system design for the cooking line, with extract-fan and gas-supply shutdown interlock on activation", description: "BS EN 12845 — see Fire Suppression Systems Replacement checklist." },
      { key: "del.catering_refrigeration_fgas_design", section: "Technical Design Package", label: "Refrigeration design (F-Gas compliant refrigerant selection, leak-detection provision)", description: "F-Gas Regulations." },
      { key: "del.catering_water_backflow_design", section: "Technical Design Package", label: "Water and backflow-prevention design for warewashers, ice machines and combi-ovens", description: "Water Supply (Water Fittings) (Scotland) Byelaws 2014 / WRAS." },
      { key: "del.catering_electrical_controls_design", section: "Technical Design Package", label: "Electrical and control system design (extract fan interlocks, BMS integration)", description: "SHTM 06 series." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.catering_stakeholder_design_approval", label: "Stakeholder review and approval of design (Estates, Catering/Facilities, Fire Safety Advisor, Environmental Health)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements and full RAMS, including temporary catering continuity arrangements", description: "Critical for food-service continuity — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates (appliances, fire-rated ductwork, fire-suppression components)", description: "BESA DW/172." },
      { key: "del.catering_install", label: "Installation of appliances, extract ductwork, refrigeration plant and controls" },
      { key: "del.catering_gas_safety_installation_testing", label: "Gas safety installation testing (Gas Safe registered engineer)", description: "Gas Safety (Installation and Use) Regulations 1998 — distinct statutory step from general commissioning.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.catering_fire_suppression_interlock_testing", label: "Fire-suppression and extract/gas-interlock installation testing", description: "BS EN 12845 — critical for cooking-line fire safety, cannot be bypassed at PM level.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.catering_ipc_environmental_health_signoff", label: "Environmental Health / IPC sign-off for any works affecting food-preparation areas" },
      { key: "del.common_decommissioning_records", label: "Decommissioning & disposal records of redundant appliances" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.catering_full_commissioning_records", label: "Full commissioning records — gas safety certification, appliance performance, extract airflow verification", description: "Gas Safety (Installation and Use) Regulations 1998." },
      { key: "del.catering_fire_suppression_commissioning", label: "Fire-suppression system commissioning, including extract-fan/gas-shutoff interlock test on activation", description: "BS EN 12845.", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.catering_fgas_commissioning_verification", label: "F-Gas commissioning and leak-detection verification records", description: "F-Gas Regulations.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.catering_water_backflow_commissioning", label: "Water/backflow-prevention commissioning records", description: "Water Supply (Water Fittings) (Scotland) Byelaws 2014 / WRAS." },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings, appliance schedules and control system configuration records" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for catering and estates staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.catering_formal_stakeholder_acceptance", label: "Formal client / stakeholder acceptance", bypassAuthority: "SRO" },
      { key: "del.catering_ongoing_ductcleaning_gassafety_confirmation", label: "Confirmation of ongoing DW/172 extract-duct cleaning regime (per TR19) and annual gas-safety inspection", description: "BESA TR19." },
    ],
    // Gate 7 — Use
    [
      { key: "del.catering_soft_landings_review", label: "Soft landings / post-occupancy review (reliability, food-service continuity, user feedback)" },
      { key: "del.catering_ongoing_ductcleaning_regime", label: "Ongoing extract-duct cleaning regime in operation, aligned to fire risk assessment", description: "BESA TR19." },
      { key: "del.catering_ongoing_gas_safety_regime", label: "Ongoing annual gas-safety inspection regime", description: "Gas Safety (Installation and Use) Regulations 1998." },
      { key: "del.catering_ongoing_fgas_regime", label: "Ongoing F-Gas refrigerant leak-check regime", description: "F-Gas Regulations." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const laundryTemplate = await db.template.create({
    data: {
      key: "template.health.laundry_linen_services_replacement",
      name: "Laundry / Linen Services Replacement",
      description:
        "Replacement or major upgrade of industrial laundry/linen-processing plant — washer-extractors, tumble dryers, flatwork ironers/calendars, and dirty-to-clean flow infrastructure, in an operational healthcare environment. Not general infection control policy — this checklist covers the engineering deliverables that support thermal-disinfection compliance and dirty-to-clean flow separation, cross-referencing HAI-SCRIBE where IPC sign-off is required.",
      matchKeywords: ["laundry", "linen services", "washer-extractor", "tumble dryer", "flatwork ironer", "calender", "thermal disinfection", "dirty-to-clean"],
      sectorVariantId: health.id,
    },
  });
  const laundryStageTemplates = await createStageAndGateTemplates(laundryTemplate.id);
  await createDeliverableTemplates(laundryStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.laundry_business_case", label: "Business case / need identification (plant age, reliability, capacity, thermal-disinfection compliance)" },
      { key: "del.laundry_strategic_brief", label: "Strategic brief & project outcomes (linen-supply continuity, infection control)" },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level infection control impact assessment", description: "HTM 01-04." },
      { key: "del.laundry_steam_electric_split_confirmation", label: "Confirmation of steam-heated versus electric equipment (pressure systems scope trigger)", description: "Pressure Systems Safety Regulations 2000." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.laundry_project_brief", label: "Project Brief (washer-extractor/dryer/ironer schedule, thermal-disinfection capacity)" },
      { key: "del.laundry_condition_surveys", label: "Existing condition surveys, including current Written Scheme of Examination status for pressure equipment", description: "Pressure Systems Safety Regulations 2000." },
      { key: "del.common_expanded_risk_register", label: "Initial risk register (linen-supply continuity, fire risk, thermal-disinfection failure = infection risk)", description: "CDM 2015." },
      { key: "del.laundry_stakeholder_engagement", label: "Engagement with IPC, Linen Services, Estates and Fire Safety Advisor" },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.laundry_concept_design_report", label: "Concept design options (washer-extractor barrier-wash technology, dirty-to-clean one-way flow separation)", description: "HTM 01-04." },
      { key: "del.laundry_thermal_disinfection_validation_strategy", label: "Outline thermal-disinfection validation strategy", description: "HTM 01-04." },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "Pressure Systems Safety Regulations 2000, CDM 2015." },
      { key: "del.common_outline_specs_cost_plan", label: "Preliminary specifications & cost plan" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.laundry_coordinated_layout_drawings", label: "Coordinated design (barrier/flow separation layout, steam/pressure pipework routing, dryer duct routing)", description: "HTM 01-04." },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with structure and adjacent clean/dirty zones" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan and risk register" },
      { key: "del.laundry_temp_continuity_strategy", label: "Temporary linen-supply continuity strategy during works", description: "Critical for clinical service." },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.laundry_thermal_disinfection_design", section: "Technical Design Package", label: "Full technical design — thermal-disinfection cycle validation design", description: "HTM 01-04." },
      { key: "del.laundry_pressure_system_design", section: "Technical Design Package", label: "Pressure system design and Written Scheme of Examination provisions", description: "Pressure Systems Safety Regulations 2000." },
      { key: "del.laundry_dryer_duct_fire_safety_design", section: "Technical Design Package", label: "Dryer duct and lint-trap fire-safety design" },
      { key: "del.laundry_electrical_steam_services_design", section: "Technical Design Package", label: "Electrical and steam services design" },
      { key: "del.laundry_ipc_flow_separation_design", section: "Technical Design Package", label: "IPC design confirmation of dirty-to-clean flow separation", description: "HAI-SCRIBE." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.laundry_stakeholder_design_approval", label: "Stakeholder review and approval of design (Estates, Linen Services, IPC, Fire Safety Advisor)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements, phasing & temporary linen-supply continuity arrangements", description: "Critical for clinical service — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates, including pressure vessel certificates", description: "Pressure Systems Safety Regulations 2000." },
      { key: "del.laundry_install", label: "Installation of washer-extractors, dryers, ironers/calendars and controls" },
      { key: "del.laundry_written_scheme_established", label: "Written Scheme of Examination established prior to first use of pressure equipment", description: "Pressure Systems Safety Regulations 2000 — cannot be bypassed at PM level.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.laundry_ipc_flow_signoff", label: "IPC sign-off for the dirty-to-clean flow arrangement", description: "HAI-SCRIBE." },
      { key: "del.common_decommissioning_records", label: "Decommissioning & disposal records of redundant plant" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.laundry_full_commissioning_validation_records", label: "Full commissioning & thermal-disinfection validation testing records (temperature/time proof)", description: "HTM 01-04." },
      { key: "del.laundry_pressure_system_first_examination", label: "Pressure system Written Scheme of Examination in place and first periodic examination completed", description: "Pressure Systems Safety Regulations 2000 — cannot be bypassed at PM level.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.laundry_flow_verification", label: "Dirty-to-clean flow verification", description: "HAI-SCRIBE." },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and control system configuration records" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.common_training_records", label: "Training & demonstration records for Linen Services staff" },
      { key: "del.common_residual_risk_register", label: "Residual risk register", description: "CDM 2015." },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.laundry_ongoing_revalidation_confirmation", label: "Confirmation of ongoing periodic thermal-disinfection re-validation regime", description: "HTM 01-04." },
    ],
    // Gate 7 — Use
    [
      { key: "del.laundry_soft_landings_review", label: "Soft landings / post-occupancy review (reliability, linen-supply continuity, user feedback)" },
      { key: "del.laundry_ongoing_thermal_disinfection_regime", label: "Ongoing thermal-disinfection validation regime in operation (periodic re-test)", description: "HTM 01-04." },
      { key: "del.laundry_ongoing_pressure_examination_regime", label: "Ongoing periodic examination regime for pressure equipment under the Written Scheme", description: "Pressure Systems Safety Regulations 2000.", bypassAuthority: "COMPETENT_PERSON" },
      { key: "del.laundry_ongoing_lint_fire_safety_regime", label: "Ongoing lint-trap and dryer-duct fire-safety cleaning regime" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const wasteTemplate = await db.template.create({
    data: {
      key: "template.health.waste_management_systems_replacement",
      name: "Waste Management Systems Replacement",
      description:
        "Replacement or major upgrade of healthcare waste handling plant — segregation stores, macerators, compactors and waste chutes, in an operational healthcare environment. Not the foul-drainage pipework itself — see Drainage & Foul Water System Replacement or Above-ground Drainage & Public Health Systems Replacement for that. This checklist covers the waste-handling equipment and segregation infrastructure, not the drainage it may discharge into.",
      matchKeywords: ["waste management", "clinical waste", "macerator", "compactor", "waste segregation", "waste chute", "healthcare waste", "SEPA waste carrier"],
      sectorVariantId: health.id,
    },
  });
  const wasteStageTemplates = await createStageAndGateTemplates(wasteTemplate.id);
  await createDeliverableTemplates(wasteStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.waste_business_case", label: "Business case / need identification (waste-store/macerator/compactor condition, capacity, segregation compliance)", description: "SHTN 03-01." },
      { key: "del.waste_strategic_brief", label: "Strategic brief & project outcomes (regulatory compliance driver, sustainability/circular-economy alignment)", description: "HTM 07-01 (2023)." },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level operational impact assessment (waste-collection continuity across the site during works)" },
      { key: "del.waste_stream_confirmation", label: "Confirmation of waste streams affected (clinical, offensive, domestic, recyclable segregation categories)", description: "SHTN 03-01." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.waste_project_brief", label: "Project Brief (scope of segregation stores, macerators, compactors, chutes)" },
      { key: "del.waste_condition_surveys_sepa_status", label: "Existing condition surveys and current SEPA waste carrier licence status", description: "SEPA." },
      { key: "del.common_expanded_risk_register", label: "Initial risk register (waste-accumulation risk, biohazard exposure, fire risk in waste stores)", description: "CDM 2015." },
      { key: "del.waste_stakeholder_engagement", label: "Engagement with Estates, IPC, Sustainability/Environmental lead" },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.waste_concept_design_report", label: "Concept design options (segregation-store layout and colour-coding, macerator versus compactor technology)", description: "SHTN 03-01." },
      { key: "del.waste_temp_handling_strategy", label: "Outline temporary waste-handling continuity strategy", description: "Critical for clinical service." },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "COSHH, CDM 2015." },
      { key: "del.common_outline_specs_cost_plan", label: "Preliminary specifications & cost plan" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.waste_coordinated_layout_drawings", label: "Coordinated design (waste-store locations/access routes, chute routing, compactor/macerator plant room)" },
      { key: "del.common_mep_structural_coordination", label: "Spatial coordination with fire compartmentation and vehicle access for collection" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan and risk register" },
      { key: "del.waste_temp_handling_finalised", label: "Temporary waste-handling continuity arrangements finalised" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.waste_segregation_design", section: "Technical Design Package", label: "Full technical design — segregation-store specification and colour-coding per SHTN 03-01", description: "SHTN 03-01." },
      { key: "del.waste_macerator_compactor_design", section: "Technical Design Package", label: "Macerator/compactor specification and biohazard containment design", description: "PUWER 1998." },
      { key: "del.waste_fire_risk_design", section: "Technical Design Package", label: "Fire risk design for waste storage areas (fire loading, compartmentation, sprinkler/detection interface)" },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.waste_stakeholder_design_approval", label: "Stakeholder review and approval of design (Estates, IPC, Sustainability lead, Fire Safety Advisor)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements, phasing & temporary waste-handling continuity arrangements", description: "Critical for clinical service — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates" },
      { key: "del.waste_install", label: "Installation of segregation stores, macerators, compactors and chutes" },
      { key: "del.waste_interlock_commissioning", label: "Commissioning of macerator/compactor safety interlocks", description: "PUWER 1998 — cannot be bypassed at PM level.", bypassAuthority: "SRO" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.waste_ipc_signoff", label: "IPC sign-off for any works in clinical-waste-adjacent areas", description: "HAI-SCRIBE." },
      { key: "del.common_decommissioning_records", label: "Decommissioning & disposal records of redundant equipment" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.waste_full_commissioning_records", label: "Full commissioning records — macerator/compactor safety interlock testing", description: "PUWER 1998.", bypassAuthority: "SRO" },
      { key: "del.waste_segregation_verification", label: "Segregation-store signage and colour-coding verification against SHTN 03-01", description: "SHTN 03-01." },
      { key: "del.waste_sepa_licence_confirmation", label: "Updated SEPA waste carrier licence and consignment-note arrangements confirmed", description: "SEPA.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and control system configuration records" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.waste_training_records", label: "Training & demonstration records for Estates and ward/clinical staff (segregation training coordinated with IPC)" },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.waste_ongoing_audit_confirmation", label: "Confirmation of ongoing periodic segregation-compliance audit regime", description: "SHTN 03-01." },
    ],
    // Gate 7 — Use
    [
      { key: "del.waste_soft_landings_review", label: "Soft landings / post-occupancy review (reliability, waste-collection continuity, user feedback)" },
      { key: "del.waste_ongoing_audit_regime", label: "Ongoing waste-segregation audit regime in operation", description: "SHTN 03-01." },
      { key: "del.waste_ongoing_puwer_regime", label: "Ongoing macerator/compactor PUWER inspection and maintenance regime", description: "PUWER 1998." },
      { key: "del.waste_sepa_licence_renewal_tracking", label: "SEPA waste carrier licence renewal tracking", description: "SEPA.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const mortuaryTemplate = await db.template.create({
    data: {
      key: "template.health.mortuary_services_replacement",
      name: "Mortuary Services Replacement",
      description:
        "Replacement or major upgrade of mortuary facilities — body-storage refrigeration plant, post-mortem (PM) room ventilation, and associated temperature-monitoring/alarm systems, in an operational healthcare environment. Covers the engineering/estates deliverables only, not clinical or legal process — the Human Tissue (Scotland) Act 2006 governs that separately. Not general ventilation elsewhere in the hospital — see Ventilation & Air Handling Systems Replacement for that; this checklist covers the PM Room's specific negative-pressure requirement.",
      matchKeywords: ["mortuary", "post-mortem room", "PM room", "body storage refrigeration", "mortuary ventilation", "bereavement services"],
      sectorVariantId: health.id,
    },
  });
  const mortuaryStageTemplates = await createStageAndGateTemplates(mortuaryTemplate.id);
  await createDeliverableTemplates(mortuaryStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.mortuary_business_case", label: "Business case / need identification (mortuary/refrigeration condition, reliability, capacity)", description: "SHPN 16-01." },
      { key: "del.mortuary_strategic_brief", label: "Strategic brief & project outcomes (dignity of service, operational continuity)" },
      { key: "del.common_clinical_operational_impact_assessment", label: "High-level infection control impact assessment", description: "HAI-SCRIBE." },
      { key: "del.mortuary_scope_confirmation", label: "Confirmation of scope — body store, PM suite, viewing, teaching/research areas per SHPN 16-01's modular functional elements", description: "SHPN 16-01." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.mortuary_project_brief", label: "Project Brief (scope per SHPN 16-01 functional modules)", description: "SHPN 16-01." },
      { key: "del.mortuary_condition_surveys", label: "Existing condition surveys (refrigeration plant, ventilation, PM suite fittings)" },
      { key: "del.common_expanded_risk_register", label: "Initial risk register (body-storage continuity, infection control, refrigeration failure)", description: "CDM 2015." },
      { key: "del.mortuary_stakeholder_engagement", label: "Engagement with Estates, IPC, Pathology/Bereavement Services and Fire Safety Advisor" },
      { key: "del.common_project_execution_plan", label: "Project Execution Plan & procurement strategy" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.mortuary_concept_design_report", label: "Concept design options (refrigeration capacity and resilience/redundancy strategy)", description: "SHPN 16-01." },
      { key: "del.mortuary_ventilation_strategy", label: "Outline ventilation strategy for the PM Room, targeting negative pressure per SHPN 16-01", description: "SHPN 16-01, SHTM 03-01." },
      { key: "del.common_concept_risk_assessment", label: "Design risk assessment", description: "CDM 2015, HAI-SCRIBE." },
      { key: "del.common_outline_specs_cost_plan", label: "Preliminary specifications & cost plan" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.mortuary_coordinated_layout_drawings", label: "Coordinated design (refrigeration plant room location, PM Room ventilation ductwork routing and pressure-cascade coordination)", description: "SHTM 03-01." },
      { key: "del.mortuary_dignity_privacy_coordination", label: "Spatial coordination with structure and adjacent clinical/public areas, including dignity and privacy considerations" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated cost plan and risk register" },
      { key: "del.mortuary_temp_continuity_strategy", label: "Temporary body-storage continuity strategy during works", description: "Critical — zero tolerance for loss of refrigeration." },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.mortuary_refrigeration_design", section: "Technical Design Package", label: "Full technical design — refrigeration system design, F-Gas compliant refrigerant, resilience/redundancy", description: "F-Gas Regulations." },
      { key: "del.mortuary_negative_pressure_design", section: "Technical Design Package", label: "PM Room ventilation design confirming negative pressure of -5 Pa to -15 Pa and 100% fresh air", description: "SHPN 16-01 section 6.72." },
      { key: "del.mortuary_temp_monitoring_alarm_design", section: "Technical Design Package", label: "Temperature-monitoring and alarm system design, with critical alarm routed to the BMS" },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.mortuary_stakeholder_design_approval", label: "Stakeholder review and approval of design (Estates, IPC, Pathology/Bereavement Services, Fire Safety Advisor)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements_compliance_gated", label: "Contractor's detailed Method Statements, phasing & temporary body-storage continuity arrangements", description: "Critical — zero tolerance for loss of refrigeration — cannot be bypassed at PM level. Only produced after contractor appointment, once the Gate 4 Pre-Contract Hold Point has cleared.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_material_equipment_certificates", label: "Material & equipment certificates (refrigeration plant, ventilation)" },
      { key: "del.mortuary_install", label: "Installation of refrigeration plant, ventilation ductwork and controls" },
      { key: "del.mortuary_alarm_interlock_commissioning", label: "Commissioning of temperature-monitoring and alarm interlocks" },
      { key: "del.common_progress_records_quality_log", label: "Progress records, quality inspections, change control log" },
      { key: "del.mortuary_ipc_signoff", label: "IPC sign-off", description: "HAI-SCRIBE." },
      { key: "del.common_decommissioning_records", label: "Decommissioning & disposal records of redundant plant" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.mortuary_full_commissioning_records", label: "Full commissioning & validation records — refrigeration temperature performance" },
      { key: "del.mortuary_negative_pressure_verification", label: "PM Room negative-pressure verification against the -5 Pa to -15 Pa range", description: "SHPN 16-01 section 6.72 — cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.mortuary_temp_monitoring_testing", label: "Temperature-monitoring and alarm system testing, including BMS integration" },
      { key: "del.common_as_fitted_drawings", label: "As-fitted drawings and control system configuration records" },
      { key: "del.common_om_manuals", label: "Comprehensive O&M manuals" },
      { key: "del.common_updated_hs_file", label: "Updated Health & Safety File", description: "CDM 2015." },
      { key: "del.mortuary_training_records", label: "Training & demonstration records for Estates and Pathology/Bereavement Services staff" },
      { key: "del.common_practical_completion_certificate", label: "Practical Completion / handover certificate", bypassAuthority: "SRO" },
      { key: "del.mortuary_ongoing_verification_confirmation", label: "Confirmation of ongoing periodic negative-pressure and refrigeration verification regime", description: "SHTM 03-01." },
    ],
    // Gate 7 — Use
    [
      { key: "del.mortuary_soft_landings_review", label: "Soft landings / post-occupancy review (reliability, body-storage continuity, user feedback)" },
      { key: "del.mortuary_ongoing_negative_pressure_regime", label: "Ongoing periodic negative-pressure verification regime in operation, aligned to the SHTM 03-01 ventilation verification cycle", description: "SHTM 03-01.", bypassAuthority: "AUTHORISED_PERSON_VENTILATION" },
      { key: "del.mortuary_ongoing_refrigeration_monitoring", label: "Ongoing refrigeration temperature-monitoring and alarm regime" },
      { key: "del.mortuary_ongoing_fgas_regime", label: "Ongoing F-Gas refrigerant leak-check regime", description: "F-Gas Regulations." },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const netZeroTemplate = await db.template.create({
    data: {
      key: "template.health.renewable_net_zero_plant",
      name: "Renewable / Net Zero Plant",
      description:
        "Installation or major upgrade of renewable/net-zero plant — solar PV, air/ground source heat pumps, battery energy storage systems (BESS), and EV charging infrastructure, in an operational healthcare environment. Covers the RIBA-stage capital-delivery deliverables for the plant itself. Not standby generators/UPS/switchgear — see Electrical Services Replacement for the interface deliverables this checklist does not duplicate. Not the energy-gainshare/ventilation-conflict financial and clinical assessment — that is a separate net-zero compliance question this checklist does not itself cover.",
      matchKeywords: ["solar PV", "heat pump", "ASHP", "GSHP", "battery energy storage", "BESS", "EV charging", "net zero", "renewable energy", "DNO connection", "G98", "G99"],
      sectorVariantId: health.id,
    },
  });
  const netZeroStageTemplates = await createStageAndGateTemplates(netZeroTemplate.id);
  await createDeliverableTemplates(netZeroStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.netzero_business_case", label: "Business case / need identification (existing energy performance baseline, carbon-reduction target, plant condition)", description: "NHS Scotland Climate Emergency and Sustainability Strategy: 2022-2026." },
      { key: "del.netzero_stakeholder_map", label: "Initial stakeholder map, including Estates, Energy Manager and Finance" },
      { key: "del.netzero_feasibility_check", label: "Preliminary roof-loading / land-availability feasibility check (solar PV, ASHP siting)" },
      { key: "del.netzero_dno_capacity_enquiry", label: "Preliminary DNO capacity enquiry (headroom check ahead of a full G98/G99 application)", description: "ENA Engineering Recommendation G98/G99." },
      { key: "del.common_expanded_risk_register", label: "Expanded risk register", description: "SHTM 00, CDM 2015." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.netzero_project_brief", label: "Project Brief (scope: PV capacity, heat pump type/capacity, BESS capacity, EV charging point count)" },
      { key: "del.netzero_condition_surveys", label: "Existing system condition surveys (roof condition, existing boiler/plant interface, electrical infrastructure capacity)" },
      { key: "del.netzero_dno_preapplication", label: "Formal DNO pre-application enquiry submitted", description: "ENA Engineering Recommendation G98/G99." },
      { key: "del.netzero_bess_dsear_scoping", label: "Site-specific fire risk and DSEAR scoping for any proposed BESS", description: "DSEAR, NFCC Grid Scale BESS Planning guidance." },
      { key: "del.netzero_fire_energy_manager_engagement", label: "Engagement with Fire Safety Advisor and Energy Manager" },
      { key: "del.netzero_sustainability_benefits_case", label: "Sustainability/net zero benefits case aligned to the NHS Scotland Climate Emergency and Sustainability Strategy: 2022-2026" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.netzero_concept_design_report", label: "Concept design options (PV array layout/orientation, heat pump type ASHP vs GSHP, BESS chemistry and capacity)", description: "MCS MIS 3002, MIS 3005-D." },
      { key: "del.netzero_grid_connection_strategy", label: "Outline grid-connection strategy and indicative G98/G99 route", description: "ENA Engineering Recommendation G98/G99." },
      { key: "del.netzero_bess_siting_assessment", label: "Outline BESS siting and separation-distance assessment", description: "NFCC Grid Scale BESS Planning guidance." },
      { key: "del.netzero_structural_feasibility", label: "Structural feasibility for roof-mounted PV / heat pump plant loading" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.netzero_coordinated_layout_drawings", label: "Coordinated design (PV array layout, heat pump plant room/external unit location, BESS enclosure location, EV charge-point bay layout)" },
      { key: "del.netzero_structural_loading_confirmed", label: "Confirmed structural loading assessment (roof, plant room, ground-bearing for BESS enclosures)" },
      { key: "del.netzero_interface_mapping", label: "Interfaces with existing electrical distribution, BMS and heating systems mapped" },
      { key: "del.common_updated_risk_register_spatial", label: "Updated risk register" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.netzero_full_technical_design", section: "Technical Design Package", label: "Full technical design drawings and specifications", description: "MCS MIS 3002, MIS 3005-D/I." },
      { key: "del.netzero_bess_dsear_finalised", section: "Technical Design Package", label: "DSEAR risk assessment finalised for BESS (thermal-runaway detection, ventilation, separation distances)", description: "DSEAR, NFCC Grid Scale BESS Planning guidance.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.netzero_fire_strategy_addendum", section: "Technical Design Package", label: "Fire strategy addendum covering BESS and any new plant rooms", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.netzero_dno_application_offer", section: "Technical Design Package", label: "Formal G98/G99 connection application submitted and connection offer received", description: "ENA Engineering Recommendation G98/G99." },
      { key: "del.netzero_mcs_installer_confirmed", section: "Technical Design Package", label: "MCS-certified installer/contractor confirmed for PV and heat pump scopes", description: "MCS MIS 3002, MIS 3005-I." },
      { key: "del.netzero_ev_charging_design", section: "Technical Design Package", label: "EV charging circuit design (protective device selection, PME earthing assessment for open-access areas)", description: "BS EN IEC 61851, IET Code of Practice for EV Charging." },
      { key: "del.netzero_ventilation_compatibility_verification", section: "Technical Design Package", label: "Verification that heat pump/PV retrofit does not compromise SHTM 03-01 ventilation or thermal-comfort requirements", description: "SHTM 03-01." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.netzero_install_per_mcs", label: "Installation carried out per MCS standards, with progress records", description: "MCS MIS 3002, MIS 3005-I." },
      { key: "del.common_method_statements", label: "Contractor method statements and permit-to-work records for any live electrical isolations" },
      { key: "del.netzero_pvg_contractor_attendance", label: "PVG-checked contractor attendance records" },
      { key: "del.netzero_bess_install_verification", label: "BESS installation verified against DSEAR risk assessment and fire strategy", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.netzero_dno_pre_energisation_approval", label: "G98/G99 notification or pre-energisation approval obtained from the DNO before energisation", description: "ENA Engineering Recommendation G98/G99 — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.netzero_full_commissioning_records", label: "Full commissioning records (PV yield test, heat pump performance verification, BESS functional/fire-detection test, EV charge-point functional test)", description: "MCS MIS 3002, MIS 3005-I." },
      { key: "del.netzero_mcs_certification_issued", label: "MCS certification issued for PV and heat pump installations", description: "MCS MIS 3002, MIS 3005-I." },
      { key: "del.netzero_dno_connection_finalised", label: "DNO connection agreement finalised (G98 notification accepted / G99 approval confirmed)", description: "ENA Engineering Recommendation G98/G99." },
      { key: "del.common_om_manuals", label: "O&M manuals, warranties and as-built drawings" },
      { key: "del.netzero_operator_training", label: "Operator training on BMS integration and BESS emergency shutdown procedures" },
    ],
    // Gate 7 — Use
    [
      { key: "del.netzero_ongoing_performance_monitoring", label: "Ongoing performance monitoring against MCS commissioning benchmarks (PV yield, heat pump COP)" },
      { key: "del.netzero_bess_periodic_review", label: "BESS fire-detection and DSEAR risk assessment review on a defined periodic cycle, not treated as a one-off exercise", description: "DSEAR." },
      { key: "del.netzero_updated_maintenance_regime", label: "Updated maintenance regime integrated with the BMS and wider PPM programme" },
      { key: "del.netzero_annual_carbon_reporting", label: "Annual carbon/energy performance reported against the NHS Scotland Climate Emergency and Sustainability Strategy: 2022-2026 trajectory" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const buildingFabricTemplate = await db.template.create({
    data: {
      key: "template.health.building_fabric_external_envelope_replacement",
      name: "Building Fabric / External Envelope Replacement",
      description:
        "Replacement or major refurbishment of the external building envelope — roofing, external wall cladding, and external doors/windows, in an operational healthcare environment. Not internal fit-out/finishes — see Room or Ward Refresh, Mental Health Unit Ligature & Room Refresh, or Theatre Refresh for that, which treat building services as interfaces rather than replacing envelope fabric. Not roof-mounted renewable plant itself — see Renewable / Net Zero Plant for that, though structural loading/sequencing must be coordinated jointly where both are in scope.",
      matchKeywords: ["roofing", "external envelope", "cladding", "flat roof", "building fabric", "external doors", "external windows", "asbestos refurbishment survey", "R&D survey"],
      sectorVariantId: health.id,
    },
  });
  const buildingFabricStageTemplates = await createStageAndGateTemplates(buildingFabricTemplate.id);
  await createDeliverableTemplates(buildingFabricStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.fabric_business_case", label: "Business case / need identification (envelope condition survey, water ingress history, thermal performance baseline)" },
      { key: "del.fabric_stakeholder_map", label: "Initial stakeholder map, including Estates, IPC and affected clinical departments below/adjacent to the works" },
      { key: "del.fabric_asbestos_record_review", label: "Preliminary asbestos management-survey review of existing records", description: "Control of Asbestos Regulations 2012." },
      { key: "del.common_expanded_risk_register", label: "Expanded risk register", description: "SHTM 00, CDM 2015." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.fabric_project_brief", label: "Project Brief (scope: roof area, cladding extent, doors/windows affected, phasing constraints)" },
      { key: "del.fabric_asbestos_rd_survey", label: "Refurbishment & Demolition (R&D) asbestos survey commissioned and completed", description: "Control of Asbestos Regulations 2012, Regulations 4 & 7 — a fully intrusive survey, distinct from the routine management survey; must be current and reflected in the works method statement before intrusive work starts.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.fabric_structural_condition_survey", label: "Existing structural condition survey (roof deck, wall ties, external door/window frames)" },
      { key: "del.fabric_ipc_engagement", label: "Engagement with IPC and affected clinical departments on containment/weather-protection requirements" },
      { key: "del.fabric_height_access_strategy_scoped", label: "Working at height access strategy scoped", description: "Work at Height Regulations 2005." },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.fabric_concept_design_report", label: "Concept design options (roofing system type, cladding system, glazing performance)", description: "BS 6229:2025." },
      { key: "del.fabric_thermal_performance_targets", label: "Outline thermal/weathertightness performance targets", description: "Building (Scotland) Regulations 2004." },
      { key: "del.fabric_netzero_coordination", label: "Outline coordination with any planned Renewable/Net Zero Plant works (roof loading, sequencing)", description: "See Renewable / Net Zero Plant checklist." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.fabric_coordinated_layout_drawings", label: "Coordinated design (roof build-up, cladding fixings, door/window schedules, temporary weather protection)" },
      { key: "del.fabric_structural_loading_confirmed", label: "Confirmed structural loading assessment where roof-mounted plant is proposed" },
      { key: "del.fabric_updated_risk_register_asbestos", label: "Updated risk register incorporating asbestos survey findings" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.fabric_full_technical_design", section: "Technical Design Package", label: "Full technical design drawings and specifications", description: "BS 6229:2025." },
      { key: "del.fabric_fall_arrest_design_finalised", section: "Technical Design Package", label: "Fall-arrest/edge-protection design finalised", description: "Work at Height Regulations 2005." },
      { key: "del.fabric_asbestos_removal_method_statement", section: "Technical Design Package", label: "Asbestos removal method statement and licensed-contractor arrangements where required", description: "Control of Asbestos Regulations 2012.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.fabric_thermal_performance_calculations", section: "Technical Design Package", label: "Thermal/weathertightness performance calculations confirming compliance", description: "Building (Scotland) Regulations 2004." },
      { key: "del.fabric_rpa_consultation", section: "Technical Design Package", label: "Radiation Protection Adviser consultation where scope is in, adjacent to, above or below an imaging suite", description: "IRR17 — see Room/Ward/Theatre Refresh checklist. A separate gate from HAI-SCRIBE, not covered by it — applies to fabric-only projects too, not just system replacements." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.fabric_asbestos_removal_completed", label: "Asbestos removal completed and clearance certificates issued before follow-on trades commence", description: "Control of Asbestos Regulations 2012 — cannot be bypassed at PM level.", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_method_statements", label: "Contractor method statements and permit-to-work records for roof/height access", description: "Work at Height Regulations 2005." },
      { key: "del.fabric_pvg_contractor_attendance", label: "PVG-checked contractor attendance records" },
      { key: "del.fabric_weather_protection_records", label: "Weather-protection and containment records maintained throughout construction" },
      { key: "del.fabric_temp_works_design_signoff", label: "Temporary works design and sign-off (edge protection, scaffolding, weather screens)" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.fabric_full_commissioning_records", label: "Full commissioning records (water-tightness testing, thermal performance verification)", description: "BS 6229:2025." },
      { key: "del.fabric_asbestos_clearance_documentation", label: "Asbestos re-inspection/clearance documentation filed in the Health & Safety File", description: "Control of Asbestos Regulations 2012." },
      { key: "del.common_om_manuals", label: "O&M manuals, warranties and as-built drawings" },
      { key: "del.fabric_rpa_signoff_confirmation", label: "Confirmation of Radiation Protection Adviser sign-off where applicable" },
    ],
    // Gate 7 — Use
    [
      { key: "del.fabric_ongoing_condition_inspection_regime", label: "Ongoing roof/envelope condition inspection regime established" },
      { key: "del.fabric_updated_asbestos_register", label: "Updated asbestos register reflecting removed/remaining materials", description: "Control of Asbestos Regulations 2012 Duty to Manage." },
      { key: "del.fabric_updated_maintenance_regime", label: "Updated maintenance regime integrated with the wider PPM programme" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const escalatorsTemplate = await db.template.create({
    data: {
      key: "template.health.escalators_replacement",
      name: "Escalators Replacement",
      description:
        "Replacement or major upgrade of escalators / moving walks in hospital premises. A distinct system from Lift & Vertical Transportation Replacement — LOLER 1998 does not apply to escalators (their principal function is to transport, not lift), PUWER 1998 governs maintenance and inspection instead. Site-conditional — this checklist should only be applied where a site genuinely has, or is proposing to add, escalators, not defaulted into every capital project the way Electrical Services or Fire Alarm checklists are.",
      matchKeywords: ["escalator", "moving walk", "moving walkway", "passenger conveyor"],
      sectorVariantId: health.id,
    },
  });
  const escalatorsStageTemplates = await createStageAndGateTemplates(escalatorsTemplate.id);
  await createDeliverableTemplates(escalatorsStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.escalator_business_case", label: "Business case / need identification (escalator age, reliability, capacity, footfall analysis)", description: "BS EN 115-1:2017." },
      { key: "del.escalator_site_relevance_check", label: "Confirmation that the site has, or requires, escalator provision (site-relevance check)" },
      { key: "del.common_expanded_risk_register", label: "Expanded risk register", description: "SHTM 00, CDM 2015." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.escalator_project_brief", label: "Project Brief (scope: new installation vs major upgrade of existing unit)" },
      { key: "del.escalator_condition_survey", label: "Existing escalator condition survey (drive system, steps, balustrades, safety devices)", description: "BS EN 115-2." },
      { key: "del.escalator_baseline_footfall", label: "Baseline footfall / usage data and residual life assessment" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.escalator_concept_design_report", label: "Concept design options (full replacement vs modernisation, capacity, rise/pitch)", description: "BS EN 115-1:2017." },
      { key: "del.escalator_temp_circulation_strategy", label: "Outline circulation strategy for the works period (alternative routes, temporary lift capacity)" },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.escalator_coordinated_layout_drawings", label: "Coordinated design (structural opening, balustrade/handrail interfaces, fire-compartmentation interfaces)" },
      { key: "del.escalator_structural_loading_confirmed", label: "Confirmed structural loading and pit/headroom dimensions" },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.escalator_full_technical_design", section: "Technical Design Package", label: "Full technical design drawings and specifications", description: "BS EN 115-1:2017." },
      { key: "del.escalator_fire_smoke_compartmentation_strategy", section: "Technical Design Package", label: "Fire and smoke-compartmentation strategy for the escalator void", bypassAuthority: "FIRE_OFFICER" },
      { key: "del.escalator_puwer_regime_specified", section: "Technical Design Package", label: "PUWER-compliant maintenance and inspection regime specified", description: "PUWER 1998." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Installation records and contractor method statements" },
      { key: "del.escalator_pvg_contractor_attendance", label: "PVG-checked contractor attendance records" },
      { key: "del.escalator_temp_circulation_signage", label: "Temporary circulation/signage arrangements maintained throughout works" },
    ],
    // Gate 6 — Handover
    [
      { key: "del.escalator_full_commissioning_records", label: "Full commissioning records and safety-device functional tests", description: "BS EN 115-1:2017." },
      { key: "del.common_om_manuals", label: "O&M manuals, warranties and as-built drawings" },
      { key: "del.escalator_puwer_regime_handover", label: "Confirmation of PUWER inspection regime handed to the maintenance provider", description: "PUWER 1998." },
    ],
    // Gate 7 — Use
    [
      { key: "del.escalator_ongoing_puwer_regime", label: "Ongoing PUWER-compliant maintenance and statutory inspection regime", description: "PUWER 1998, Workplace (Health, Safety and Welfare) Regulations 1992 reg 19." },
      { key: "del.escalator_loler_exclusion_confirmation", label: "Confirmation that no LOLER thorough-examination regime has been mistakenly applied to the escalator in place of the correct PUWER regime", description: "LOLER 1998 does not apply to escalators — HSE guidance confirms the exclusion applies because their principal function is to transport, not lift." },
      { key: "del.escalator_updated_maintenance_regime", label: "Updated maintenance regime integrated with the wider PPM programme" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
    ],
  ]);

  const waterTreatmentTemplate = await db.template.create({
    data: {
      key: "template.health.water_treatment_plant_replacement",
      name: "Water Treatment Plant Replacement",
      description:
        "Replacement or major upgrade of non-domestic water treatment plant — reverse osmosis (RO) / deionised (DI) systems serving dialysis, pharmacy compounding, and CSSD/decontamination, and their distribution loop, in an operational healthcare environment. Covers the treatment plant and distribution loop only — the ISO 23500 dialysis water-quality deliverable already present in Domestic Hot & Cold Water Systems Replacement covers the point-of-use dialysis station itself; this checklist cross-references that deliverable rather than duplicating it.",
      matchKeywords: ["water treatment plant", "reverse osmosis", "RO plant", "deionised water", "DI water", "dialysis water", "pharmacy compounding water", "ISO 23500"],
      sectorVariantId: health.id,
    },
  });
  const waterTreatmentStageTemplates = await createStageAndGateTemplates(waterTreatmentTemplate.id);
  await createDeliverableTemplates(waterTreatmentStageTemplates, [
    // Gate 0 — Strategic Definition
    [
      { key: "del.watertreatment_business_case", label: "Business case / need identification (existing treatment plant condition, water-quality failure history, capacity)", description: "HTM 04-01." },
      { key: "del.watertreatment_end_use_confirmation", label: "Confirmation of which end use(s) the plant serves (dialysis, pharmacy compounding, CSSD)" },
      { key: "del.common_expanded_risk_register", label: "Expanded risk register", description: "SHTM 00, CDM 2015." },
    ],
    // Gate 1 — Preparation & Briefing
    [
      { key: "del.watertreatment_project_brief", label: "Project Brief (scope: RO/DI plant capacity, end uses served, distribution loop extent)" },
      { key: "del.watertreatment_condition_survey_baseline", label: "Existing plant condition survey and water-quality testing baseline", description: "ISO 23500." },
      { key: "del.watertreatment_stakeholder_engagement", label: "Engagement with Pharmacy, Renal/Dialysis and Decontamination services" },
    ],
    // Gate 2 — Concept Design
    [
      { key: "del.watertreatment_concept_design_report", label: "Concept design options (RO vs RO+DI, single-pass vs double-pass, loop vs point-of-use)", description: "ISO 23500-2." },
      { key: "del.watertreatment_legionella_strategy", label: "Outline Legionella control strategy for any stored/held water in the treatment train", description: "HSE ACOP L8, HSG274." },
    ],
    // Gate 3 — Spatial Coordination
    [
      { key: "del.watertreatment_coordinated_layout_drawings", label: "Coordinated design (plant room location, distribution loop routing, interfaces with dialysis stations and pharmacy compounding suite)" },
      { key: "del.watertreatment_backflow_arrangement_confirmed", label: "Confirmed backflow prevention arrangement at the mains connection", description: "WRAS." },
    ],
    // Gate 4 — Technical Design (Critical Gate). Pre-Contract Hold Point.
    [
      { key: "del.common_developed_design_pricing_specs", label: "Developed design / performance specifications (sufficient for accurate pricing)", description: "Not full construction-issue drawings — those follow contractor appointment, once the Pre-Contract Hold Point below clears." },
      { key: "del.common_detailed_scope_of_works", label: "Detailed Scope of Works" },
      { key: "del.common_updated_cost_plan_contingency", label: "Updated cost plan including appropriate contingency" },
      { key: "del.watertreatment_full_technical_design", section: "Technical Design Package", label: "Full technical design drawings and specifications", description: "ISO 23500-1/2, HTM 04-01." },
      { key: "del.watertreatment_water_quality_validation_plan", section: "Technical Design Package", label: "Water-quality validation plan defining acceptance criteria before clinical use", description: "ISO 23500-3." },
      { key: "del.watertreatment_legionella_control_finalised", section: "Technical Design Package", label: "Legionella control measures finalised for break tanks/reject storage", description: "HSE ACOP L8, HSG274." },
      { key: "del.watertreatment_pharmacy_water_quality_confirmed", section: "Technical Design Package", label: "Pharmacy compounding water-quality requirements confirmed where applicable", description: "European Pharmacopoeia Purified Water / Water for Injections monographs." },
      { key: "del.common_building_regs_compliance_info", label: "Building Warrant / Building (Scotland) Regulations 2004 compliance information (Schedule 3 where the works affect an existing occupied building)", bypassAuthority: "COMPLIANCE_OFFICER" },
      { key: "del.common_pre_construction_information", label: "Pre-Construction Information (CDM)", description: "CDM 2015." },
      { key: "del.common_construction_phase_plan", label: "Construction Phase Plan", description: "CDM 2015 reg 12 — produced by the Principal Contractor (or the contractor, if only one) before the construction phase begins." },
      { key: "del.common_design_risk_assessment_signed", label: "Designer's Risk Assessment & residual risks", description: "CDM 2015.", bypassAuthority: "SRO" },
      { key: "del.common_tender_documentation", label: "Tender documentation / Scope of Works / pricing schedules" },
      { key: "del.common_quotations_submission_and_ppm", label: "Obtain and submit competitive quotations (with PPM documentation) for PFI/NHS lifecycle approval", description: "Minimum of two competitive quotations, cost comparison, contingency and recommendation, submitted to the PFI Board / NHS together with valid PPM documentation and current compliance status for the existing plant being replaced." },
      { key: "del.common_pre_contract_hold_point", label: "PRE-CONTRACT HOLD POINT — no contractor appointment or Gate 5 works until written PFI/NHS cost approval is received", description: "Clear commercial & governance cut-off.", bypassAuthority: "SRO" },
      { key: "del.common_post_appointment_full_design", label: "After appointment: complete full technical drawings, final coordination and any remaining design details" },
    ],
    // Gate 5 — Manufacturing & Construction
    [
      { key: "del.common_method_statements", label: "Installation records and contractor method statements" },
      { key: "del.watertreatment_pvg_contractor_attendance", label: "PVG-checked contractor attendance records" },
      { key: "del.watertreatment_backflow_device_installed", label: "Backflow prevention device installed and WRAS-approved", description: "Water Supply (Water Fittings) (Scotland) Byelaws 2014 / WRAS." },
    ],
    // Gate 6 — Handover
    [
      { key: "del.watertreatment_full_commissioning_validation", label: "Full commissioning records including water-quality validation against ISO 23500 acceptance criteria before any clinical use", description: "ISO 23500-3 — critical clinical-safety verification, cannot be bypassed at PM level.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.watertreatment_legionella_commissioning_records", label: "Legionella commissioning/flushing records", description: "HSE ACOP L8, HSG274.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.common_om_manuals", label: "O&M manuals, warranties and as-built drawings" },
    ],
    // Gate 7 — Use
    [
      { key: "del.watertreatment_ongoing_water_quality_monitoring", label: "Ongoing water-quality monitoring regime (chemical, microbiological, endotoxin as applicable)", description: "ISO 23500-3.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.watertreatment_ongoing_legionella_monitoring", label: "Ongoing Legionella monitoring regime for stored/held water", description: "HSE ACOP L8, HSG274.", bypassAuthority: "AUTHORISED_PERSON_WATER" },
      { key: "del.watertreatment_updated_maintenance_regime", label: "Updated maintenance regime integrated with the wider PPM programme" },
      { key: "del.common_defects_liability_final_account", label: "Defects liability records & final account" },
      { key: "del.common_lessons_learned_report", label: "Lessons learned report" },
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
        overrideAuthority: "COMPETENT_PERSON",
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
        overrideAuthority: "COMPETENT_PERSON",
        blocksGate: true,
        appliesToStageKeys: ["stage.handover"],
        appliesIfTags: ["lifting_equipment_affected"],
      },
      // Four new safety-domain rules (26 Aug 2026): Work at Height, hot
      // works, lone working, asbestos refurb/demolition survey. Authority
      // choices, kept out of the stakeholder-facing description text
      // above: hot works ties to FIRE_OFFICER, same as every other
      // fire-domain rule in this set -- a hot-works permit is a
      // fire-ignition control, not a generic H&S one. The other three
      // stay on the default SRO override authority -- no SHTM/HTM scheme
      // establishes a Trust-appointed AP for height, lone working, or
      // asbestos the way it does for electrical/water/medical gases,
      // same reasoning as comp.loler_thorough_examination above for lifts.
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.work_at_height_authorisation",
        label: "Work at Height risk assessment, RAMS and permit authorised before elevated/roof-level work starts",
        description: "Applies wherever the works involve roof-level plant, external elevated access, or work above ground level (MEWP, scaffold, fragile-roof or edge-protection risk) — a distinct statutory duty from the general Designer's Risk Assessment under CDM, and from any system-specific isolation permit.",
        ruleRef: "Work at Height Regulations 2005",
        blocksGate: true,
        appliesToStageKeys: ["stage.manufacturing_construction"],
        appliesIfTags: ["work_at_height_affected"],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.hot_works_permit",
        label: "Hot works permit authorised before welding/grinding/naked-flame work starts",
        description: "Welding, grinding, brazing, and other naked-flame or spark-generating work is a distinct fire-ignition risk in an occupied healthcare building — a signed hot-works permit (isolation of the area, fire watch, extinguishing equipment) is required before work starts, on top of the general fire risk assessment.",
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
        description: "Out-of-hours, isolated-plant-room, or single-operative tasks need their own risk assessment and check-in/emergency-contact arrangement — a distinct duty from the general Designer's Risk Assessment or a task-specific method statement.",
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
        ruleRef: "NIS Regulations 2018 / Scottish Public Sector Cyber Resilience Framework (PSCRF) v2.0",
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
      // F10 (HSE) notification (27 Aug 2026, external review feedback —
      // Sample_Template_Documents/F10 Notification - Ward 3.pdf) — driven
      // by Project.notifiableUnderCdm, a third self-declared CDM answer
      // captured alongside worksType at creation, same reasoning as the
      // two rules above. Sits at Gate 4 (stage.technical_design), same
      // stage as comp.building_warrant and every other "must clear before
      // Gate 5 construction starts" item — reg 6 requires notification
      // before the construction phase begins.
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.cdm_f10_notification",
        label: "F10 notification submitted to HSE (or confirmed not required)",
        description: "Required before the construction phase begins if the project will last more than 30 working days AND have more than 20 workers on site simultaneously at any point, or involve more than 500 person-days of construction work in total.",
        ruleRef: "Construction (Design and Management) Regulations 2015, reg 6",
        blocksGate: true,
        appliesToStageKeys: ["stage.technical_design"],
        appliesIfTags: [CDM_F10_NOTIFIABLE_TAG],
      },
      // Principal Contractor appointment (27 Aug 2026, same source doc —
      // Sample_Template_Documents/Ward3_Construction_Phase_Plan_Document_
      // v2.0.pdf) — same reg 5(1) trigger as comp.cdm_principal_designer_
      // appointed above, so reuses CDM_PRINCIPAL_DESIGNER_TAG rather than
      // a new tag. Sits at Gate 4, not Gate 1 like Principal Designer:
      // the Principal Contractor is the appointed contractor's own site
      // representative, so the appointment naturally coincides with
      // contractor appointment at the Gate 4 Pre-Contract Hold Point,
      // not before design work has even started.
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.cdm_principal_contractor_appointed",
        label: "Principal Contractor appointed under CDM 2015",
        description: "Required as soon as practicable, and before the construction phase begins, whenever more than one contractor is or will be working on the project.",
        ruleRef: "Construction (Design and Management) Regulations 2015, reg 5(1)",
        blocksGate: true,
        appliesToStageKeys: ["stage.technical_design"],
        appliesIfTags: [CDM_PRINCIPAL_DESIGNER_TAG],
      },
      // Three rules added same session as the Automatic Doors / Fume
      // Cupboards / Fire Curtains templates below, ported from the
      // Document_Outlines docx reference checklists' own PVG/DSEAR/RPA
      // additions. All three are genuinely cross-cutting — they don't
      // belong to one discipline the way F-Gas or LOLER do — so they
      // live here in the core ruleset rather than duplicated as a
      // DeliverableTemplate row in every affected template.
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.pvg_scheme_membership",
        label: "PVG Scheme membership evidenced for contractor personnel attending site",
        description: "Current PVG Scheme membership (Disclosure Scotland's 5-year membership product for regulated roles, legally required since the Disclosure (Scotland) Act 2020's 1 April 2025 commencement) must be evidenced for named contractor operatives before they attend an occupied hospital site — distinct from Level 1/Level 2 disclosure, and from general trade competency cards. Applies to every project: hospital circulation routes aren't cleanly separable from vulnerable-patient areas.",
        ruleRef: "Disclosure (Scotland) Act 2020 / PVG Scheme",
        blocksGate: true,
        appliesToStageKeys: ["stage.manufacturing_construction"],
        appliesIfTags: [],
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.dsear_risk_assessment",
        label: "DSEAR risk assessment completed for dangerous substances / explosive atmospheres",
        description: "Applies wherever the works involve a flammable or pressurised substance — refrigerant handling (including A2L refrigerants such as R32, in scope since DSEAR's 2015 amendment brought all 'gases under pressure' into scope regardless of flammability class), fuel supply/combustion, or compressed/medical gas — particularly where hot works occur on or near the same system. A distinct statutory risk assessment from the general fire risk assessment and the hot-works permit above.",
        ruleRef: "Dangerous Substances and Explosive Atmospheres Regulations 2002, as amended 2015",
        blocksGate: true,
        appliesToStageKeys: ["stage.manufacturing_construction"],
        appliesIfTags: ["dsear_dangerous_substances_affected"],
        // Fire-domain in practice (ignition-source control, same concern
        // as comp.hot_works_permit) but the underlying hazard is the
        // dangerous substance itself, not fire-safety-of-the-building —
        // kept on the default SRO authority rather than FIRE_OFFICER,
        // consistent with comp.work_at_height_authorisation and
        // comp.lone_working_arrangements (no SHTM/HTM-established AP
        // exists for DSEAR the way it does for fire/electrical/water).
      },
      {
        ruleSetId: scottishHealthCompliance.id,
        key: "comp.rpa_shielding_integrity",
        label: "Radiation Protection Adviser (RPA) sign-off confirming shielding integrity unaffected",
        description: "Applies wherever works are in, adjacent to, above or below a room housing ionising-radiation imaging equipment (CT, X-ray, fluoroscopy, nuclear medicine — not MRI, which uses no ionising radiation). A separate gate from HAI-SCRIBE, not covered by it: a job can pass infection-control review cleanly and still risk breaching lead shielding integrity by drilling or fixing into a bounding wall, floor or ceiling.",
        ruleRef: "Ionising Radiations Regulations 2017 (IRR17)",
        blocksGate: true,
        appliesToStageKeys: ["stage.technical_design"],
        appliesIfTags: ["imaging_suite_adjacent_works"],
      },
    ],
  });

  // ── Project: UPS Systems Replacement, excluding Gate 7 (Use) ─────
  const project = await db.project.create({
    data: {
      projectNumber: "20456",
      isDemoProject: true,
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
      effectiveComplianceTags(project, [meTemplate.key])
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
      isDemoProject: true,
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
      projectTags: effectiveComplianceTags(waterProject, [waterTemplate.key]),
      sectorVariantId: health.id,
      order: i,
      stageTemplates: [waterStageTemplatesFull[i]!],
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
      isDemoProject: true,
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
      projectTags: effectiveComplianceTags(drainageProject, [drainageTemplate.key]),
      sectorVariantId: health.id,
      order: i,
      stageTemplates: [drainageStageTemplatesFull[i]!],
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
      isDemoProject: true,
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
      projectTags: effectiveComplianceTags(coldWaterProject, [coldWaterTemplate.key]),
      sectorVariantId: health.id,
      order: i,
      stageTemplates: [coldWaterStageTemplatesFull[i]!],
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
      isDemoProject: true,
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
      projectTags: effectiveComplianceTags(lightingProject, [lightingTemplate.key]),
      sectorVariantId: health.id,
      order: i,
      stageTemplates: [lightingStageTemplatesFull[i]!],
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
  // england:generate` — see src/lib/englandConversion.ts.
  const englandResult = await generateEnglandVariant(db);

  // England's own project-number counter (see the Scotland one above) —
  // starts at 40001 not 40000: seedEnglandDemo below issues project
  // #40001 directly via db.project.create, bypassing this counter, so
  // the first number actually issued through it must be #40002.
  await db.projectNumberCounter.upsert({
    where: { sectorVariantId: englandResult.sectorVariantId },
    update: {},
    create: { sectorVariantId: englandResult.sectorVariantId, value: 40001 },
  });

  // The England demo tenant itself (28 Aug 2026) — its own companies,
  // role-name-only users, and one demo project, entirely separate from
  // the Scotland/FVRH branding above. See seedEnglandDemo's own comment;
  // a live DB gets this via `npm run england:demo` instead.
  const englandDemo = await seedEnglandDemo(db);

  console.log("Seed complete.");
  console.log(
    `England variant: ${englandResult.templatesCreated} templates, ${englandResult.rulesCreated} compliance rules. Demo project #${englandDemo.projectNumber}.`
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
