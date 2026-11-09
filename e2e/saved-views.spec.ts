import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * Build 5.5 of #256 (#276): saved views, driven as a person would. A26: a first save puts focus on the new "Saved view"
 * menu button. A222: an empty name is caught before anything is sent, and the 60-character limit has the shared
 * counter. A223: Delete view is the red confirm that opens on Cancel. Saving, renaming and deleting show at once,
 * in the list's heading and in the sidebar's "Your views", and go back with a message when the server refuses.
 * A235: on a phone a long view name in the heading wraps instead of being cut.
 *
 * Every refusal here is the server's own: the test changes what the page sent (a Project or a view nobody has), as
 * a second tab could have, and the server refuses it.
 */

const isAction = (request: Request) => request.method() === "POST" && Boolean(request.headers()["next-action"]);
const heading = (page: Page) => page.locator('[data-slot="requests-workspace"] [data-slot="page-strip"] h1');
const sidebarView = (page: Page, name: string) => page.locator("#lane-sidebar").getByRole("link", { name, exact: true });
const toasts = (page: Page) => page.getByRole("region", { name: /^Messages/ });
const saveButton = (page: Page) => page.getByRole("button", { name: "Save view", exact: true });
const savedButton = (page: Page) => page.getByRole("button", { name: "Saved view", exact: true });

async function withDatabase<T>(run: (sql: ReturnType<typeof e2eDatabase>) => Promise<T>) {
  const sql = e2eDatabase();
  try { return await run(sql); } finally { await sql.end(); }
}

/** Popups take on Lane's behaviour once the page is idle (src/components/popup/load-behaviour.ts). */
async function ready(page: Page) {
  await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(1, { timeout: 30_000 });
  if (page.viewportSize()!.width < 640) await expect(page.locator("html[data-popup-sheet=ready]")).toHaveCount(1, { timeout: 30_000 });
}

/**
 * Holds the next server action whose body has `marker` until `release`, then sends it to the real server, with its
 * body changed by `rewrite` when given: the way a test makes the server refuse (another tab's state) without changing
 * what the page knows.
 */
async function holdAction(page: Page, marker: string, rewrite?: (body: string) => string) {
  const released = Promise.withResolvers<void>();
  const seen = Promise.withResolvers<void>();
  const sent = Promise.withResolvers<void>();
  let claimed = false;
  const handler = async (route: Route) => {
    const request = route.request();
    const body = request.postData() ?? "";
    if (claimed || !isAction(request) || !body.includes(marker)) return route.fallback();
    claimed = true;
    seen.resolve();
    await released.promise;
    try { await route.continue(rewrite ? { postData: rewrite(body) } : undefined); } finally { sent.resolve(); }
  };
  await page.route("**/*", handler);
  return {
    seen: seen.promise,
    // The held request goes on before the route comes off, so nothing else answers it.
    async release() { released.resolve(); await sent.promise; await page.unroute("**/*", handler); },
  };
}

/** A Project or view nobody has. */
const NOBODYS = "00000000-0000-4000-8000-000000000000";

async function withWorkspace(page: Page, label: string, run: (user: TestUser, orgId: string) => Promise<void>) {
  const user = await createTestUser(label);
  try {
    const orgId = await provisionAndSignIn(page, user, { name: "Views Tester", workspaceName: `#276 ${label}` });
    await seedTestRequest(user.id, `${label}: a Request to filter`);
    await run(user, orgId);
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
}

test("saving, renaming and deleting a view show at once, keep focus, and go back with a message when refused (A26, A222, A223)", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await withWorkspace(page, "saved-views", async (user, orgId) => {
    await page.goto("/");
    await ready(page);
    await expect(heading(page)).toHaveText("Requests");

    // A222: an empty name is caught in the dialog; nothing is sent.
    const sent: Request[] = [];
    page.on("request", request => { if (isAction(request)) sent.push(request); });
    await saveButton(page).click();
    const saveDialog = page.getByRole("dialog", { name: "Save view", exact: true });
    const name = saveDialog.getByRole("textbox", { name: "Name" });
    await expect(name).toBeFocused();
    await name.fill("   ");
    await page.keyboard.press("Enter");
    await expect(name).toHaveAccessibleDescription(/Give the view a name\./);
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await page.waitForTimeout(500);
    expect(sent).toHaveLength(0);
    // The counter speaks near the 60-character limit, and the field stops there.
    await name.fill("x".repeat(50));
    await expect(name).toHaveAccessibleDescription(/10 characters left/);
    await name.fill("x".repeat(60));
    await expect(name).toHaveAccessibleDescription(/No characters left/);

    // A save the server refuses (its Project went in another tab) shows at once, then goes back with a message;
    // focus stays on the control.
    const refusedSave = await holdAction(page, "Refused view", body => body.replace('"project":"all"', `"project":"${NOBODYS}"`));
    await name.fill("Refused view");
    await page.keyboard.press("Enter");
    await refusedSave.seen;
    await expect(saveDialog).toHaveCount(0);
    await expect(heading(page)).toHaveText("Refused view");
    await expect(sidebarView(page, "Refused view")).toBeVisible();
    await expect(savedButton(page)).toBeFocused();
    await refusedSave.release();
    await expect(toasts(page)).toContainText("That Project isn’t available. Choose another and try again.", { timeout: 20_000 });
    await expect(heading(page)).toHaveText("Requests");
    await expect(sidebarView(page, "Refused view")).toHaveCount(0);
    await expect(saveButton(page)).toBeFocused();

    // A26: a first save puts focus on the new Saved view button, and it stays there once the server answers.
    const save = await holdAction(page, "Focus view");
    await saveButton(page).click();
    await name.fill("Focus view");
    await page.keyboard.press("Enter");
    await save.seen;
    await expect(saveDialog).toHaveCount(0);
    await expect(heading(page)).toHaveText("Focus view");
    await expect(sidebarView(page, "Focus view")).toBeVisible();
    await expect(savedButton(page)).toBeFocused();
    await save.release();
    await page.waitForTimeout(1_500);
    await expect(savedButton(page)).toBeFocused();
    await expect(heading(page)).toHaveText("Focus view");
    await expect(sidebarView(page, "Focus view")).toBeVisible();
    await expect(sidebarView(page, "Refused view")).toHaveCount(0);
    const [{ id }] = await withDatabase(sql => sql<{ id: string }[]>`SELECT id FROM saved_views WHERE org_id = ${orgId} AND owner_id = ${user.id} AND name = 'Focus view'`);

    // A rename shows at once, in the heading and the sidebar.
    const rename = await holdAction(page, "Renamed view");
    await savedButton(page).click();
    await page.getByRole("menuitem", { name: "Rename view…" }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename view", exact: true });
    const renameField = renameDialog.getByRole("textbox", { name: "Name" });
    await expect(renameField).toHaveValue("Focus view");
    await renameField.fill("Renamed view");
    await page.keyboard.press("Enter");
    await rename.seen;
    await expect(renameDialog).toHaveCount(0);
    await expect(heading(page)).toHaveText("Renamed view");
    await expect(sidebarView(page, "Renamed view")).toBeVisible();
    await expect(sidebarView(page, "Focus view")).toHaveCount(0);
    await rename.release();
    await page.waitForTimeout(1_000);
    await expect(heading(page)).toHaveText("Renamed view");
    await expect(sidebarView(page, "Renamed view")).toBeVisible();

    // A rename the server refuses (it no longer finds the view) shows at once, then the old name comes back.
    const refusedRename = await holdAction(page, "Gone view", body => body.replace(id, NOBODYS));
    await savedButton(page).click();
    await page.getByRole("menuitem", { name: "Rename view…" }).click();
    await renameField.fill("Gone view");
    await page.keyboard.press("Enter");
    await refusedRename.seen;
    await expect(heading(page)).toHaveText("Gone view");
    await expect(sidebarView(page, "Gone view")).toBeVisible();
    await refusedRename.release();
    await expect(toasts(page)).toContainText("That view isn’t saved any more.", { timeout: 20_000 });
    await expect(heading(page)).toHaveText("Renamed view");
    await expect(sidebarView(page, "Renamed view")).toBeVisible();
    await expect(sidebarView(page, "Gone view")).toHaveCount(0);

    // A223: the red confirm opens on Cancel and says nothing else is lost.
    await savedButton(page).click();
    await page.getByRole("menuitem", { name: "Delete view…" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete “Renamed view”?", exact: true });
    await expect(confirm).toContainText("The view is removed from your sidebar. Your Requests don’t change.");
    await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    // A delete the server refuses leaves the sidebar at once, then comes back.
    const refusedDelete = await holdAction(page, id, body => body.replace(id, NOBODYS));
    await confirm.getByRole("button", { name: "Delete view", exact: true }).click();
    await refusedDelete.seen;
    await expect(confirm).toHaveCount(0);
    await expect(sidebarView(page, "Renamed view")).toHaveCount(0);
    await expect(heading(page)).toHaveText("Requests");
    await expect(saveButton(page)).toBeFocused();
    await refusedDelete.release();
    await expect(sidebarView(page, "Renamed view")).toBeVisible({ timeout: 20_000 });
    await expect(heading(page)).toHaveText("Renamed view");
    await expect(savedButton(page)).toBeFocused();
    await page.waitForTimeout(1_000);
    await expect(sidebarView(page, "Renamed view")).toBeVisible();

    // A delete that goes through leaves the sidebar at once and stays gone.
    await savedButton(page).click();
    await page.getByRole("menuitem", { name: "Delete view…" }).click();
    await confirm.getByRole("button", { name: "Delete view", exact: true }).click();
    await expect(sidebarView(page, "Renamed view")).toHaveCount(0);
    await expect(heading(page)).toHaveText("Requests");
    await expect(saveButton(page)).toBeFocused();
    await page.waitForTimeout(1_000);
    await expect(sidebarView(page, "Renamed view")).toHaveCount(0);
    expect(await withDatabase(sql => sql`SELECT 1 FROM saved_views WHERE id = ${id}`)).toHaveLength(0);
  });
});

test("on a phone a long view name in the heading wraps instead of being cut (A235)", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await withWorkspace(page, "saved-view-phone", async () => {
    await page.goto("/");
    await ready(page);
    const long = "Checkout and payment Requests for the spring launch";
    await saveButton(page).click();
    const dialog = page.getByRole("dialog", { name: "Save view", exact: true });
    await dialog.getByRole("textbox", { name: "Name" }).fill(long);
    await dialog.getByRole("button", { name: "Save view", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const title = heading(page);
    await expect(title).toHaveText(long);
    const shape = await title.evaluate(element => {
      const style = getComputedStyle(element);
      return { cut: element.scrollWidth > element.clientWidth + 1, lines: Math.round(element.getBoundingClientRect().height / parseFloat(style.lineHeight)) };
    });
    expect(shape.cut).toBe(false);
    expect(shape.lines).toBeGreaterThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
