import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Sized for cross-region latency: local dev ↔ Supabase Tokyo (~200ms/round-trip,
// spikes on cold connections). Worst observed passing test: ~19s at 30s default.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    headless: true,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        port: 3000,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
