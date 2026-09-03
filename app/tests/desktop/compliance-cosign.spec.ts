// Regression test for a real bug found live, 29 Aug 2026: a compliance
// requirement with additionalApproverRoleKeys (e.g. HAI-SCRIBE's
// Client Authority co-sign, seed.ts) stayed at "additional sign-off
// required" after "Override all outstanding" -- technically still
// clearable (Local Admin holds every role), but indistinguishable from
// a genuine dead end to someone who has no one else to hand it to in a
// single-user build. Fixed by auto-signing every additionalApprover
// role at the same moment an item is overridden/evidenced, in local
// mode only (see actions.ts's autoCoSignForLocalMode). This test
// reproduces the exact scenario: a Fire Alarm project tagged
// occupied_during_works, which pulls in both a FIRE_OFFICER-exact-match
// requirement (Fire (Scotland) Act 2005) and the HAI-SCRIBE co-sign
// requirement onto the same gate, and asserts ONE override click
// reaches 100% clear with no separate co-sign action needed.
import { test, expect } from "@playwright/test";

test("overriding a gate with a co-signed compliance item clears it in one click", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Sign out (Local Admin)")).toBeVisible({ timeout: 15_000 });

  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Compliance Co-Sign Regression Test");
  await page.getByLabel("System / Template").selectOption({ label: "Fire Alarm & Detection Systems Replacement" });
  await page.getByLabel("Description").fill("Replace the fire alarm system, live occupied hospital.");
  await page.getByLabel(/Direct replacement, multiple contractors/).check();
  await page.getByLabel(/Yes \/ not sure yet/).check();
  await page.getByRole("button", { name: "Match & create draft" }).click();
  await page.waitForURL(/\/projects\/\d+\/provisioning$/, { timeout: 20_000 });

  // No AI key in the desktop build, so tags are never auto-proposed --
  // set the two that pull in the fire + co-sign requirements by hand,
  // exactly as the draft-review UI expects a real user to.
  await page.getByLabel("Tags (comma-separated)").fill("occupied_during_works, hot_works_affected");
  await page.getByRole("button", { name: "Update draft" }).click();
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: "Approve & activate" }).click();
  await page.waitForURL(/\/projects\/\d+$/, { timeout: 20_000 });

  await page.getByRole("link", { name: /^Gate 3 —/ }).click();
  await page.waitForURL(/\/gates\//, { timeout: 15_000 });

  const beforeText = await page.locator("body").innerText();
  const before = beforeText.match(/COMPLIANCE · (\d+) OF (\d+) CLEAR/);
  expect(before, `expected a COMPLIANCE line on Gate 3, got:\n${beforeText.slice(0, 2000)}`).not.toBeNull();
  const totalRequirements = Number(before![2]);
  expect(totalRequirements, "expected at least one compliance requirement on Gate 3").toBeGreaterThan(0);

  await page.getByPlaceholder(/Reason for overriding all outstanding/).fill("Regression test override");
  await page.getByRole("button", { name: "Override all outstanding" }).click();
  await page.waitForTimeout(2000);
  await page.reload();
  await page.waitForTimeout(500);

  // The exact regression: before the fix this read "1 OF 2 CLEAR" with
  // a separate "Sign off as Client Authority" button still sitting
  // there, unclearable-looking without a second, easy-to-miss click.
  const afterText = await page.locator("body").innerText();
  const after = afterText.match(/COMPLIANCE · (\d+) OF (\d+) CLEAR/);
  expect(after, `expected a COMPLIANCE line on Gate 3 after override, got:\n${afterText.slice(0, 2000)}`).not.toBeNull();
  expect(
    Number(after![1]),
    `expected all ${totalRequirements} compliance requirements clear after one override, got "${after![0]}"`
  ).toBe(totalRequirements);
  expect(afterText, "expected no leftover 'Sign off as X' co-sign button after the override").not.toMatch(
    /Sign off as /
  );
});
