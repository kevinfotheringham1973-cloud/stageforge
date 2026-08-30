// Bundled Postgres for the self-contained desktop build — same engine
// (16.x) production runs via docker-compose, just spawned locally by
// Electron instead. Chosen over PGlite (its only Prisma adapter needs
// Prisma 7, an upgrade this app's shared schema/client isn't on) and over
// SQLite (Prisma's SQLite connector doesn't support the scalar-list
// fields — matchKeywords, tags, etc. — this schema already uses). This
// way schema.prisma and every existing migration apply completely
// unmodified; only DATABASE_URL changes.

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

// Deliberately not 5432 (a common default a user might already have
// running locally) or 5433 (docker-compose's port for normal dev, see
// docker-compose.yml) — this gets its own, so it can never collide with
// either.
const DB_PORT = 5434;
const DB_USER = "stageforge";
// Local-loopback-only credential (see postgresFlags below) on a
// single-user machine — not a secret worth protecting beyond that; OS
// account compromise already means game over regardless of DB password
// strength.
const DB_PASSWORD = "stageforge-local-only";
const DB_NAME = "stageforge_local";

function buildDatabaseUrl() {
  return `postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}?schema=public`;
}

// Deliberately INSIDE databaseDir, not alongside it -- found live, 29
// Aug 2026: with the marker as a sibling of pgdata, a user deleting
// only the pgdata folder (the documented way to reset a broken
// install) got a silently *unseeded* database forever after, since the
// marker survived and the next launch's needsSeed check saw it,
// skipped seed.ts entirely, and left a schema with zero rows (surfaced
// as a Prisma "no record found" crash on the first page needing any
// seeded data). Marker and data must reset together, since the
// marker's only meaning is "this exact database has been seeded" --
// see tests/marker-path.test.js, which asserts this invariant directly.
function getSeedMarkerPath(databaseDir) {
  return path.join(databaseDir, "stageforge-seed-complete.marker");
}

function waitForPort(port, child, retriesLeft = 60) {
  return new Promise((resolve, reject) => {
    let settled = false;
    // The worker exiting early (a real startup failure) should surface
    // immediately, not as a generic 30s "never came up" timeout once
    // retries run out — its own stderr (stdio: inherit) already shows
    // the real reason above this in the same log/console.
    child.once("exit", (code) => {
      if (!settled && code !== 0) {
        settled = true;
        reject(new Error(`Postgres worker process exited with code ${code} before its port came up`));
      }
    });
    const attempt = () => {
      if (settled) return;
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      socket.once("error", () => {
        socket.destroy();
        if (settled) return;
        if (retriesLeft <= 0) {
          settled = true;
          reject(new Error(`Postgres never came up on port ${port}`));
          return;
        }
        retriesLeft -= 1;
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

// pgModulesDir: dev (__dirname/node_modules, where npm install put it) vs
// packaged (resources/pg/node_modules, electron-builder.yml's
// extraResources copy) -- passed in from main.js, which is the one place
// that already knows app.isPackaged.
async function startLocalDatabase(databaseDir, pgModulesDir) {
  const isFirstRun = !fs.existsSync(path.join(databaseDir, "PG_VERSION"));
  const workerPath = path.join(__dirname, "pgWorker.js");
  const pgProcess = spawn(
    process.execPath,
    [workerPath, databaseDir, pgModulesDir, String(DB_PORT), DB_USER, DB_PASSWORD, DB_NAME],
    {
      stdio: "inherit",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    }
  );

  await waitForPort(DB_PORT, pgProcess);

  return { pgProcess, databaseUrl: buildDatabaseUrl(), isFirstRun };
}

// Direct `node <cli entry>` rather than `npx <package>` — found live (27
// Aug 2026), packaging the first installer, that npx's own resolution
// broke once the app moved out of a normal npm-managed project location
// (AppData\Programs\StageForge\resources\nextapp) even though the exact
// file it claimed was missing was sitting right there in node_modules.
// Resolving the CLI's real entry file ourselves and invoking it with
// node sidesteps npx's resolution entirely, in dev and packaged alike.
//
// process.execPath here is Electron's own binary, not a plain node.exe
// -- ELECTRON_RUN_AS_NODE makes it behave as one for this one child
// process. Without it (found live, 27 Aug 2026, right after fixing the
// npx issue above) it tries to launch the script path as if it were
// another Electron app to open, which just silently goes nowhere: no
// prisma/tsx output at all, not even an error, until waitForServer's
// timeout eventually fires with a completely unrelated-looking message.
function runNode(appDir, binRelativePath, args, env) {
  return new Promise((resolve, reject) => {
    const binPath = path.join(appDir, "node_modules", binRelativePath);
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd: appDir,
      stdio: "inherit",
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node ${binRelativePath} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function migrateAndSeed(appDir, databaseUrl, needsSeed, seedMarkerPath) {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    // Prisma CLI's own anonymous telemetry (checkpoint.prisma.io) — a
    // separate outbound channel from anything in the app itself,
    // scoped to just this process, not a global Prisma config change.
    CHECKPOINT_DISABLE: "1",
  };
  // Retried, unlike every other runNode call here — found live (27 Aug
  // 2026): waitForPort's bare TCP connect can succeed before Postgres
  // has actually finished its own internal startup (WAL crash-recovery
  // replay after an unclean previous shutdown takes a few more seconds
  // once the port's already accepting connections), so the very first
  // migrate deploy attempt can land in that narrow window and fail —
  // confirmed by re-running the identical command a few seconds later,
  // which succeeded immediately. Only this first call is exposed to
  // that race; seed/anonymize below only ever run after this one has
  // already succeeded once.
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await runNode(appDir, "prisma/build/index.js", ["migrate", "deploy"], env);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 5) await sleep(1500);
    }
  }
  if (lastErr) throw lastErr;
  // needsSeed is main.js's own marker-file check, deliberately NOT the
  // same thing as "is the Postgres cluster new" -- see its comment for
  // why conflating the two used to leave real installs permanently
  // stuck with a half-seeded database. seed.ts itself now runs its
  // entire body inside one transaction (see that file's header), so an
  // interrupted attempt here always leaves the database exactly as
  // empty as it found it -- safe to unconditionally retry whenever
  // needsSeed is true, never a partial-data conflict.
  if (needsSeed) {
    await runNode(appDir, "tsx/dist/cli.mjs", ["prisma/seed.ts"], env);
    // Desktop-build-only, see that script's header — replaces seed.ts's
    // real-sounding demo names with role names, since this build gets
    // shown to people outside Kevin's own company.
    await runNode(appDir, "tsx/dist/cli.mjs", ["scripts/anonymize-local-demo-names.ts"], env);
    // Written only once both steps above have actually succeeded --
    // this file's mere existence is what main.js trusts on every future
    // launch to mean "don't seed again", so it must never be written
    // any earlier than this.
    fs.writeFileSync(seedMarkerPath, new Date().toISOString());
  }
}

module.exports = { startLocalDatabase, migrateAndSeed, buildDatabaseUrl };
