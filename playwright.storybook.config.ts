import { defineConfig } from "@playwright/test"

type BaselineApproval = {
  approved: boolean
  reviewedBy: string | null
  reviewedAt: string | null
  environment: string | null
  sourceCommit: string | null
}

// Deliberately unapproved. Candidate captures are review artifacts, not baselines.
// Complete this manifest only after the user accepts the corresponding images
// captured in the same pinned browser/OS/font environment as comparison runs.
export const visualBaselineApproval: BaselineApproval = {
  approved: false,
  reviewedBy: null,
  reviewedAt: null,
  environment: null,
  sourceCommit: null,
}

export const visualReviewMode = process.env.LANE_VISUAL_MODE ?? "review"
const boundaryStories = /patterns-requests--populated|primitives-controls--variants|primitives-form-controls--text-field|primitives-overlays--open-dialog-with-long-content/

if (visualReviewMode !== "review" && visualReviewMode !== "compare") {
  throw new Error("LANE_VISUAL_MODE must be review or compare.")
}

if (
  visualReviewMode === "compare" &&
  (!visualBaselineApproval.approved ||
    !visualBaselineApproval.reviewedBy ||
    !visualBaselineApproval.reviewedAt ||
    !visualBaselineApproval.environment ||
    !visualBaselineApproval.sourceCommit)
) {
  throw new Error(
    "Visual comparison is blocked: no reviewed baseline set is approved. " +
    "Run review mode, have the candidate images accepted, then follow storybook-tests/README.md. " +
    "A passing candidate capture is not a passing visual regression check."
  )
}

export default defineConfig({
  testDir: "./storybook-tests",
  testMatch: "visual.spec.ts",
  outputDir: "./test-results/storybook-visual",
  snapshotPathTemplate: "{testDir}/baselines/{projectName}/{arg}{ext}",
  updateSnapshots: "none",
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 0 },
  },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:6006",
    browserName: "chromium",
    headless: true,
    locale: "en-US",
    timezoneId: "UTC",
    contextOptions: { reducedMotion: "reduce" },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-light", use: { viewport: { width: 1440, height: 1000 }, colorScheme: "light" } },
    { name: "desktop-dark", use: { viewport: { width: 1440, height: 1000 }, colorScheme: "dark" } },
    { name: "mobile-light", use: { viewport: { width: 390, height: 844 }, colorScheme: "light", isMobile: true, hasTouch: true } },
    { name: "mobile-dark", use: { viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true } },
    ...[639, 640, 767, 768].flatMap(width => (["light", "dark"] as const).map(colorScheme => ({
      name: `boundary-${width}-${colorScheme}`,
      grep: boundaryStories,
      use: { viewport: { width, height: 1000 }, colorScheme, isMobile: width < 640, hasTouch: true },
    }))),
  ],
  webServer: {
    command: "node_modules/.bin/storybook dev --ci --no-open --host 127.0.0.1 -p 6006",
    url: "http://127.0.0.1:6006/index.json",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { STORYBOOK_DISABLE_TELEMETRY: "1" },
  },
})
