import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * Build 5.2 of #256 (#273): the preview and the summary sit beside the list, never over it (A216, A231).
 * The preview is offered at 1280px and wider with a mouse, closes below that with focus back on its row, and the
 * list drops Labels first as it narrows. The summary narrows the list on desktop and is the phone's bottom panel,
 * its × sits at the panel header's corner, and the two panels never show at once. The previewed row names the
 * preview it controls, and the preview's sections are headings one level below its title.
 */

const ROW = '[data-request-grid] [role="row"][data-request-id]';
const TITLES = [
  "Checkout button sits under the keyboard on narrow phone screens during payment",
  "Receipt emails show the wrong currency for customers outside Europe",
  "Pricing page loads slowly on the first visit from a search result",
  "Invoices need a PDF download for finance teams",
  "Onboarding checklist forgets the steps a person already finished",
  "Search results hide archived Projects without saying so",
];

type Box = { x: number; y: number; width: number; height: number };
const right = (box: Box) => box.x + box.width;

async function seed(orgId: string, userId: string) {
  const sql = e2eDatabase();
  try {
    const [{ id: project }] = await sql`INSERT INTO projects (org_id, name, created_by) VALUES (${orgId}, 'Checkout and billing', ${userId}) RETURNING id`;
    const labels: string[] = [];
    for (const [name, colour] of [["Accessibility", "blue"], ["Mobile web", "green"]])
      labels.push((await sql`INSERT INTO workspace_labels (org_id, name, colour, created_by) VALUES (${orgId}, ${name}, ${colour}, ${userId}) RETURNING id`)[0].id as string);
    const ids: string[] = [];
    for (const title of TITLES) ids.push((await sql`
      INSERT INTO requests ${sql({ org_id: orgId, title, description: "Seeded for the side-by-side check.", created_by: userId, project_id: project, label_keys: labels, assigned_to: userId })} RETURNING id`)[0].id as string);
    return ids;
  } finally {
    await sql.end();
  }
}

/** A panel that slides in has landed: its transform is back to none. */
async function settled(panel: Locator) {
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(element => getComputedStyle(element).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
}

/** No row of the list reaches into `panel`. */
async function besideList(page: Page, panel: Locator) {
  const panelBox = (await panel.boundingBox())!;
  for (const box of await page.locator(ROW).evaluateAll(rows => rows.map(row => row.getBoundingClientRect().toJSON() as Box)))
    expect(right(box), "a row reaches under the panel").toBeLessThanOrEqual(panelBox.x + 0.5);
}

const shown = (row: Locator, property: string) => row.locator(`[data-row-property="${property}"]`).evaluate(element => getComputedStyle(element).display !== "none");

async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled" });
}

test("the preview and the summary sit beside the list (#273)", async ({ page, browser }, info) => {
  test.setTimeout(400_000);
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser("preview-beside-list");
    await page.setViewportSize({ width: 1440, height: 900 });
    const orgId = await provisionAndSignIn(page, owner, { name: "Beside Owner", workspaceName: "Preview beside the list" });
    const ids = await seed(orgId, owner.id);
    await page.goto("/");
    const rows = page.locator(ROW);
    await expect(rows).toHaveCount(TITLES.length);
    const preview = page.getByRole("region", { name: "Request preview" });
    const summary = page.getByRole("region", { name: "List summary" });
    const row = page.locator(`${ROW}[data-request-id="${ids[0]}"]`);

    await test.step("at 1440 the preview sits beside the list, no row is covered and Labels drop first", async () => {
      await expect(row.locator('[data-row-property="requestType"]')).toBeVisible();
      await row.locator("[data-request-code]").click();
      await settled(preview);
      await expect(preview.getByRole("heading", { level: 2, name: TITLES[0], exact: true })).toBeVisible();
      await besideList(page, preview);
      for (const [property, wanted] of [["requestType", false], ["createdAt", true]] as const)
        expect(await shown(row, property), `${property} at 1440 with the preview open`).toBe(wanted);
      // The title ends in "…" and keeps its full text on hover.
      const title = row.locator("a[data-request-title]");
      await expect(title).toHaveAttribute("title", TITLES[0]);
      expect(await title.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      await shot(page, info, "preview-1440");
      await page.emulateMedia({ colorScheme: "dark" });
      await shot(page, info, "preview-1440-dark");
      await page.emulateMedia({ colorScheme: "light" });
      // Under reduced motion the preview neither moves nor fades.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await row.locator("[data-request-code]").click();
      await expect(page.locator("[data-request-peek]")).toHaveCount(0);
      await row.locator("[data-request-code]").click();
      await expect(preview).toBeVisible();
      expect(await preview.evaluate(element => { const style = getComputedStyle(element); return { transform: style.transform, opacity: style.opacity }; })).toEqual({ transform: expect.stringMatching(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/), opacity: "1" });
      await page.emulateMedia({ reducedMotion: "no-preference" });
    });

    await test.step("the previewed row points to the preview, and its sections are h3 under the h2 title", async () => {
      const previewId = await preview.getAttribute("id");
      expect(previewId).toBeTruthy();
      await expect(row).toHaveAttribute("aria-controls", previewId!);
      await expect(rows.nth(1)).not.toHaveAttribute("aria-controls", /.+/);
      await expect(preview.getByRole("heading", { level: 2 })).toHaveCount(1);
      await expect(preview.getByRole("heading", { level: 2 })).toHaveText(TITLES[0]);
      await expect(preview.getByRole("heading", { level: 3, name: "Problem", exact: true })).toBeAttached();
      await preview.getByRole("tab", { name: /^Conversation/ }).click();
      await expect(preview.getByRole("heading", { level: 3, name: "Conversation", exact: true })).toBeVisible();
      await preview.getByRole("tab", { name: "Journey", exact: true }).click();
      await expect(preview.getByRole("heading", { level: 3, name: "Journey", exact: true })).toBeVisible();
      await expect(preview.getByRole("heading", { level: 2 })).toHaveCount(1);
      await preview.getByRole("tab", { name: "Overview", exact: true }).click();
    });

    await test.step("the focused row's ring is drawn inside the row", async () => {
      // A row in the middle, so J and K both move: keyboard focus shows the ring.
      const middle = rows.nth(2);
      await middle.focus();
      await page.keyboard.press("j");
      await page.keyboard.press("k");
      await expect(middle).toBeFocused();
      const ring = await middle.evaluate(element => { const style = getComputedStyle(element); return { offset: Number.parseFloat(style.outlineOffset), width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle }; });
      expect(ring.style).not.toBe("none");
      expect(ring.offset).toBeLessThanOrEqual(-ring.width);
      await row.locator("[data-request-code]").click();
      await expect(preview).toHaveAttribute("data-request-id", ids[0]);
    });

    await test.step("at 1280 the preview still sits beside the list and the date stays", async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(preview).toBeVisible();
      await besideList(page, preview);
      for (const [property, wanted] of [["requestType", false], ["submittedBy", false], ["createdAt", true]] as const)
        if (await row.locator(`[data-row-property="${property}"]`).count()) expect(await shown(row, property), `${property} at 1280 with the preview open`).toBe(wanted);
      await shot(page, info, "preview-1280");
    });

    await test.step("at 1279 the preview closes, focus returns to its row, Space opens nothing and the menu has no Preview", async () => {
      await preview.getByRole("tab", { name: "Overview", exact: true }).focus();
      await page.setViewportSize({ width: 1279, height: 900 });
      await expect(page.locator("[data-request-peek]")).toHaveCount(0);
      await expect(row).toBeFocused();
      await page.keyboard.press("Space");
      await page.waitForTimeout(400);
      await expect(page.locator("[data-request-peek]")).toHaveCount(0);
      await row.click({ button: "right" });
      await expect(page.getByRole("menuitem", { name: "Open Request" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Preview" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
    });

    await test.step("at 1024 the summary narrows the list and its × sits at the header's top corner", async () => {
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.getByRole("button", { name: "Open list summary" }).click();
      await settled(summary);
      await besideList(page, summary);
      const panel = (await summary.boundingBox())!;
      const close = (await summary.getByRole("button", { name: "Close list summary" }).boundingBox())!;
      const count = (await summary.getByText(/^\d+ matching Requests?$/).boundingBox())!;
      expect(close.y + close.height, "the × sits above the count line").toBeLessThanOrEqual(count.y + 0.5);
      expect(close.y - panel.y, "the × sits at the panel's top").toBeLessThanOrEqual(16);
      expect(right(panel) - right(close), "the × sits at the panel's end").toBeLessThanOrEqual(16);
      await shot(page, info, "summary-1024");
    });

    await test.step("opening one panel closes the other", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(summary).toBeVisible();
      await row.locator("[data-request-code]").click();
      await settled(preview);
      await expect(summary).toHaveCount(0);
      await page.getByRole("button", { name: "Open list summary" }).click();
      await settled(summary);
      await expect(preview).toHaveCount(0);
      await besideList(page, summary);
      await summary.getByRole("button", { name: "Close list summary" }).click();
      await expect(summary).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open list summary" })).toBeFocused();
    });

    await test.step("on a phone the summary opens as the bottom panel", async () => {
      const phone = await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      try {
        const tapPage = await phone.newPage();
        await tapPage.goto("/");
        await expect(tapPage.locator(ROW)).toHaveCount(TITLES.length);
        await expect(tapPage.locator("html")).toHaveAttribute("data-popup-sheet", "ready");
        await tapPage.getByRole("button", { name: "Open list summary" }).tap();
        const sheet = tapPage.getByRole("dialog", { name: "List summary" });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText(`${TITLES.length} matching Requests`)).toBeVisible();
        await expect(tapPage.getByRole("region", { name: "List summary" })).toHaveCount(0);
        // Risen from the bottom edge: its rows are on screen and it still meets the bottom.
        await expect(sheet.getByRole("button", { name: /^Filter Status: Open, 6 Requests$/ })).toBeInViewport({ ratio: 1 });
        await expect.poll(async () => { const box = (await sheet.boundingBox())!; return { top: box.y > 0, bottom: Math.round(box.y + box.height) >= 842 }; }).toEqual({ top: true, bottom: true });
        await tapPage.waitForTimeout(400);
        await tapPage.screenshot({ path: info.outputPath("summary-phone.png") });
        await sheet.getByRole("button", { name: "Close", exact: true }).tap();
        await expect(sheet).toHaveCount(0);
      } finally { await phone.close(); }
    });
  } finally {
    if (owner) { await cleanupTestWorkspace(owner.id); await deleteTestUser(owner.id); }
  }
});
