// Phase 5 extended (PRD.html §06/§09) — the same real-SharePoint-vs-local-
// vs-stub resolution documentReviewEvidence.ts already does for a single
// review's evidence/report, generalised here for a generation request's
// multiple source files and one draft result. Deliberately its own file
// rather than added to actions.ts — this has no "use server" / form-action
// shape, it's plain library code the new document-generation API routes
// call directly.
import { isSharePointConfigured, downloadEvidenceFile, uploadEvidenceFile, evidenceFolderPath } from "./sharepoint";
import {
  isLocalEvidenceStorageEnabled,
  localEvidenceFolderPath,
  readLocalEvidenceFile,
  saveLocalEvidenceFile,
} from "./localEvidenceStorage";

type ProjectRef = { name: string; projectNumber: string };

// Only the multi-document DRAFTING agents belong here — shaped "several
// documents in, one new draft out." The single-document reviewers
// (nhs-scotland-rams-review et al.) stay on documentReviewEvidence.ts's
// REVIEWABLE_AGENT_SLUGS; the Q&A/guidance agents (hardfm-compliance,
// ipc-haiscribe, lifecycle-handback, netzero-energy, pfi-paymech) don't take
// a document at all and are out of scope for either bridge. Lives here, not
// in actions.ts, for the same "a 'use server' file may only export async
// functions" build constraint documentReviewEvidence.ts's own header notes.
export const GENERATABLE_AGENT_SLUGS = [
  "nhs-scotland-sow-generator",
  "nhs-scotland-business-case-generator",
  "nhs-scotland-ccn-preparation",
  "nhs-scotland-project-brief-generator",
  "nhs-scotland-execution-plan-generator",
  "nhs-scotland-wsg-sbar-generator",
  "nhs-scotland-risk-register-generator",
] as const;

// See REVIEWABLE_AGENT_DESCRIPTIONS (documentReviewEvidence.ts) for why
// this exists: a PM picking a raw agent slug from a dropdown has no way
// to know what it does.
export const GENERATABLE_AGENT_DESCRIPTIONS: Record<(typeof GENERATABLE_AGENT_SLUGS)[number], string> = {
  "nhs-scotland-sow-generator": "Draft a Statement of Work from a contractor quote (and email recap, if available)",
  "nhs-scotland-business-case-generator": "Draft the Gate 0 case — Business Case, Strategic Brief, or Clinical/Operational Impact Assessment",
  "nhs-scotland-ccn-preparation": "Prepare a CCB/CCN change-control workbook from an agreed Statement of Work and quote",
  "nhs-scotland-project-brief-generator": "Draft the Gate 1 Project Brief from the accepted Gate 0 case and any condition survey on file",
  "nhs-scotland-execution-plan-generator": "Draft the Project Execution Plan & procurement strategy from the accepted Gate 0 case",
  "nhs-scotland-wsg-sbar-generator": "Draft the formal SBAR submission to the Water Safety Group from the case and condition/risk evidence on file",
  "nhs-scotland-risk-register-generator": "Draft the Expanded Risk Register from the accepted Gate 0 case, condition evidence, and the project's real Team & Scope roster",
};

/**
 * A deliverable's own key already says what kind of document it is
 * (business-case-shaped, procurement-shaped, ...) across every template in
 * the library -- same deterministic key-matching idiom as isPciDeliverable
 * (GateDetail.tsx) and the CDM/HAI-SCRIBE tag logic (lib/cdm.ts). Used to
 * PRE-SELECT the right agent as this dropdown's default, not to remove the
 * other options -- a PM can still override. Not a smarter/LLM picker: this
 * stays a deterministic rule, same boundary as every other "relay and
 * recorder, never a decision-maker" choice in this bridge.
 *
 * Found live 13 Sep 2026, fire-testing project #30004: sow-generator
 * DID run successfully against a Business Case deliverable fed only a
 * contractor quote -- but business-case-generator's own output on the
 * same evidence rated its justification strength "Weak/Mixed" and named
 * the quote as the wrong evidence type for a Gate 0 case, recommending
 * sow-review/sow-generator instead. A quote is genuinely Gate 1+
 * (pre-contract) evidence; defaulting business-case-shaped deliverables
 * to business-case-generator (sourced from inspection/PPM/condition
 * evidence, not a quote) and procurement-shaped ones to sow-generator
 * is what that finding actually implies.
 */
export function isBusinessCaseShapedDeliverable(key: string): boolean {
  return key.includes("business_case") || key.includes("strategic_brief") || key.includes("operational_impact_assessment");
}

// Widened 13 Sep 2026, fire-testing Gates 0-4: "Detailed Scope of Works" and
// "Obtain and submit competitive quotations (with PPM documentation)" are
// both genuinely SOW-shaped (confirmed shared literal keys across every
// template in seed.ts) but fell through to the manual dropdown because the
// original two substrings were too narrow -- not a new agent, just an
// under-matched existing one.
export function isProcurementShapedDeliverable(key: string): boolean {
  return (
    key.includes("procurement_package") ||
    key.includes("tender_documentation") ||
    key.includes("detailed_scope_of_works") ||
    key.includes("quotations_submission_and_ppm")
  );
}

// Every template's Gate 1 Project Brief is "del.<system>_project_brief"
// (confirmed by grep across all 28 templates in seed.ts) -- translates an
// accepted Gate 0 case into design scope, same "thin, hedged" posture as
// business-case-generator, not a new kind of judgment call.
export function isProjectBriefShapedDeliverable(key: string): boolean {
  return key.includes("project_brief");
}

// One shared literal key across every template.
export function isExecutionPlanShapedDeliverable(key: string): boolean {
  return key.includes("project_execution_plan");
}

// SBAR (Situation-Background-Assessment-Recommendation) is a defined SHTM
// 04-01 Part B document format -- confirmed on both the water and boiler
// templates (any system with a domestic hot/cold water angle), not water-only.
export function isWsgSbarShapedDeliverable(key: string): boolean {
  return key.includes("sbar_submission_to_wsg");
}

// Every template's own risk-register deliverable key ends
// "_expanded_risk_register" (see riskRegisterDraft.ts's own header comment
// -- it never got canonicalized to a shared key because the standard risk
// *categories* genuinely differ by discipline). 17 Sep 2026: added
// alongside nhs-scotland-risk-register-generator so this deliverable stops
// defaulting to the bare "Choose an agent..." dropdown, same reasoning as
// every other positive matcher above.
export function isRiskRegisterShapedDeliverable(key: string): boolean {
  return key.endsWith("expanded_risk_register");
}

export function defaultGenerationAgentForDeliverable(key: string): (typeof GENERATABLE_AGENT_SLUGS)[number] | undefined {
  if (isBusinessCaseShapedDeliverable(key)) return "nhs-scotland-business-case-generator";
  if (isProcurementShapedDeliverable(key)) return "nhs-scotland-sow-generator";
  if (isProjectBriefShapedDeliverable(key)) return "nhs-scotland-project-brief-generator";
  if (isExecutionPlanShapedDeliverable(key)) return "nhs-scotland-execution-plan-generator";
  if (isWsgSbarShapedDeliverable(key)) return "nhs-scotland-wsg-sbar-generator";
  if (isRiskRegisterShapedDeliverable(key)) return "nhs-scotland-risk-register-generator";
  return undefined;
}

// The inverse question: deliverables where "Generate draft with AI" should
// never appear at all, not just lack a default agent. Found live 13 Sep
// 2026, auditing every water-template deliverable through Gate 4 -- past
// Gate 1 most remaining items are drawings/engineering coordination
// (concept design options, schematics, coordinated layout), a deliverable
// whose evidence genuinely IS the source document rather than something
// drafted from others (condition surveys), or an external decision the
// project receives rather than produces (WSG written approval, and any
// high-stakes item already carrying a bypassAuthority for a signed
// professional sign-off, e.g. Designer's Risk Assessment, fire
// compartmentation). Kevin's own framing: the goal was never AI drafting
// every deliverable -- this list is as much a part of "deliberate coverage"
// as the positive matchers above, not an afterthought.
const NEVER_AI_DRAFTABLE_KEY_PATTERNS: RegExp[] = [
  /coordinated_layout/,
  /mep_structural_coordination/,
  /concept_design_report/,
  /preliminary_schematics/,
  /outline_system_strategy/,
  /condition_surveys?/,
  /written_approval/,
  /design_risk_assessment_signed/,
  /fire_compartmentation/,
];

export function isNeverAiDraftableDeliverable(key: string): boolean {
  return NEVER_AI_DRAFTABLE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

// Relevance gating for the oversight panel (added 13 Sep 2026, same day as
// the panel itself) -- found live on the very first real test: consulting
// all five agents on a cold-water-tank project hit a genuine Claude session
// rate limit (six sequential agent calls for one request), and
// nhs-scotland-netzero-energy's own real answer confirmed it was low-value
// for this project ("doesn't apply here... secondary... small candidate").
// Deterministic, not a smarter picker -- checks the PROJECT's own
// Template.matchKeywords (the same data provisioning/project-creation
// already matches against), same idiom as isBusinessCaseShapedDeliverable
// above. Only net-zero is gated for now: compliance, PFI/paymech, and
// lifecycle/handback are broadly relevant to any Gate 0 case regardless of
// system type, and IPC/HAI-SCRIBE's own answer showed excluding it risks
// missing a genuine clinical-risk flag more often than asking it costs --
// the wrong tradeoff to make just to save a call. Narrow further only with
// the same kind of real evidence that justified this first cut.
const ENERGY_RELEVANT_TEMPLATE_KEYWORDS = [
  "boiler",
  "heating plant",
  "bms",
  "building management system",
  "building automation",
  "chiller",
  "chilled water",
  "cooling system",
  "electrical replacement",
  "generator",
  "switchgear",
  "led",
  "lighting",
  "solar",
  "heat pump",
  "net zero",
  "renewable energy",
  "bess",
  "ev charging",
  "steam",
] as const;

export function isEnergyRelevantTemplate(matchKeywords: string[]): boolean {
  const haystack = matchKeywords.join(" ").toLowerCase();
  return ENERGY_RELEVANT_TEMPLATE_KEYWORDS.some((kw) => haystack.includes(kw));
}

/**
 * Downloads one SUBMITTED source EvidenceFile's real bytes for the AI
 * Council to draft from. Returns null (never throws for this specific case)
 * when the record is the inert dev-upload stub — there is genuinely no real
 * file behind it, and the caller turns that into a clean, honest API
 * response rather than a 500. Source files may belong to a different
 * Deliverable/Gate than the request's target, so the project/stage context
 * for each one is resolved by the caller per-file, not assumed to match the
 * target deliverable's own.
 */
export async function downloadRealSourceBytes(
  fileRef: string,
  fileName: string,
  project: ProjectRef,
  stageName: string
): Promise<Buffer | null> {
  if (fileRef.startsWith("local://dev-upload/")) return null;

  if (isSharePointConfigured()) {
    return downloadEvidenceFile(evidenceFolderPath(project, stageName), fileName);
  }
  if (isLocalEvidenceStorageEnabled()) {
    return readLocalEvidenceFile(localEvidenceFolderPath(project, stageName), fileName);
  }
  return null;
}

/**
 * Uploads a generated draft using the same storage branch a real evidence
 * upload would use — the draft ends up alongside the TARGET deliverable's
 * own evidence (that deliverable's own project/stage, not any individual
 * source file's), just as a separate file.
 */
export async function uploadGeneratedDraft(
  fileName: string,
  content: Buffer,
  project: ProjectRef,
  stageName: string
): Promise<{ fileRef: string }> {
  if (isSharePointConfigured()) {
    const uploaded = await uploadEvidenceFile(evidenceFolderPath(project, stageName), fileName, content);
    return { fileRef: uploaded.webUrl };
  }
  if (isLocalEvidenceStorageEnabled()) {
    const { servePath } = await saveLocalEvidenceFile(localEvidenceFolderPath(project, stageName), fileName, content);
    return { fileRef: servePath };
  }
  return { fileRef: `local://dev-upload/${fileName}` };
}
