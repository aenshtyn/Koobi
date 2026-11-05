import { expect, test } from "@playwright/test";

/** Public pages render, never say "tutor", and Explore links to real offers. */
test.describe("public site", () => {
  for (const path of ["/", "/explore", "/how-it-works", "/pricing", "/trust", "/terms", "/privacy"]) {
    test(`${path} renders`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator("h1").first()).toBeVisible();
      expect((await page.locator("body").innerText()).toLowerCase()).not.toMatch(/\btutors?\b|holiday tuition/);
    });
  }

  test("an offer page shows a price and a way to book", async ({ page }) => {
    await page.goto("/explore");
    const first = page.locator('a[href^="/offers/"]').first();
    test.skip((await first.count()) === 0, "no approved offers on this deployment");
    await first.click();
    await expect(page.locator("text=/KES [0-9,]+/").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /book/i }).first()).toBeVisible();
  });
});
