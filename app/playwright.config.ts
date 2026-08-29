import { defineConfig, devices } from "@playwright/test";
import { TEST_BASE_URL } from "./tests/desktop/constants";

// Regression suite for the desktop (STAGEFORGE_LOCAL_MODE) build --
// global-setup.ts provisions a completely fresh embedded Postgres +
// migrate/seed/anonymize + `next dev`, tests drive it as the Local
// Admin exactly the way a real first-time user would, global-teardown.ts
// tears it all down. Run with `npm run test:desktop` before cutting any
// installer or merging a change that touches seeding, permissions, or
// the project-creation/gate lifecycle.
export default defineConfig({
  testDir: "./tests/desktop",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  globalSetup: "./tests/desktop/global-setup.ts",
  globalTeardown: "./tests/desktop/global-teardown.ts",
  reporter: [["list"]],
  use: {
    baseURL: TEST_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
