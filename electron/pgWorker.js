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
const { pathToFileURL } = require("url");

const [, , databaseDir, pgModulesDir, port, user, password, dbName] = process.argv;

async function main() {
  const entryPath = path.join(pgModulesDir, "embedded-postgres", "dist", "index.js");
  const { default: EmbeddedPostgres } = await import(pathToFileURL(entryPath).href);

  const isFirstRun = !fs.existsSync(path.join(databaseDir, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port: Number(port),
    persistent: true,
    // Defense in depth on top of Windows Firewall's default-deny for
    // unsolicited inbound connections — explicit, not just assumed.
    postgresFlags: ["-c", "listen_addresses=localhost"],
  });

  if (isFirstRun) {
    await pg.initialise();
  }
  await pg.start();

  if (isFirstRun) {
    try {
      await pg.createDatabase(dbName);
    } catch (err) {
      if (!/already exists/i.test(String(err))) throw err;
    }
  }

  // localDb.js's startLocalDatabase polls the port directly rather than
  // watching for this line, but it's worth having in the log either way.
  console.log("[pgWorker] ready");
}

main().catch((err) => {
  console.error("[pgWorker] failed:", err);
  process.exit(1);
});
