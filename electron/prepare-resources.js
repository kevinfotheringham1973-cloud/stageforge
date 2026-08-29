// Stages everything electron-builder.yml's extraResources needs to copy
// (the Next.js app AND embedded-postgres + its dependency closure) into
// ONE combined directory, copied via a SINGLE extraResources entry --
// not two separate ones. Found live (27 Aug 2026): with two separate
// extraResources entries, the second ("pg") consistently ended up
// missing entirely from the NSIS-installed copy -- present in the
// unpacked build, present inside the compiled installer archive itself
// (confirmed via 7z), even present in NSIS's own temp extraction
// staging folder mid-install, but never actually landing in the final
// install directory. Ruled out (each tested independently): file count,
// total size, path length, antivirus/Defender (tested with an explicit
// exclusion), list ordering, and source location inside vs. outside the
// electron/ project directory. This turned out to match a real,
// previously-reported electron-builder/NSIS bug class specifically
// around *multiple* extraResources entries -- merging into one entry is
// the documented workaround, and fixed it here too.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ELECTRON_DIR = __dirname;
const REPO_ROOT = path.join(ELECTRON_DIR, "..");
const STAGE_DIR = path.join(REPO_ROOT, "build-resources");

const PG_PACKAGES = [
  "embedded-postgres",
  "@embedded-postgres",
  "async-exit-hook",
  "pg",
  "pg-connection-string",
  "pg-pool",
  "pg-protocol",
  "pg-types",
  "pg-int8",
  "postgres-array",
  "postgres-bytea",
  "postgres-date",
  "postgres-interval",
  "xtend",
  "pgpass",
  "split2",
];

// Postgres's own translated-message catalogs -- not needed for a
// single-user local instance (English is fine), hundreds of small
// deeply-nested files for no functional benefit.
const PG_LOCALE_DIR = path.join("@embedded-postgres", "windows-x64", "native", "share", "locale");

// main.js only ever runs Next itself via the standalone server.js (see
// startServer's packaged branch) -- everything Next's server code
// actually imports (next, react, @prisma/client + its generated query
// engine, docx, exceljs, node-cron, zod, ...) already lands in
// .next/standalone/node_modules via output: "standalone" (next.config.ts)
// tracing the real import graph. These packages are invoked separately
// as CLIs by localDb.js's migrateAndSeed (prisma migrate deploy, tsx
// running prisma/seed.ts + scripts/anonymize-local-demo-names.ts) --
// nothing *imports* them, so the trace never finds them, and they need
// the same explicit-list treatment as PG_PACKAGES above.
const CLI_ONLY_PACKAGES = [
  "prisma",
  "@prisma/config",
  "@prisma/engines",
  "tsx",
  "esbuild", // tsx's own transform engine
  "dotenv", // scripts/anonymize-local-demo-names.ts does `import "dotenv/config"`
  // @prisma/config's own dependency closure (not traced -- see above)
  "c12",
  "deepmerge-ts",
  "effect",
  "empathic",
];

fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });

// -- nextapp: the Next.js app itself (was extraResources `from: ../app`) --
const nextappSrc = path.join(REPO_ROOT, "app");
const nextappDest = path.join(STAGE_DIR, "nextapp");

const standaloneSrc = path.join(nextappSrc, ".next", "standalone");
if (!fs.existsSync(standaloneSrc)) {
  console.error(
    `[prepare-resources] missing ${standaloneSrc} -- run "npm run build" in app/ first (next.config.ts's output: "standalone" is what produces this folder).`
  );
  process.exit(1);
}
// The traced server + its traced node_modules (next, react, @prisma/client
// incl. its generated query engine binary, docx, exceljs, ... -- whatever
// the app's server code actually imports). Deliberately NOT the whole
// app/ directory + full node_modules the old build did -- that shipped
// devDependencies (typescript, eslint, tailwindcss...) and hundreds of MB
// nothing at runtime ever touches.
//
// Next's own standalone output copies the real .env alongside server.js
// (confirmed live, 29 Aug 2026) -- Kevin's actual ANTHROPIC_API_KEY,
// RESEND_API_KEY, AZURE_CLIENT_SECRET, AUTH_SECRET, and production
// DATABASE_URL, sitting in plain text inside the installed app
// directory of every copy of this installer. runtimeEnv() below
// already blanks/overrides all of these in the spawned server's actual
// process.env regardless, but that doesn't stop the raw file itself
// from shipping on disk for anyone to open -- excluded here the same
// way the old whole-app-dir copy always excluded it.
fs.cpSync(standaloneSrc, nextappDest, {
  recursive: true,
  filter: (src) => path.basename(src) !== ".env",
});

// Standalone output deliberately excludes these two (Next's own docs:
// "not required to run the server") -- copied back in by hand, same as
// any real deployment of a standalone build has to.
fs.cpSync(path.join(nextappSrc, ".next", "static"), path.join(nextappDest, ".next", "static"), {
  recursive: true,
});
const publicSrc = path.join(nextappSrc, "public");
if (fs.existsSync(publicSrc)) {
  fs.cpSync(publicSrc, path.join(nextappDest, "public"), { recursive: true });
}

// Not part of the server's import trace (read as files by the prisma
// CLI / tsx at runtime, never `import`ed) -- see localDb.js's
// migrateAndSeed and CLI_ONLY_PACKAGES' comment above.
fs.cpSync(path.join(nextappSrc, "prisma"), path.join(nextappDest, "prisma"), { recursive: true });
fs.cpSync(
  path.join(nextappSrc, "scripts", "anonymize-local-demo-names.ts"),
  path.join(nextappDest, "scripts", "anonymize-local-demo-names.ts")
);
// tsx transpiles prisma/seed.ts and anonymize-local-demo-names.ts directly
// from source at runtime (not from the compiled .next output) -- they and
// their own imports (src/lib/compliance, src/lib/instantiation,
// src/lib/englandConversion, src/lib/db, ...) need the real TS source
// present, plus tsconfig.json for the "@/..." path alias tsx resolves
// against. Small (under 2MB total) -- not worth trying to cherry-pick the
// exact transitive import subset.
fs.cpSync(path.join(nextappSrc, "src"), path.join(nextappDest, "src"), { recursive: true });
fs.cpSync(path.join(nextappSrc, "tsconfig.json"), path.join(nextappDest, "tsconfig.json"));
fs.cpSync(path.join(nextappSrc, "prisma.config.ts"), path.join(nextappDest, "prisma.config.ts"));

for (const pkg of CLI_ONLY_PACKAGES) {
  const srcPath = path.join(nextappSrc, "node_modules", pkg);
  if (!fs.existsSync(srcPath)) {
    console.error(`[prepare-resources] missing: ${pkg}`);
    process.exit(1);
  }
  const destPath = path.join(nextappDest, "node_modules", pkg);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.cpSync(srcPath, destPath, { recursive: true });
}

// -- pg: embedded-postgres + its full transitive runtime dependency closure --
const pgSrc = path.join(ELECTRON_DIR, "node_modules");
const pgDest = path.join(STAGE_DIR, "pg", "node_modules");
fs.mkdirSync(pgDest, { recursive: true });
for (const pkg of PG_PACKAGES) {
  const srcPath = path.join(pgSrc, pkg);
  if (!fs.existsSync(srcPath)) {
    console.error(`[prepare-resources] missing: ${pkg}`);
    process.exit(1);
  }
  const destPath = path.join(pgDest, pkg);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.cpSync(srcPath, destPath, {
    recursive: true,
    filter: (src) => !src.startsWith(path.join(pgSrc, PG_LOCALE_DIR)),
  });
}

// buildInfo.ts's `git rev-parse` fails inside the packaged app (.git is
// deliberately never copied into nextappDest above), and it already
// falls back to "unknown" for that -- but "unknown" defeats the whole
// point of the About page for a desktop build sitting next to the live
// server (see the alignment discussion this came out of, 28 Aug 2026).
// This is captured HERE, while REPO_ROOT's real .git is still in reach,
// and read back by buildInfo.ts as its fallback instead of "unknown".
function gitInfoAt(repoRoot) {
  try {
    return {
      commitSha: execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim(),
      commitDate: execSync("git log -1 --format=%cI", { cwd: repoRoot }).toString().trim(),
    };
  } catch {
    return { commitSha: "unknown", commitDate: "unknown" };
  }
}

fs.writeFileSync(
  path.join(nextappDest, "desktop-build-info.json"),
  JSON.stringify({ ...gitInfoAt(REPO_ROOT), packagedAt: new Date().toISOString() }, null, 2)
);

console.log(`[prepare-resources] staged nextapp/ and pg/ into ${STAGE_DIR}`);
