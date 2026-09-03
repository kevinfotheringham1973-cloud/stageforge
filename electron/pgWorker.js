// Runs the bundled Postgres lifecycle in its own genuine Node.js
// process (spawned by localDb.js with ELECTRON_RUN_AS_NODE=1), not
// inside Electron's own main process -- found live, 27 Aug 2026: dynamic
// import() of an external module from within Electron's main GUI
// process fails in a packaged app (ERR_MODULE_NOT_FOUND for files that
// demonstrably exist, tried from several different locations, with and
// without asar), while the exact same import() call from a spawned
// child process -- the same pattern already relied on for prisma/tsx/
// next in main.js -- works every time. Stays running for the app's
// whole session (Postgres itself is a further child of this process);
// localDb.js kills the whole tree on shutdown rather than sending a
// stop message, since a hard taskkill /T is already how the Next.js
// server gets stopped too.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");

const [, , databaseDir, pgModulesDir, port, user, password, dbName] = process.argv;

// stdio: "inherit" from localDb.js's spawn call is a no-op in a packaged
// build — Electron's main process is a Windows GUI-subsystem executable,
// so even when launched from a terminal it has no properly-attached
// console for children to inherit into, and console.log/error here just
// vanish silently (found live, 1 Sep 2026: a genuine Windows 10 22H2
// certification-style test produced zero output via either terminal
// redirection or Event Viewer, despite a clean exit(1) proving this
// catch block DID run). Written to a fixed, predictable path instead of
// relying on any inherited handle at all -- this is the only reliable
// way to see why Postgres actually failed to start on a machine that
// isn't this dev box.
const DEBUG_LOG_PATH = path.join(os.tmpdir(), "stageforge-pgworker-debug.log");
function debugLog(msg) {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // If even this fails, there's nothing further to fall back to.
  }
}

async function main() {
  debugLog(`start: databaseDir=${databaseDir} pgModulesDir=${pgModulesDir} port=${port}`);
  const entryPath = path.join(pgModulesDir, "embedded-postgres", "dist", "index.js");
  debugLog(`entryPath exists=${fs.existsSync(entryPath)}: ${entryPath}`);
  const { default: EmbeddedPostgres } = await import(pathToFileURL(entryPath).href);
  debugLog("embedded-postgres module imported OK");

  const isFirstRun = !fs.existsSync(path.join(databaseDir, "PG_VERSION"));
  debugLog(`isFirstRun=${isFirstRun}`);

  const pg = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port: Number(port),
    persistent: true,
    // Defense in depth on top of Windows Firewall's default-deny for
    // unsolicited inbound connections — explicit, not just assumed.
    postgresFlags: ["-c", "listen_addresses=localhost"],
    // Default is console.log -- same invisible-in-a-packaged-app problem
    // as everything else here. This is the ONLY place postgres.exe's own
    // stderr ever surfaces (embedded-postgres's start() rejects with a
    // bare, argument-less reject() -- undefined, no message, no exit
    // code -- the instant the process closes without ever printing
    // "database system is ready", found live 2 Sep 2026; this is the
    // only way to see what it actually said right before dying).
    onLog: (message) => debugLog(`[postgres] ${message}`),
  });

  if (isFirstRun) {
    debugLog("calling pg.initialise()...");
    await pg.initialise();
    debugLog("pg.initialise() OK");
  }
  debugLog("calling pg.start()...");
  await pg.start();
  debugLog("pg.start() OK");

  if (isFirstRun) {
    try {
      await pg.createDatabase(dbName);
      debugLog(`created database ${dbName}`);
    } catch (err) {
      if (!/already exists/i.test(String(err))) throw err;
    }
  }

  // localDb.js's startLocalDatabase polls the port directly rather than
  // watching for this line, but it's worth having in the log either way.
  console.log("[pgWorker] ready");
  debugLog("ready");
}

main().catch((err) => {
  debugLog(`FAILED: ${err && err.stack ? err.stack : String(err)}`);
  console.error("[pgWorker] failed:", err);
  process.exit(1);
});
