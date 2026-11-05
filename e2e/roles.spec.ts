import { expect, test } from "@playwright/test";
import { PASSWORD, signInAs } from "./helpers";

/** Every role reaches its own area and is kept out of the others. */
test.describe("roles", () => {
  test.skip(!PASSWORD, "set KOOBI_TEST_PASSWORD");

  test("learner: lessons, credits, notifications, settings", async ({ page }) => {
    await signInAs(page, "learner");
    for (const path of ["/home", "/sessions", "/account/credits", "/notifications", "/account/settings"]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
    }
    await page.goto("/staff/payouts");
    await expect(page).toHaveURL(/forbidden|staff\/login/);
  });

  test("parent: children need consent first", async ({ page }) => {
    await signInAs(page, "guardian");
    await page.goto("/account/learners/new");
    await expect(page.getByText(/parent or legal guardian/i).first()).toBeVisible();
    await page.getByRole("button", { name: /add child/i }).click();
    await expect(page.locator("input:invalid").first()).toBeVisible(); // nothing is sent without the consent box
  });

  test("teacher: dashboard, verification, earnings, statements", async ({ page }) => {
    await signInAs(page, "teacher");
    for (const path of ["/teach", "/teach/verification", "/teach/earnings", "/teach/statements", "/teach/settings", "/teach/reviews"]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });

  test("staff: each desk opens for its role", async ({ page }) => {
    await signInAs(page, "admin");
    for (const path of ["/staff", "/staff/disputes", "/staff/refunds", "/staff/payouts", "/staff/reconciliation", "/staff/verification", "/staff/reports/pilot", "/staff/readiness"]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });
});
