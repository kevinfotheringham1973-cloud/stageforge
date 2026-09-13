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
] as const;

// See REVIEWABLE_AGENT_DESCRIPTIONS (documentReviewEvidence.ts) for why
// this exists: a PM picking a raw agent slug from a dropdown has no way
// to know what it does.
export const GENERATABLE_AGENT_DESCRIPTIONS: Record<(typeof GENERATABLE_AGENT_SLUGS)[number], string> = {
  "nhs-scotland-sow-generator": "Draft a Statement of Work from a contractor quote (and email recap, if available)",
  "nhs-scotland-business-case-generator": "Draft the Gate 0 case — Business Case, Strategic Brief, or Clinical/Operational Impact Assessment",
  "nhs-scotland-ccn-preparation": "Prepare a CCB/CCN change-control workbook from an agreed Statement of Work and quote",
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

export function isProcurementShapedDeliverable(key: string): boolean {
  return key.includes("procurement_package") || key.includes("tender_documentation");
}

export function defaultGenerationAgentForDeliverable(key: string): (typeof GENERATABLE_AGENT_SLUGS)[number] | undefined {
  if (isBusinessCaseShapedDeliverable(key)) return "nhs-scotland-business-case-generator";
  if (isProcurementShapedDeliverable(key)) return "nhs-scotland-sow-generator";
  return undefined;
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
