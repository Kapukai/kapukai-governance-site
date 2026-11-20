import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "browser-checks.spec.mjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 45_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 7_000 },
  outputDir: "artifacts/test-output",
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/results.json" }],
    ["html", { outputFolder: "artifacts/report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    serviceWorkers: "block",
  },
  // The local server exists only for the test run. No credentials or deploy API.
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory ../..",
    url: "http://127.0.0.1:4173/circuit/",
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
