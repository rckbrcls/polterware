import { defineConfig } from "@playwright/test";

const run = process.env.PWNOTES_E2E_RUN ?? "functional";
if (!/^[a-z0-9-]+$/.test(run)) throw new Error("Invalid PWNOTES_E2E_RUN label");
const resultRoot = `test-results/${run}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: process.env.PWNOTES_E2E_LIVE_NOTIFY === "1" ? "live/**/*.spec.ts" : process.env.PWNOTES_E2E_PERFORMANCE === "1" ? "perf/**/*.spec.ts" : "e2e/**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: `${resultRoot}/artifacts`,
  reporter: [["list"], ["html", { outputFolder: `${resultRoot}/html`, open: "never" }], ["json", { outputFile: `${resultRoot}/results.json` }]],
  use: { trace: "retain-on-failure" },
});
