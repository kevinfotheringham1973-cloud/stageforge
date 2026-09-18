// CDM 2015 appointment-form auto-draft generator (18 Sep 2026) — the
// third "auto-filled deliverable draft" after PCI and the Risk Register
// (documentTemplateRoadmap.ts). Structure and wording are generalised from
// a real Serco "Form of Appointment for Principal Contractor (CDM 2015)"
// — genericised for reuse: the FM Contractor's name is pulled from the
// project's own real role assignment (same field pciDraft.ts already
// uses), never hardcoded to any one company, so this works the same way
// for whichever FM Contractor holds that role on a given project.
//
// Covers both Reg 5(1) appointments this app already tracks as separate
// compliance requirements (comp.cdm_principal_designer_appointed at Gate
// 1, comp.cdm_principal_contractor_appointed at Gate 4) — same form
// shape, different regulation subsection and appointee.
//
// Deliberately produces a BLANK, unsigned draft, same boundary as the
// Risk Register generator: signature/acceptance fields are never filled
// in, because an appointment is only real evidence once the actual
// Client representative and appointee have really signed it — this is
// paperwork prepared for signature, not evidence of one having happened.
//
// This module only builds the block content (buildCdmAppointmentBlocks)
// and renders it via docDraft.ts's shared renderer — the route handler
// (src/app/api/projects/[projectNumber]/cdm-appointment-draft/route.ts)
// owns loading data and serving the file.
import type { DraftBlock } from "./docDraft";
export { renderDraftDocx as renderCdmAppointmentDocx } from "./docDraft";

export type CdmAppointmentRole = "PRINCIPAL_DESIGNER" | "PRINCIPAL_CONTRACTOR";

const ROLE_COPY: Record<CdmAppointmentRole, { label: string; regSubsection: string; duty: string }> = {
  PRINCIPAL_DESIGNER: {
    label: "Principal Designer",
    regSubsection: "5(1)(a)",
    duty: "plan, manage, monitor and coordinate health and safety in the pre-construction phase",
  },
  PRINCIPAL_CONTRACTOR: {
    label: "Principal Contractor",
    regSubsection: "5(1)(b)",
    duty: "plan, manage, monitor and coordinate health and safety in the construction phase",
  },
};

export type CdmAppointmentInput = {
  projectName: string;
  projectNumber: string;
  role: CdmAppointmentRole;
  fmContractorName: string | null;
  appointeeName: string | null;
  leadOfficerRoleLabel: string;
  leadOfficerName: string;
};

const GBDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

export function buildCdmAppointmentBlocks(input: CdmAppointmentInput): DraftBlock[] {
  const { label, regSubsection, duty } = ROLE_COPY[input.role];
  const fmContractor = input.fmContractorName ?? "[FM Contractor name — not yet assigned on Team & Scope]";
  const appointee = input.appointeeName ?? `[${label} name — not yet assigned on Team & Scope]`;

  return [
    { type: "heading1", text: `Form of Appointment for ${label} (CDM 2015)` },
    {
      type: "paragraph",
      text: `This document to be used to appoint a ${label} where more than one contractor is or will be working on the project at any one time.`,
    },
    {
      type: "table",
      rows: [
        ["Date", ""],
        ["Project", `${input.projectName} (Project #${input.projectNumber})`],
        ["To", appointee],
      ],
    },
    {
      type: "paragraph",
      text:
        `In accordance with the requirements of Regulation ${regSubsection} of The Construction (Design and Management) ` +
        `Regulations 2015 and in my capacity as CDM Client or Client's representative (on behalf of ${fmContractor}) ` +
        `I hereby appoint ${appointee} as ${label} for the ${input.projectName} project.`,
    },
    {
      type: "paragraph",
      text: `As ${label} you will be expected to ${duty}, and to abide by the CDM Regulations at all times.`,
    },
    { type: "heading2", text: "Client-side lead officer" },
    {
      type: "table",
      header: ["Name", "Role", "Signature", "Date"],
      rows: [[input.leadOfficerName, input.leadOfficerRoleLabel, "", ""]],
    },
    {
      type: "paragraph",
      text: "Please return a duly signed copy of this form as acknowledgement and acceptance of this statutory appointment.",
    },
    { type: "heading2", text: "Acceptance" },
    {
      type: "table",
      rows: [
        ["Signature", ""],
        ["Name", appointee],
        ["Appointment", ""],
        ["Address", ""],
      ],
    },
    {
      type: "placeholder",
      text:
        "Draft — StageForge-generated template. Not a signed or accepted appointment until both the Client-side lead " +
        "officer and the appointee have actually signed it; upload the signed copy as the real compliance evidence.",
    },
  ];
}
