import path from "node:path";
import fs from "node:fs";
import { test, expect, _electron as electron } from "@playwright/test";

// Launches the actual built executable (not `electron .` against
// source) so this catches the class of bug that only exists in the
// packaged artifact -- a missing extraResource, an asar/unpacked-path
// mismatch, a native module that didn't get rebuilt for Electron's
// Node ABI. Run `npm run dist` first; this doesn't build for you.
const EXE_PATH = path.join(__dirname, "..", "dist", "win-unpacked", "StageForge.exe");

// main.js binds the Next server here (see main.js's own comment on why
// it's deliberately not 3001, which is the live PM2 site's port).
const APP_URL_RE = /^http:\/\/localhost:3002\//;

test("packaged desktop app boots and reaches the portfolio", async () => {
  test.skip(
    !fs.existsSync(EXE_PATH),
    `${EXE_PATH} doesn't exist -- run "npm run dist" in electron/ first.`
  );

  const consoleErrors: string[] = [];
  const electronApp = await electron.launch({ executablePath: EXE_PATH });

  try {
    // main.js reuses one BrowserWindow throughout -- it may briefly show
    // a splash (data: URL) before navigating itself to the real app, so
    // this waits past that rather than asserting on whatever loaded
    // first.
    const page = await electronApp.firstWindow();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await page.waitForURL(APP_URL_RE, { timeout: 200_000 });

    // Sidebar wordmark + the portfolio's own heading -- together these
    // confirm the Next server actually came up AND rendered a real page
    // (not an error boundary, not a blank screen), auto-signed-in as
    // the local admin (see main.js's runtimeEnv comment on why no login
    // form appears in this build).
    await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("StageForge").first()).toBeVisible();
    await expect(page.getByText("Health").first()).toBeVisible();

    // A couple of the sidebar's other destinations -- catches a route
    // that 404s or crashes in the packaged build specifically (working
    // fine against `next dev` proves nothing about the standalone
    // server's own file resolution).
    await page.getByRole("link", { name: "Resources" }).click();
    await page.waitForURL(/\/resources$/, { timeout: 15_000 });
    await page.getByRole("link", { name: "Finance" }).click();
    await page.waitForURL(/\/finance$/, { timeout: 15_000 });

    expect(consoleErrors, `Unexpected browser console errors:\n${consoleErrors.join("\n")}`).toHaveLength(0);
  } finally {
    await electronApp.close();
  }
});
