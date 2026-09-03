// Encodes the full manual regression sweep from the 29 Aug 2026 session
// into an automated run: create a project exactly the way a new desktop
// user would, activate it, then clear every one of Gates 0-7 as the
// Local Admin (bypass/override/co-sign/submit/approve), and finally
// assert the new onRequestError logging hook (instrumentation.ts)
// recorded zero real server errors along the way. Any regression in
// seeding, the compliance-bypass-for-Local-Admin fix, or the
// project-creation flow itself should show up here before it ever
// reaches a packaged installer.
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import { SERVER_ERROR_LOG } from "./constants";

let projectPath: string;

test.describe.serial("desktop full lifecycle", () => {
  // One shared page/browser context for the whole describe block --
  // Playwright gives each `test()` a fresh context by default, which
  // drops the auto-signed-in session cookie between tests. A real
  // Local Admin walking Gates 0-7 stays in one continuous session, so
  // the regression suite should too.
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("creates and activates a new project as Local Admin", async () => {
    await page.goto("/");
    await expect(page.getByText("Sign out (Local Admin)")).toBeVisible({ timeout: 15_000 });

    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill("Playwright Regression Test");
    await page.getByLabel("System / Template").selectOption({ label: "Electrical Services Replacement" });
    await page
      .getByLabel("Description")
      .fill("Replace distribution boards on Ward 12, live hospital, phased over weekends.");
    await page.getByLabel(/Direct replacement, multiple contractors/).check();
    await page.getByLabel(/Yes \/ not sure yet/).check();

    await page.getByRole("button", { name: "Match & create draft" }).click();
    await page.waitForURL(/\/projects\/\d+\/provisioning$/, { timeout: 20_000 });

    await page.getByRole("button", { name: "Approve & activate" }).click();
    await page.waitForURL(/\/projects\/\d+$/, { timeout: 20_000 });

    await expect(page.getByRole("heading", { name: "Playwright Regression Test" })).toBeVisible();
    projectPath = new URL(page.url()).pathname;
  });

  for (const gateNumber of [0, 1, 2, 3, 4, 5, 6, 7]) {
    test(`clears Gate ${gateNumber}`, async () => {
      await page.goto(projectPath);
      await page.getByRole("link", { name: new RegExp(`^Gate ${gateNumber} —`) }).click();
      await page.waitForURL(/\/gates\//, { timeout: 15_000 });

      const result = await clearGate(page);
      expect(result.signedOff, `Gate ${gateNumber} did not reach "Signed off by": ${JSON.stringify(result)}`).toBe(
        true
      );
    });
  }

  test("recorded zero real server errors across the whole lifecycle", async () => {
    const entries = fs.existsSync(SERVER_ERROR_LOG)
      ? fs
          .readFileSync(SERVER_ERROR_LOG, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
    expect(entries, `server-errors.log had ${entries.length} entr${entries.length === 1 ? "y" : "ies"}:\n${JSON.stringify(entries, null, 2)}`).toHaveLength(
      0
    );
  });
});

async function clearGate(page: Page): Promise<{ bypassed: number; cosigned: number; signedOff: boolean; log: string[] }> {
  return page.evaluate(async () => {
    function setVal(input: HTMLInputElement, val: string) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, val);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const log: string[] = [];
    let bypassCount = 0;
    while (true) {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Bypass");
      if (!btn) break;
      const row = btn.closest("div");
      const reasonInput = row?.querySelector<HTMLInputElement>('input[placeholder*="bypass" i], input[placeholder*="reason" i]');
      if (reasonInput) setVal(reasonInput, "Regression test bypass");
      btn.click();
      bypassCount++;
      await new Promise((r) => setTimeout(r, 1200));
      if (bypassCount > 30) break;
    }
    log.push("bypassed=" + bypassCount);

    const overrideBtn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Override all outstanding"
    );
    if (overrideBtn) {
      const reasonInput = [...document.querySelectorAll("input")].find((i) =>
        /overriding all outstanding/i.test((i as HTMLInputElement).placeholder || "")
      ) as HTMLInputElement | undefined;
      if (reasonInput) setVal(reasonInput, "Regression test override");
      overrideBtn.click();
      await new Promise((r) => setTimeout(r, 1800));
      log.push("overrode compliance");
    } else {
      log.push("no bulk compliance override needed");
    }

    let cosignCount = 0;
    while (true) {
      const btn = [...document.querySelectorAll("button")].find((b) => /^Sign off as /.test(b.textContent?.trim() ?? ""));
      if (!btn) break;
      btn.click();
      cosignCount++;
      await new Promise((r) => setTimeout(r, 1800));
      if (cosignCount > 10) break;
    }
    log.push("cosigned=" + cosignCount);

    const submitBtn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Submit for Sponsor approval"
    );
    if (submitBtn) {
      submitBtn.click();
      await new Promise((r) => setTimeout(r, 1800));
      log.push("submitted");
    } else {
      log.push("NO SUBMIT BUTTON");
    }

    const approveBtn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Approve gate");
    if (approveBtn) {
      approveBtn.click();
      await new Promise((r) => setTimeout(r, 1800));
      log.push("approved");
    } else {
      log.push("NO APPROVE BUTTON");
    }

    const signedOff = document.body.textContent?.includes("Signed off by") ?? false;
    return { bypassed: bypassCount, cosigned: cosignCount, signedOff, log };
  });
}
