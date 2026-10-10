import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { assertE2ETarget } from "./e2e/helpers/safety";

// Clerk testing tokens only work with a Development instance. Load its keys
// from the ignored local env, then overlay Lane Staging's database settings.
// Production credentials are never used by this harness.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.staging.local", override: true });

if (process.env.STAGING_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.STAGING_DATABASE_URL;
}
const target = assertE2ETarget();

// Includes real Clerk provisioning/authentication and cross-region Supabase
// round trips. Workspace isolation took 57s; leave room for provider variance.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  expect: { timeout: 15_000 },
  use: {
    baseURL: target.baseURL,
    headless: true,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: target.baseURL === "https://lane-staging.vercel.app"
    ? undefined
    : {
        command:
          "LANE_ENV_FILE=/dev/null NEXT_DIST_DIR=.next-e2e PORT=3100 node node_modules/next/dist/bin/next dev",
        env: {
          ...process.env,
          LANE_ENV_FILE: "/dev/null",
          NEXT_DIST_DIR: ".next-e2e",
          DATABASE_URL: process.env.DATABASE_URL!,
          PORT: "3100",
        },
        url: target.baseURL,
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
