// The "Pre-fillable from the 18 Deliverables Checklists" roadmap (26
// Aug 2026, "pre-filled template outline.docx") — StageForge auto-
// generating a first-draft document for a deliverable (using brief
// text, CDM works type, discipline, compliance tags and SHTM/HTM
// references already captured on the project), which the Project
// Manager/Compliance Officer/gate approver then reviews, edits, and
// owns before uploading as evidence. This file is pure static
// reference content (same "transcribed source doc" pattern as
// regulationConversion.ts) — update a row's `status` to "live" as each
// one actually ships; `/document-templates` reads straight from here,
// so the page stays honest without a schema/DB change.

export type DocumentTemplateStatus = "live" | "planned";

export type DocumentTemplateRow = {
  name: string;
  gates: string;
  autoFilledContent: string;
  pmOwns: string;
  status: DocumentTemplateStatus;
};

export const CORE_PROJECT_WIDE_TEMPLATES: DocumentTemplateRow[] = [
  {
    name: "Project Brief",
    gates: "Gate 0 / Gate 1",
    autoFilledContent: "Scope summary, outcomes, high-level clinical impact",
    pmOwns: "Final wording & priorities",
    status: "planned",
  },
  {
    name: "Project Execution Plan (PEP)",
    gates: "Gate 1",
    autoFilledContent: "Procurement strategy, high-level programme, roles",
    pmOwns: "Detailed programme & team names",
    status: "planned",
  },
  {
    name: "Initial Risk Register",
    gates: "Gate 1",
    autoFilledContent: "Standard risks (CDM, HAI, service continuity, asbestos, fire) + system-specific risks",
    pmOwns: "Scoring, owners, mitigation actions",
    status: "planned",
  },
  {
    name: "Pre-Construction Information (PCI)",
    gates: "Gate 4",
    autoFilledContent: "CDM works type, existing hazards, design hazards, site constraints",
    pmOwns: "Site-specific details & residual risks",
    status: "live",
  },
  {
    name: "Construction Phase Plan",
    gates: "Gate 4 / Gate 5",
    autoFilledContent:
      "Site rules, welfare, communication & coordination arrangements, project directory, standard hazard list — carried forward from the PCI, GE 700 (CITB) structure",
    pmOwns: "Method statements, phasing, contractor-specific arrangements",
    status: "planned",
  },
  {
    name: "F10 (HSE) Notification",
    gates: "Gate 1 / Gate 4",
    autoFilledContent: "Client, Principal Designer, Principal Contractor, project location, works description",
    pmOwns: "Confirmed programme duration & workforce numbers",
    status: "planned",
  },
  {
    name: "Designer's Risk Assessment",
    gates: "Gate 2–4",
    autoFilledContent: "High-level design risks + residual risks by discipline",
    pmOwns: "Final residual risk ratings",
    status: "planned",
  },
  {
    name: "Stage Report / Gate Review Report",
    gates: "End of each Gate",
    autoFilledContent: "Summary of deliverables completed, outstanding items, approvals",
    pmOwns: "Recommendations & decisions",
    status: "planned",
  },
  {
    name: "Pre-Contract Hold Point Pack",
    gates: "Gate 4",
    autoFilledContent: "Quotes summary, contingency, SBAR status, compliance tags",
    pmOwns: "Formal recommendation to Board",
    status: "planned",
  },
];

export type SafetyGroupTemplateRow = DocumentTemplateRow & { triggeredBy: string };

export const SAFETY_GROUP_TEMPLATES: SafetyGroupTemplateRow[] = [
  {
    name: "SBAR — Water Safety Group",
    triggeredBy: "Domestic Water, Boilers, Chilled Water, Steam",
    gates: "Gate 4",
    autoFilledContent: "Situation, Background, Assessment (from checklist) + SHTM 04-01 refs",
    pmOwns: "Recommendation & local context",
    status: "planned",
  },
  {
    name: "SBAR — Ventilation / IPC",
    triggeredBy: "Ventilation, Ward Refurb",
    gates: "Gate 4",
    autoFilledContent: "Infection control risks, HAI-SCRIBE stage, temporary strategy",
    pmOwns: "Clinical impact statement",
    status: "planned",
  },
  {
    name: "SBAR / Submission — Medical Gas Safety Group",
    triggeredBy: "Medical Gases",
    gates: "Gate 4",
    autoFilledContent: "Continuity, Permit-to-Work, identity/quality risks",
    pmOwns: "AP (MGPS) comments",
    status: "planned",
  },
  {
    name: "Fire Strategy / Compartmentation Note",
    triggeredBy: "Any system affecting fire",
    gates: "Gate 3–4",
    autoFilledContent: "Fire Officer tags, penetrations, means of escape",
    pmOwns: "Site-specific fire strategy input",
    status: "planned",
  },
  {
    name: "HAI-SCRIBE Stage Record",
    triggeredBy: "All clinical / high-risk systems",
    gates: "Gate 1–4",
    autoFilledContent: "Stage 1–4 question set prompts + risk summary",
    pmOwns: "Actual scores & mitigations",
    status: "planned",
  },
];

export type DisciplineSpecificTemplateRow = DocumentTemplateRow & { relatedSystems: string };

export const DISCIPLINE_SPECIFIC_TEMPLATES: DisciplineSpecificTemplateRow[] = [
  {
    name: "Scope of Works (Technical)",
    relatedSystems: "All 18",
    gates: "Gate 4",
    autoFilledContent: "Standard scope clauses + system-specific exclusions",
    pmOwns: "Final scope boundaries",
    status: "planned",
  },
  {
    name: "Temporary Works / Continuity Strategy",
    relatedSystems: "Heating, Ventilation, Water, Medical Gas, Electrical",
    gates: "Gate 3",
    autoFilledContent: "High-level principles only (no method statements)",
    pmOwns: "Site-specific temporary arrangements",
    status: "planned",
  },
  {
    name: "Validation & Commissioning Requirements",
    relatedSystems: "Ventilation, Medical Gas, Water, Electrical, Lifts",
    gates: "Gate 4–6",
    autoFilledContent: "SHTM-referenced test list",
    pmOwns: "Actual results & sign-off",
    status: "planned",
  },
  {
    name: "Permit-to-Work Requirements Summary",
    relatedSystems: "Medical Gas, Electrical, Hot Works, Work at Height",
    gates: "Gate 4–5",
    autoFilledContent: "Mandatory permit types by activity",
    pmOwns: "Named permit holders & dates",
    status: "planned",
  },
  {
    name: "Asbestos / Hazardous Materials Note",
    relatedSystems: "Ward Refurb, any intrusive works",
    gates: "Gate 1–3",
    autoFilledContent: "Standard risk wording + survey requirement",
    pmOwns: "Survey results & findings",
    status: "planned",
  },
  {
    name: "Soft Landings / Handover Checklist",
    relatedSystems: "All systems",
    gates: "Gate 6–7",
    autoFilledContent: "O&M, training, residual risks, updated Written Schemes",
    pmOwns: "Actual handover outcomes",
    status: "planned",
  },
];

export const GATE_MAP: { gate: string; templates: string }[] = [
  { gate: "Gate 0", templates: "Project Brief + High-level Impact Assessment" },
  { gate: "Gate 1", templates: "PEP + Initial Risk Register + Early Engagement Log" },
  { gate: "Gate 2", templates: "Design Risk Assessment (high-level) + Outline Specs" },
  { gate: "Gate 3", templates: "Coordinated Design Summary + Temporary Strategy (principles)" },
  { gate: "Gate 4", templates: "PCI + Pre-Contract Hold Point Pack + SBAR(s) + Scope of Works" },
  { gate: "Gate 5", templates: "(Contractor-owned) Method Statements / RAMS — only after approval" },
  { gate: "Gate 6", templates: "Soft Landings / Handover Checklist + Final Safety Group Acceptance" },
  { gate: "Gate 7", templates: "Lessons Learned + Updated Written Schemes" },
];
