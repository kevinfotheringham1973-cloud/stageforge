// Provisions a completely fresh desktop-build environment for the
// regression suite: real embedded Postgres (same engine/package the
// packaged Electron app bundles, see electron/pgWorker.js) + a genuine
// prisma migrate deploy + seed.ts + anonymize-local-demo-names.ts run,
// then a `next dev` server started with the exact same env vars
// electron/main.js's runtimeEnv gives the packaged app. Every desktop
// build regression found in the 29 Aug 2026 session (crash-safe
// seeding, compliance sign-off permanently stuck for Local Admin, real
// names/emails leaking, a "new project" crash with no diagnosable
// error) was only ever caught by hand-driving exactly this setup
// through a browser -- this automates the setup half so `npm run
// test:desktop` can do it before every build/commit instead.
import { execFileSync, spawn, type ChildProcess } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import {
  EVIDENCE_DIR,
  LOG_DIR,
  PG_DATA_DIR,
  SCRATCH_DIR,
  STATE_FILE,
  TEST_DB_NAME,
  TEST_DB_PASSWORD,
  TEST_DB_PORT,
  TEST_DB_USER,
  TEST_PORT,
  buildTestDatabaseUrl,
} from "./constants";

const APP_DIR = path.resolve(__dirname, "..", "..");
const ELECTRON_DIR = path.resolve(APP_DIR, "..", "electron");

function waitForPort(port: number, timeoutMs: number, child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let settled = false;
    child.once("exit", (code) => {
      if (!settled && code !== 0 && code !== null) {
        settled = true;
        reject(new Error(`process exited with code ${code} before port ${port} came up`));
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
        if (Date.now() > deadline) {
          settled = true;
          reject(new Error(`nothing came up on port ${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

export default async function globalSetup() {
  // Clean-room every run, deliberately -- this is meant to catch
  // exactly the "does a genuine first launch work" class of bug (the
  // crash-safe-seeding and compliance-stuck fixes both only showed up
  // against a truly fresh database), not to reuse state between runs.
  fs.rmSync(SCRATCH_DIR, { recursive: true, force: true });
  fs.mkdirSync(PG_DATA_DIR, { recursive: true });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const pgWorkerPath = path.join(ELECTRON_DIR, "pgWorker.js");
  const pgModulesDir = path.join(ELECTRON_DIR, "node_modules");
  const pgProcess = spawn(
    process.execPath,
    [pgWorkerPath, PG_DATA_DIR, pgModulesDir, String(TEST_DB_PORT), TEST_DB_USER, TEST_DB_PASSWORD, TEST_DB_NAME],
    { stdio: "inherit" }
  );
  await waitForPort(TEST_DB_PORT, 60_000, pgProcess);

  const databaseUrl = buildTestDatabaseUrl();
  const migrateEnv = { ...process.env, DATABASE_URL: databaseUrl, CHECKPOINT_DISABLE: "1" };

  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: APP_DIR, env: migrateEnv, stdio: "inherit", shell: true });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { cwd: APP_DIR, env: migrateEnv, stdio: "inherit", shell: true });
  execFileSync("npx", ["tsx", "scripts/anonymize-local-demo-names.ts"], {
    cwd: APP_DIR,
    env: migrateEnv,
    stdio: "inherit",
    shell: true,
  });

  // Mirrors electron/main.js's runtimeEnv exactly -- every optional
  // cloud credential blanked, since the packaged app never has them
  // either, and the earlier "new project" crash investigation (29 Aug
  // 2026) confirmed the AI-tagging-configured vs. not code paths genuinely
  // differ, so testing with a real key would test the wrong path.
  const serverEnv = {
    ...process.env,
    STAGEFORGE_LOCAL_MODE: "1",
    AUTH_URL: `http://localhost:${TEST_PORT}`,
    AUTH_SECRET: "playwright-desktop-regression-secret-not-for-production",
    AUTH_TRUST_HOST: "true",
    DATABASE_URL: databaseUrl,
    STAGEFORGE_EVIDENCE_DIR: EVIDENCE_DIR,
    STAGEFORGE_LOG_DIR: LOG_DIR,
    ANTHROPIC_API_KEY: "",
    AZURE_TENANT_ID: "",
    AZURE_CLIENT_ID: "",
    AZURE_CLIENT_SECRET: "",
    SHAREPOINT_SITE_ID: "",
    SHAREPOINT_DRIVE_ID: "",
    RESEND_API_KEY: "",
    AUTH_MICROSOFT_ENTRA_ID_ID: "",
    AUTH_MICROSOFT_ENTRA_ID_SECRET: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };

  const serverProcess = spawn("npx", ["next", "dev", "-p", String(TEST_PORT)], {
    cwd: APP_DIR,
    env: serverEnv,
    stdio: "inherit",
    shell: true,
    detached: false,
  });
  await waitForPort(TEST_PORT, 60_000, serverProcess);

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ pgPid: pgProcess.pid, serverPid: serverProcess.pid, logDir: LOG_DIR, scratch: SCRATCH_DIR })
  );
}
