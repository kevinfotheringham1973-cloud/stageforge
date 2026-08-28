/**
 * Seeds the England demo tenant (companies, role-name-only users, one
 * demo project) against the live DB — see seedEnglandDemo's own comment
 * in src/lib/englandConversion.ts. Not idempotent, meant to run once;
 * assumes `npm run england:generate` has already been run (or seed.ts
 * has, on a fresh install) so the health_england SectorVariant/Templates
 * already exist.
 *
 * Usage: npm run england:demo
 */
import { PrismaClient } from "@prisma/client";
import { seedEnglandDemo } from "../src/lib/englandConversion";

async function main() {
  const db = new PrismaClient();
  const result = await seedEnglandDemo(db);
  console.log(`England demo tenant ready: project #${result.projectNumber}.`);
  await db.$disconnect();
}

main();
