/**
 * SharePoint/OneDrive item names disallow " * : < > ? / \ | and can't be
 * just "." or "..". A project name, stage name, or uploaded file name is
 * free text (a PM types the project/stage name; a browser supplies the
 * file name) — sanitizing each one here, before it's joined into a path,
 * means a value containing "/" or ".." can't inject an extra path
 * segment or escape the folder it's meant to land in. Shared by
 * sharepoint.ts and localEvidenceStorage.ts — nothing downstream should
 * split/rejoin the result, build every path through this.
 */
export function sanitizePathSegment(segment: string): string {
  const cleaned = segment.replace(/["*:<>?/\\|]/g, "-").trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "_" : cleaned;
}
