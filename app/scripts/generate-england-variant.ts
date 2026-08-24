/**
 * Runs the SHTM->HTM conversion engine (src/lib/englandConversion.ts)
 * against the live DB, generating/refreshing the "health_england"
 * SectorVariant from the current Scotland template + compliance corpus.
 * Idempotent (upserts throughout) — safe to re-run any time the
 * Scotland corpus changes, to pick up the new content in the England
 * mirror too.
 *
 * Usage: npm run england:generate
 */
import { PrismaClient } from "@prisma/client";
import { generateEnglandVariant } from "../src/lib/englandConversion";

async function main() {
  const db = new PrismaClient();
  const result = await generateEnglandVariant(db);
  console.log(
    `England variant ready: ${result.templatesCreated} templates, ${result.rulesCreated} compliance rules (SectorVariant ${result.sectorVariantId}).`
  );
  await db.$disconnect();
}

main();
