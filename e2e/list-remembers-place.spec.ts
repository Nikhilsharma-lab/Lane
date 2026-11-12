import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * Build 5.4 of #256 (#275): the list remembers your place and feels instant. Its address carries the order, grouping,
 * folded groups and shown counts, so a reload shows the same list; Back from a Request puts the list back where it
 * was scrolled and focuses the row that was opened (A232); the row menu hands focus back to the row (A211); coming
 * back to the tab reads fresh rows; rows that change group slide into place, and don't move under reduced motion;
 * the loading placeholder is the page's own shape, so nothing moves when the content lands (A225).
 * Seeded straight into the workspace: 40 Open, 4 In progress and 6 Done, a minute apart, newest Open first.
 */

const grid = (page: Page) => page.locator("[data-request-grid]");
/** The list's own scroller: the grid's nearest ancestor that scrolls. With `to`, scrolls it there first. */
const listScrollTop = (page: Page, to?: number) => grid(page).evaluate((element, top) => {
  let scroller = element.parentElement;
  while (scroller && getComputedStyle(scroller).overflowY !== "auto") scroller = scroller.parentElement;
  if (!scroller) throw new Error("The list has no scroller");
  if (top !== undefined) scroller.scrollTop = top;
  return scroller.scrollTop;
}, to);
const group = (page: Page, label: string) => page.getByRole("rowgroup", { name: `${label} Requests`, exact: true });
const groupRows = (page: Page, label: string) => group(page, label).locator('[role="row"][data-request-id]');
const row = (page: Page, id: string) => page.locator(`[role="row"][data-request-id="${id}"]`);
const search = (page: Page) => new URL(page.url()).search;
const focusedRow = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("data-request-id") ?? document.activeElement?.tagName ?? null);

type Seeded = { open: string[]; inProgress: string[]; done: string[] };

async function seedList(orgId: string, userId: string): Promise<Seeded> {
  const sql = e2eDatabase();
  const seeded: Seeded = { open: [], inProgress: [], done: [] };
  const rows: Record<string, unknown>[] = [];
  const add = (into: string[], status: "open" | "in_progress" | "done", count: number, label: string, offset: number) => {
    for (let index = 1; index <= count; index++) {
      const id = randomUUID();
      into.push(id);
      rows.push({ id, org_id: orgId, title: `${label} ${String(index).padStart(2, "0")}`, description: "Seeded by list-remembers-place.spec.ts", status, created_by: userId,
        assigned_to: status === "open" ? null : userId, created_at: new Date(Date.now() - (offset + index) * 60_000) });
    }
  };
  add(seeded.open, "open", 40, "Open seeded", 0);
  add(seeded.inProgress, "in_progress", 4, "Started seeded", 100);
  add(seeded.done, "done", 6, "Finished seeded", 200);
  try { await sql`INSERT INTO requests ${sql(rows)}`; } finally { await sql.end(); }
  return seeded;
}

async function withList(page: Page, label: string, run: (seeded: Seeded, owner: TestUser) => Promise<void>) {
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser(label);
    const orgId = await provisionAndSignIn(page, owner, { name: "Place Keeper", workspaceName: `#275 ${label}` });
    await run(await seedList(orgId, owner.id), owner);
  } finally {
    if (owner) {
      await cleanupTestWorkspace(owner.id);
      await deleteTestUser(owner.id);
    }
  }
}

async function openList(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
  await expect(grid(page)).toBeVisible();
  // What the page loads on its own (the preview's code, the row menus' behaviour) has arrived before the test acts.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
}

test("reload, Back and the row menu keep the list's place (address, A232, A211)", async ({ page, context }) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await withList(page, "list-place", async seeded => {
    // Ordering from a shared link; Show more and folding a group are written to the address as they happen.
    await openList(page, "/?order=oldest");
    await expect(groupRows(page, "Open")).toHaveCount(25);
    expect(await groupRows(page, "Open").first().getAttribute("data-request-id")).toBe(seeded.open.at(-1));
    await page.locator('[data-grid-row="m:status:open"]').getByRole("button", { name: "Show more" }).click();
    await expect(groupRows(page, "Open")).toHaveCount(40);
    await page.getByRole("button", { name: "Collapse Done group", exact: true }).click();
    await expect(groupRows(page, "Done").first()).toBeHidden();
    await expect.poll(() => search(page)).toBe("?order=oldest&folded=done&shown=open.50");

    // A reload shows the same list.
    await page.reload();
    await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
    await expect(groupRows(page, "Open")).toHaveCount(40);
    expect(await groupRows(page, "Open").first().getAttribute("data-request-id")).toBe(seeded.open.at(-1));
    await expect(groupRows(page, "Done").first()).toBeHidden();
    expect(search(page)).toBe("?order=oldest&folded=done&shown=open.50");

    // A shared link opens the same list in another tab.
    const shared = await context.newPage();
    await shared.setViewportSize({ width: 1440, height: 900 });
    await openList(shared, "/?group=none&order=title");
    await expect(shared.getByRole("grid", { name: "Requests" })).toBeVisible();
    await expect(shared.locator('[role="row"][data-request-id]').first()).toContainText("Finished seeded 01");
    await shared.close();

    // A232: Back from a Request puts the list back at the exact scroll position and focuses the opened row.
    expect(await listScrollTop(page, 613)).toBe(613);
    const opened = seeded.open.at(-20)!;
    await row(page, opened).focus();
    // Focus moves nothing: the row is already in view at this position.
    expect(await listScrollTop(page)).toBe(613);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/requests/${opened}`));
    await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/\?order=oldest&folded=done&shown=open\.50$/);
    await expect(row(page, opened)).toBeFocused({ timeout: 10_000 });
    expect(await listScrollTop(page)).toBe(613);
    await expect(groupRows(page, "Open")).toHaveCount(40);

    // A211: Escape from the row menu focuses the row itself, not its title link.
    const menuRow = seeded.open.at(-3)!;
    await row(page, menuRow).locator("a[data-request-title]").click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(row(page, menuRow)).toBeFocused();

    // A211: so does choosing Preview, and the preview opens beside the list.
    await row(page, menuRow).locator("a[data-request-title]").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Preview" }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(row(page, menuRow)).toHaveAttribute("aria-current", "true");
    await expect.poll(() => focusedRow(page)).toBe(menuRow);
  });
});

test("rows slide into their new group, rows that leave fade out and groups fold and unfold in motion, never under reduced motion; the tab's return reads fresh rows; the placeholder is the page's shape", async ({ page }) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Counts each animation started on the list's rows, by any means.
  await page.addInitScript(() => {
    const counted = window as unknown as { __rowMoves: number; __rowLeaves: number };
    counted.__rowMoves = 0;
    counted.__rowLeaves = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element["animate"]>) {
      // A row, a group's header or Show more, or a group: what moves when the list does.
      if (this.matches("[data-request-grid] [data-grid-row], [data-request-grid] [role=rowgroup]")) counted.__rowMoves += 1;
      // What stands in for a row that left (removed, or folded away) while it fades out where it was.
      if (this.matches("[data-request-grid] [data-row-leaving]")) counted.__rowLeaves += 1;
      return animate.apply(this, args);
    };
  });
  const moves = () => page.evaluate(() => (window as unknown as { __rowMoves: number }).__rowMoves);
  const leaves = () => page.evaluate(() => (window as unknown as { __rowLeaves: number }).__rowLeaves);
  const fold = (label: string, folded: boolean) => page.getByRole("button", { name: `${folded ? "Collapse" : "Expand"} ${label} group`, exact: true }).click();
  const pickUp = async (id: string) => {
    // A menu open while the last move's saved rows arrive can close under the pointer; open it again then.
    await expect(async () => {
      await row(page, id).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Pick up" }).click({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await expect(group(page, "In progress").locator(`[data-request-id="${id}"]`)).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  };
  await withList(page, "list-moves", async seeded => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openList(page);
    await page.evaluate(() => { (window as unknown as { __rowMoves: number }).__rowMoves = 0; });
    await pickUp(seeded.open[0]);
    await fold("Done", true);
    await page.waitForTimeout(400);
    await fold("Done", false);
    await page.waitForTimeout(400);
    expect(await moves()).toBe(0);
    expect(await leaves()).toBe(0);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await pickUp(seeded.open[1]);
    expect(await moves()).toBeGreaterThan(0);
    // Each move lasts the standard 0.2s and leaves nothing behind.
    await expect.poll(() => grid(page).evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    // #256 user story 44: a group folding fades its rows out where they were, and unfolding fades them in.
    await fold("Done", true);
    await expect.poll(leaves).toBeGreaterThan(0);
    await expect(grid(page).locator("[data-row-leaving]")).toHaveCount(0);
    const unfolding = await moves();
    await fold("Done", false);
    await expect.poll(moves).toBeGreaterThan(unfolding);
    await expect.poll(() => grid(page).evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    const removing = await leaves();

    // Coming back to the tab reads fresh rows in place: no page load.
    await page.evaluate(() => { (window as unknown as { __laneStayed: boolean }).__laneStayed = true; });
    const sql = e2eDatabase();
    try {
      await sql`UPDATE requests SET title = 'Renamed while away' WHERE id = ${seeded.open[5]}`;
      await sql`DELETE FROM requests WHERE id = ${seeded.open[6]}`;
    } finally { await sql.end(); }
    await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    await expect(row(page, seeded.open[5])).toContainText("Renamed while away", { timeout: 15_000 });
    // A Request that left the list fades out where it was, and its stand-in goes with the fade.
    await expect(row(page, seeded.open[6])).toHaveCount(0);
    await expect.poll(leaves).toBeGreaterThan(removing);
    await expect(grid(page).locator("[data-row-leaving]")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __laneStayed?: boolean }).__laneStayed)).toBe(true);

    // A225: the placeholder has the page's title, pills, toolbar, Save view and rows, where the page puts them. The
    // page's first response streams the placeholder first; cut after it, the browser shows only the placeholder.
    await page.route(url => url.pathname === "/", async route => {
      if (route.request().resourceType() !== "document") return route.fallback();
      const response = await route.fetch();
      const body = await response.text();
      const cut = body.indexOf('<div hidden id="S:');
      await route.fulfill({ response, body: cut > 0 ? body.slice(0, cut) : body });
    });
    await page.goto("/", { waitUntil: "commit" });
    const placeholder = page.locator('[data-skeleton="list"]');
    await expect(placeholder).toBeVisible({ timeout: 15_000 });
    // Where each part starts, and how tall the rows are: what the eye sees move.
    const shape = (selector: string) => page.locator(selector).first().evaluate(element => { const box = element.getBoundingClientRect(); return { top: Math.round(box.top), left: Math.round(box.left), ...(element.matches("[data-grid-row], [data-skeleton-part=row], [data-skeleton-part=group-header]") ? { height: Math.round(box.height) } : {}) }; });
    const before = {
      strip: await shape('[data-skeleton="list"] [data-slot="page-strip"]'),
      tools: await shape('[data-skeleton="list"] [data-skeleton-part="save-view"]'),
      pills: await shape('[data-skeleton="list"] [data-skeleton-part="pills"]'),
      header: await shape('[data-skeleton="list"] [data-skeleton-part="group-header"]'),
      row: await shape('[data-skeleton="list"] [data-skeleton-part="row"]'),
    };
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await openList(page);
    const after = {
      strip: await shape('[data-slot="requests-workspace"] [data-slot="page-strip"]'),
      tools: await shape('[data-slot="requests-workspace"] [data-slot="page-strip"] button[aria-label="Save view"]'),
      pills: await shape('[data-slot="requests-toolbar"] [role="group"][aria-label="Request status"]'),
      header: await shape('[data-request-grid] [data-grid-row^="g:"]'),
      row: await shape('[data-request-grid] [role="row"][data-request-id]'),
    };
    expect(after).toEqual(before);
  });
});
