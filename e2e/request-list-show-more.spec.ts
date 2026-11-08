import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * Build 5.1 of #256 (#272): each status group shows its first 25 Requests and its own Show more adds 25 (A212).
 * Headers count the whole group, finished ones included, never "N of M"; empty groups are left out (A221); folding a
 * group moves nothing else; J and K go from Request to Request while ↑ and ↓ stop on headers and Show more.
 * Seeded straight into the workspace: 30 Open, 3 In progress and 60 Done, so the first load holds the latest 50 Done.
 */

const grid = (page: Page) => page.locator("[data-request-grid]");
const group = (page: Page, label: string) => page.getByRole("rowgroup", { name: `${label} Requests`, exact: true });
const groupRows = (page: Page, label: string) => group(page, label).locator('[role="row"][data-request-id]');
const header = (page: Page, key: string) => page.locator(`[data-grid-row="g:status:${key}"]`);
const more = (page: Page, key: string) => page.locator(`[data-grid-row="m:status:${key}"]`);
const focusedRow = (page: Page) => page.evaluate(() => document.activeElement?.closest<HTMLElement>("[data-grid-row]")?.dataset.gridRow ?? null);
const ids = (page: Page, label: string) => groupRows(page, label).evaluateAll(rows => rows.map(row => row.getAttribute("data-request-id")));

type Seeded = { open: string[]; inProgress: string[]; done: string[] };

/** Newest first within each status, a minute apart, every Open newer than every In progress, newer than every Done. */
async function seedList(orgId: string, userId: string): Promise<Seeded> {
  const sql = e2eDatabase();
  const seeded: Seeded = { open: [], inProgress: [], done: [] };
  const rows: Record<string, unknown>[] = [];
  const add = (into: string[], status: "open" | "in_progress" | "done", count: number, label: string, offset: number) => {
    for (let index = 1; index <= count; index++) {
      const id = randomUUID();
      into.push(id);
      rows.push({ id, org_id: orgId, title: `${label} ${String(index).padStart(2, "0")}`, description: "Seeded by request-list-show-more.spec.ts", status, created_by: userId,
        assigned_to: status === "open" ? null : userId, created_at: new Date(Date.now() - (offset + index) * 60_000) });
    }
  };
  add(seeded.open, "open", 30, "Open seeded", 0);
  add(seeded.inProgress, "in_progress", 3, "Started seeded", 100);
  add(seeded.done, "done", 60, "Finished seeded", 200);
  try { await sql`INSERT INTO requests ${sql(rows)}`; } finally { await sql.end(); }
  return seeded;
}

test("each status group shows 25 with its own Show more, full counts and J/K from Request to Request (A212, A221)", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser("show-more-owner");
    const orgId = await provisionAndSignIn(page, owner, { name: "Show More Owner", workspaceName: "Show more" });
    const seeded = await seedList(orgId, owner.id);
    const olderReads: string[] = [];
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/requests/done") olderReads.push(request.url()); });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(groupRows(page, "Open")).toHaveCount(25);

    // Full counts, never "N of M"; the Done header counts the 60, not the 50 loaded. Empty statuses are left out.
    const headers = grid(page).locator('[role="row"][aria-level="1"]');
    await expect(headers).toHaveCount(3);
    expect(await headers.evaluateAll(rows => rows.map(row => row.getAttribute("aria-label")))).toEqual(["Open, 30 Requests", "In progress, 3 Requests", "Done, 60 Requests"]);
    await expect(grid(page)).not.toContainText(/\d+ of \d+/);
    await expect(header(page, "measuring")).toHaveCount(0);
    await expect(header(page, "closed")).toHaveCount(0);
    // No pages: no page footer, page-size picker or "Show older" button.
    await expect(page.getByRole("navigation", { name: "Request pages" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Requests per page" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Show older/ })).toHaveCount(0);
    expect(await ids(page, "Open")).toEqual(seeded.open.slice(0, 25));
    await expect(groupRows(page, "In progress")).toHaveCount(3);
    expect(await ids(page, "Done")).toEqual(seeded.done.slice(0, 25));
    await expect(more(page, "open")).toBeVisible();
    await expect(more(page, "in_progress")).toHaveCount(0);
    await expect(more(page, "done")).toBeVisible();
    await testInfo.attach("groups-first-25", { body: await page.screenshot(), contentType: "image/png" });

    // ↓ and ↑ stop on Show more and on headers; J and K skip both.
    await groupRows(page, "Open").nth(24).focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedRow(page)).toBe("m:status:open");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedRow(page)).toBe("g:status:in_progress");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focusedRow(page)).toBe(`r:${seeded.open[24]}`);
    await page.keyboard.press("j");
    await expect.poll(() => focusedRow(page)).toBe(`r:${seeded.inProgress[0]}`);
    await page.keyboard.press("k");
    await expect.poll(() => focusedRow(page)).toBe(`r:${seeded.open[24]}`);
    await groupRows(page, "Open").first().focus();
    await page.keyboard.press("k");
    await expect.poll(() => focusedRow(page)).toBe(`r:${seeded.open[0]}`);
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focusedRow(page)).toBe("g:status:open");

    // ← folds the group under focus; nothing moves into or out of the others.
    const doneBefore = await ids(page, "Done");
    await page.keyboard.press("ArrowLeft");
    await expect(header(page, "open")).toHaveAttribute("aria-expanded", "false");
    await expect(groupRows(page, "Open").filter({ visible: true })).toHaveCount(0);
    expect(await ids(page, "In progress")).toEqual(seeded.inProgress);
    expect(await ids(page, "Done")).toEqual(doneBefore);
    await expect(more(page, "open")).toBeHidden();
    // J from the folded group's header lands on the next Request, past both headers.
    await page.keyboard.press("j");
    await expect.poll(() => focusedRow(page)).toBe(`r:${seeded.inProgress[0]}`);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect.poll(() => focusedRow(page)).toBe("g:status:open");
    await page.keyboard.press("ArrowRight");
    await expect(header(page, "open")).toHaveAttribute("aria-expanded", "true");
    await expect(groupRows(page, "Open")).toHaveCount(25);

    // Show more from the keyboard adds 25 (here the last 5) and focus lands on the first Request it added; J walks them.
    await groupRows(page, "Open").nth(24).focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => focusedRow(page)).toBe("m:status:open");
    await page.keyboard.press("Enter");
    await expect(groupRows(page, "Open")).toHaveCount(30);
    await expect(more(page, "open")).toHaveCount(0);
    await expect.poll(() => focusedRow(page)).toBe(`r:${seeded.open[25]}`);
    for (const id of seeded.open.slice(26)) {
      await page.keyboard.press("j");
      await expect.poll(() => focusedRow(page)).toBe(`r:${id}`);
    }
    await page.keyboard.press("j");
    await expect.poll(() => focusedRow(page)).toBe(`r:${seeded.inProgress[0]}`);
    await expect(header(page, "open")).toHaveAttribute("aria-label", "Open, 30 Requests");
    // Showing more in one group moves nothing in another.
    expect(await ids(page, "Done")).toEqual(doneBefore);

    // A finished group shows its loaded rows first, with no read…
    await more(page, "done").getByRole("button", { name: "Show more", exact: true }).click();
    await expect(groupRows(page, "Done")).toHaveCount(50);
    expect(olderReads).toEqual([]);
    await expect(more(page, "done")).toBeVisible();
    // …then reads its older Requests from the server, under its own status.
    const read = page.waitForResponse(response => new URL(response.url()).pathname === "/api/requests/done" && response.ok());
    await more(page, "done").getByRole("button", { name: "Show more", exact: true }).click();
    const response = await read;
    expect(new URL(response.url()).searchParams.get("status")).toBe("done");
    await expect(groupRows(page, "Done")).toHaveCount(60);
    expect(await ids(page, "Done")).toEqual(seeded.done);
    await expect(more(page, "done")).toHaveCount(0);
    await expect(header(page, "done")).toHaveAttribute("aria-label", "Done, 60 Requests");
    expect(olderReads).toHaveLength(1);
    await testInfo.attach("groups-shown-in-full", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    // No grouping: one list, 25 at a time, with one Show more at the bottom.
    await page.getByRole("button", { name: "Display", exact: true }).click();
    await page.getByRole("combobox", { name: "Group by", exact: true }).click();
    await page.getByRole("option", { name: "No grouping", exact: true }).click();
    await page.keyboard.press("Escape");
    const flat = grid(page).locator('[role="row"][data-request-id]');
    await expect(flat).toHaveCount(25);
    await expect(grid(page).getByRole("button", { name: "Show more", exact: true })).toHaveCount(1);
    await grid(page).getByRole("button", { name: "Show more", exact: true }).click();
    await expect(flat).toHaveCount(50);
  } finally {
    if (owner) { await cleanupTestWorkspace(owner.id); await deleteTestUser(owner.id); }
  }
});
