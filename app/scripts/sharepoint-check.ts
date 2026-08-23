/**
 * Setup helper — run once AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET
 * are in .env and a real SharePoint site exists. Resolves the site's Graph
 * Site ID and lists its document libraries (drives), so you can copy the
 * right values into SHAREPOINT_SITE_ID / SHAREPOINT_DRIVE_ID in .env.
 *
 * Usage: npm run sharepoint:check -- https://yourtenant.sharepoint.com/sites/StageForge
 */
import "dotenv/config";
import { resolveSite } from "../src/lib/sharepoint";

async function main() {
  const siteUrl = process.argv[2];
  if (!siteUrl) {
    console.error("Usage: npm run sharepoint:check -- <site-url>");
    console.error("e.g.:  npm run sharepoint:check -- https://yourtenant.sharepoint.com/sites/StageForge");
    process.exit(1);
  }

  console.log(`Looking up ${siteUrl} ...`);
  const { siteId, drives } = await resolveSite(siteUrl);

  console.log(`\nSHAREPOINT_SITE_ID="${siteId}"`);
  console.log("\nDocument libraries on this site:");
  for (const d of drives) {
    console.log(`  ${d.name}  ->  SHAREPOINT_DRIVE_ID="${d.id}"`);
  }
  console.log("\nCopy the Site ID above, and the Drive ID for the library you want (usually 'Documents'), into .env.");
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
