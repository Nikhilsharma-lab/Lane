import { expect, test, type Page, type Route } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// #267 (Build 3, popup code loads on open): a popup's code arrives when someone reaches for it, so on an old tab
// after a deploy, or offline, it may never arrive. Then Lane says so inside the app and keeps what was typed: never
// a blank popup, never the page thrown out for an error screen. Try again opens it once the code can load.

const COULDNT_OPEN = "Couldn't open this";
const TEXT_KEPT = "Your text is still here.";

const toasts = (page: Page) => page.getByRole("region", { name: /^Messages/ });
const SCRIPT = /\/_next\/static\/.+\.js$/;

/**
 * An old tab after a deploy: the scripts the page loaded with are there, every script it asks for later is gone.
 * Returns the switch that makes later scripts load again.
 */
async function blockScriptsAfterLoad(page: Page) {
  let loaded = false;
  let blocking = true;
  page.on("load", () => { loaded = true; });
  const handler = (route: Route) => (loaded && blocking && SCRIPT.test(new URL(route.request().url()).pathname) ? route.abort("failed") : route.continue());
  await page.route("**/*", handler);
  return async () => { blocking = false; await page.unroute("**/*", handler); };
}

/** Fails every script whose text includes `marker`, as a deploy that removed that one file would. */
async function blockScriptsCarrying(page: Page, marker: string) {
  const handler = async (route: Route) => {
    if (!SCRIPT.test(new URL(route.request().url()).pathname)) return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    return body.includes(marker) ? route.abort("failed") : route.fulfill({ response, body });
  };
  await page.route("**/*", handler);
  return () => page.unroute("**/*", handler);
}

test("a popup whose code can't load says so inside Lane, keeps typed text, and opens on Try again", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("popup-code");
  try {
    await provisionAndSignIn(page, user, { name: "Popup Code PM", workspaceName: "Lane E2E Popup code", role: "pm" });
    await seedTestRequest(user.id, "Popup code Request");
    const thrownOut = page.getByRole("heading", { name: "This page couldn’t load" });

    await test.step("an old tab after a deploy: ? and C say Lane couldn't open them, and nothing blank opens", async () => {
      const unblock = await blockScriptsAfterLoad(page);
      await page.goto("/", { waitUntil: "load" });
      await expect(page.getByRole("row", { name: /Popup code Request/ }).first()).toBeVisible();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      await page.keyboard.press("?");
      await expect(toasts(page).getByText(COULDNT_OPEN).first()).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await page.keyboard.press("c");
      await expect(toasts(page).getByText(COULDNT_OPEN)).toHaveCount(2);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(thrownOut).toHaveCount(0);

      // Once the code can load, Try again opens the popup that couldn't.
      await unblock();
      await toasts(page).getByRole("button", { name: "Try again" }).first().click();
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    await test.step("a guarded popup keeps its typed text when the discard question can't load", async () => {
      await page.goto("/", { waitUntil: "load" });
      const unblock = await blockScriptsCarrying(page, "Discard what you typed");
      await page.getByRole("button", { name: "Save view", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Save view" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("textbox", { name: "Name" }).fill("Popup code view");
      await page.keyboard.press("Escape");

      await expect(toasts(page).getByText(COULDNT_OPEN).first()).toBeVisible();
      await expect(toasts(page).getByText(TEXT_KEPT).first()).toBeVisible();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Popup code view");
      await expect(thrownOut).toHaveCount(0);

      // With the code back, Escape asks first, as it always has.
      await unblock();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog", { name: "Discard what you typed?" }).or(page.getByRole("dialog", { name: "Discard what you typed?" }))).toBeVisible();
    });
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
