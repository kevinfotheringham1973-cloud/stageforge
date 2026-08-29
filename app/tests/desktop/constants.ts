import os from "os";
import path from "path";

// Fixed, deliberately never-colliding with any other port this codebase
// already uses: dev (3001), tunnel/PM2 (3001), packaged Electron (3002),
// docker-compose Postgres (5433), desktop build's bundled Postgres
// (5434) -- see localDb.js's own comment for why it picked 5434 for the
// same reason.
export const TEST_PORT = 3900;
export const TEST_DB_PORT = 5555;
export const TEST_BASE_URL = `http://localhost:${TEST_PORT}`;
export const TEST_DB_USER = "stageforge_test";
export const TEST_DB_PASSWORD = "stageforge-test-only";
export const TEST_DB_NAME = "stageforge_test";

export function buildTestDatabaseUrl(): string {
  return `postgresql://${TEST_DB_USER}:${TEST_DB_PASSWORD}@localhost:${TEST_DB_PORT}/${TEST_DB_NAME}?schema=public`;
}

export const SCRATCH_DIR = path.join(os.tmpdir(), "stageforge-playwright");
export const PG_DATA_DIR = path.join(SCRATCH_DIR, "pgdata");
export const EVIDENCE_DIR = path.join(SCRATCH_DIR, "evidence");
export const LOG_DIR = path.join(SCRATCH_DIR, "logs");
export const STATE_FILE = path.join(SCRATCH_DIR, "state.json");
export const SERVER_ERROR_LOG = path.join(LOG_DIR, "server-errors.log");
