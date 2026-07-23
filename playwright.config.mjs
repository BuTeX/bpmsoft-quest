import { defineConfig, devices } from "@playwright/test";

const port = 4175;
const baseURL = `http://127.0.0.1:${port}`;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "node server.js",
    url: `${baseURL}/ready`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
    env: {
      ...process.env,
      PORT: String(port),
      ADMIN_PASSWORD: "e2e-admin-password",
      PGSSLMODE: "disable",
      DATABASE_URL: testDatabaseUrl,
      REQUIRE_DATABASE: testDatabaseUrl ? "true" : "false"
    }
  }
});
