/**
 * Local-disk evidence storage — the desktop build's replacement for
 * SharePoint (sharepoint.ts), and (via STAGEFORGE_ENABLE_LOCAL_EVIDENCE,
 * see below) also usable as a cloud-deployment fallback for real
 * end-to-end testing of the evidence-consuming AI Council bridges before
 * a real SharePoint site exists. Mirrors sharepoint.ts's shape
 * (folder-path builder + upload function) so actions.ts's
 * resolveEvidenceUploads just gets a third branch, not a rewrite.
 *
 * Layout on disk: one folder per project, one subfolder per gate/stage —
 * <evidence root>/<Project Name (Number)>/<Stage name>/<file>. Served
 * back out through /api/evidence/local/[...segments] (auth-gated same as
 * every other page — see that route).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { sanitizePathSegment } from "./pathSafety";

/**
 * Deliberately a SEPARATE flag from STAGEFORGE_LOCAL_MODE, not folded into
 * it — that flag also silently auto-co-signs compliance items
 * (autoCoSignForLocalMode, actions.ts) and disables admin view-as
 * (setViewAsUser, actions.ts), both correct for the single-user desktop
 * build but a real regression if enabled on the live multi-user cloud
 * site. This flag turns on ONLY real file storage, nothing else, so it's
 * safe to set on the cloud deployment for genuine evidence-upload/AI
 * Council testing without touching either of those behaviors.
 */
export function isLocalEvidenceStorageEnabled(): boolean {
  return process.env.STAGEFORGE_LOCAL_MODE === "1" || process.env.STAGEFORGE_ENABLE_LOCAL_EVIDENCE === "1";
}

/**
 * Electron (main.js) sets STAGEFORGE_EVIDENCE_DIR to a per-OS user-data
 * folder outside the repo/install directory. Falls back to a repo-local
 * folder for `npm run dev` local-mode testing without Electron — kept
 * out of git (see .gitignore) same as any other local data.
 */
function evidenceRootDir(): string {
  return process.env.STAGEFORGE_EVIDENCE_DIR ?? path.join(process.cwd(), ".local-evidence");
}

export function localEvidenceFolderPath(
  project: { name: string; projectNumber: string },
  stageName: string
): string {
  return [`${project.name} (${project.projectNumber})`, stageName].map(sanitizePathSegment).join("/");
}

/**
 * folderPath must come from localEvidenceFolderPath() — same contract as
 * sharepoint.ts's uploadEvidenceFile. fileName is sanitized here too
 * (unlike the SharePoint path, a disk write has no encodeURIComponent
 * step protecting it) — without that, a file named e.g. "../../evil"
 * could write outside the project/stage folder entirely.
 */
export async function saveLocalEvidenceFile(
  folderPath: string,
  fileName: string,
  content: Buffer
): Promise<{ servePath: string }> {
  const segments = folderPath.split("/").map(sanitizePathSegment);
  const safeFileName = sanitizePathSegment(fileName);

  // turbopackIgnore: evidenceRootDir() is runtime-configured (env var),
  // not a path Turbopack can trace statically — without the ignore
  // comment its build-time tracer conservatively bundles the entire
  // project as a "might be needed" dependency of this route.
  const dir = path.join(/* turbopackIgnore: true */ evidenceRootDir(), ...segments);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, safeFileName), content);

  const servePath = "/api/evidence/local/" + [...segments, safeFileName].map(encodeURIComponent).join("/");
  return { servePath };
}

/**
 * Reads a file's bytes back off local disk — the local-mode counterpart to
 * sharepoint.ts's downloadEvidenceFile(), used by the Phase 5 document-
 * review bridge. folderPath must come from localEvidenceFolderPath(), same
 * contract as saveLocalEvidenceFile(). Returns null rather than throwing
 * when the file genuinely isn't there (caller turns that into a clean,
 * honest "no real evidence file exists for this record" response).
 */
export async function readLocalEvidenceFile(folderPath: string, fileName: string): Promise<Buffer | null> {
  const segments = folderPath.split("/").map(sanitizePathSegment);
  const safeFileName = sanitizePathSegment(fileName);
  const filePath = path.join(/* turbopackIgnore: true */ evidenceRootDir(), ...segments, safeFileName);
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Deletes a file previously saved via saveLocalEvidenceFile. Not wired to
 * any product action (no "delete evidence" feature exists) — exists only
 * so the permanent smoke test can clean up the real file it saves to
 * verify the Phase 5 document-review bridge in a non-SharePoint dev
 * environment, same justification as sharepoint.ts's own deleteEvidenceFile.
 */
export async function deleteLocalEvidenceFile(folderPath: string, fileName: string): Promise<void> {
  const segments = folderPath.split("/").map(sanitizePathSegment);
  const safeFileName = sanitizePathSegment(fileName);
  const filePath = path.join(/* turbopackIgnore: true */ evidenceRootDir(), ...segments, safeFileName);
  await fs.unlink(filePath).catch(() => {});
}

/** Used only by the serving route — resolves and bounds-checks a request path against the same root. */
export function resolveLocalEvidencePath(segments: string[]): string | null {
  if (segments.some((s) => s === ".." || s.includes("/") || s.includes("\\"))) return null;

  const root = path.resolve(/* turbopackIgnore: true */ evidenceRootDir());
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;

  return resolved;
}
