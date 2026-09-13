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
