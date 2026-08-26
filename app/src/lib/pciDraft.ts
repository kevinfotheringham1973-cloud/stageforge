// The PCI (Pre-Construction Information) auto-draft generator (26 Aug
// 2026) — the pilot for "auto-filled deliverable drafts"
// (documentTemplateRoadmap.ts). Structure and boilerplate wording are
// transcribed and generalised from a real FVRH PCI (Currie & Brown,
// "PCI_FVRH_Ward 3 Mental Health Unit Refurb Project_rev 3.0.pdf",
// supplied 26 Aug 2026) — confirmed the large majority of a real PCI
// (client site rules, security, welfare, permit-to-work, HAI-SCRIBE
// framing, the entire standard hazard list, the Health & Safety File
// requirements, both appendices) is standing CDM 2015 / Trust
// boilerplate that barely changes between projects, not project-
// specific judgement. Only a handful of things genuinely vary: scope
// description, team names, timescales, which hazards to emphasise per
// discipline, and the actual residual-risk entries — everything else
// here is either pulled from data already on the Project, or a fixed
// paragraph reused for every generated draft.
//
// Site-identifying details (address, emergency contact numbers, the
// Trust's H&S File delivery format) are hardcoded below rather than
// modelled — reasonable for this single-tenant (FVRH/Serco) deployment
// (see stageforge_branding), but would need to become configurable
// fields the moment a second tenant is onboarded.
//
// This module only builds the PLAIN CONTENT (buildPciSections) and
// renders it to a .docx Buffer (renderPciDocx) — it never touches the
// database or Next.js request/response; the route handler
// (src/app/api/projects/[projectNumber]/pci-draft/route.ts) is
// responsible for loading data and serving the file.
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType, TextRun } from "docx";
import type { CdmWorksType } from "@prisma/client";

const PRINCIPAL_DESIGNER_PLACEHOLDER = "[PRINCIPAL DESIGNER / PM TO COMPLETE — site-specific detail, not auto-filled]";

export type PciBlock =
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "placeholder"; text: string }
  | { type: "table"; header?: string[]; rows: string[][] };

export type PciRoleAssignmentInput = {
  roleName: string;
  userName: string;
  companyName: string | null;
};

export type PciInput = {
  projectName: string;
  projectNumber: string;
  brief: string | null;
  worksType: CdmWorksType;
  constituentTemplateNames: string[];
  neededRoleKeys: Set<string>;
  fmContractorName: string | null;
  clientAuthorityName: string | null;
  principalDesignerName: string | null;
  roleAssignments: PciRoleAssignmentInput[];
  earliestTargetStart: Date | null;
  latestTargetEnd: Date | null;
  isHaiScribeIntensive: boolean;
  generatedByName: string;
  generatedDate: Date;
};

const GBDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

function scopeSummary(input: PciInput): string {
  const disciplines = input.constituentTemplateNames.join(" and ");
  const briefSentence = input.brief ? ` ${input.brief}` : "";
  return (
    `The project relates to ${disciplines} works at ${input.clientAuthorityName ?? "the Client Authority's site"}.` +
    briefSentence +
    ` The works will be undertaken within a live operational healthcare environment, which presents inherent risks relating to infection prevention, patient safety, and continuity of hospital operations.`
  );
}

function notificationParagraph(worksType: CdmWorksType): string {
  if (worksType === "DIRECT_REPLACEMENT_SINGLE_CONTRACTOR") {
    return (
      "With reference to Regulation 6 of the Construction (Design and Management) Regulations 2015 (CDM 2015), this project " +
      "is a like-for-like replacement delivered by a single contractor. On that basis it is not anticipated to meet the " +
      "notification thresholds, but this should be confirmed once final programme duration and workforce levels are known " +
      "— if notification does become required, an F10 notification must be submitted to the Health and Safety Executive " +
      "prior to commencement of construction activities, and a copy displayed on site for the duration of the works."
    );
  }
  return (
    "With reference to Regulation 6 of the Construction (Design and Management) Regulations 2015 (CDM 2015), the works " +
    "are anticipated to be notifiable subject to confirmation of final programme duration and workforce levels. Where the " +
    "notification thresholds are met, an F10 notification shall be submitted to the Health and Safety Executive prior to " +
    "commencement of construction activities. Where notification is required, the Principal Contractor shall ensure that a " +
    "copy of the F10 is clearly displayed on site for the duration of the works and kept up to date should any material " +
    "changes occur. No construction activities shall commence until statutory notification requirements have been satisfied."
  );
}

function groundConditionsParagraph(worksType: CdmWorksType): string {
  if (worksType === "BUILDING_MODIFICATION") {
    return (
      "The works involve alteration to the structure, layout or fabric of the building, and localised groundworks or " +
      "structural intervention may therefore be required. Contractors should be aware that the condition of existing " +
      "substrates, structural elements and concealed services may vary once exposed, and appropriate precautions must be " +
      "taken when undertaking any intrusive works to avoid damage to existing building elements or services. Any " +
      "unforeseen conditions encountered during the works shall be reported to the project team and assessed prior to " +
      "proceeding."
    );
  }
  return (
    "The works are confined to internal refurbishment/replacement within an existing building, and no significant " +
    "external groundworks or deep excavations are anticipated as part of the project. Localised floor or wall preparation " +
    "may be required to facilitate installation activities; however, these will be limited in extent and depth. " +
    "Contractors should be aware that the condition of existing substrates and concealed services may vary once exposed. " +
    "Any unforeseen conditions encountered during the works shall be reported to the project team and assessed prior to " +
    "proceeding."
  );
}

// Standard construction hazards (26 Aug 2026, transcribed from the real
// PCI's "Project Health and Safety Hazards" section) — near-universal
// for an internal refurbishment/replacement project in an operational
// healthcare setting, so always included. `emphasise` lists the
// discipline role keys (see neededDisciplineRoleKeys,
// src/lib/disciplineTeam.ts) that make a given hazard more prominent
// for THIS project, rather than inventing separate per-template hazard
// text.
const STANDARD_HAZARDS: { heading: string; text: string; emphasise?: string[] }[] = [
  {
    heading: "Boundaries and general access, including temporary access",
    text: "The work area shall be clearly defined and segregated from operational areas at all times. The Principal Contractor will be responsible for establishing suitable site boundaries using temporary barriers, hoarding and clear signage to restrict access to authorised personnel only. Safe access and egress routes must be identified, maintained and coordinated with the Client to avoid conflict with existing circulation routes used by patients, staff and visitors.",
  },
  {
    heading: "Restrictions on deliveries, vehicular traffic or waste collection or storage",
    text: "All deliveries must be pre-planned, coordinated with the Client and scheduled to minimise disruption to hospital operations, emergency access routes and staff circulation areas. Construction waste must be managed in accordance with hospital procedures, with prompt removal from the work area. All construction waste skips shall be lockable and fitted with secure lids to prevent unauthorised access and minimise infection control risks.",
  },
  {
    heading: "Location of existing services",
    text: "Existing building services are present within and around the work areas and may include electrical, mechanical and plumbing systems associated with the operation of the facility. All existing services shall be treated as live until confirmed otherwise, and contractors must undertake appropriate verification prior to commencing any intrusive works. Where works interface with existing services, appropriate isolation, lock-off and permit-to-work procedures must be followed.",
    emphasise: ["AUTHORISED_PERSON_ELECTRICAL", "AUTHORISED_PERSON_WATER", "AUTHORISED_PERSON_MEDICAL_GASES"],
  },
  {
    heading: "Excavations and groundworks",
    text: "Where the works involve any intrusive floor or wall works, appropriate precautions must be taken given the potential for concealed services or variations in existing construction. Any unforeseen conditions encountered during such activities must be reported to the project team and assessed before works continue.",
  },
  {
    heading: "Vibration impact",
    text: "Construction activities including drilling, cutting and removal of existing building elements may generate vibration within the structure of the building. The Principal Contractor shall ensure that suitable methods of work and equipment are selected to minimise vibration so far as reasonably practicable, and that works are carefully planned, monitored and coordinated with the Client.",
  },
  {
    heading: "Working at height",
    text: "Where activities require working at height, this shall be properly planned, supervised and carried out by competent personnel using suitable access equipment, in accordance with the Work at Height Regulations 2005.",
    emphasise: ["AUTHORISED_PERSON_VENTILATION", "AUTHORISED_PERSON_ELECTRICAL"],
  },
  {
    heading: "Lifting operations",
    text: "Lifting operations required for the movement, removal and installation of materials, equipment and building components must be carefully planned and carried out by competent personnel in accordance with the Lifting Operations and Lifting Equipment Regulations 1998 (LOLER) and the Provision and Use of Work Equipment Regulations 1998 (PUWER).",
  },
  {
    heading: "Live services",
    text: "Existing live services present within the work areas shall be assumed to be live at all times unless confirmed otherwise. The Principal Contractor shall ensure that all works in proximity to existing services are properly planned and controlled, including identification, isolation and protection of services where required, with appropriate permit-to-work procedures and lock-off arrangements in place before any work commences.",
    emphasise: ["AUTHORISED_PERSON_ELECTRICAL", "AUTHORISED_PERSON_WATER", "AUTHORISED_PERSON_MEDICAL_GASES"],
  },
  {
    heading: "Slips, trips and falls",
    text: "The presence of materials, tools, debris and temporary changes to floor conditions may increase the likelihood of slips, trips and falls. The Principal Contractor shall implement suitable control measures, including maintaining good housekeeping, keeping access routes clear and providing adequate lighting.",
  },
  {
    heading: "Hand-arm vibration",
    text: "The use of powered tools and equipment can expose operatives to hand-arm vibration. The Principal Contractor shall ensure that risks are assessed and managed in accordance with the Control of Vibration at Work Regulations 2005, including selection of low-vibration equipment, limiting exposure duration and task rotation.",
  },
  {
    heading: "Construction related dust & silica dust particles",
    text: "Drilling, cutting and removal of existing building elements may generate dust, including respirable crystalline silica (RCS). The Principal Contractor shall ensure exposure is adequately controlled through dust suppression, local extraction, effective segregation and appropriate cleaning regimes, with suitable respiratory protective equipment provided where required.",
  },
  {
    heading: "Musculoskeletal disorders",
    text: "Repetitive movements, awkward postures and the handling of materials and equipment within confined spaces may contribute to musculoskeletal disorders. The Principal Contractor shall ensure these risks are assessed and controlled through appropriate task planning, mechanical aids where practicable, and safe working methods.",
  },
  {
    heading: "Manual handling",
    text: "Manual handling activities, including movement of materials, equipment and components, shall be assessed and managed in accordance with the Manual Handling Operations Regulations 1992 (as amended), reducing the need for manual handling where practicable and using mechanical aids.",
  },
  {
    heading: "Noise from construction activities",
    text: "Noise from tools, equipment and installation processes must be assessed and managed in accordance with the Control of Noise at Work Regulations 2005, with low-noise equipment selected where practicable and hearing protection provided where required.",
  },
  {
    heading: "Buried services and excavations",
    text: "Where limited intrusive works are required within floor constructions, concealed services could be present. All available information shall be reviewed, and appropriate checks undertaken prior to any intrusive activity; any services encountered shall be treated as live until confirmed otherwise.",
  },
];

function hazardMatchesProject(hazard: (typeof STANDARD_HAZARDS)[number], neededRoleKeys: Set<string>): boolean {
  if (!hazard.emphasise) return false;
  return hazard.emphasise.some((k) => neededRoleKeys.has(k));
}

export function buildPciSections(input: PciInput): PciBlock[] {
  const blocks: PciBlock[] = [];
  const add = (b: PciBlock) => blocks.push(b);

  add({ type: "heading1", text: `${input.projectName} — Pre-Construction Information` });
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
    text: "This Pre-Construction Information (PCI) document has been prepared in accordance with the requirements of the Construction (Design and Management) Regulations 2015 (CDM 2015). Its purpose is to provide designers, contractors and other duty holders with relevant and proportionate health and safety information to enable the safe planning, management and delivery of the proposed works. The PCI collates known information relating to the site, the scope of works and the associated risks, and is intended to support the early identification, elimination and reduction of foreseeable hazards so far as is reasonably practicable. The information contained within this document is intended to inform the preparation of the Construction Phase Plan together with suitable risk assessments and method statements (RAMS). This document shall be treated as a live document and reviewed as the design and construction progresses.",
  });
  add({ type: "paragraph", text: scopeSummary(input) });
  add({ type: "heading2", text: "Notification of project" });
  add({ type: "paragraph", text: notificationParagraph(input.worksType) });

  add({ type: "heading1", text: "Project Details" });
  add({ type: "heading2", text: "Description of the Project" });
  add({ type: "paragraph", text: scopeSummary(input) });
  add({ type: "heading2", text: "Site Location and General Environment" });
  add({
    type: "paragraph",
    text: `The works will be undertaken within ${input.clientAuthorityName ?? "the Client Authority's facility"}, a fully operational healthcare facility. The project area is situated within an occupied environment, where patient care activities continue throughout the construction period. Particular consideration must be given to maintaining a safe and secure setting for patients, staff and visitors throughout.`,
  });
  add({ type: "placeholder", text: "Site address to be confirmed by the Project Manager." });
  add({ type: "heading2", text: "Project Timescale" });
  add({
    type: "table",
    header: ["Key event", "Date"],
    rows: [
      ["Anticipated start date", input.earliestTargetStart ? GBDate(input.earliestTargetStart) : "TBC"],
      ["Anticipated completion date", input.latestTargetEnd ? GBDate(input.latestTargetEnd) : "TBC"],
    ],
  });
  add({ type: "heading2", text: "The Project Team" });
  add({
    type: "paragraph",
    text: "The project will be delivered by a multidisciplinary team appointed by the Client in accordance with CDM 2015. The Principal Designer is responsible for planning, managing and monitoring the pre-construction phase and coordinating health and safety matters during the design process. The Principal Contractor is responsible for planning, managing and coordinating the construction phase, including the preparation of the Construction Phase Plan. All members of the project team are required to cooperate, coordinate and share relevant information.",
  });
  if (input.roleAssignments.length > 0) {
    add({
      type: "table",
      header: ["Role", "Name", "Company"],
      rows: input.roleAssignments.map((r) => [r.roleName, r.userName, r.companyName ?? ""]),
    });
  }
  add({ type: "heading2", text: "Ground Conditions" });
  add({ type: "paragraph", text: groundConditionsParagraph(input.worksType) });
  add({ type: "heading2", text: "Extent and location of existing records and plans" });
  add({
    type: "paragraph",
    text: "Existing drawings, asset information and service records relating to the affected area are available; however, the level of detail and accuracy of these records may vary. Contractors should not rely solely on existing drawings for construction purposes — all available records should be reviewed prior to commencement, and verification of existing conditions undertaken on site where necessary. Any discrepancies, omissions or unforeseen conditions identified during the works must be reported to the project team.",
  });

  add({ type: "heading1", text: "Client's Considerations, Planning and Management Requirements" });
  add({ type: "heading2", text: "Client Brief and Safety Goals" });
  add({
    type: "paragraph",
    text: "The project health and safety goals of the Client and the project team are to achieve the following: no accidents on site or in areas adjacent to or associated with the works; no occupational ill health arising from the project; no environmental damage resulting from construction activities; minimise disruption to hospital services, staff, patients and visitors; ensure the construction site is properly secured against unauthorised access at all times; provide safe access and egress for those involved in the project; maintain appropriate infection control measures throughout, given the works take place within a live hospital environment; and ensure all contractors and subcontractors comply with the relevant hospital safety procedures and site rules.",
  });
  add({ type: "heading2", text: "Communication" });
  add({
    type: "paragraph",
    text: "Effective communication between all members of the project team is essential to the safe planning and delivery of the works. The Client, Principal Designer, Principal Contractor and all contractors are required to cooperate and coordinate their activities in accordance with CDM 2015. Regular progress meetings, design coordination meetings and site briefings shall be undertaken throughout the project.",
  });
  add({ type: "heading2", text: "Security of the site" });
  add({
    type: "paragraph",
    text: "The works will be undertaken within an operational healthcare environment, and appropriate site security measures must be implemented at all times. The construction area shall be clearly defined and segregated from operational areas, with access restricted to authorised personnel only.",
  });
  add({ type: "heading2", text: "Welfare provision" });
  add({
    type: "paragraph",
    text: "Suitable welfare facilities shall be provided and maintained for all personnel involved in the project in accordance with Schedule 2 of CDM 2015, including sanitary conveniences, washing facilities, drinking water, rest areas and facilities for changing and storing clothing where necessary.",
  });
  add({ type: "heading2", text: "Overlap with the Client's undertaking and other users of the site" });
  add({
    type: "paragraph",
    text: "The works will be carried out within an operational environment where there will be ongoing interaction between construction activities and the Client's normal operations, including patients, clinical staff, visitors and support services. The Principal Contractor will be required to coordinate closely with the Client to manage access, sequencing and working arrangements, including the use of phased works to minimise disruption.",
  });
  add({ type: "heading2", text: "Client's site rules" });
  add({
    type: "paragraph",
    text: "All works shall be carried out in strict accordance with the Client's site rules and procedures. The Principal Contractor shall ensure that all personnel receive a site-specific induction prior to commencing work, covering access arrangements, security protocols and emergency procedures. Works shall be suspended where non-compliance presents a risk to health and safety or to the continued operation of the hospital.",
  });
  add({ type: "heading2", text: "Client permit-to-work systems" });
  add({
    type: "paragraph",
    text: "Certain construction activities will be subject to the Client's permit-to-work systems to ensure high-risk operations are properly controlled and coordinated with the ongoing operation of the hospital. This includes activities such as electrical isolation, hot works, works on or near live services, and any operations that may impact fire safety or critical building systems. No work requiring a permit shall commence until formal authorisation has been issued by the Client or authorised representative.",
  });
  if (input.isHaiScribeIntensive) {
    add({ type: "heading2", text: "HAI-SCRIBE Requirements and Infection Control Measures" });
    add({
      type: "paragraph",
      text: "This system is rated High infection prevention & control involvement across most of the project lifecycle. The works are being undertaken within a live operational healthcare environment and strict infection prevention and control measures shall be implemented throughout all stages of the project. All contractors and subcontractors shall comply with the agreed HAI-SCRIBE procedures and associated infection control risk assessments applicable to the works, including containment measures, segregation arrangements, cleaning procedures and monitoring regimes.",
    });
  }
  add({ type: "heading2", text: "Fire precautions and emergency procedures" });
  add({
    type: "paragraph",
    text: "The Principal Contractor shall ensure that adequate fire prevention measures and emergency procedures are established and maintained throughout the construction phase. All personnel must be made aware of the site's fire safety procedures, including fire alarm points, escape routes and assembly points. Activities that may present a fire risk, such as hot works, must only be undertaken in accordance with the Client's permit-to-work procedures.",
  });
  add({ type: "heading2", text: "Site Establishment" });
  add({
    type: "paragraph",
    text: "The Principal Contractor is responsible for establishing and managing the construction site in a manner that ensures the safety of the workforce, hospital staff, patients and visitors, with the construction area clearly segregated from operational areas using temporary hoarding, barriers and signage.",
  });
  add({ type: "heading2", text: "HSE Notification" });
  add({ type: "paragraph", text: notificationParagraph(input.worksType) });
  add({ type: "heading2", text: "Smoking Restrictions" });
  add({
    type: "paragraph",
    text: "Smoking, including the use of e-cigarettes or vaping devices, is strictly prohibited within hospital buildings and in any areas designated as non-smoking by the Client. This restriction applies to all contractors, subcontractors, visitors and personnel involved in the project.",
  });

  add({ type: "heading1", text: "Project Health and Safety Hazards" });
  add({
    type: "paragraph",
    text: "The works present a range of potential health and safety hazards that must be carefully considered and managed throughout the construction phase, in addition to the significant risks associated with working within an operational healthcare facility where vulnerable patients, clinical staff and visitors are present. All hazards must be identified, assessed and managed through suitable risk assessments, method statements and site management procedures.",
  });
  for (const hazard of STANDARD_HAZARDS) {
    add({ type: "heading2", text: hazard.heading });
    const emphasised = hazardMatchesProject(hazard, input.neededRoleKeys);
    add({
      type: "paragraph",
      text: emphasised ? `${hazard.text} This hazard is particularly relevant to this project's own scope.` : hazard.text,
    });
  }
  add({ type: "heading2", text: "Asbestos, including results of surveys" });
  add({
    type: "paragraph",
    text: "All available asbestos survey information must be reviewed prior to the commencement of works, and appropriate control measures implemented in accordance with the Control of Asbestos Regulations 2012. If any suspect materials are encountered during the works, all activities in the affected area shall cease immediately and be reported to the Client for further assessment.",
  });
  add({ type: "heading2", text: "Legionella risks from water systems" });
  add({
    type: "paragraph",
    text: "Where the works involve activities within areas where existing water systems are present, there is a potential risk of Legionella growth if systems are not properly managed during the construction period. The Principal Contractor shall coordinate with the Client and relevant facilities management teams to ensure water systems are managed in accordance with applicable guidance, minimising periods of stagnation and implementing flushing/disinfection regimes where required.",
  });
  add({ type: "heading2", text: "Design Hazard and Risk information" });
  add({
    type: "paragraph",
    text: "During the design stage, consideration has been given to the identification and management of potential hazards associated with the proposed works, in accordance with CDM 2015. Designers have sought to eliminate hazards where reasonably practicable and reduce risks through design decisions, planning of construction activities and coordination of interfaces within the existing building.",
  });
  add({ type: "heading2", text: "Residual Design Hazard and Risk information" });
  add({ type: "placeholder", text: PRINCIPAL_DESIGNER_PLACEHOLDER });
  add({ type: "heading2", text: "Method Statements" });
  add({
    type: "paragraph",
    text: "All work sequences must be risk assessed by the contractor carrying out the works. Where a work sequence is found to contain risks or hazards requiring specific control measures, a Method Statement must be formulated by the contractor, including: (1) the item of work; (2) the location, including access and site boundary; (3) duration of the works, including key stages; (4) safety arrangements required; (5) personnel involved — numbers, skills, training and PPE requirements; (6) briefing arrangements for site personnel affected; (7) resources to be used (plant and machinery); (8) detail of how the work will be carried out; (9) detail of temporary works required; (10) risks identified with proposed method of control; (11) emergency arrangements — fire, injury etc.",
  });

  add({ type: "heading1", text: "The Health and Safety File" });
  add({
    type: "paragraph",
    text: "It is the responsibility of the Principal Contractor to provide sufficient information for the Health and Safety File as required by CDM 2015. Key information shall include: a brief description of the work carried out; any hazards not eliminated through the design and construction process (residual hazards) and how they have been addressed; key structural principles and safe working loads; hazardous materials used; information on removal/dismantling of plant and equipment; health and safety information about equipment provided for cleaning or maintaining the structure; the nature, location and markings of significant services; fire strategy; as-built drawings of the building, its plant and equipment; cleaning access and maintenance strategy; and plant maintenance strategy.",
  });

  add({ type: "heading1", text: "Appendix A: Project Directory" });
  if (input.roleAssignments.length > 0) {
    add({
      type: "table",
      header: ["Role", "Name", "Company"],
      rows: input.roleAssignments.map((r) => [r.roleName, r.userName, r.companyName ?? ""]),
    });
  } else {
    add({ type: "placeholder", text: "No roles assigned yet — add the project team on the Team page." });
  }

  add({ type: "heading1", text: "Appendix B: Work Involving Particular Risks" });
  add({
    type: "paragraph",
    text: "Schedule 3 of CDM 2015 lists significant hazards that require specific measures to be taken by the Principal Contractor.",
  });
  add({
    type: "table",
    header: ["Activity", "Comment / Note"],
    rows: [
      [
        "Refurbishment/replacement works within a live healthcare environment",
        "Works to be carefully managed to minimise disruption to patients, staff and visitors, with strict segregation and coordination required.",
      ],
      [
        "Infection control risks",
        "Construction activities may generate dust and contaminants; strict infection control measures, containment and cleaning regimes required.",
      ],
      [
        "Work in proximity to existing services",
        "Electrical, mechanical and plumbing services may be present and must be identified, isolated and protected where required.",
      ],
      [
        "Construction activities generating dust",
        "Dust from drilling, cutting and removal works must be controlled to prevent exposure and contamination.",
      ],
      [
        "Manual handling of materials and equipment",
        "Movement of materials within confined spaces may present handling risks and requires appropriate controls and use of aids.",
      ],
      [
        "Working at height",
        "Activities involving access to elevated areas must be properly planned and carried out using suitable equipment.",
      ],
      [
        "Noise from construction activities",
        "Construction noise may impact hospital operations and must be controlled and managed appropriately.",
      ],
      [
        "Slips, trips and falls",
        "Temporary changes to floor conditions and presence of materials may create hazards within the work area.",
      ],
    ],
  });
  add({ type: "heading2", text: "Further project-specific significant hazards" });
  add({ type: "placeholder", text: PRINCIPAL_DESIGNER_PLACEHOLDER });

  add({ type: "heading1", text: "Appendix C: Construction Phase Plan Criteria" });
  add({
    type: "paragraph",
    text: "Section 1 — General Project Information: description of the project; programme details; details of Client, Principal Designer, Principal Contractor and other consultants; the management structure and responsibilities.",
  });
  add({
    type: "paragraph",
    text: "Section 2 — Management Arrangements: project health and safety aims and goals; the site rules; arrangements to ensure cooperation and coordination between project team members (e.g. regular site meetings); arrangements for involving workers/consultation with the workforce; site induction/training; welfare facilities; fire and emergency procedures (Fire Plan); security arrangements; first aid arrangements; accident/incident reporting and investigating (RIDDOR); monitoring and review of health and safety performance; site plan/traffic management plan; significant safety risks (Schedule 3, CDM 2015); Health and Safety File information.",
  });

  return blocks;
}

export async function renderPciDocx(blocks: PciBlock[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  for (const block of blocks) {
    if (block.type === "heading1") {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 }));
    } else if (block.type === "heading2") {
      children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 }));
    } else if (block.type === "paragraph") {
      children.push(new Paragraph({ text: block.text, spacing: { after: 200 } }));
    } else if (block.type === "placeholder") {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: block.text, italics: true, color: "B45309" })],
          spacing: { after: 200 },
        })
      );
    } else if (block.type === "table") {
      const headerRow = block.header
        ? new TableRow({
            children: block.header.map(
              (h) =>
                new TableCell({
                  children: [new Paragraph({ text: h })],
                  width: { size: 100 / block.header!.length, type: WidthType.PERCENTAGE },
                })
            ),
          })
        : null;
      const dataRows = block.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ text: cell })],
                })
            ),
          })
      );
      children.push(
        new Table({
          rows: headerRow ? [headerRow, ...dataRows] : dataRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
