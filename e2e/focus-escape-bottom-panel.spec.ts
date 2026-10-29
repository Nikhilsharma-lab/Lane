import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanupTestWorkspace, provisionTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./helpers/test-user";
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

/** Popups and in-page forms take on Lane's behaviour once the page is idle (src/components/popup/load-behaviour.ts). */
const behaviourReady = (page: Page) => expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(1, { timeout: 30_000 });

/**
 * Holds back the popup behaviour's script (the only one that carries its phone breakpoint) until `release`, so a
 * test can press Escape or open a popup in the moment right after the page loads, before the behaviour is there.
 */
async function holdPopupBehaviour(page: Page) {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/_next\/static\/.+\.js(\?.*)?$/, async route => {
    const response = await route.fetch().catch(() => null);
    // A fetch the server cut short is simply made again by the page, unheld.
    if (!response) return route.continue().catch(() => undefined);
    const body = await response.text();
    if (body.includes("639.98px")) await held;
    await route.fulfill({ response, body }).catch(() => undefined);
  });
  return release;
}

async function openRequest(page: Page, id: string) {
  await page.goto(`/requests/${id}`);
  await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot="request-workspace-keyboard"][data-ready="true"]')).toHaveCount(1);
  await behaviourReady(page);
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
      await behaviourReady(page);
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

  test("right after the page loads, Escape still asks and popups still open on their first field; Cancel never asks (B2, B4, B31)", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "escape-early", async (_user, id) => {
      const release = await holdPopupBehaviour(page);
      try {
        // The held script may be one the page's load event waits for.
        await page.goto(`/requests/${id}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
        const reviewers = page.locator("#reviewers");
        await reviewers.getByRole("button", { name: "Add reviewer", exact: true }).click();
        const question = reviewers.getByRole("textbox");
        await question.fill("Asked before the behaviour arrived");
        await expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(0);
        await blurToPage(page);
        await page.keyboard.press("Escape");
        const prompt = discardPrompt(page);
        await expect(prompt).toBeVisible();
        await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(prompt).toHaveCount(0);
        await expect(question).toHaveValue("Asked before the behaviour arrived");
        await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));

        // B31: the permanent-action confirmation opens on Cancel, never on the ×.
        await page.locator('[data-slot="page-strip"]').getByRole("button", { name: "Delete Request", exact: true }).click();
        const confirm = page.getByRole("dialog", { name: "Delete this Request?", exact: true });
        await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(confirm).toHaveCount(0);

        // A popup with a field opens on it; Escape with typed text asks; Cancel is a deliberate discard and just closes.
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
        await expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(0);
        const save = page.getByRole("button", { name: "Save view", exact: true });
        await save.click();
        const saveDialog = page.getByRole("dialog", { name: "Save view", exact: true });
        const name = saveDialog.getByRole("textbox", { name: "Name" });
        await expect(name).toBeFocused();
        await name.fill("Early view");
        await page.keyboard.press("Escape");
        await expect(prompt).toBeVisible();
        await prompt.getByRole("button", { name: "Keep editing", exact: true }).click();
        await expect(name).toHaveValue("Early view");
        await saveDialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(saveDialog).toHaveCount(0);
        await expect(prompt).toHaveCount(0);
      } finally {
        release();
      }

      // Once the behaviour is there: Cancel still just closes, the × still asks.
      await page.goto("/");
      await behaviourReady(page);
      const save = page.getByRole("button", { name: "Save view", exact: true });
      const saveDialog = page.getByRole("dialog", { name: "Save view", exact: true });
      await save.click();
      await saveDialog.getByRole("textbox", { name: "Name" }).fill("Deliberately dropped");
      await saveDialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(saveDialog).toHaveCount(0);
      await expect(discardPrompt(page)).toHaveCount(0);
      await expect(save).toBeFocused();
      await save.click();
      await saveDialog.getByRole("textbox", { name: "Name" }).fill("Asked first");
      await saveDialog.getByRole("button", { name: "Close dialog", exact: true }).click();
      await expect(discardPrompt(page)).toBeVisible();
      await discardPrompt(page).getByRole("button", { name: "Discard", exact: true }).click();
      await expect(saveDialog).toHaveCount(0);
    });
  });

  test("Escape on the Quarter note editor asks before dropping a half-written note", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "quarter-note", async () => {
      const now = new Date();
      await page.goto(`/impact?period=${now.getUTCFullYear()}-q${Math.floor(now.getUTCMonth() / 3) + 1}`);
      await behaviourReady(page);
      const write = page.getByRole("button", { name: /^Write the .+ note$/ });
      await write.click();
      const note = page.getByRole("textbox", { name: /^Quarter note for / });
      await expect(note).toBeFocused({ timeout: 20_000 });
      await note.fill("Checkout errors fell after the redesign.");
      await page.keyboard.press("Escape");
      const prompt = discardPrompt(page);
      await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(prompt).toHaveCount(0);
      await expect(note).toHaveValue("Checkout errors fell after the redesign.");
      await expect(note).toBeFocused();

      await page.keyboard.press("Escape");
      await prompt.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(note).toHaveCount(0);
      await expect(write).toBeFocused();

      // With nothing typed, Escape just closes it.
      await write.click();
      await expect(note).toBeFocused({ timeout: 20_000 });
      await page.keyboard.press("Escape");
      await expect(note).toHaveCount(0);
      await expect(prompt).toHaveCount(0);
      await expect(write).toBeFocused();
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
      await behaviourReady(page);
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
      await page.keyboard.press("Escape");
      await discardPrompt(page).getByRole("button", { name: "Discard", exact: true }).click();
      await expect(saveDialog).toHaveCount(0);

      // A panel whose action moves to another page lands there: deleting the Request opens the list.
      await openRequest(page, id);
      await page.locator('[data-slot="page-strip"]').getByRole("button", { name: "Delete Request", exact: true }).click();
      await page.getByRole("dialog", { name: "Delete this Request?", exact: true }).getByRole("button", { name: "Delete Request", exact: true }).click();
      await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(/\/$/);
    });
  });

  test("the Requests list hands focus back to the row after its menu and after Back (A211, A232)", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "list-focus", async (_user, id) => {
      await page.goto("/");
      await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
      const row = page.locator(`[role=row][data-request-id="${id}"]`);
      const title = row.locator("a[data-request-title]");
      await title.click({ button: "right" });
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(row).toBeFocused();

      // Enter on the row opens the Request's page (a pointer click previews it at this width).
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/requests/${id}`));
      await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/$/);
      await expect(row).toBeFocused({ timeout: 10_000 });
    });
  });

  test("the first-run guide keeps focus on Next step from step to step (A210)", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const user = await createTestUser("first-run-focus");
    try {
      const orgId = await provisionTestWorkspace({ userId: user.id, email: user.email, name: "Focus Tester", workspaceName: "#263 first-run focus", freshFirstRun: true });
      await signInTestUser(page, user, orgId);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
      const guide = page.locator("[data-first-run='first_request']");
      const next = guide.getByRole("button", { name: "Next step", exact: true });
      for (const step of [2, 3, 4, 5]) {
        if (step === 2) await next.click(); else await page.keyboard.press("Enter");
        await expect(guide.getByRole("progressbar")).toHaveAccessibleName(new RegExp(`^Step ${step} of 5`));
        // The last step has no Next step; its heading takes focus instead.
        if (step < 5) await expect(next).toBeFocused();
        else await expect(guide.locator("[data-first-run-step] h3")).toBeFocused();
        await page.waitForTimeout(500);
        if (step < 5) await expect(next).toBeFocused();
      }
    } finally {
      await cleanupTestWorkspace(user.id);
      await deleteTestUser(user.id);
    }
  });

  test("on a phone the New Request composer is the bottom panel and keeps its draft without asking", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await withWorkspace(page, "composer-panel", async () => {
      await page.goto("/intake");
      await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
      await behaviourReady(page);
      const launcher = page.getByRole("link", { name: "Create Request", exact: true });
      await launcher.click();
      const composer = page.getByRole("dialog", { name: "New Request", exact: true });
      const title = composer.getByRole("textbox", { name: "Request title" });
      await expect(title).toBeFocused({ timeout: 20_000 });
      await expect.poll(async () => { const box = await dialogBox(composer); return box.left <= 1 && box.right >= box.width - 1 && box.bottom >= box.height - 1; }).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // The composer keeps its draft, so closing with typed text asks nothing and loses nothing.
      await title.fill("Phone filing keeps the draft");
      await page.keyboard.press("Escape");
      await expect(composer).toHaveCount(0);
      await expect(discardPrompt(page)).toHaveCount(0);
      await expect(launcher).toBeFocused();
      await launcher.click();
      await expect(title).toHaveValue("Phone filing keeps the draft");
    });
  });
});
