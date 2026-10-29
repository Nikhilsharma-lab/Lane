import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

// #263 (Build 2.4, spec #256 "Focus, Escape and confirmations" and "Phone bottom panel"): focus moves into what
// opens and back to what opened it, Escape closes only the top layer and asks before dropping typed text, the
// permanent-action confirmation opens on Cancel, and under 640px Lane's dialogs are one bottom panel.

const DISCARD = "Discard what you typed?";
const discardPrompt = (page: Page) => page.getByRole("dialog", { name: DISCARD, exact: true });

async function blurToPage(page: Page) {
  // A click on blank page, which leaves focus on the document: the walk's repro for B2 and C2-1.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
}

async function withWorkspace(page: Page, label: string, run: (user: TestUser, requestId: string) => Promise<void>) {
  const user = await createTestUser(label);
  try {
    await provisionAndSignIn(page, user, { name: "Focus Tester", workspaceName: `#263 ${label}` });
    const { id } = await seedTestRequest(user.id, `${label}: focus and Escape`);
    await run(user, id);
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
}

async function openRequest(page: Page, id: string) {
  await page.goto(`/requests/${id}`);
  await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot="request-workspace-keyboard"][data-ready="true"]')).toHaveCount(1);
}

function dialogBox(locator: Locator) {
  return locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight };
  });
}

test.describe("#263 focus, Escape and the phone bottom panel", () => {
  test("Escape on a Request page form asks before dropping typed text, and just closes it with nothing typed (B2, B3, C2-1)", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "escape-form", async (_user, id) => {
      await openRequest(page, id);
      const reviewers = page.locator("#reviewers");
      const add = reviewers.getByRole("button", { name: "Add reviewer", exact: true });
      await add.click();
      // B3: opening the form moves focus into it.
      const question = reviewers.getByRole("textbox");
      await expect(reviewers.locator("[data-detail-form]")).toHaveCount(1);
      await expect.poll(() => reviewers.locator("[data-detail-form]").evaluate(form => form.contains(document.activeElement))).toBe(true);

      await question.fill("Does the empty state read well on a phone?");
      await blurToPage(page);
      await page.keyboard.press("Escape");
      const prompt = discardPrompt(page);
      await expect(prompt).toBeVisible();
      await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(prompt).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));
      await expect(question).toHaveValue("Does the empty state read well on a phone?");

      // Escape from inside the field asks too; Discard closes the form and focus goes back to its button.
      await question.focus();
      await page.keyboard.press("Escape");
      await expect(prompt).toBeVisible();
      await prompt.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(reviewers.locator("[data-detail-form]")).toHaveCount(0);
      await expect(add).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));

      // With nothing typed, Escape just closes the form; the page stays.
      await add.click();
      await expect(reviewers.locator("[data-detail-form]")).toHaveCount(1);
      await blurToPage(page);
      await page.keyboard.press("Escape");
      await expect(reviewers.locator("[data-detail-form]")).toHaveCount(0);
      await expect(prompt).toHaveCount(0);
      await expect(add).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));

      // C2-1 and C2-3: a Journey step form. Opening moves focus into it, Cancel hands it back to its button.
      const lifecycle = page.locator('[data-slot="request-lifecycle-actions"]:visible');
      await lifecycle.getByRole("button", { name: "Pick up", exact: true }).click();
      // Wait for the saved pickup before reloading, as request-release.spec.ts does.
      await expect(lifecycle.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible({ timeout: 20_000 });
      await openRequest(page, id);
      const journey = page.getByRole("region", { name: "Journey", exact: true });
      const closeWithout = journey.getByRole("button", { name: /^Close without a result/ });
      await closeWithout.click({ timeout: 20_000 });
      const form = journey.locator("[data-detail-form]");
      await expect.poll(() => form.evaluate(element => element.contains(document.activeElement))).toBe(true);
      await form.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(closeWithout).toBeFocused();

      await closeWithout.click();
      const details = form.getByRole("textbox", { name: "Details (optional)" });
      await details.fill("Measured on the wrong cohort; starting over.");
      await blurToPage(page);
      await page.keyboard.press("Escape");
      await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(prompt).toHaveCount(0);
      await expect(details).toHaveValue("Measured on the wrong cohort; starting over.");
      await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));
      await blurToPage(page);
      await page.keyboard.press("Escape");
      await prompt.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(closeWithout).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));
    });
  });

  test("each shared popup takes focus, opens a confirmation on Cancel and hands focus back (A26, B4, B31, C2-13)", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "focus-return", async (_user, id) => {
      await openRequest(page, id);
      const strip = page.locator('[data-slot="page-strip"]');

      // B31: the permanent-action confirmation opens on Cancel; Escape hands focus back to Delete.
      const del = strip.getByRole("button", { name: "Delete Request", exact: true });
      await del.click();
      const confirm = page.getByRole("dialog", { name: "Delete this Request?", exact: true });
      await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      const centred = await dialogBox(confirm);
      expect(Math.abs((centred.left + centred.right) / 2 - centred.width / 2)).toBeLessThan(2);
      expect(centred.bottom).toBeLessThan(centred.height);
      await page.keyboard.press("Escape");
      await expect(confirm).toHaveCount(0);
      await expect(del).toBeFocused();

      // Edit Request: focus goes to its first field, a menu inside closes alone on Escape, then focus returns.
      const edit = strip.getByRole("button", { name: "Edit Request", exact: true });
      await edit.click();
      const editor = page.getByRole("dialog", { name: "Edit Request", exact: true });
      await expect(editor.getByRole("textbox").first()).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => editor.evaluate(dialog => dialog.contains(document.activeElement) && document.activeElement?.getAttribute("aria-label") !== "Close dialog")).toBe(true);
      await editor.getByRole("combobox", { name: /^Priority: / }).click();
      const options = page.getByRole("listbox");
      await expect(options).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(options).toHaveCount(0);
      await expect(editor).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);
      await expect(edit).toBeFocused();

      // C2-13 and B4: "Is it live?" opens on Not yet; Escape never drops focus on the page.
      const lifecycle = page.locator('[data-slot="request-lifecycle-actions"]:visible');
      await lifecycle.getByRole("button", { name: "Pick up", exact: true }).click();
      await lifecycle.getByRole("button", { name: "Mark Done", exact: true }).click({ timeout: 20_000 });
      const live = page.getByRole("dialog", { name: "Is it live?", exact: true });
      await expect(live).toBeVisible({ timeout: 20_000 });
      await expect(live.getByRole("button", { name: "Not yet", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(live).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)).toBe(true);

      // A26: saving a view puts focus on the Saved view button that replaces Save view.
      await page.goto("/");
      const save = page.getByRole("button", { name: "Save view", exact: true });
      await save.click();
      const saveDialog = page.getByRole("dialog", { name: "Save view", exact: true });
      const name = saveDialog.getByRole("textbox", { name: "Name" });
      await expect(name).toBeFocused();
      await name.fill("Focus check view");
      await page.keyboard.press("Enter");
      await expect(saveDialog).toHaveCount(0);
      const saved = page.getByRole("button", { name: "Saved view", exact: true });
      await expect(saved).toBeVisible({ timeout: 20_000 });
      await expect(saved).toBeFocused();
      await page.waitForTimeout(1500);
      await expect(saved).toBeFocused();

      // The shortcuts dialog hands focus back to where ? was pressed.
      await saved.focus();
      await page.keyboard.press("Shift+?");
      const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
      await expect(shortcuts).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(shortcuts).toHaveCount(0);
      await expect(saved).toBeFocused();
    });
  });

  test("under 640px a dialog is a bottom panel that keeps focus and closes with Back or Close", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await withWorkspace(page, "bottom-panel", async (_user, id) => {
      await openRequest(page, id);
      const del = page.locator('[data-slot="page-strip"]').getByRole("button", { name: "Delete Request", exact: true });
      await del.click();
      const panel = page.getByRole("dialog", { name: "Delete this Request?", exact: true });
      await expect(panel.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      // A bottom panel: full width, resting on the bottom edge.
      await expect.poll(async () => { const box = await dialogBox(panel); return box.left <= 1 && box.right >= box.width - 1 && box.bottom >= box.height - 1; }).toBe(true);
      // Taps inside the panel are at least 44px.
      for (const button of await panel.getByRole("button").all()) {
        const label = await button.getAttribute("aria-label");
        if (label?.endsWith("sheet")) continue; // The grabber.
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      // Focus stays inside while tabbing.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        expect(await panel.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
      }
      // Back closes the panel and stays on the Request.
      await page.goBack();
      await expect(panel).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));
      await expect(page.locator("#request-title")).toBeVisible();
      await expect(del).toBeFocused();
      // Its close button closes it too, and Back afterwards leaves the Request as before.
      await del.click();
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "Close", exact: true }).click();
      await expect(panel).toHaveCount(0);
      await expect(del).toBeFocused();

      // The phone Properties panel is the same bottom panel.
      await page.locator("[data-detail-state-line]").click();
      const properties = page.getByRole("dialog", { name: "Properties", exact: true });
      await expect(properties).toBeVisible();
      await expect.poll(async () => { const box = await dialogBox(properties); return box.left <= 1 && box.bottom >= box.height - 1; }).toBe(true);
      await page.goBack();
      await expect(properties).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));

      // A panel holding typed text asks before Back drops it.
      await page.goto("/");
      await page.getByRole("button", { name: "Save view", exact: true }).click();
      const saveDialog = page.getByRole("dialog", { name: "Save view", exact: true });
      await saveDialog.getByRole("textbox", { name: "Name" }).fill("Phone view");
      await page.goBack();
      const prompt = discardPrompt(page);
      await expect(prompt).toBeVisible();
      await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(prompt).toHaveCount(0);
      await expect(saveDialog.getByRole("textbox", { name: "Name" })).toHaveValue("Phone view");
      await expect(page).toHaveURL(/\/$/);
    });
  });
});
