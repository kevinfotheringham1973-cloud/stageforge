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
