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

// Walks a package-lock.json's real dependency graph starting from
// `roots`, breadth-first, and returns every package name that needs to
// physically exist in node_modules for those roots to run: regular
// `dependencies` edges always, plus `optionalDependencies` edges but
// ONLY when the name looks like this target's platform variant (e.g.
// @embedded-postgres/windows-x64, @esbuild/win32-x64) -- never
// devDependencies or peerDependencies, so e.g. prisma's peerDependency
// on `typescript` correctly stays out, and never some *other*
// platform's variant (darwin-arm64, linux-x64, ...).
//
// Replaces three hand-maintained lists that used to live here. Found
// live (29 Aug 2026): the hand-picked prisma CLI list missed
// @prisma/debug and ~25 other transitive packages (chokidar, jiti,
// giget, nypm, ...) -- invisible until an installed build actually
// tried to run `prisma migrate deploy` and hit `Cannot find module
// '@prisma/debug'`. Fixing that by computing the closure from the
// lockfile instead of guessing then immediately hit the same shape of
// bug again one level down -- tsx's own `esbuild` dependency was in the
// computed closure, but esbuild's platform-specific binary package
// (an optionalDependency of esbuild itself, same relationship
// @embedded-postgres/windows-x64 has to embedded-postgres) wasn't,
// crashing prisma/seed.ts's first tsx invocation with "package
// @esbuild/win32-x64 could not be found". A hand-picked list silently
// goes stale the moment any dependency changes; computing it -- for
// both regular and platform-optional edges -- from the lockfile that's
// already the source of truth can't drift out of sync the same way.
const WINDOWS_X64_VARIANT = /(^|\/)(win32-x64|windows-x64)$/;

function resolveDependencyClosure(lockfilePath, roots) {
  const lock = JSON.parse(fs.readFileSync(lockfilePath, "utf8"));
  const pkgs = lock.packages || {};
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const p = pkgs["node_modules/" + name];
    if (!p) {
      console.error(`[prepare-resources] ${name} not found in ${lockfilePath}`);
      process.exit(1);
    }
    for (const dep of Object.keys(p.dependencies || {})) {
      if (!seen.has(dep)) queue.push(dep);
    }
    for (const dep of Object.keys(p.optionalDependencies || {})) {
      if (!seen.has(dep) && WINDOWS_X64_VARIANT.test(dep)) queue.push(dep);
    }
  }
  return [...seen].sort();
}

const nextappSrc = path.join(REPO_ROOT, "app");
const nextappDest = path.join(STAGE_DIR, "nextapp");

const PG_PACKAGES = resolveDependencyClosure(path.join(ELECTRON_DIR, "package-lock.json"), [
  "embedded-postgres",
  "async-exit-hook",
]);

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
// the same computed-closure treatment as PG_PACKAGES above.
const CLI_ONLY_PACKAGES = resolveDependencyClosure(path.join(nextappSrc, "package-lock.json"), [
  "prisma",
  "@prisma/config",
  "@prisma/engines",
  "tsx",
  "dotenv", // scripts/anonymize-local-demo-names.ts does `import "dotenv/config"`
]);

fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });

// -- nextapp: the Next.js app itself (was extraResources `from: ../app`) --

const standaloneSrc = path.join(nextappSrc, ".next", "standalone");
if (!fs.existsSync(standaloneSrc)) {
  console.error(
    `[prepare-resources] missing ${standaloneSrc} -- run STAGEFORGE_DESKTOP_BUILD=1 npm run build in app/ first (next.config.ts only sets output: "standalone", which produces this folder, when that env var is set -- see next.config.ts's own comment for why a plain build won't produce it).`
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
// dereference: true is required here -- Next's own output-file-tracing
// stages some packages (found live, 30 Aug 2026: node-cron) as an NTFS
// junction into .next/node_modules/<pkg>-<hash> pointing straight back
// at app/node_modules/<pkg>, rather than a real copy. Without
// dereferencing, cpSync faithfully recreates that junction inside the
// packaged app, still pointing at this dev machine's own
// C:\Projects\StageForge\... path -- meaningless (and MODULE_NOT_FOUND
// at runtime if ever resolved) on a customer's machine, and outright
// fatal for the appx target specifically: makeappx.exe refuses to pack
// a reparse point at all ("You can't add folders or devices to the
// package"), so the NSIS/portable builds silently shipped a landmine
// that the MSIX build instead failed loudly on.
fs.cpSync(standaloneSrc, nextappDest, {
  recursive: true,
  dereference: true,
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

// Read by main.js's ensureWritableCliRuntime (31 Aug 2026) -- migrate
// deploy/seed/anonymize all run the CLI packages above in place, inside
// APP_DIR. That's fine for NSIS/portable (a writable per-user install
// dir either way), but the appx target's install location is read-only
// by Windows' own design with no opt-out (unlike NSIS's perMachine
// escape hatch above) -- Prisma writes into its own node_modules at
// runtime regardless (a jiti/c12 config-load cache for prisma.config.ts,
// and a query-engine binary copy), so running the CLI in place there hit
// EPERM and crashed the app on first launch, confirmed live 31 Aug 2026
// testing the actual submitted appx. The fix is the same shape as
// ensureWritablePgRuntime below: copy just what the CLI needs into a
// writable userData folder once, and always invoke it from there. This
// manifest is that "just what it needs" list, computed here from the
// same lockfile-derived closure as the copy loop above so it can't drift
// out of sync with what's actually staged.
fs.writeFileSync(
  path.join(nextappDest, "cli-runtime-manifest.json"),
  JSON.stringify(
    {
      // @prisma/client and its generated .prisma/client (the actual
      // query engine, ~20MB) aren't part of CLI_ONLY_PACKAGES -- they're
      // already covered by Next's own standalone trace for the server's
      // own use, which is why prepare-resources.js never had to copy
      // them separately above. seed.ts imports @prisma/client directly
      // though, and once it's running from its own isolated cli-runtime
      // copy (not APP_DIR) rather than in place, that copy needs its own
      // node_modules/@prisma/client -- confirmed live, 31 Aug 2026,
      // testing the actual fix: migrate deploy started working, seed.ts
      // then failed with Cannot find module '@prisma/client'. Sourced
      // from nextappDest (both already land there via the standalone
      // trace), not copied specially -- just listed here so
      // ensureWritableCliRuntime knows to bring them along too.
      packages: [...CLI_ONLY_PACKAGES, "@prisma/client", ".prisma/client"],
      // Everything else migrate/seed/anonymize touch by relative path --
      // see localDb.js's migrateAndSeed and the copies just above this
      // one for why each is here.
      paths: ["prisma", "scripts", "src", "tsconfig.json", "prisma.config.ts", "package.json"],
    },
    null,
    2
  )
);

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

// nextappSrc (app/) is ALSO the live tunnel-hosted server's serving
// directory (see deploy-topology notes) -- the STAGEFORGE_DESKTOP_BUILD=1
// build staged above left app/.next configured with output: "standalone",
// which `next start` cannot run (breaks Auth.js's verify-request action --
// found live 29 Aug 2026, a real "can't log in, no email arrives" report
// some hours after this was left unconditionally on; see next.config.ts's
// own comment). Everything this script needs from that build is already
// copied into STAGE_DIR above, so it's safe to immediately rebuild
// app/.next as a plain (non-standalone) build here, restoring the live
// server to a working state before electron-builder even runs -- instead
// of relying on a human to remember to do this by hand afterward, which
// is exactly what didn't happen 29 Aug 2026.
console.log("[prepare-resources] restoring app/.next to a plain (non-standalone) build for the live server...");
const restoreEnv = { ...process.env };
delete restoreEnv.STAGEFORGE_DESKTOP_BUILD;
try {
  execSync("npm run build", { cwd: nextappSrc, stdio: "inherit", env: restoreEnv });
} catch {
  console.error(
    "[prepare-resources] FAILED to restore a plain build in app/ -- the live server's .next is still the broken standalone build from this desktop packaging pass. Fix the build error above, then run `npm run build` in app/ by hand (no STAGEFORGE_DESKTOP_BUILD set) before doing anything else."
  );
  process.exit(1);
}

// Best-effort: get the live process serving the restored build right
// away instead of leaving it broken until whatever incidental restart
// happens to notice next. Not fatal if pm2 or this process isn't present
// (e.g. packaging from a machine that doesn't run the live tunnel).
try {
  execSync("pm2 restart stageforge-tunnel --update-env", { cwd: REPO_ROOT, stdio: "inherit" });
  console.log("[prepare-resources] restarted stageforge-tunnel with the restored build.");
} catch {
  console.warn(
    "[prepare-resources] could not restart stageforge-tunnel via pm2 (not running on this machine?) -- if this IS the live-serving machine, restart it by hand before leaving things here."
  );
}
