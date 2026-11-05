import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks against a running Koobi (local `npm run dev`, or the test deployment). They sign in
 * with the test accounts (`npm run test-users`), so the target must have KOOBI_TEST_LOGINS=true and the
 * payment sandbox (no PAYSTACK_SECRET_KEY). Never point them at production.
 *
 *   E2E_BASE_URL=http://localhost:3100 KOOBI_TEST_PASSWORD=… npm run e2e
 *
 * Browsers: `npx playwright install chromium` once.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
