// The Risk Register auto-draft generator (26 Aug 2026) — the second
// "auto-filled deliverable draft" after the PCI (pciDraft.ts), covering
// the "Initial Risk Register" deliverable every template carries at
// Gate 1. Unlike the PCI, this deliverable was never canonicalized to
// a shared key (see #82) — every template uses its own key
// (`del.<discipline>_expanded_risk_register`), because the standard
// risk *categories* genuinely differ by discipline (Legionella for
// water, loss of supply for electrical, ligature for MHU, etc.), each
// already spelled out in that template's own deliverable label/
// description in prisma/seed.ts.
//
// Content model, three tiers, cheapest-to-verify first:
//  1. Universal construction/CDM hazards — reuses PciDraft's own
//     STANDARD_HAZARDS list (already-vetted, generic, non-site-
//     specific control wording) plus Asbestos and Legionella, present
//     on every project regardless of discipline.
//  2. Clinical-environment risks — infection control / disruption to
//     patient care, present whenever the project touches an occupied
//     clinical space (Room/Ward Refresh, Theatre Refresh, or the MHU
//     Ligature template).
//  3. MHU ligature-specific risks — generalised from a real, supplied
//     example ("Risk_Register_Ward3_MHU_v3.xlsx", Ward 3 Mental Health
//     Unit Reduced Ligature Refurbishment) with names, dates and
//     site-specific product/contractor detail stripped out, present
//     only when the project includes the MHU Ligature template.
//
// A fourth, per-discipline tier turns the parenthetical category list
// already written into each *system* template's own risk-register
// deliverable label (e.g. "(loss of supply, critical areas, temporary
// power, discrimination)" for electrical) into stub rows — hazard
// identification only, no invented technical controls, since that
// genuinely needs the discipline AP/PM's judgement (same boundary
// PciDraft draws around residual risk).
//
// Likelihood/Impact/Risk scoring, ownership, status and dates are
// always left for the PM/Compliance Officer to complete — those are
// judgement calls about THIS project, never boilerplate.
//
// This module only builds rows (buildRiskRegisterRows) and renders
// them to an .xlsx Buffer (renderRiskRegisterXlsx) — the route handler
// (src/app/api/projects/[projectNumber]/risk-register-draft/route.ts)
// owns loading data and serving the file.
import ExcelJS from "exceljs";
import { STANDARD_HAZARDS } from "./pciDraft";

const COMPLETE_PLACEHOLDER = "[PM / Compliance Officer / Authorised Person to complete]";
const SCORE_PLACEHOLDER = "TBC";

export type RiskRegisterRow = {
  activity: string;
  hazard: string;
  personsAtRisk: string;
  controls: string | null; // null renders as COMPLETE_PLACEHOLDER
};

export type RiskRegisterDeliverableInput = {
  key: string; // e.g. "del.electrical_expanded_risk_register"
  label: string; // e.g. "Initial risk register (loss of supply, critical areas, ...)"
};

export type RiskRegisterInput = {
  projectName: string;
  projectNumber: string;
  riskRegisterDeliverables: RiskRegisterDeliverableInput[];
  generatedByName: string;
  generatedDate: Date;
};

export type RiskRegisterSection = { title: string; rows: RiskRegisterRow[] };

const GBDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

// The three "occupied clinical space" templates share these key
// prefixes on their risk-register deliverable — Ward/Theatre Refresh
// get the clinical-environment tier, MHU additionally gets the
// ligature-specific tier. Every other prefix is a plant/system
// discipline and falls through to the generic per-discipline tier.
const SPACE_REFRESH_PREFIXES = new Set(["wardrefresh", "theatrerefresh", "mhu"]);
const MHU_PREFIX = "mhu";

const DISCIPLINE_LABELS: Record<string, string> = {
  electrical: "Electrical Systems",
  water: "Domestic Hot & Cold Water Systems",
  drainage: "Drainage",
  coldwater: "Cold Water Storage",
  lighting: "Lighting",
  boiler: "Boiler / Heating Plant",
  ventilation: "Ventilation Systems",
  medgas: "Medical Gas Systems",
  firealarm: "Fire Alarm & Detection",
  lift: "Lift Systems",
  nursecall: "Nurse Call / Staff Paging",
  bms: "Building Management System (BMS)",
  chilledwater: "Chilled Water / Cooling",
  steam: "Steam Systems",
  firesuppression: "Fire Suppression",
  security: "Security Systems",
  pts: "Pneumatic Tube System",
  abovedrainage: "Above-ground Drainage",
  compressedair: "Compressed Air Systems",
};

function keyPrefix(key: string): string {
  return key.replace(/^del\./, "").replace(/_expanded_risk_register$/, "");
}

// Pulls the standard risk-category list a template's own risk-register
// deliverable already names, e.g. "(loss of supply, critical areas)"
// -> ["loss of supply", "critical areas"], or "— means-of-escape and
// clinical continuity focus" -> ["means-of-escape and clinical
// continuity focus"]. Returns [] when the label carries no hint
// (e.g. plain "Expanded Risk Register"), so the caller can fall back
// to a single generic stub row.
function parseRiskCategories(label: string): string[] {
  const parenMatch = label.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]) {
    return parenMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const dashParts = label.split(" — ");
  if (dashParts.length > 1 && dashParts[1]) return [dashParts[1].trim()];
  return [];
}

function universalRisksSection(): RiskRegisterSection {
  const rows: RiskRegisterRow[] = STANDARD_HAZARDS.map((h) => ({
    activity: h.heading,
    hazard: h.heading,
    personsAtRisk: "Patients, Staff, Contractors",
    controls: h.text,
  }));
  rows.push({
    activity: "Asbestos, including results of surveys",
    hazard: "Disturbance of asbestos-containing materials during intrusive works",
    personsAtRisk: "Patients, Staff, Contractors",
    controls:
      "All available asbestos survey information must be reviewed prior to the commencement of works, and appropriate control measures implemented in accordance with the Control of Asbestos Regulations 2012. If any suspect materials are encountered during the works, all activities in the affected area shall cease immediately and be reported to the Client for further assessment.",
  });
  rows.push({
    activity: "Legionella risks from water systems",
    hazard: "Legionella growth in existing water systems disturbed or left stagnant during works",
    personsAtRisk: "Patients, Staff, Contractors",
    controls:
      "Where the works involve activities within areas where existing water systems are present, the Principal Contractor shall coordinate with the Client and relevant facilities management teams to ensure water systems are managed in accordance with applicable guidance, minimising periods of stagnation and implementing flushing/disinfection regimes where required.",
  });
  return { title: "Standard construction / CDM risks (every project)", rows };
}

function clinicalEnvironmentSection(): RiskRegisterSection {
  return {
    title: "Clinical environment risks (occupied ward/unit works)",
    rows: [
      {
        activity: "Infection control during works in an occupied clinical area",
        hazard: "Infection control breach from dust, debris or contractor movement in a live clinical environment",
        personsAtRisk: "Patients, Staff",
        controls:
          "HAI-SCRIBE controls appropriate to the assessed risk class are applied for the duration of works, including dust suppression/on-tool extraction, sealed work areas, and a daily deep clean of the work area before clinical staff or patients re-enter.",
      },
      {
        activity: "Disruption to patient care during works",
        hazard: "Cumulative disturbance to patients and clinical routine over the project duration",
        personsAtRisk: "Patients, Staff",
        controls:
          "Works are phased so only a limited number of rooms/areas are affected at any one time; the ward/clinical team receives regular briefings on the schedule; agreed working hours and noise controls are followed.",
      },
    ],
  };
}

// Generalised from a real Reduced Ligature Refurbishment risk
// register — names, dates, specific contractors and product brands
// removed; only the risk categories and generic control principles
// kept, consistent with this app's "boilerplate only, judgement stays
// with the PM/Compliance Officer" rule.
function mhuLigatureSection(): RiskRegisterSection {
  return {
    title: "Mental Health Unit / ligature-specific risks",
    rows: [
      {
        activity: "Patient access to tools, materials or unsecured work areas",
        hazard: "Patient accessing tools, materials or an unsecured work area, creating a self-harm or safety risk",
        personsAtRisk: "Patients, Staff",
        controls:
          "Rooms are kept locked whenever a contractor is not present; a daily tool and materials sign-in/sign-out register is maintained; no tools or sharp items are left unattended in a patient-accessible area at any time.",
      },
      {
        activity: "New ironmongery, doors or windows creating an unintended ligature point",
        hazard: "Replacement doors, windows, door monitors or hardware not sealed/tested to anti-ligature standard",
        personsAtRisk: "Patients",
        controls:
          "All replacement ironmongery, doors and windows are confirmed as tested and compliant with recognised anti-ligature product standards before the room is handed back into clinical use; any temporary opening created during the works is sealed or continuously supervised.",
      },
      {
        activity: "Contractors leaving a window or door opening unsecured while working",
        hazard: "Unsecured opening allowing an escape or ligature attempt",
        personsAtRisk: "Patients",
        controls:
          "External sealing / securing protocol strictly followed before contractors leave the area; a daily checklist confirms every opening is secured; no work is left overnight with an open aperture.",
      },
      {
        activity: "Patient behaviour or security incident near the work area",
        hazard: "A patient attempts to enter the work area or shows signs of distress",
        personsAtRisk: "Patients, Staff, Contractors",
        controls:
          "Contractors are instructed to stop work immediately, secure the area, and alert nursing staff — contractors must never attempt to manage patient behaviour themselves. Covered in site induction.",
      },
      {
        activity: "Emergency alarm response",
        hazard: "Contractor does not know when or how to raise the alarm in an emergency",
        personsAtRisk: "Patients, Contractors",
        controls:
          "Use of the ward's personal alarm system is covered in contractor induction and verified as functioning before work commences each day.",
      },
      {
        activity: "Patient and staff confidentiality",
        hazard: "Contractors overhearing confidential information, or capturing images of patients, staff or documents",
        personsAtRisk: "Patients, Staff",
        controls:
          "Confidentiality obligations are covered at induction; no photography or recording is permitted on the ward; any suspected breach is escalated to the Nurse in Charge immediately.",
      },
      {
        activity: "Food or drink left unattended by contractors",
        hazard: "Unsecured contractor food/drink consumed by a patient with dietary or fluid restrictions",
        personsAtRisk: "Patients",
        controls: "No food or drink is held in an unsecured patient area; covered at induction; any found is removed immediately and escalated to the Nurse in Charge.",
      },
    ],
  };
}

function disciplineStubSection(deliverable: RiskRegisterDeliverableInput): RiskRegisterSection | null {
  const prefix = keyPrefix(deliverable.key);
  if (SPACE_REFRESH_PREFIXES.has(prefix)) return null; // covered by the clinical/ligature tiers above
  const disciplineLabel = DISCIPLINE_LABELS[prefix] ?? deliverable.label;
  const categories = parseRiskCategories(deliverable.label);
  const rows: RiskRegisterRow[] =
    categories.length > 0
      ? categories.map((category) => ({
          activity: disciplineLabel,
          hazard: category,
          personsAtRisk: SCORE_PLACEHOLDER,
          controls: null,
        }))
      : [
          {
            activity: disciplineLabel,
            hazard: `Discipline-specific risks — see the ${disciplineLabel} risk assessment`,
            personsAtRisk: SCORE_PLACEHOLDER,
            controls: null,
          },
        ];
  return { title: `${disciplineLabel} — discipline-specific risks`, rows };
}

export function buildRiskRegisterSections(input: RiskRegisterInput): RiskRegisterSection[] {
  const sections: RiskRegisterSection[] = [universalRisksSection()];

  const prefixes = input.riskRegisterDeliverables.map((d) => keyPrefix(d.key));
  if (prefixes.some((p) => SPACE_REFRESH_PREFIXES.has(p))) {
    sections.push(clinicalEnvironmentSection());
  }
  if (prefixes.includes(MHU_PREFIX)) {
    sections.push(mhuLigatureSection());
  }

  for (const deliverable of input.riskRegisterDeliverables) {
    const stub = disciplineStubSection(deliverable);
    if (stub) sections.push(stub);
  }

  return sections;
}

const COLUMN_HEADERS = [
  "Risk ID",
  "Element / Activity",
  "Hazard / Risk",
  "Persons at Risk",
  "Inherent Likelihood",
  "Inherent Impact",
  "Inherent Risk",
  "Controls",
  "Residual Risk",
  "Accountability",
  "Risk Owner",
  "Status",
  "Date Raised",
  "Last Review Date",
  "Next Review Date",
  "Actions Required",
  "Action Due Date",
  "Progress Notes",
];

export async function renderRiskRegisterXlsx(sections: RiskRegisterSection[], input: RiskRegisterInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.generatedByName;
  workbook.created = input.generatedDate;
  const sheet = workbook.addWorksheet("Risk Register", { views: [{ state: "frozen", ySplit: 4 }] });

  sheet.columns = COLUMN_HEADERS.map((header) => ({
    header,
    width: header === "Controls" || header === "Hazard / Risk" || header === "Progress Notes" ? 40 : 16,
  }));

  sheet.mergeCells(1, 1, 1, COLUMN_HEADERS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `DRAFT RISK REGISTER — ${input.projectName} (Project #${input.projectNumber})`;
  titleCell.font = { bold: true, size: 13 };

  sheet.mergeCells(2, 1, 2, COLUMN_HEADERS.length);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = `Auto-generated draft — review, score and complete before use. Generated by ${input.generatedByName} on ${GBDate(input.generatedDate)}.`;
  subtitleCell.font = { italic: true, size: 10 };

  sheet.addRow([]);

  const headerRow = sheet.addRow(COLUMN_HEADERS);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
    cell.alignment = { wrapText: true, vertical: "top" };
  });

  let riskNumber = 1;
  for (const section of sections) {
    const sectionRow = sheet.addRow([section.title]);
    sheet.mergeCells(sectionRow.number, 1, sectionRow.number, COLUMN_HEADERS.length);
    sectionRow.font = { bold: true };
    sectionRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };

    for (const row of section.rows) {
      const riskId = `R-${String(riskNumber).padStart(2, "0")}`;
      riskNumber += 1;
      const dataRow = sheet.addRow([
        riskId,
        row.activity,
        row.hazard,
        row.personsAtRisk,
        SCORE_PLACEHOLDER,
        SCORE_PLACEHOLDER,
        SCORE_PLACEHOLDER,
        row.controls ?? COMPLETE_PLACEHOLDER,
        SCORE_PLACEHOLDER,
        SCORE_PLACEHOLDER,
        SCORE_PLACEHOLDER,
        "OPEN",
        GBDate(input.generatedDate),
        "",
        "",
        row.controls ? "" : "Define discipline-specific controls and risk scoring",
        "",
        "",
      ]);
      dataRow.eachCell((cell) => {
        cell.alignment = { wrapText: true, vertical: "top" };
      });
    }
  }

  sheet.addRow([]);
  const legendRow = sheet.addRow(["RISK MATRIX / STATUS GUIDE"]);
  sheet.mergeCells(legendRow.number, 1, legendRow.number, COLUMN_HEADERS.length);
  legendRow.font = { bold: true };
  sheet.addRow(["HIGH", "", "", "", "OPEN", "", "Risk identified; controls in place but being monitored"]);
  sheet.addRow(["MEDIUM", "", "", "", "IN PROGRESS", "", "Mitigation actions underway"]);
  sheet.addRow(["LOW", "", "", "", "MONITORING", "", "Residual risk acceptable; under routine review"]);
  sheet.addRow(["", "", "", "", "ESCALATED", "", "Risk elevated — senior management intervention required"]);
  sheet.addRow(["", "", "", "", "CLOSED", "", "Risk no longer active"]);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
