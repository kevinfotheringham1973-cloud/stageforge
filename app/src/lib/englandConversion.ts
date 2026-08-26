// The actual SHTM->HTM conversion engine (24 Aug 2026), replacing the
// static /regulatory-reference notes page with something that really
// generates a second, England-jurisdiction SectorVariant from the live
// Scotland template + compliance corpus -- see generateEnglandVariant
// below. Every mapping here was derived by querying the live corpus for
// every SHTM/Scotland-specific string that actually exists (not
// guessed), then converted against Regulation Conversion_England_Scotland.docx's
// per-system and "Key Conversion Notes" tables.
import type { PrismaClient } from "@prisma/client";

export const ENGLAND_SECTOR_VARIANT_KEY = "health_england";
export const ENGLAND_RULE_SET_KEY = "compliance.health_england.core";

// Direct HTM-series equivalents -- the doc's "simple find-and-replace of
// SHTM -> HTM" systems. Firecode volumes (81/82/83/86, SFPN 3) don't map
// 1:1 and are handled separately below, since England's Firecode
// reorganises into a single HTM 05 series rather than keeping Scotland's
// per-volume numbering.
const DIRECT_SHTM_MAP: Record<string, string> = {
  "SHTM 00": "HTM 00",
  "SHTM 02-01": "HTM 02-01",
  "SHTM 03-01": "HTM 03-01",
  "SHTM 04-01": "HTM 04-01",
  "SHTM 06": "HTM 06",
  "SHTM 06-01": "HTM 06-01",
  "SHTM 08-01": "HTM 08-01",
  "SHTM 08-02": "HTM 08-02",
  "SHTM 08-03": "HTM 08-03",
  "SHTM 64": "HTM 64",
};

const FIRECODE_ENGLAND = "HTM 05 series (Firecode)";
const FIRECODE_TOKENS = ["SHTM 81", "SHTM 82", "SHTM 83", "SHTM 86", "SFPN 3"];

// Full-string overrides for the label/description rows whose Scotland
// legal citation is embedded in a sentence rather than a clean
// comma-separated citation list -- every one of these was found by
// querying the live corpus for "SHTM" or "Scotland" (24 Aug 2026); this
// is the complete set, not a sample.
const EXACT_TEXT_OVERRIDES: Record<string, string> = {
  "Building Standards (Scotland).": "Building Regulations (England) + Approved Documents.",
  "NHS Scotland Security Standards.": "NHS England Security / Estates guidance.",
  "Statutory duty under the Building (Scotland) Regulations and Fire (Scotland) Act — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.":
    "Statutory duty under the Building Regulations (England) and the Regulatory Reform (Fire Safety) Order 2005 — only the site NHS Fire Officer can approve or reject fire-related compliance, not the SRO.",
  "Building Standards (Scotland) compliance information": "Building Regulations (England) compliance information",
  "Complete pipework and fittings specification compliant with SHTM 64 and the Building (Scotland) Regulations Section 3 (Environment)":
    "Complete pipework and fittings specification compliant with HTM 64 and Building Regulations 2010 (England), Approved Document H (Drainage and waste disposal)",
  "Complete storage tank, filtration and pipework specification compliant with SHTM 04-01 Part B, BS 8558 and the Water Supply (Water Fittings) (Scotland) Byelaws 2014":
    "Complete storage tank, filtration and pipework specification compliant with HTM 04-01 Part B, BS 8558 and the Water Supply (Water Fittings) Regulations 1999",
  "Compliance Matrix — mapping against BS EN 12056, SHTM 64, Building (Scotland) Regulations, Water Environment (Controlled Activities) (Scotland) Regulations 2011, CDM 2015":
    "Compliance Matrix — mapping against BS EN 12056, HTM 64, Building Regulations 2010 (England), Environmental Permitting (England and Wales) Regulations 2016, CDM 2015",
  "Evidence of compliance with Building Standards (Scotland), BS EN 12056 and manufacturer requirements":
    "Evidence of compliance with Building Regulations (England), BS EN 12056 and manufacturer requirements",
  "Evidence of compliance with NHS Scotland Security Standards, BS EN standards, cybersecurity requirements and GDPR":
    "Evidence of compliance with NHS England Security / Estates guidance, BS EN standards, cybersecurity requirements and GDPR",
  "Scottish Water Byelaws.": "Water Supply (Water Fittings) Regulations 1999.",
  "Confirmation of trade effluent / grease-management requirements with Scottish Water":
    "Confirmation of trade effluent / grease-management requirements with the local water/sewerage undertaker",
};

function convertShtmTokens(text: string): string {
  let result = text;
  for (const token of FIRECODE_TOKENS) {
    result = result.split(token).join(FIRECODE_ENGLAND);
  }
  for (const [shtm, htm] of Object.entries(DIRECT_SHTM_MAP)) {
    result = result.split(shtm).join(htm);
  }
  // Two Firecode tokens in the same list (e.g. "SHTM 82, SHTM 86") both
  // convert to the same England line -- collapse the resulting repeat
  // rather than leave "HTM 05 series (Firecode), HTM 05 series (Firecode)".
  result = result.replace(/(HTM 05 series \(Firecode\))(, \1)+/g, "$1");
  // Fallback for any SHTM reference not in the explicit map above -- keeps
  // this safe rather than silently wrong if a new one is ever added to a
  // Scotland template without updating this file.
  result = result.replace(/SHTM/g, "HTM");
  return result;
}

export function convertGuidanceText<T extends string | null | undefined>(text: T): T {
  if (!text) return text;
  if (text in EXACT_TEXT_OVERRIDES) return EXACT_TEXT_OVERRIDES[text] as T;
  return convertShtmTokens(text) as T;
}

// Per-rule England equivalents for the 17-row Scotland compliance corpus,
// hand-mapped against the doc's "Key Conversion Notes" table -- real
// statutory citation swaps (Building Warrant -> Building Regulations
// approval via Building Control, Fire (Scotland) Act -> Regulatory
// Reform (Fire Safety) Order 2005, HAI-SCRIBE -> local ICRA-style IPC
// process since the doc says it "has no direct HTM equivalent"), not
// regex. Rules not listed here (CDM 2015, DCB0160, F-Gas, LOLER, PSSR,
// UK GDPR) are already UK-wide statute and carry over unchanged.
export const ENGLAND_RULE_OVERRIDES: Record<string, { label?: string; description?: string; ruleRef?: string }> = {
  comp_bms_cybersecurity_hardening: {
    ruleRef: "NHS England Data Security and Protection Toolkit (DSPT) / NCSC Cyber Assessment Framework",
  },
  comp_building_warrant: {
    label: "Building Regulations approval obtained from Building Control before work starts",
    ruleRef: "Building Act 1984 / Building Regulations 2010 (England)",
  },
  comp_drainage_flow_design: {
    ruleRef: "BS EN 12056 (Gravity drainage systems inside buildings) / Building Regulations 2010 (England), Approved Document H (Drainage and waste disposal)",
  },
  comp_fire_risk_assessment: {
    ruleRef: "Regulatory Reform (Fire Safety) Order 2005 / HTM 05 series (Firecode)",
  },
  comp_haiscribe_high_intensity_review: {
    label: "IPC / ICRA review — sustained high-intensity involvement",
    description:
      "This system is rated High Infection Prevention & Control involvement across most of the project lifecycle, not just at Spatial Coordination — Concept Design through Handover all need an active IPC review checkpoint, per the local ICRA-style intensity matrix.",
    ruleRef: "Local Trust IPC risk assessment (ICRA-style) / HTM 00",
  },
  comp_haiscribe_review: {
    label: "IPC / ICRA risk assessment reviewed for infection-control impact",
    description:
      "Infection Control Risk Assessment (ICRA) process — mitigates healthcare-associated infection risk from construction/refurbishment/maintenance activity, in place of Scotland's HAI-SCRIBE where no direct HTM equivalent exists.",
    ruleRef: "Local Trust IPC risk assessment (ICRA-style) / HTM 00",
  },
  comp_legionella_water_safety: {
    ruleRef: "HTM 04-01 / HSE ACOP L8 / Water Supply (Water Fittings) Regulations 1999",
  },
  comp_nhs_scotland_assure_sbar: {
    label: "SBAR forms submitted to NHS England Estates & Facilities assurance",
    description:
      "Mandatory design/construction assurance review for major capital schemes — one SBAR form per relevant primary group (e.g. Water Safety, Ventilation, Infection Control).",
    ruleRef: "NHS England Estates & Facilities / New Hospital Programme assurance",
  },
  comp_planning_permission_confirmed: {
    ruleRef: "Town and Country Planning Act 1990",
  },
  comp_trade_effluent_consent: {
    ruleRef: "Environmental Permitting (England and Wales) Regulations 2016 / Water Industry Act 1991 trade effluent consent",
  },
};

// comp.mgps_validation_verification and comp.pssr_written_scheme's
// ruleRef are already jurisdiction-neutral (SHTM 02-01 -> HTM 02-01 via
// convertShtmTokens, PSSR is UK-wide) -- only their prose description
// needed the SHTM->HTM token swap, which convertGuidanceText handles the
// same way it does every DeliverableTemplate description.

function ruleOverrideKey(ruleKey: string): string {
  return ruleKey.replace(/\./g, "_");
}

/**
 * Idempotent: safe to call from prisma/seed.ts (fresh install) and from
 * a one-off run against the live DB alike, and safe to re-run if the
 * Scotland corpus changes later -- every write is an upsert keyed on the
 * same unique constraint Prisma already enforces (Template.key,
 * StageTemplate [templateId,key], GateTemplate.stageTemplateId,
 * DeliverableTemplate [gateTemplateId,key], ComplianceRuleSet.key,
 * ComplianceRuleTemplate [ruleSetId,key]).
 *
 * Deliberately leaves the new Templates' matchKeywords empty (same
 * "invisible until needed" trick the retired Cold Water Storage template
 * uses) -- listMatchableTemplates (provisioning.ts) only offers
 * templates with matchKeywords set, so this never appears in the
 * current single-tenant (Scotland) demo's project-creation dropdown
 * until a real England tenant is onboarded and someone deliberately
 * populates them.
 */
export async function generateEnglandVariant(
  db: PrismaClient
): Promise<{ sectorVariantId: string; templatesCreated: number; rulesCreated: number }> {
  const scotland = await db.sectorVariant.findUniqueOrThrow({ where: { key: "health" } });

  const england = await db.sectorVariant.upsert({
    where: { key: ENGLAND_SECTOR_VARIANT_KEY },
    update: {},
    create: { key: ENGLAND_SECTOR_VARIANT_KEY, name: "Health (England)", brandName: scotland.brandName },
  });

  const scotlandTemplates = await db.template.findMany({
    where: { sectorVariantId: scotland.id },
    include: {
      stageTemplates: {
        orderBy: { order: "asc" },
        include: { gateTemplate: { include: { deliverableTemplates: true } } },
      },
    },
  });

  let templatesCreated = 0;
  for (const t of scotlandTemplates) {
    const englandTemplate = await db.template.upsert({
      where: { key: t.key.replace("template.health.", "template.health_england.") },
      update: {},
      create: {
        key: t.key.replace("template.health.", "template.health_england."),
        name: t.name,
        description: t.description,
        matchKeywords: [], // invisible until a real England tenant needs it
        sectorVariantId: england.id,
      },
    });
    templatesCreated++;

    for (const st of t.stageTemplates) {
      const englandStage = await db.stageTemplate.upsert({
        where: { templateId_key: { templateId: englandTemplate.id, key: st.key } },
        update: {},
        create: { templateId: englandTemplate.id, key: st.key, name: st.name, order: st.order },
      });

      if (!st.gateTemplate) continue;
      const gt = st.gateTemplate;
      const englandGate = await db.gateTemplate.upsert({
        where: { stageTemplateId: englandStage.id },
        update: {},
        create: { stageTemplateId: englandStage.id, key: gt.key, name: gt.name },
      });

      for (const dt of gt.deliverableTemplates) {
        await db.deliverableTemplate.upsert({
          where: { gateTemplateId_key: { gateTemplateId: englandGate.id, key: dt.key } },
          update: {},
          create: {
            gateTemplateId: englandGate.id,
            key: dt.key,
            order: dt.order,
            label: convertGuidanceText(dt.label),
            description: convertGuidanceText(dt.description),
            minFiles: dt.minFiles,
            blocksGate: dt.blocksGate,
            bypassAuthority: dt.bypassAuthority,
          },
        });
      }
    }
  }

  const scotlandRuleSet = await db.complianceRuleSet.findFirstOrThrow({
    where: { sectorVariantId: scotland.id },
    include: { rules: true },
  });

  const englandRuleSet = await db.complianceRuleSet.upsert({
    where: { key: ENGLAND_RULE_SET_KEY },
    update: {},
    create: { key: ENGLAND_RULE_SET_KEY, name: "England NHS Hard FM — Core Compliance", sectorVariantId: england.id },
  });

  let rulesCreated = 0;
  for (const r of scotlandRuleSet.rules) {
    const override = ENGLAND_RULE_OVERRIDES[ruleOverrideKey(r.key)];
    await db.complianceRuleTemplate.upsert({
      where: { ruleSetId_key: { ruleSetId: englandRuleSet.id, key: r.key } },
      update: {},
      create: {
        ruleSetId: englandRuleSet.id,
        key: r.key,
        label: override?.label ?? convertGuidanceText(r.label),
        description: override?.description ?? convertGuidanceText(r.description),
        ruleRef: override?.ruleRef ?? convertGuidanceText(r.ruleRef),
        evidenceType: r.evidenceType,
        minFiles: r.minFiles,
        blocksGate: r.blocksGate,
        appliesToStageKeys: r.appliesToStageKeys,
        appliesIfTags: r.appliesIfTags,
        overrideAuthority: r.overrideAuthority,
        additionalApproverRoleKeys: r.additionalApproverRoleKeys,
      },
    });
    rulesCreated++;
  }

  return { sectorVariantId: england.id, templatesCreated, rulesCreated };
}
