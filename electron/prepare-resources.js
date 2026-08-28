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

fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });

// -- nextapp: the Next.js app itself (was extraResources `from: ../app`) --
const nextappSrc = path.join(REPO_ROOT, "app");
const nextappDest = path.join(STAGE_DIR, "nextapp");
const NEXTAPP_EXCLUDE = [".env", ".env.example"];
fs.cpSync(nextappSrc, nextappDest, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(nextappSrc, src);
    if (NEXTAPP_EXCLUDE.includes(rel)) return false;
    if (rel.startsWith(path.join(".next", "cache"))) return false;
    if (rel.endsWith(".tsbuildinfo")) return false;
    return true;
  },
});

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
