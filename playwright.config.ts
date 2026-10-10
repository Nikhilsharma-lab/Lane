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

// Plan item 1.15b: e2e/perf.spec.ts measures a running production build and
// runs only when LANE_PERF_BASE_URL is set. It provisions nothing and touches
// no database directly (it signs in with a saved storage state), so it skips
// the remote-fixture assertion and starts no server. The target is limited to
// a local build or Lane Staging.
const perfBaseURL = process.env.LANE_PERF_BASE_URL;
function perfTarget(value: string) {
  const url = new URL(value);
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.origin !== "https://lane-staging.vercel.app") || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("[perf] LANE_PERF_BASE_URL must be a local build (http://localhost:<port>) or https://lane-staging.vercel.app.");
  }
  return url.origin;
}

const perfConfig = perfBaseURL ? defineConfig({
  testDir: "./e2e",
  testMatch: /perf\.spec\.ts/,
  timeout: 300_000,
  retries: 0,
  workers: 1,
  expect: { timeout: 15_000 },
  use: { baseURL: perfTarget(perfBaseURL), headless: true, navigationTimeout: 30_000, actionTimeout: 15_000 },
  projects: [{ name: "perf", use: { ...devices["Desktop Chrome"] } }],
}) : null;

// Includes real Clerk provisioning/authentication and cross-region Supabase
// round trips. Workspace isolation took 57s; leave room for provider variance.
function e2eConfig() {
  const target = assertE2ETarget();
  return defineConfig({
    testDir: "./e2e",
    timeout: 120_000,
    retries: 0,
    expect: { timeout: 15_000 },
    // The perf spec runs only in the perf configuration above.
    testIgnore: /perf\.spec\.ts/,
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
}

export default perfConfig ?? e2eConfig();
