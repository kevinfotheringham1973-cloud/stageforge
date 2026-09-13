// Phase 5 of the Project Managed System build (PRD.html §06/§09) — the
// same real-SharePoint-vs-local-vs-stub resolution actions.ts's
// resolveEvidenceUploads() already does for uploads, mirrored here for
// downloads (and, for the review report, an upload using the exact same
// branching). Deliberately its own file rather than added to actions.ts —
// this has no "use server" / form-action shape, it's plain library code
// the new document-review API routes call directly.
import { isSharePointConfigured, downloadEvidenceFile, uploadEvidenceFile, evidenceFolderPath } from "./sharepoint";
import {
  isLocalEvidenceStorageEnabled,
  localEvidenceFolderPath,
  readLocalEvidenceFile,
  saveLocalEvidenceFile,
} from "./localEvidenceStorage";

type ProjectRef = { name: string; projectNumber: string };

// Only the nhs-scotland-* agents shaped as "one document in, one report
// out" are eligible. The Q&A/guidance agents (hardfm-compliance,
// ipc-haiscribe, lifecycle-handback, netzero-energy, pfi-paymech) don't
// take a document at all, and the multi-document drafting agent
// (ccn-preparation, which needs a SOW+quote pair) doesn't fit a single-
// EvidenceFile request either — both deliberately excluded from this
// bridge for now, not an oversight. Lives here, not in actions.ts, because
// a "use server" file may only export async functions — a plain const
// export breaks Next's build (found live in CI, not by `tsc --noEmit`,
// which doesn't enforce that constraint).
export const REVIEWABLE_AGENT_SLUGS = [
  "nhs-scotland-rams-review",
  "nhs-scotland-sow-review",
  "nhs-scotland-inspection-review",
  "nhs-scotland-cdm-review",
  "nhs-scotland-sfg20-mapping-review",
] as const;

// A PM choosing an agent from a dropdown has no way to know what these
// slugs mean -- found live 13 Sep 2026 while walking a real project
// through the bridge. Plain-language, not a smarter picker: this stays a
// human decision (see this bridge's "relay and recorder, never a
// decision-maker" boundary), just an informed one.
export const REVIEWABLE_AGENT_DESCRIPTIONS: Record<(typeof REVIEWABLE_AGENT_SLUGS)[number], string> = {
  "nhs-scotland-rams-review": "Review a contractor's Risk Assessment/Method Statement for real hospital-specific awareness",
  "nhs-scotland-sow-review": "Review a contractor's quotation/Statement of Work for technical, compliance and commercial gaps",
  "nhs-scotland-inspection-review": "Review an inspection/condition report and prioritise findings by real-world consequence",
  "nhs-scotland-cdm-review": "Review a CDM 2015 Pre-Construction Information or Construction Phase Plan document",
  "nhs-scotland-sfg20-mapping-review": "Compare actual PPM/CAFM maintenance records against the SFG20 benchmark schedule",
};

/**
 * Downloads a SUBMITTED EvidenceFile's real bytes for the AI Council to
 * review. Returns null (never throws for this specific case) when the
 * record is the inert dev-upload stub — there is genuinely no real file
 * behind it, and the caller turns that into a clean, honest API response
 * rather than a 500.
 */
export async function downloadRealEvidenceBytes(
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
 * Uploads a generated review report using the same storage branch a real
 * evidence upload would use — the report ends up right alongside the
 * evidence it reviewed (same evidenceFolderPath), just as a separate file.
 */
export async function uploadReviewReport(
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
