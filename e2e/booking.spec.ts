import { expect, test } from "@playwright/test";
import { PASSWORD, signInAs } from "./helpers";

/**
 * Booking money path in the payment sandbox: a learner books and pays, the teacher accepts with a Meet
 * link, and the learner sees the link. Lesson day, release, refunds and payouts are covered at database
 * level by scripts/check-migrations.mjs (the same functions the screens call).
 */
test.describe("booking in the sandbox", () => {
  test.skip(!PASSWORD, "set KOOBI_TEST_PASSWORD");

  test("learner books and pays; teacher accepts", async ({ browser }) => {
    const learner = await browser.newPage();
    await signInAs(learner, "learner");
    await learner.goto("/explore");
    const offers = learner.locator('a[href^="/offers/"]');
    test.skip((await offers.count()) === 0, "no approved offers on this deployment");
    await offers.first().click();
    const slot = learner.locator('a[href*="/book/"][href*="slot="]').first();
    test.skip((await slot.count()) === 0, "the first offer has no open times");
    await slot.click();
    await learner.getByRole("checkbox").first().check().catch(() => undefined); // cancellation policy acknowledgement
    await learner.getByRole("button", { name: /continue|pay|book/i }).first().click();
    await expect(learner).toHaveURL(/\/checkout\/.+\/pay/);
    await learner.locator('input[name="phone"]').fill("712345678");
    await learner.getByRole("button", { name: /with m-pesa/i }).click();
    await expect(learner).toHaveURL(/\/checkout\/.+\/status/);
    await learner.getByRole("button", { name: /simulate: pin entered/i }).click();
    await expect(learner.getByText(/paid|confirmed|waiting for/i).first()).toBeVisible({ timeout: 20_000 });
    const bookingId = learner.url().match(/checkout\/([0-9a-f-]{36})/)?.[1] ?? (await learner.url()).split("/bookings/")[1]?.split("/")[0];

    const teacher = await browser.newPage();
    await signInAs(teacher, "teacher");
    await teacher.goto(`/teach/bookings/${bookingId}`);
    test.skip((await teacher.getByRole("button", { name: /accept the booking/i }).count()) === 0, "the test teacher does not own this offer");
    const link = teacher.locator('input[name="meeting_link"]');
    if (await link.count()) await link.fill("https://meet.google.com/abc-defg-hij");
    await teacher.getByRole("button", { name: /accept the booking/i }).click();
    await expect(teacher.getByText(/accepted/i).first()).toBeVisible();

    await learner.goto(`/bookings/${bookingId}`);
    await expect(learner.getByRole("link", { name: /join the lesson/i })).toBeVisible();
  });
});
