/**
 * Microsoft Graph API client for evidence storage in SharePoint —
 * app-only (client credentials) auth, no user sign-in involved.
 * Inactive until the AZURE_ and SHAREPOINT_ env vars are set (see .env.example);
 * evidence upload stays the dev stub (recordEvidenceStub in actions.ts)
 * until this is wired in and a real SharePoint site is configured.
 */

import { sanitizePathSegment } from "./pathSafety";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export function isSharePointConfigured(): boolean {
  return Boolean(
    process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET &&
      process.env.SHAREPOINT_SITE_ID &&
      process.env.SHAREPOINT_DRIVE_ID
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("SharePoint isn't configured — missing AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET.");
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Graph token request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

/**
 * Where a project/gate's evidence lives in SharePoint — kept in sync
 * with the read-only preview shown in GateDetail.tsx (sharePointFolderPath
 * there) so the two never drift apart once real upload replaces the stub.
 */
export function evidenceFolderPath(project: { name: string; projectNumber: string }, stageName: string): string {
  return ["StageForge", `${project.name} (${project.projectNumber})`, stageName].map(sanitizePathSegment).join("/");
}

/**
 * Uploads a file to the configured SharePoint drive. Graph creates any
 * missing folders in the path automatically via this endpoint. Files
 * over 4MB need the resumable upload-session API instead — out of
 * scope until evidence files are actually large enough to need it.
 *
 * folderPath must come from evidenceFolderPath() (or otherwise be
 * pre-sanitized per-segment) — this function trusts its "/" characters
 * are real segment boundaries, not raw user input.
 */
export async function uploadEvidenceFile(
  folderPath: string,
  fileName: string,
  content: Buffer | Blob
): Promise<{ id: string; webUrl: string }> {
  const siteId = process.env.SHAREPOINT_SITE_ID;
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  if (!siteId || !driveId) {
    throw new Error("SharePoint isn't configured — missing SHAREPOINT_SITE_ID/SHAREPOINT_DRIVE_ID.");
  }

  const token = await getAccessToken();
  const encodedPath = folderPath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const url = `${GRAPH_BASE}/sites/${siteId}/drives/${driveId}/root:/${encodedPath}/${encodeURIComponent(fileName)}:/content`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: content as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`SharePoint upload failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Downloads a file's bytes from the configured SharePoint drive. Used by
 * the Phase 5 document-review bridge (PRD.html §06/§09) to fetch a real
 * evidence file's content for the AI Council mailbox pipeline to review —
 * folderPath + fileName must be exactly what uploadEvidenceFile() was
 * originally called with (EvidenceFile only ever persists the resulting
 * webUrl, not the Graph item id, so re-deriving the same path is how this
 * finds the file again rather than needing a new stored id).
 */
export async function downloadEvidenceFile(folderPath: string, fileName: string): Promise<Buffer> {
  const siteId = process.env.SHAREPOINT_SITE_ID;
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  if (!siteId || !driveId) {
    throw new Error("SharePoint isn't configured — missing SHAREPOINT_SITE_ID/SHAREPOINT_DRIVE_ID.");
  }

  const token = await getAccessToken();
  const encodedPath = folderPath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const url = `${GRAPH_BASE}/sites/${siteId}/drives/${driveId}/root:/${encodedPath}/${encodeURIComponent(fileName)}:/content`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`SharePoint download failed: ${res.status} ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Deletes a file from the configured SharePoint drive. Not wired to any
 * product action yet (no "delete evidence" feature exists) — exists only
 * so the permanent smoke test can clean up the real file it uploads to
 * verify the Phase 5 document-review bridge, rather than leaving test
 * debris in a real SharePoint site on every run. Swallows failure (best-
 * effort cleanup only) rather than letting a cleanup problem mask the
 * actual test result.
 */
export async function deleteEvidenceFile(folderPath: string, fileName: string): Promise<void> {
  const siteId = process.env.SHAREPOINT_SITE_ID;
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  if (!siteId || !driveId) return;
  try {
    const token = await getAccessToken();
    const encodedPath = folderPath
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const url = `${GRAPH_BASE}/sites/${siteId}/drives/${driveId}/root:/${encodedPath}/${encodeURIComponent(fileName)}`;
    await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // best-effort — see header comment
  }
}

/**
 * Setup-time helper: resolves a SharePoint site's Graph Site ID from its
 * URL, and lists its document libraries (drives) with their Drive IDs.
 * Run via `npm run sharepoint:check -- <site-url>` once a real site
 * exists, to get the values for SHAREPOINT_SITE_ID / SHAREPOINT_DRIVE_ID.
 */
export async function resolveSite(siteUrl: string): Promise<{
  siteId: string;
  drives: { id: string; name: string }[];
}> {
  const token = await getAccessToken();
  const url = new URL(siteUrl);

  const siteRes = await fetch(`${GRAPH_BASE}/sites/${url.hostname}:${url.pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!siteRes.ok) {
    throw new Error(`Site lookup failed: ${siteRes.status} ${await siteRes.text()}`);
  }
  const site = (await siteRes.json()) as { id: string };

  const drivesRes = await fetch(`${GRAPH_BASE}/sites/${site.id}/drives`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!drivesRes.ok) {
    throw new Error(`Drive lookup failed: ${drivesRes.status} ${await drivesRes.text()}`);
  }
  const drives = (await drivesRes.json()) as { value: { id: string; name: string }[] };

  return { siteId: site.id, drives: drives.value.map((d) => ({ id: d.id, name: d.name })) };
}
