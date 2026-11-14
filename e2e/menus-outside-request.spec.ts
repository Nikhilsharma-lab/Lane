import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { focusInside, hiddenButFocusable } from "./helpers/menu-focus";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// #281 (B37) made what's behind an open Arc Select or DropdownMenu inert, in the shared Arc wrappers, so it holds on
// every page. Outside the Request page: a Select inside a popup keeps that popup usable once it closes, and a menu
// item that opens its own popup leaves that popup usable; while either menu is open, nothing behind it takes Tab.

const DISCARD = "Discard what you typed?";

async function withWorkspace(page: Page, label: string, run: () => Promise<void>) {
  const user = await createTestUser(label);
  try {
    await provisionAndSignIn(page, user, { name: "Menu Tester", workspaceName: `#281 ${label}` });
    // The Requests list offers Save view once it has a Request.
    await seedTestRequest(user.id, `${label}: menus and focus`);
    await run();
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
}

const behaviourReady = (page: Page) => expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(1, { timeout: 30_000 });

/** Nothing outside `inside` is inert: that popup takes input and Tab. */
const inertOver = (inside: Locator) => inside.evaluate(element => Boolean(element.closest("[inert]")) || [...element.querySelectorAll("[inert]")].length > 0);

/** With the menu open, focus is in it, Tab keeps it there, and nothing behind it (the popup, the page) takes focus. */
async function expectOnlyTheMenu(page: Page, role: "menu" | "listbox") {
  await expect(page.getByRole(role)).toBeVisible();
  await expect.poll(() => focusInside(page, role)).toBe(true);
  expect(await hiddenButFocusable(page)).toEqual([]);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInside(page, role)).toBe(true);
  }
}

test.describe("#281 menus outside the Request page (B37)", () => {
  test("a Select inside the Create metric popup: open, nothing behind takes Tab; closed, the popup is usable again", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "select-in-popup", async () => {
      await page.goto("/settings/metrics");
      await behaviourReady(page);
      await page.getByRole("button", { name: "Add metric", exact: true }).click();
      const create = page.getByRole("dialog", { name: "Create metric", exact: true });
      await create.getByText("How long does it take?", { exact: true }).click();
      await create.getByRole("button", { name: "Continue", exact: true }).click();
      const name = create.getByRole("textbox", { name: "Name this metric" });
      await expect(name).toBeFocused();
      await name.fill("Checkout time");
      const unit = create.getByRole("combobox", { name: "Measure in seconds or minutes?" });

      await unit.focus();
      await page.keyboard.press("Enter");
      await expectOnlyTheMenu(page, "listbox");
      // Escape closes only the list: the popup stays, asks nothing, and its trigger has focus again.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await expect(page.getByRole("dialog", { name: DISCARD, exact: true })).toHaveCount(0);
      await expect(create).toBeVisible();
      await expect(unit).toBeFocused();
      expect(await inertOver(create)).toBe(false);

      // Choosing by keyboard closes the list and hands focus back to it, inside a popup that takes input again.
      await page.keyboard.press("Enter");
      await expectOnlyTheMenu(page, "listbox");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await expect(unit).toBeFocused();
      expect(await inertOver(create)).toBe(false);
      await expect(unit).toContainText("Seconds");
      await name.focus();
      await page.keyboard.type(" in seconds");
      await expect(name).toHaveValue("Checkout time in seconds");
      await page.keyboard.press("Tab");
      expect(await focusInside(page, "dialog")).toBe(true);
    });
  });

  test("the Saved view menu: open, nothing behind takes Tab; Rename opens its own popup, which takes input and Tab", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "menu-to-popup", async () => {
      await page.goto("/");
      await behaviourReady(page);
      await page.getByRole("button", { name: "Save view", exact: true }).click();
      const saveDialog = page.getByRole("dialog", { name: "Save view", exact: true });
      await saveDialog.getByRole("textbox", { name: "Name" }).fill("Menu check view");
      await page.keyboard.press("Enter");
      await expect(saveDialog).toHaveCount(0);
      const saved = page.getByRole("button", { name: "Saved view", exact: true });
      await expect(saved).toBeFocused({ timeout: 20_000 });

      await page.keyboard.press("Enter");
      await expectOnlyTheMenu(page, "menu");
      await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toHaveCount(0);
      await page.getByRole("menuitem", { name: "Rename view…" }).click();
      const rename = page.getByRole("dialog", { name: "Rename view", exact: true });
      const name = rename.getByRole("textbox", { name: "Name" });
      await expect(name).toBeFocused();
      expect(await inertOver(rename)).toBe(false);
      await name.fill("Menu check view, renamed");
      await expect(name).toHaveValue("Menu check view, renamed");
      // Tab moves through the popup's own controls and stays in it.
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        expect(await focusInside(page, "dialog")).toBe(true);
      }
      await rename.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(rename).toHaveCount(0);
      await expect(saved).toBeFocused();
      // Closed, the page is whole again: the skip link takes focus.
      const skip = page.getByRole("link", { name: "Skip to content", exact: true });
      await skip.focus();
      await expect(skip).toBeFocused();
    });
  });
});
