import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// #283 (Build 7 check page): Impact opened straight on the Outcome report threw React's hydration error (#418) on
// every load after the server's first, because the server's copy of the report's code changed what it rendered once
// it had loaded. Each load here is a fresh document, so the server has the report's code from the second load on.
// The browser runs in a zone far from the server's, so text the server dates in its own zone would differ too.

test.use({ timezoneId: "Pacific/Honolulu" });

/** React's hydration failures: the production build's minified errors (#418, #419, #423, #425) and dev's wording. */
const HYDRATION = /Minified React error #4(18|19|23|25)\b|Hydration failed|didn.t match the client|hydrat/i;

/** Hydration errors reported while `load` runs, as uncaught errors or console errors. */
async function hydrationErrors(page: Page, load: () => Promise<void>) {
  const errors: string[] = [];
  const onError = (error: Error) => { if (HYDRATION.test(error.message)) errors.push(error.message.slice(0, 200)); };
  const onConsole = (message: { type(): string; text(): string }) => { if (message.type() === "error" && HYDRATION.test(message.text())) errors.push(message.text().slice(0, 200)); };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  try {
    await load();
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
  }
  return errors;
}

test("Impact opened on the Outcome report hydrates without a mismatch, load after load", async ({ page }) => {
  test.setTimeout(240_000);
  const user = await createTestUser("impact-hydration");
  try {
    await provisionAndSignIn(page, user, { name: "Hydration Tester", workspaceName: "#283 Impact hydration" });
    const now = new Date();
    const address = `/impact?tab=outcome-report&period=${now.getUTCFullYear()}-q${Math.floor(now.getUTCMonth() / 3) + 1}`;
    for (const [width, height] of [[1440, 900], [390, 844], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      const errors = await hydrationErrors(page, async () => {
        await page.goto(address);
        await expect(page.getByRole("tab", { name: "Outcome report", exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tabpanel", { name: "Outcome report", exact: true })).toBeVisible();
        // Lane's popup behaviour loads once the page is idle, well after hydration has finished or failed.
        await expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(1, { timeout: 30_000 });
      });
      expect(errors, `hydration errors loading ${address} at ${width}px`).toEqual([]);
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
