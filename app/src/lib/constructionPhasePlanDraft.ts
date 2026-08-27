// The Construction Phase Plan (CDM 2015 reg 12) auto-draft generator
// (27 Aug 2026) — the second "auto-filled deliverable draft"
// (documentTemplateRoadmap.ts), following the exact shape and
// philosophy pciDraft.ts established as the pilot. Structure and
// boilerplate wording are transcribed and condensed from a real FVRH
// CPP (CITB GE700 "Construction site safety" format,
// "Ward3_Construction_Phase_Plan_Document_v2.0.pdf", supplied 27 Aug
// 2026) — same finding as the PCI's own source document: the large
// majority (site rules, standard risk categories, H&S file
// requirements, incident-reporting procedures) is standing CDM 2015 /
// Trust boilerplate that barely changes between projects. Only a
// handful of things genuinely vary: scope description, team names
// (including the Principal Contractor), programme dates, and which
// risks to emphasise — same split pciDraft.ts already makes.
//
// This module only builds the PLAIN CONTENT (buildCppSections) — it
// reuses docDraft.ts's renderDraftDocx to turn that into a .docx
// Buffer; the route handler
// (src/app/api/projects/[projectNumber]/construction-phase-plan-draft/route.ts)
// is responsible for loading data and serving the file.
import type { CdmWorksType } from "@prisma/client";
import type { DraftBlock } from "./docDraft";

const PRINCIPAL_DESIGNER_PLACEHOLDER = "[PRINCIPAL DESIGNER / PM TO COMPLETE — site-specific detail, not auto-filled]";

export type CppRoleAssignmentInput = {
  roleName: string;
  userName: string;
  companyName: string | null;
};

export type CppInput = {
  projectName: string;
  projectNumber: string;
  brief: string | null;
  worksType: CdmWorksType;
  constituentTemplateNames: string[];
  clientAuthorityName: string | null;
  fmContractorName: string | null;
  principalDesignerName: string | null;
  principalContractorName: string | null;
  roleAssignments: CppRoleAssignmentInput[];
  earliestTargetStart: Date | null;
  latestTargetEnd: Date | null;
  isHaiScribeIntensive: boolean;
  generatedByName: string;
  generatedDate: Date;
};

const GBDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

function scopeSummary(input: CppInput): string {
  const disciplines = input.constituentTemplateNames.join(" and ");
  const briefSentence = input.brief ? ` ${input.brief}` : "";
  return (
    `The project relates to ${disciplines} works at ${input.clientAuthorityName ?? "the Client Authority's site"}.` +
    briefSentence +
    ` The works will be undertaken within a live operational healthcare environment, which presents inherent risks relating to infection prevention, patient safety, and continuity of hospital operations.`
  );
}

function expectedDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return "TBC";
  const weeks = Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  return `${weeks} week programme (approx.)`;
}

// Same conditional split as pciDraft.ts's groundConditionsParagraph —
// building-modification work carries a genuinely different structural
// risk profile from a like-for-like plant/equipment swap.
function structuralStabilityNote(worksType: CdmWorksType): string {
  if (worksType === "BUILDING_MODIFICATION") {
    return "The works involve alteration to the structure, layout or fabric of the building. Any opening-up that could affect stability or fire compartmentation shall be reviewed by the design team before proceeding, with temporary support provided where required.";
  }
  return "No major structural alterations are anticipated. Any unforeseen structural or fire-compartmentation implications encountered during the works shall be reported to the project team and assessed before proceeding.";
}

export function buildCppSections(input: CppInput): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  const add = (b: DraftBlock) => blocks.push(b);

  add({ type: "heading1", text: `${input.projectName} — Construction Phase Plan` });
  add({
    type: "paragraph",
    text: `Project number: ${input.projectNumber} — Draft generated ${GBDate(input.generatedDate)} by ${input.generatedByName}.`,
  });

  add({ type: "heading1", text: "Version Control" });
  add({
    type: "table",
    header: ["Version", "Date", "Description", "Prepared by", "Checked by", "Authorised by"],
    rows: [["1.0", GBDate(input.generatedDate), "Auto-generated draft", input.generatedByName, "", ""]],
  });

  add({ type: "heading1", text: "Introduction" });
  add({
    type: "paragraph",
    text: "This Construction Phase Plan (CPP) has been prepared in accordance with Regulation 12 of the Construction (Design and Management) Regulations 2015 (CDM 2015). It sets out the health, safety and infection-control arrangements for the construction phase of the works, and shall be developed and reviewed by the Principal Contractor as the project progresses. It should be read alongside the project's Pre-Construction Information (PCI), which sets out the known site information, existing records and design hazards this plan responds to.",
  });
  add({ type: "paragraph", text: scopeSummary(input) });

  add({ type: "heading1", text: "Programme & Project Details" });
  add({
    type: "table",
    header: ["Item", "Detail"],
    rows: [
      ["Proposed start date", input.earliestTargetStart ? GBDate(input.earliestTargetStart) : "TBC"],
      ["Anticipated completion date", input.latestTargetEnd ? GBDate(input.latestTargetEnd) : "TBC"],
      ["Expected duration", expectedDuration(input.earliestTargetStart, input.latestTargetEnd)],
    ],
  });
  add({
    type: "paragraph",
    text: "Proposed phasing: Pre-start (confirm decant/access strategy, barriers, clean and dirty routes, permits and infection control controls) — Construction (isolate services, strip-out, install replacement systems, recommission) — Validation (testing, flushing, temperature/ventilation checks, enhanced cleaning, IPC sign-off prior to reoccupation) — Handover (H&S file, O&M information, HAI-SCRIBE Stage 4 review where applicable, test records and sign-off).",
  });

  add({ type: "heading1", text: "The Project Team" });
  add({
    type: "paragraph",
    text: "The Principal Designer is responsible for managing, monitoring and coordinating the pre-construction phase and communicating residual design risks. The Principal Contractor is responsible for planning, managing, monitoring and coordinating the construction phase, including day-to-day control of the works, and for reviewing contractors' RAMS. All subcontractors report through the Principal Contractor.",
  });
  add({
    type: "table",
    header: ["Role", "Name"],
    rows: [
      ["Principal Designer", input.principalDesignerName ?? "Not yet assigned"],
      ["Principal Contractor", input.principalContractorName ?? "Not yet assigned"],
      ["FM Contractor", input.fmContractorName ?? "Not yet assigned"],
      ["Client Authority", input.clientAuthorityName ?? "Not yet assigned"],
    ],
  });
  if (input.roleAssignments.length > 0) {
    add({
      type: "table",
      header: ["Role", "Name", "Company"],
      rows: input.roleAssignments.map((r) => [r.roleName, r.userName, r.companyName ?? ""]),
    });
  }

  add({ type: "heading1", text: "Management of the Work" });
  add({ type: "heading2", text: "Management structure and responsibilities" });
  add({
    type: "paragraph",
    text: "The Principal Contractor has day-to-day control of the works. The Client's representative coordinates with Estates and Infection Prevention & Control (IPC). Clinical/ward management controls patient and staff operations within the affected area. IPC/HAI-SCRIBE approves infection control arrangements and sign-off. All subcontractors report through the Principal Contractor.",
  });
  add({ type: "heading2", text: "Health, safety & infection control goals" });
  add({
    type: "paragraph",
    text: input.isHaiScribeIntensive
      ? "This system is rated High infection prevention & control involvement across most of the project lifecycle. Project goals are: zero harm to patients, staff, visitors and contractors; no uncontrolled dust or infection transmission; safe phased hand-back; daily site inspections by the Principal Contractor; weekly joint inspections with Estates/IPC; review of permits and RAMS compliance."
      : "Project goals are: zero harm to patients, staff, visitors and contractors; no uncontrolled dust or infection transmission; safe phased hand-back; daily site inspections by the Principal Contractor; weekly joint inspections with Estates/IPC; review of permits and RAMS compliance.",
  });
  add({ type: "heading2", text: "Health, safety & infection control arrangements" });
  add({
    type: "paragraph",
    text: "All works shall comply with CDM 2015, the Health and Safety at Work etc. Act 1974, the Management of Health and Safety at Work Regulations 1999, COSHH, PUWER, and applicable NHS/FM Contractor health & safety and IPC policies. Construction areas shall be separated from occupied clinical space by sealed temporary partitions, controlled access, and agreed clean/dirty routes. Dust suppression, enhanced cleaning, water hygiene controls, permit-to-work arrangements and room/area sign-off procedures shall be implemented throughout.",
  });
  add({ type: "heading2", text: "Site rules" });
  add({
    type: "paragraph",
    text: "No access by patients to work areas. Site sign in/out is mandatory. PPE and task-specific PPE/RPE to be worn as required by RAMS. No smoking or vaping on site. Tools, cords, sharps and other risk items to be removed or locked away when not in immediate use. Barriers, fire routes and clinical routes must not be compromised. Good housekeeping and hand hygiene to be maintained at all times.",
  });

  add({ type: "heading1", text: "Arrangements" });
  add({ type: "heading2", text: "Co-operation and coordination" });
  add({
    type: "paragraph",
    text: "Weekly coordination meetings involving the Principal Contractor, FM Contractor, Estates, IPC and clinical representatives. Daily start-of-shift briefings and permit reviews. Sequencing agreed with the clinical team. A lessons-learned review to be carried out at the end of each phase.",
  });
  add({ type: "heading2", text: "Consultation with the workforce" });
  add({
    type: "paragraph",
    text: "Consultation through inductions, daily briefings, toolbox talks and supervisor engagement. Workforce encouraged to report concerns, accidents, near misses and suggested improvements immediately.",
  });
  add({ type: "heading2", text: "Exchange of design information" });
  add({
    type: "paragraph",
    text: "Design and residual risk information shall be issued by the Principal Designer/design team to the Principal Contractor and briefed to supervisors, the local clinical management team (where appropriate) and subcontractors before work starts or changes are introduced.",
  });
  add({ type: "heading2", text: "Handling design changes" });
  add({
    type: "paragraph",
    text: "Any design change affecting the programme shall be raised through the project's change control process before being reviewed by the Principal Designer, Client representative, Estates, the local clinical management team (where appropriate) and IPC before implementation.",
  });
  add({ type: "heading2", text: "Selection and control of contractors" });
  add({
    type: "paragraph",
    text: "Contractors and subcontractors shall be selected on proven competency, healthcare experience, training, supervision standards and insurance, and on their ability to work to HAI-SCRIBE and site-specific requirements.",
  });
  add({ type: "heading2", text: "Exchange of health and safety information" });
  add({
    type: "paragraph",
    text: "Relevant health and safety information shall be exchanged through pre-start meetings, this Construction Phase Plan, RAMS, permits, coordination meetings, daily briefings and close-out/handover records.",
  });
  add({ type: "heading2", text: "Site security" });
  add({
    type: "paragraph",
    text: "Controlled access to work zones by sign-in/out and badge system. Materials and tools stored in locked areas, counted in and out, and removed from site after use at the end of each shift.",
  });

  add({ type: "heading1", text: "Reporting, RAMS, Fire & Emergency" });
  add({ type: "heading2", text: "Reporting and investigation of incidents" });
  add({
    type: "paragraph",
    text: "All accidents, incidents and near misses shall be reported immediately to the Principal Contractor's site manager and recorded via the FM Contractor's incident reporting system, in accordance with RIDDOR. Patient-related incidents or concerns shall be escalated immediately to clinical management and IPC.",
  });
  add({ type: "heading2", text: "Production and approval of risk assessments" });
  add({
    type: "paragraph",
    text: "Task-specific RAMS and written systems of work are required for all significant activities. RAMS shall be approved by the Principal Contractor before works start, with additional review where a task creates a foreseeable risk to patients or hospital staff.",
  });
  add({ type: "heading2", text: "Fire safety procedures" });
  add({
    type: "paragraph",
    text: "Hospital fire procedures apply at all times. Hot works are only permitted under the hospital's permit-to-work system, with fire watch and extinguishers provided. Temporary partitions shall maintain fire compartmentation as required, and escape routes, alarm points and firefighting equipment shall remain accessible.",
  });
  add({ type: "heading2", text: "Emergency precautions and procedures" });
  add({
    type: "paragraph",
    text: "Emergency procedures shall align with the hospital's own arrangements. In a fire or medical emergency, all site personnel shall comply with ward/hospital instructions and alarm procedures. A suspected infection-control breach, dust escape or water-quality issue requires an immediate stop-work, make-safe and IPC review.",
  });

  add({ type: "heading1", text: "Arrangements for Controlling Significant Site Risks" });
  add({
    type: "paragraph",
    text: "The table below sets out this project's arrangements for the significant site risk categories under Schedule 3 of CDM 2015 that are relevant to internal healthcare refurbishment/replacement work. Categories with no anticipated relevance (e.g. diving, tunnelling, explosives) are omitted.",
  });
  add({
    type: "table",
    header: ["Risk category", "Arrangement"],
    rows: [
      [
        "Delivery and removal of materials, including waste",
        "Deliveries via agreed clean routes avoiding patient/public routes where practicable; waste removed via designated dirty routes in sealed, lockable containers, timed to minimise interaction with ward activity.",
      ],
      [
        "Dealing with services — water, electricity and gas",
        "All affected services identified and isolated in coordination with Estates and the permit system before work begins; lock-out/tag-out to apply; water systems managed to avoid dead legs, with temporarily isolated branches flushed and records retained.",
      ],
      ["Stability of structures", structuralStabilityNote(input.worksType)],
      [
        "Preventing falls / working at height",
        "Work at height to use suitable access equipment (MEWPs/tower scaffolds) with trained operatives, inspection, exclusion zones and edge protection as necessary.",
      ],
      [
        "Assembly/dismantling of heavy or prefabricated components",
        "Handled under specific lifting/manual handling assessments, using sufficient labour and mechanical aids where practicable.",
      ],
      [
        "Traffic routes and segregation",
        "Traffic and pedestrian routes agreed and communicated with clinical teams per phase; delivery/collection times controlled and service routes used where possible.",
      ],
      [
        "Storage of materials, including hazardous materials",
        "Materials and equipment stored only in designated secured areas; hazardous products stored per COSHH assessments and manufacturer guidance; combustible load minimised.",
      ],
      [
        "Chemical and biological substances",
        "Operatives may be exposed to adhesives, sealants, cleaning agents and biological risks associated with live hospital working. Controls include COSHH assessments, hygiene arrangements, appropriate PPE/RPE, segregation and supervision.",
      ],
    ],
  });

  add({ type: "heading1", text: "Health Risks" });
  add({ type: "heading2", text: "Asbestos" });
  add({
    type: "paragraph",
    text: "All available asbestos survey information must be reviewed prior to commencement, with appropriate controls implemented per the Control of Asbestos Regulations 2012. If suspect materials are encountered, work in the affected area shall stop immediately pending assessment.",
  });
  add({ type: "heading2", text: "Manual handling" });
  add({
    type: "paragraph",
    text: "Manual handling shall be conducted in line with the Manual Handling Operations Regulations 1992, with risks mitigated by contractors' RAMS and mechanical aids used where practicable.",
  });
  add({ type: "heading2", text: "Noise and vibration" });
  add({
    type: "paragraph",
    text: "Noisy or vibration-producing activities shall be restricted to agreed time windows and minimised, particularly where vulnerable patients or those with heightened agitation levels are nearby.",
  });
  add({ type: "heading2", text: "Other significant health risks" });
  add({
    type: "paragraph",
    text: "Additional health risks may include dust exposure, contamination transfer, Legionella/water-hygiene risk from disturbed water systems, and slips/trips in constrained live areas. Controls include sealed barriers, extraction, enhanced cleaning, flushing and temperature checks, and strict housekeeping.",
  });

  add({ type: "heading1", text: "The Health and Safety File" });
  add({
    type: "paragraph",
    text: "The Health and Safety File shall be produced in electronic format, structured by asset/room/discipline, with sections for residual risks, product data, test records, certificates, O&M information and cleaning/maintenance requirements. Information shall be collected progressively from designers, specialist suppliers and contractors throughout the project. Responsibility for compiling the file sits with the Principal Designer (from pre-construction information) and the Principal Contractor (from construction records); the completed file shall be handed to the Client Authority's Estates team on completion.",
  });

  add({ type: "heading1", text: "Significant Design and Construction Hazards" });
  add({
    type: "paragraph",
    text: "Ongoing design coordination and design changes shall be managed through the Principal Designer and project meetings, with all relevant parties informed of changes affecting safety, infection control, fire, services or system performance before work proceeds.",
  });
  add({ type: "heading2", text: "Project-specific significant hazards and residual design risks" });
  add({ type: "placeholder", text: PRINCIPAL_DESIGNER_PLACEHOLDER });

  add({ type: "heading1", text: "Comments" });
  add({
    type: "paragraph",
    text: "Monitoring and audits: daily toolbox talks and inspections by the Principal Contractor's site manager; weekly health & safety and IPC audits by the FM Contractor's projects team; weekly coordination meetings. Site segregation and security: work zones sealed during works to prevent dust/contamination spread; tools and materials secured; all room/area work carried out behind locked doors where practicable. Incident reporting: all accidents, incidents and near misses reported immediately to the Principal Contractor's site manager and recorded; patient-related incidents escalated to clinical management, Estates and IPC. Fire safety controls: hot works via hospital permit-to-work system only; escape routes kept clear at all times. Waste management: deliveries via clean routes, waste via dirty routes, contained in sealed, locked containers, removed at agreed times.",
  });

  return blocks;
}
