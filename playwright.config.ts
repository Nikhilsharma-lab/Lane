import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { assertE2ETarget } from "./e2e/helpers/safety";

// Loads the ignored local env, then overlays Lane Staging's settings (its
// database, its storage and its BETTER_AUTH_SECRET, pinned by fingerprint in
// e2e/helpers/safety.ts). Production credentials are never used by this harness.
//
// #257: LANE_E2E_LOCAL_DATABASE=1 runs against a local `lane_test_*` database
// instead (DATABASE_URL from the shell, which .env.local doesn't override), with
// the app on E2E_BASE_URL's local port and .env.local's own BETTER_AUTH_SECRET;
// e2e/helpers/safety.ts checks them. docs/agents/local-browser-checks.md §7.
const localDatabase = process.env.LANE_E2E_LOCAL_DATABASE === "1";
// LANE_E2E_START=1 serves the production build already in .next (`pnpm build`) with `next start` instead of
// starting `next dev`, so a local run checks what ships. docs/agents/local-browser-checks.md §7.
const serveBuild = process.env.LANE_E2E_START === "1";
const distDir = serveBuild ? ".next" : ".next-e2e";
dotenv.config({ path: ".env.local" });
if (!localDatabase) {
  dotenv.config({ path: ".env.staging.local", override: true });
  if (process.env.STAGING_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.STAGING_DATABASE_URL;
  }
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

// Cloudflare's published always-pass Turnstile keys, for the app this config starts. `pnpm build` writes the site key
// into the browser bundle, so a build served with LANE_E2E_START=1 needs it in its own environment too.
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const TURNSTILE_TEST_KEYS = {
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};

// A staging run makes cross-region Supabase round trips; leave room for them.
function e2eConfig() {
  const target = assertE2ETarget();
  // Fixtures keep their verified session connection; the app matches hosted
  // serverless runtime pooling without changing the pinned staging identity.
  const runtimeDatabaseUrl = new URL(target.databaseUrl);
  if (runtimeDatabaseUrl.hostname.endsWith(".pooler.supabase.com")) runtimeDatabaseUrl.port = "6543";
  const port = new URL(target.baseURL).port || "3100";
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
        testMatch: /better-auth\.setup\.ts/,
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
            `LANE_ENV_FILE=/dev/null NEXT_DIST_DIR=${distDir} PORT=${port} node node_modules/next/dist/bin/next ${serveBuild ? `start -p ${port}` : "dev"}`,
          env: {
            ...process.env,
            LANE_ENV_FILE: "/dev/null",
            NEXT_DIST_DIR: distDir,
            DATABASE_URL: runtimeDatabaseUrl.toString(),
            PORT: port,
            BETTER_AUTH_URL: target.baseURL,
            ...TURNSTILE_TEST_KEYS,
          },
          url: target.baseURL,
          reuseExistingServer: false,
          // A fresh checkout compiles both the app entry and the sign-in page before
          // Playwright's readiness request completes.
          timeout: 120_000,
        },
  });
}

export default perfConfig ?? e2eConfig();
