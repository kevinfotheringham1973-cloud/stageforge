/**
 * Runs every content-sync migration in this directory (files matching
 * sync-*.ts) as its own process, in filename order. Each one is already
 * self-idempotent by convention — skips anything already present in the
 * database and only appends what's missing — see
 * sync-scotland-compliance-updates.ts and
 * sync-2026-09-16-water-isolation-flushing.ts for the pattern new sync
 * scripts should follow. Safe to run on every desktop launch and every
 * live deploy; a script that's already fully applied just logs [skip]
 * lines and exits 0. This is what closes the gap that let the water
 * isolation/flushing deliverables reach the live tunnel DB (run by hand,
 * once) but never the desktop app's separate local DB — from now on
 * there's one command that hits every database, and it isn't optional.
 *
 * Electron's localDb.js does NOT shell out to this file — it runs the
 * same sync-*.ts scripts directly through its own runNode() helper
 * (resolving tsx's CLI entry point under the packaged app's
 * node_modules, since `npx` resolution isn't reliable in a packaged
 * install — see runNode's own comment). This file is for everywhere
 * else: local dev and the live-tunnel deploy cycle.
 *
 * Usage: npm run sync:all   (run from app/, same cwd as every other
 * script's "Usage" line in this directory)
 */
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

const scriptsDir = path.join(process.cwd(), "scripts");
// A plain filesystem join, not require.resolve — tsx's package.json
// "exports" map doesn't expose this subpath to module resolution (same
// reason electron/localDb.js's runNode() resolves it this way too).
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

const migrations = fs
  .readdirSync(scriptsDir)
  .filter((f) => f.startsWith("sync-") && f.endsWith(".ts"))
  .sort();

if (migrations.length === 0) {
  console.log("No content-sync scripts found in scripts/.");
  process.exit(0);
}

for (const file of migrations) {
  console.log(`\n=== Running ${file} ===`);
  execFileSync(process.execPath, [tsxCli, path.join(scriptsDir, file)], {
    stdio: "inherit",
    env: process.env,
  });
}

console.log("\nAll content-sync scripts applied.");
