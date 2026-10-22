import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedRowIdentityFixtures } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";
import { capturePaintedTheme } from "./theme-parity/capture";
import {
  compareThemes,
  type KNOWN_EXCEPTIONS,
  type Mode,
  type ThemeBaseline,
} from "./theme-parity/compare";
import { THEME_NAMES } from "./theme-parity/names";

/**
 * Theme parity (spec #87, Seam 1): Lane must paint exactly what it painted
 * before the theme switch, on the sign-in screen, Requests, Request detail,
 * Intake and Settings, in light and dark.
 *
 * Re-record the baseline (only when a visible change is intended):
 *   LANE_E2E_ALLOW_REMOTE=1 pnpm theme-parity:record
 */
const BASELINE = path.join(__dirname, "theme-parity", "baseline.json");
const RECORD = process.env.LANE_THEME_PARITY_RECORD === "1";
const MODES: Mode[] = ["light", "dark"];

/** Differences the switch is allowed to make, by name (spec #87, Further Notes). */
const ALLOWED: (keyof typeof KNOWN_EXCEPTIONS)[] = [
  "wide-gamut dark primary",
  "wide-gamut destructive text",
  "pre-Geist fallback font",
];

async function settle(page: Page, mode: Mode) {
  if (mode === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
  else await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.addStyleTag({
    content:
      "nextjs-portal { display: none !important; } *, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

async function record(
  captured: ThemeBaseline,
  page: Page,
  name: string,
  open: () => Promise<void>
) {
  captured[name] = {};
  for (const mode of MODES) {
    await page.emulateMedia({ colorScheme: mode });
    await open();
    await settle(page, mode);
    captured[name][mode] = await capturePaintedTheme(page, THEME_NAMES);
  }
}

test("Lane paints the same theme on every page in light and dark", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const captured: ThemeBaseline = {};
  const viewport = { width: 1280, height: 800 };

  const signedOut = await browser.newContext({ viewport });
  try {
    const page = await signedOut.newPage();
    await record(captured, page, "sign-in", async () => {
      await page.goto("/login");
      // Clerk's card mounts on the client; its submit button means it has painted.
      await expect(page.locator(".cl-formButtonPrimary").first()).toBeVisible();
    });
  } finally {
    await signedOut.close();
  }

  const signedIn = await browser.newContext({ viewport });
  const user = await createTestUser("theme-parity");
  try {
    const page = await signedIn.newPage();
    await provisionAndSignIn(page, user, {
      name: "Theme Parity Test",
      workspaceName: "Theme Parity Workspace",
    });
    const { requestId } = await seedRowIdentityFixtures(user.id);

    await record(captured, page, "requests", async () => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
      await expect(
        page.locator('[data-slot="row"]').filter({
          hasText: "Help customers understand why their Requests changed",
        })
      ).toBeVisible();
    });
    await record(captured, page, "request-detail", async () => {
      await page.goto(`/requests/${requestId}`);
      await expect(
        page.locator('[data-slot="row-group"][aria-label="Request comments"]')
      ).toBeVisible();
    });
    await record(captured, page, "intake", async () => {
      await page.goto("/intake");
      await expect(page.getByPlaceholder("Request title")).toBeVisible();
    });
    await record(captured, page, "settings", async () => {
      await page.goto("/settings/profile");
      // The loading skeleton also says "Settings"; only the loaded page has this region.
      await expect(page.getByRole("region", { name: "Settings content" })).toBeVisible();
    });
  } finally {
    await signedIn.close();
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }

  if (RECORD) {
    writeFileSync(BASELINE, `${JSON.stringify(captured, null, 2)}\n`);
    test.info().annotations.push({ type: "theme-parity", description: `recorded ${BASELINE}` });
    return;
  }

  expect(
    existsSync(BASELINE),
    "No theme baseline yet: record it from the pre-switch build with `LANE_E2E_ALLOW_REMOTE=1 pnpm theme-parity:record`"
  ).toBe(true);
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as ThemeBaseline;
  const { failures, excused } = compareThemes(baseline, captured, ALLOWED);
  for (const description of excused) {
    test.info().annotations.push({ type: "allowed difference", description });
  }
  expect(failures, "Painted differently from the recorded baseline").toEqual([]);
});
