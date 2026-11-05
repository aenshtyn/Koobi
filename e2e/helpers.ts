import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.KOOBI_TEST_PASSWORD ?? "";

/** Signs in through /signin/test as one of the test accounts and waits to leave the sign-in page. */
export async function signInAs(page: Page, key: string) {
  await page.goto("/signin/test");
  await page.locator(`input[name="account"][value="${key}"]`).check({ force: true });
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').last().click();
  await expect(page).not.toHaveURL(/\/signin\/test/, { timeout: 20_000 });
}
