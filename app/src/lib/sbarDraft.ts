// WSG SBAR blank-template generator (18 Sep 2026) — the fourth
// "auto-filled deliverable draft" after PCI, the Risk Register, and the
// CDM appointment form. Unlike those three, this one carries no
// project-specific auto-filled content at all (no real evidence exists
// yet the way a condition survey or a roster does) — it's a structural
// skeleton only, every section a prompt for the PM/Compliance Officer to
// fill in. (`nhs-scotland-wsg-sbar-generator`, the AI-drafting path for
// this same deliverable, is where real evidence gets synthesised into an
// actual draft — this generator is the "no AI available, or want a blank
// starting point" fallback, same relationship the Risk Register's two
// paths already have.)
//
// Structure is generalised from two independent real Serco/FVRH SBAR
// submissions to the same governance body — one water-system (cold water
// storage tank replacement), one ventilation (AHU frost coil replacement)
// — confirming the S/B/A/R shape and the Supporting Detail companion
// document's recurring categories hold across genuinely different
// systems. No fact, contractor name, or figure from either real example
// appears here — only the structural prompts both independently used.
import type { DraftBlock } from "./docDraft";
export { renderDraftDocx as renderSbarDocx } from "./docDraft";

export type SbarInput = {
  projectName: string;
  projectNumber: string;
  generatedDate: Date;
};

const GBDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
const PROMPT = (text: string): DraftBlock => ({ type: "placeholder", text });

export function buildSbarBlocks(input: SbarInput): DraftBlock[] {
  return [
    { type: "heading1", text: "SBAR – Water Safety Group Submission" },
    PROMPT("[One-line project/system identifier — e.g. \"Replacement of X – <site>\"]"),
    {
      type: "table",
      rows: [["To / From / Date", `Water Safety Group, [relevant AP/AE/IPC roles for this system]  |  [Project Team]  |  ${GBDate(input.generatedDate)}`]],
    },
    { type: "heading2", text: "S — Situation" },
    PROMPT(
      "One paragraph: the real problem (cite the evidence it's drawn from), the proposed contractor/approach if one is genuinely " +
        "appointed, and what this SBAR is actually asking the Water Safety Group to do — usually to endorse a plan so a further " +
        "step (a site walk, a structural survey, a detailed programme) can proceed, not to approve completed works."
    ),
    { type: "heading2", text: "B — Background" },
    PROMPT(
      "The real scope, tied to an actual quote/contract reference if one exists. The specific operational/commercial positions " +
        "already agreed at a real project meeting, if one has happened — cite it, never invent a meeting or its agreements."
    ),
    { type: "heading2", text: "A — Assessment" },
    PROMPT(
      "Ties the scope back to why the proposed approach suits a live/occupied hospital. Name explicitly whatever clinical-sensitive " +
        "question the evidence hasn't yet resolved (e.g. which specific assets/areas serve a clinically vulnerable area, or a " +
        "continuity-of-supply gap) — don't bury this. Point to the Supporting Detail companion document for fuller technical depth " +
        "rather than duplicating it here."
    ),
    { type: "heading2", text: "R — Recommendation" },
    PROMPT(
      "A bulleted list of the SPECIFIC things the Water Safety Group is asked to endorse — never one vague \"approve this\" line. " +
        "Typically: the commercial/scope basis; a technical/compliance framing point (stated as compliance, not a separate design " +
        "change, where that's genuinely true); a requirement for a further step (site walk/survey) before the programme is " +
        "finalised; the specific clinical-risk action still needed; an indicative timeline (real figures only — mark anything else " +
        "[TO CONFIRM]); a commercial/contract-terms note; an open invitation for the Group to raise any further local requirement " +
        "or hold point."
    ),
    PROMPT(
      "Next step: name what the Group's decision actually unlocks, and the real urgency driving it (a statutory deadline, a " +
        "programme window) if one genuinely exists."
    ),
    { type: "placeholder", text: "Draft — complete every prompt above from real project evidence before submission. See the Supporting Detail companion document for the fuller technical version." },
  ];
}

export function buildSbarSupportingDetailBlocks(input: SbarInput): DraftBlock[] {
  return [
    { type: "heading1", text: "Supporting Detail" },
    PROMPT("[Project/system name]"),
    { type: "paragraph", text: "Companion to the one-page SBAR — for Water Safety Group reference." },
    {
      type: "table",
      rows: [
        ["Project", input.projectName],
        ["Project number", input.projectNumber],
        ["Date", GBDate(input.generatedDate)],
      ],
    },
    { type: "heading2", text: "1. Scope Summary" },
    PROMPT("The real assets/areas affected, named as specifically as the evidence allows — don't generalise where a specific reference exists."),
    { type: "heading2", text: "2. Technical/Compliance Specification Position" },
    PROMPT("If a specific standard is being met (e.g. an SHTM reference), state it and whether it's being met as-is or requires a genuine design change. Omit this section if it doesn't apply."),
    { type: "heading2", text: "3. Commercial/Consumables Position" },
    PROMPT("Any commercial or ongoing-consumable position agreed at a real project meeting — cite it. Omit if nothing of this kind exists yet."),
    { type: "heading2", text: "4. Site Walk / Survey and Programme" },
    PROMPT("What the further step (site walk, survey) will actually establish. Real lead-time/duration figures where they exist — mark anything else [TO CONFIRM], never estimate by analogy with a different project."),
    { type: "heading2", text: "5. Safety / Isolation Liaison" },
    PROMPT("Who arranges isolations, flushing, or equivalent safety-critical coordination, and when. Omit if not applicable to this system."),
    { type: "heading2", text: "6. Clinical Sensitivity / IPC" },
    PROMPT("The fullest, most specific version of the SBAR's own Assessment flag — name exactly what's unconfirmed about clinically vulnerable areas this work affects."),
    { type: "heading2", text: "7. Commercial and Contract Terms" },
    PROMPT("Value, retention, insurance, contract form — only if genuinely known. Omit rather than guess."),
    { type: "heading2", text: "8. Personnel and Access" },
    PROMPT("PVG or equivalent personnel-vetting requirements, if applicable to this project's contractor access."),
    { type: "placeholder", text: "Draft — complete only the sections that genuinely apply to this project; delete the rest rather than leaving them blank." },
  ];
}
