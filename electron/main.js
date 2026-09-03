// StageForge desktop shell — self-contained single-user build.
//
// Spawns a bundled local Postgres (localDb.js), runs the app's existing
// migrations against it, builds/starts the Next.js server in production
// mode pointed at that instance instead of any cloud/docker database,
// and blanks every optional cloud credential (runtimeEnv below). A
// source checkout does this via `next build` + `next start` (not `next
// dev`); a packaged install instead runs the pre-built .next/standalone
// server.js directly (see startServer, and prepare-resources.js for why
// -- shrinks the installed footprint by not shipping the full `next`
// CLI + devDependencies nothing at runtime needs). Combined with
// STAGEFORGE_LOCAL_MODE (auth.ts) skipping Entra ID / Resend and
// localEvidenceStorage.ts replacing SharePoint, this needs no external
// setup and makes no outbound network call at all — no Docker, no
// login, no internet (verified live: zero non-loopback connections in
// any state, 27 Aug 2026).
//
// Packaged into a real distributable installer via electron-builder
// (electron-builder.yml) — see APP_DIR and needsBuild()'s comments for
// what changes between a source checkout and an installed copy.

const { app, BrowserWindow, dialog } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const { startLocalDatabase, migrateAndSeed } = require("./localDb");
const { getOrCreateAuthSecret } = require("./localAuthSecret");

// A real user can double-click the desktop shortcut a second time while
// the first launch is still starting up (bundled Postgres init alone
// takes a few seconds) -- without this, both copies race to start their
// own Postgres against the same data directory and one hard-crashes on
// a lock-file conflict. Found live, 27 Aug 2026, from an NSIS installer
// auto-launching the app right as a manual launch was also starting.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Packaged builds copy the app/ directory in as an extraResource (see
// electron-builder.yml) rather than shipping it as a sibling folder next
// to main.js the way the source checkout has it. Named "nextapp", not
// "app" -- "app" is electron-builder's own reserved location for the
// Electron entry point itself (main.js), and colliding with it left
// Electron unable to find its own entry point at all (found live, 27
// Aug 2026, packaging the first installer).
const APP_DIR = app.isPackaged ? path.join(process.resourcesPath, "nextapp") : path.join(__dirname, "..", "app");
// Deliberately NOT 3001 — that's the port ecosystem.config.js's PM2 app
// "stageforge-tunnel" binds for the real deployed instance behind the
// Cloudflare tunnel. Colliding with it either fails to start or, worse,
// fights it for the port. This shell gets its own.
const PORT = 3002;
const URL = `http://localhost:${PORT}`;

let serverProcess;
let mainWindow;
let pgProcess;

function runtimeEnv(databaseUrl, evidenceDir, authSecret, logDir) {
  return {
    ...process.env,
    // See auth.ts — skips Entra ID / Resend, auto-signs in as the
    // local admin.
    STAGEFORGE_LOCAL_MODE: "1",
    // Overrides the shared .env's AUTH_URL (pinned to the production
    // https:// tunnel domain) — left as-is, Auth.js marks session
    // cookies Secure-only and Electron's Chromium silently refuses to
    // store them over plain http://localhost, breaking login.
    AUTH_URL: URL,
    // See localAuthSecret.js — a fresh secret generated and persisted
    // per install, never Kevin's real one from the shared .env.
    AUTH_SECRET: authSecret,
    AUTH_TRUST_HOST: "true",
    // Overrides the shared .env's DATABASE_URL (docker-compose, port
    // 5433) — points at the bundled local instance instead.
    DATABASE_URL: databaseUrl,
    // See localEvidenceStorage.ts — replaces SharePoint with a folder
    // under this OS's per-user app-data directory.
    STAGEFORGE_EVIDENCE_DIR: evidenceDir,
    // See instrumentation.ts's onRequestError — a real server error's
    // full message/stack, otherwise unrecoverable once React's
    // production error stripping and this app's lack of a visible
    // terminal both apply.
    STAGEFORGE_LOG_DIR: logDir,
    // Every optional cloud credential, explicitly blanked rather than
    // just left unset — whoever's .env this app loads (Next reads it
    // regardless of who spawns the process) may well have real keys
    // in it, same as this dev machine's does. The desktop build's
    // offline claim can't depend on which machine happens to run it;
    // each of these already has its own graceful no-key fallback
    // (isAiTaggingConfigured/provisioning.ts, isSharePointConfigured/
    // sharepoint.ts, hasResendConfig+email.ts's sendEmail no-op,
    // hasEntraIdConfig/auth.ts), this just guarantees they all take it.
    ANTHROPIC_API_KEY: "",
    AZURE_TENANT_ID: "",
    AZURE_CLIENT_ID: "",
    AZURE_CLIENT_SECRET: "",
    SHAREPOINT_SITE_ID: "",
    SHAREPOINT_DRIVE_ID: "",
    RESEND_API_KEY: "",
    AUTH_MICROSOFT_ENTRA_ID_ID: "",
    AUTH_MICROSOFT_ENTRA_ID_SECRET: "",
    // Next.js's own anonymous usage telemetry — a separate outbound
    // channel from anything in this app's code. Scoped to just this
    // spawned process (not `next telemetry disable`, which would
    // change this machine's global setting for every Next project).
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

// Next's real CLI entry (node_modules/next/dist/bin/next), invoked
// directly with node — not `npx next` — for the same reason localDb.js's
// migrate/seed calls switched off npx: found live (27 Aug 2026),
// packaging the first installer, that npx's resolution broke once the
// app moved out of a normal npm-managed project location, even though
// the file it claimed was missing was right there in node_modules.
const NEXT_BIN = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next");

// ELECTRON_RUN_AS_NODE -- see localDb.js's runNode for why: without it,
// process.execPath (Electron's own binary here, not a plain node.exe)
// tries to open binPath as another Electron app instead of running it
// as a script, and fails completely silently.
function runNode(binPath, args, env, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd: APP_DIR,
      stdio: "inherit",
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`))));
    child.on("error", reject);
  });
}

/**
 * Real `next build` output, checked into neither git nor an installer's
 * source tree — this only builds when .next is missing/stale. A packaged
 * installer ships a pre-built .next as part of its resources (built once
 * at package-creation time, see the root README/packaging notes), so
 * this only actually fires when running from a source checkout without
 * ever having built — an end user's installed copy should never hit it.
 */
function needsBuild() {
  return !fs.existsSync(path.join(APP_DIR, ".next", "BUILD_ID"));
}

async function buildApp(env) {
  await runNode(NEXT_BIN, ["build"], env, "next build");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The portable build's own NSIS self-extraction can still be mid-copy
// when Electron's main process starts -- found live, 28 Aug 2026: a
// `next start` server came up and served some routes (whatever had
// already landed) while other requests 500'd on files that hadn't been
// copied yet (e.g. the Prisma engine binary arriving well after the
// page bundles did). node_modules is by far the largest thing under
// each extraResources copy, so these canaries were deliberately picked
// from well inside it rather than at the top level -- their presence is
// a real "everything's actually here" signal, not just "something is".
function packagedResourceCanaries(pgModulesDir) {
  return [
    path.join(APP_DIR, "package.json"),
    // Packaged builds ship .next/standalone's own trace, not the full
    // `next` package -- the CLI (dist/bin/next) isn't part of that
    // trace, so this checks a core runtime file server.js itself
    // depends on instead (see prepare-resources.js and startServer).
    path.join(APP_DIR, "node_modules", "next", "dist", "server", "next-server.js"),
    path.join(APP_DIR, "node_modules", "prisma", "build", "index.js"),
    path.join(APP_DIR, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(pgModulesDir, "embedded-postgres", "dist", "index.js"),
  ];
}

function resourcesReady(pgModulesDir) {
  return packagedResourceCanaries(pgModulesDir).every((p) => fs.existsSync(p));
}

// Polled rather than watched -- extraction is an external process (the
// NSIS stub) we have no event to hook into, so this is the only signal
// available. 4 minutes covers even a slow disk/antivirus-scanned first
// extraction (observed ~100s on a normal run) with real margin.
async function waitForResources(pgModulesDir, retriesLeft = 480) {
  while (!resourcesReady(pgModulesDir)) {
    if (retriesLeft <= 0) {
      throw new Error(`Packaged app resources never finished extracting under ${process.resourcesPath}`);
    }
    retriesLeft -= 1;
    await sleep(500);
  }
}

// stdio: "inherit" is a no-op in a packaged build -- Electron's main
// process is a Windows GUI-subsystem executable with no properly-attached
// console for children to inherit into, so the Next.js server's own
// stdout/stderr (its normal "Ready on port X" line, or any crash stack)
// vanishes silently (same root cause and same fix as pgWorker.js's
// DEBUG_LOG_PATH, found live 1-2 Sep 2026 chasing a genuine Windows 10
// 22H2 certification-style failure). Passing real, already-open file
// descriptors as stdio (rather than "inherit" or a string like "pipe")
// bypasses the whole inherited-console problem entirely.
const SERVER_DEBUG_LOG_PATH = path.join(os.tmpdir(), "stageforge-server-debug.log");

function startServer(env) {
  const logFd = fs.openSync(SERVER_DEBUG_LOG_PATH, "a");
  fs.writeSync(logFd, `\n${new Date().toISOString()} spawning server, packaged=${app.isPackaged}\n`);

  // Packaged builds ship .next/standalone's own server.js (see
  // prepare-resources.js) instead of the full `next` CLI + full
  // node_modules, so this launches that directly rather than `next
  // start` -- the standalone trace doesn't include the CLI bin at all
  // (see packagedResourceCanaries' comment). A source checkout (not
  // packaged) has no standalone folder to run, so keeps using `next
  // start` against the full node_modules it already has.
  if (app.isPackaged) {
    serverProcess = spawn(process.execPath, [path.join(APP_DIR, "server.js")], {
      cwd: APP_DIR,
      stdio: ["ignore", logFd, logFd],
      env: { ...env, ELECTRON_RUN_AS_NODE: "1", PORT: String(PORT) },
    });
  } else {
    serverProcess = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
      cwd: APP_DIR,
      stdio: ["ignore", logFd, logFd],
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    });
  }

  serverProcess.on("error", (err) => {
    fs.writeSync(logFd, `${new Date().toISOString()} spawn error: ${err.stack || err}\n`);
    console.error("[electron] failed to start Next.js server:", err);
  });
  serverProcess.on("exit", (code, signal) => {
    fs.writeSync(logFd, `${new Date().toISOString()} server exited: code=${code} signal=${signal}\n`);
  });
}

function waitForServer(retriesLeft = 60) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(URL, () => resolve())
        .on("error", () => {
          if (retriesLeft <= 0) {
            reject(new Error(`Next.js server never came up on ${URL}`));
            return;
          }
          retriesLeft -= 1;
          setTimeout(attempt, 500);
        });
    };
    attempt();
  });
}

function createWindow() {
  // Reuse the "setting up" loading window from a first-run if it's still
  // open, rather than popping a second window on top of it.
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      title: "StageForge",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
  }

  mainWindow.loadURL(URL);

  // Hardening: this window should only ever show the local app server.
  // Block any attempt to open a popup or navigate elsewhere (a malicious
  // link in evidence text, a compromised dependency, etc.) rather than
  // trusting every link on the page to stay local.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith(URL)) event.preventDefault();
  });
}

// Shared by the resource-extraction wait and the first-run/build wait
// below -- either can fire first depending on what's slow, and reusing
// the same window (rather than each creating its own) avoids a second
// window popping up on top of the first if both happen to apply.
function ensureSplashWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({ width: 1400, height: 900, title: "StageForge" });
    mainWindow.loadURL(
      "data:text/html,<body style='font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><p>Starting StageForge&hellip; this can take a minute or two the first time.</p></body>"
    );
  }
}

function killProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    // Both Next and the Postgres worker (pgWorker.js, itself spawning
    // real postgres.exe) spawn their own child processes internally;
    // plain .kill() leaves those orphaned on Windows — taskkill /t
    // walks the whole tree.
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`);
    } catch (err) {
      console.error("[electron] failed to kill process tree:", err.message);
    }
  } else {
    child.kill();
  }
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  killProcessTree(serverProcess);
  killProcessTree(pgProcess);
}

// embedded-postgres chmods its own bundled postgres.exe on every start --
// found live, 29 Aug 2026: an "all users" NSIS install lands in
// C:\Program Files\..., the app itself then runs unelevated (as it
// should), and that chmod fails with EPERM inside a directory a normal
// user can't write to, crashing with "Postgres worker process exited
// with code 1 before its port came up". app.getPath("userData") is
// always writable by the current user regardless of where the app
// itself is installed (per-machine or per-user), so the pg runtime is
// copied there once and always executed from that copy -- makes this
// robust to install location instead of relying on whoever's installing
// it to pick "just me" and never being able to enforce that choice.
function pgRuntimeReady(pgRuntimeDir) {
  return fs.existsSync(path.join(pgRuntimeDir, "embedded-postgres", "dist", "index.js"));
}

async function ensureWritablePgRuntime(pgSourceDir, pgRuntimeDir) {
  if (pgRuntimeReady(pgRuntimeDir)) return;
  fs.rmSync(pgRuntimeDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(pgRuntimeDir), { recursive: true });
  fs.cpSync(pgSourceDir, pgRuntimeDir, { recursive: true });
}

// Same shape, same reason, as pgRuntimeReady/ensureWritablePgRuntime
// above -- but for the CLI packages migrateAndSeed runs (prisma migrate
// deploy, tsx running seed.ts + the anonymize script), not embedded
// Postgres. Confirmed live, 31 Aug 2026, testing the actual .appx
// submitted to the Store: running `prisma migrate deploy` in place
// inside APP_DIR crashed the app on first launch with EPERM (a
// jiti/c12 config-load cache under node_modules/.cache/prisma, then a
// query-engine binary copy under node_modules/@prisma/engines) -- the
// appx install location is read-only with no per-install-location
// escape hatch the way NSIS's perMachine:false is, so this can't be
// fixed by choosing an install location; it needs its own writable copy
// the same way the pg runtime already gets one. cli-runtime-manifest.json
// (written by prepare-resources.js from the same lockfile-derived
// closure CLI_ONLY_PACKAGES uses) is the "what to copy" list, so this
// can't drift out of sync with what prepare-resources.js actually staged.
function cliRuntimeReady(cliRuntimeDir) {
  return fs.existsSync(path.join(cliRuntimeDir, "node_modules", "prisma", "build", "index.js"));
}

async function ensureWritableCliRuntime(cliSourceDir, cliRuntimeDir) {
  if (cliRuntimeReady(cliRuntimeDir)) return;
  const manifest = JSON.parse(fs.readFileSync(path.join(cliSourceDir, "cli-runtime-manifest.json"), "utf8"));
  fs.rmSync(cliRuntimeDir, { recursive: true, force: true });
  fs.mkdirSync(cliRuntimeDir, { recursive: true });
  for (const relPath of manifest.paths) {
    fs.cpSync(path.join(cliSourceDir, relPath), path.join(cliRuntimeDir, relPath), { recursive: true });
  }
  for (const pkg of manifest.packages) {
    const destPath = path.join(cliRuntimeDir, "node_modules", pkg);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.cpSync(path.join(cliSourceDir, "node_modules", pkg), destPath, { recursive: true });
  }
}

// Postgres itself refuses to run under an Administrator/elevated account
// (a deliberate, hard-coded Postgres security policy on every OS, not
// specific to this app) -- without this check that surfaces as a bare,
// generic "Postgres worker process exited with code 1" with no
// indication why (found live, 2 Sep 2026, testing from an elevated
// PowerShell window). `net session` only succeeds when elevated -- a
// standard, dependency-free way to detect this on Windows.
function isRunningElevated() {
  if (process.platform !== "win32") return false;
  try {
    execSync("net session", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

app.whenReady().then(async () => {
  if (isRunningElevated()) {
    dialog.showErrorBox(
      "StageForge can't run as Administrator",
      "StageForge's local database refuses to start under an elevated/Administrator account, by design (Postgres's own security policy). Please close this and run StageForge normally instead -- just double-click it, don't use \"Run as administrator\"."
    );
    app.quit();
    return;
  }

  try {
    const databaseDir = path.join(app.getPath("userData"), "pgdata");
    // Deliberately NOT under APP_DIR/resources/app -- see localDb.js and
    // electron-builder.yml for why embedded-postgres lives in its own
    // extraResources copy instead.
    const pgSourceDir = app.isPackaged
      ? path.join(process.resourcesPath, "pg", "node_modules")
      : path.join(__dirname, "node_modules");
    // Only the packaged path needs its own writable copy -- a source
    // checkout's node_modules is already wherever npm put it, always
    // writable by whoever's running it.
    const pgModulesDir = app.isPackaged
      ? path.join(app.getPath("userData"), "pg-runtime", "node_modules")
      : pgSourceDir;

    // Packaged only -- a source checkout's files are just there, nothing
    // to extract. See packagedResourceCanaries' comment: the portable
    // build's own NSIS self-extraction can still be copying resources/
    // in the background at this point, and starting the DB/server
    // against a half-copied APP_DIR is exactly what produced an
    // intermittent "Internal Server Error" live, 28 Aug 2026.
    if (app.isPackaged && !resourcesReady(pgSourceDir)) {
      ensureSplashWindow();
      await waitForResources(pgSourceDir);
    }

    if (app.isPackaged && !pgRuntimeReady(pgModulesDir)) {
      ensureSplashWindow();
      await ensureWritablePgRuntime(pgSourceDir, pgModulesDir);
    }

    const dbResult = await startLocalDatabase(databaseDir, pgModulesDir);
    pgProcess = dbResult.pgProcess;
    const { databaseUrl, isFirstRun } = dbResult;
    // Deliberately NOT the same thing as isFirstRun above (which only
    // asks "does a Postgres cluster already exist in this userData
    // folder") -- found live, 29 Aug 2026, on a real Microsoft
    // Store-path install: seeding got interrupted partway (the process
    // killed mid-run), leaving a database with some rows but not all of
    // them. isFirstRun was already false on every later launch (the
    // cluster genuinely did exist), so seeding was never retried --
    // permanently half-seeded, no error, no way to recover short of a
    // manual folder deletion. This marker file is written by
    // migrateAndSeed ONLY after seed.ts and the anonymize script have
    // both actually finished (see its own comment), so its absence is a
    // trustworthy "seeding never completed" signal on its own, decoupled
    // from Postgres's own bookkeeping (PG_VERSION / isFirstRun above).
    // Lives INSIDE databaseDir, not alongside it -- found live, 29 Aug
    // 2026: a user manually deleting only the pgdata folder (the
    // documented way to reset a broken install) got a silently
    // *unseeded* database forever after, since the marker survived in
    // userData and the next launch's needsSeed check saw it, skipped
    // seed.ts entirely, and left a schema with zero rows (surfaced as a
    // Prisma "no record found" crash on the very first page needing any
    // seeded data, e.g. /projects/new's SectorVariant lookup). Marker
    // and data must reset together, since the marker's only meaning is
    // "this exact database has been seeded."
    const seedMarkerPath = path.join(databaseDir, "stageforge-seed-complete.marker");
    const needsSeed = !fs.existsSync(seedMarkerPath);
    const buildNeeded = needsBuild();
    // First run, seeding needed, and/or a missing build: initialising
    // the cluster + applying migrations + seeding demo data + (on this
    // dev-machine testing path only, see needsBuild's comment) building
    // the app can take a while — worth a visible wait state rather than
    // looking frozen.
    if (isFirstRun || needsSeed || buildNeeded) ensureSplashWindow();
    // Writable copy of just the CLI packages, same reason and same
    // pattern as pgModulesDir above -- see ensureWritableCliRuntime's
    // comment. A source checkout's APP_DIR is already writable, so it
    // runs the CLI in place unchanged, same as the pg case.
    const cliRuntimeDir = app.isPackaged ? path.join(app.getPath("userData"), "cli-runtime") : APP_DIR;
    if (app.isPackaged && !cliRuntimeReady(cliRuntimeDir)) {
      ensureSplashWindow();
      await ensureWritableCliRuntime(APP_DIR, cliRuntimeDir);
    }
    await migrateAndSeed(cliRuntimeDir, databaseUrl, needsSeed, seedMarkerPath);
    const evidenceDir = path.join(app.getPath("userData"), "evidence");
    const authSecret = getOrCreateAuthSecret(app.getPath("userData"));
    // instrumentation.ts's onRequestError writes here — production React
    // deliberately strips the real message from errors like #441 (an RSC
    // render threw), leaving only an opaque digest on screen, and this
    // packaged app has no visible terminal for stdio: "inherit" to reach
    // once launched normally (found live, 29 Aug 2026: a real "new
    // project" crash left nothing usable behind to diagnose it from).
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const env = runtimeEnv(databaseUrl, evidenceDir, authSecret, logDir);
    if (buildNeeded) await buildApp(env);
    startServer(env);
    await waitForServer();
    createWindow();
  } catch (err) {
    console.error("[electron] startup failed:", err);
    dialog.showErrorBox("StageForge failed to start", String(err && err.message ? err.message : err));
    await shutdown();
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await shutdown();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  shutdown();
});
