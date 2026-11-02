import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * Build 4 of #256 (#270): the Requests list's title filter and workspace search, driven as a person would.
 * A214: the list's title filter is "Filter by title" with a funnel, kept in the address beside status and Project,
 * and in saved views; a view saved before it still opens. A27: the list toolbar's icon buttons are 44px on touch.
 * Workspace search: A23 (the recent menu over the "Search in" cards), A24 (long recent searches), A229, A230,
 * result names with status and Project, the phone placeholder, and a highlighted Request loading ahead.
 */

const ROWS = '[data-request-grid] [role="row"][data-request-id]';
const rows = (page: Page) => page.locator(ROWS);
const titleButton = (page: Page) => page.getByRole("button", { name: "Filter by title", exact: true });
const titleField = (page: Page) => page.getByRole("searchbox", { name: "Filter by title", exact: true });
const searchField = (page: Page) => page.getByRole("combobox", { name: "Search workspace", exact: true });
const titleParam = (page: Page) => new URL(page.url()).searchParams.get("title");

async function withDatabase<T>(run: (sql: ReturnType<typeof e2eDatabase>) => Promise<T>) {
  const sql = e2eDatabase();
  try { return await run(sql); } finally { await sql.end(); }
}

async function seedProject(orgId: string, userId: string, name: string) {
  return withDatabase(async sql => {
    const [{ id }] = await sql`INSERT INTO projects (org_id, name, created_by) VALUES (${orgId}, ${name}, ${userId}) RETURNING id`;
    return id as string;
  });
}

async function filterByTitle(page: Page, value: string) {
  await titleButton(page).click();
  await titleField(page).fill(value);
  await page.keyboard.press("Escape");
  await expect(titleField(page)).toBeHidden();
}

test("the list's title filter is a filter, kept in the address and in saved views (A214, A27)", async ({ page, browser }) => {
  test.setTimeout(600_000);
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser("title-filter-owner", undefined, { borrowFrom: "last" });
    const orgId = await provisionAndSignIn(page, owner, { name: "Title Filter Owner", workspaceName: "Title filter" });
    const checkout = await seedProject(orgId, owner.id, "Checkout");
    const misaligned = await seedTestRequest(owner.id, "Checkout button misaligned");
    await seedTestRequest(owner.id, "Checkout total is wrong");
    await seedTestRequest(owner.id, "Pricing page is slow");
    await withDatabase(sql => sql`UPDATE requests SET project_id = ${checkout} WHERE id = ${misaligned.id}`);
    // A view saved before the title filter existed: status and Project only, as #219 stored them.
    await withDatabase(sql => sql`INSERT INTO saved_views (org_id, owner_id, name, filters) VALUES (${orgId}, ${owner!.id}, 'Older open view', ${sql.json({ status: "open", project: "all" })})`);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(rows(page)).toHaveCount(3);

    // A magnifier means workspace search only: the title filter shows a funnel, and its popover never says "Search".
    const toolbar = page.locator('[data-slot="requests-toolbar"]');
    await expect(titleButton(page).locator("svg.lucide-funnel")).toHaveCount(1);
    await expect(toolbar.locator("svg.lucide-search")).toHaveCount(0);
    await titleButton(page).click();
    const popover = page.getByRole("dialog", { name: "Filter by title", exact: true });
    await expect(popover).toBeVisible();
    await expect(popover.locator("svg.lucide-search")).toHaveCount(0);
    expect(await popover.innerText()).not.toMatch(/search/i);
    await titleField(page).fill("checkout");
    await page.keyboard.press("Escape");

    // Kept in the address, beside the status view.
    await expect(rows(page)).toHaveCount(2);
    await expect.poll(() => titleParam(page)).toBe("checkout");

    // Reload keeps it.
    await page.reload();
    await expect(rows(page)).toHaveCount(2);
    await expect(titleButton(page)).toHaveAttribute("data-active", "");
    await titleButton(page).click();
    await expect(titleField(page)).toHaveValue("checkout");
    await page.keyboard.press("Escape");

    // Back from another page keeps it, in the app and after a full page load.
    await page.getByRole("link", { name: "Impact", exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === "/impact");
    await page.goBack();
    await expect(page).toHaveURL(url => url.pathname === "/" && url.searchParams.get("title") === "checkout");
    await expect(rows(page)).toHaveCount(2);
    await page.goto(`/requests/${misaligned.id}`);
    await expect(page.getByRole("heading", { name: "Checkout button misaligned" }).first()).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(url => url.pathname === "/" && url.searchParams.get("title") === "checkout");
    await expect(rows(page)).toHaveCount(2);

    // Saved with a view, and brought back when the view opens.
    await page.getByRole("button", { name: "Save view", exact: true }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Checkout work");
    await page.getByRole("dialog", { name: "Save view" }).getByRole("button", { name: "Save view", exact: true }).click();
    await expect(page.getByRole("link", { name: "Checkout work", exact: true })).toBeVisible();
    await filterByTitle(page, "pricing");
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByText("Filters changed since you saved this view.")).toBeVisible();

    // The older view, saved without a title, opens as it always did: its status view, and no title filter.
    await page.getByRole("link", { name: "Older open view", exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === "/" && url.searchParams.get("status") === "open" && !url.searchParams.has("title"));
    await expect(rows(page)).toHaveCount(3);
    await expect(titleButton(page)).not.toHaveAttribute("data-active", "");

    await page.getByRole("link", { name: "Checkout work", exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === "/" && url.searchParams.get("title") === "checkout");
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByText("Filters changed since you saved this view.")).toBeHidden();
    await titleButton(page).click();
    await expect(titleField(page)).toHaveValue("checkout");
    await page.keyboard.press("Escape");

    // A27: on a touch screen every toolbar icon button is a 44px target.
    for (const width of [768, 390]) {
      const touch = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true });
      try {
        const phone = await touch.newPage();
        await signInTestUser(phone, owner, orgId);
        await phone.goto("/");
        await expect(rows(phone)).toHaveCount(3);
        const toolbar = phone.locator('[data-slot="requests-toolbar"]');
        for (const [name, button] of [["Filter by title", titleButton(phone)], ["Add filter", toolbar.locator("[data-filter-trigger]")], ["Display", toolbar.getByRole("button", { name: "Display", exact: true })]] as const) {
          const box = await button.boundingBox();
          expect({ width: box?.width, height: box?.height }, `${name} at ${width}px`).toEqual({ width: 44, height: 44 });
        }
      } finally { await touch.close(); }
    }
  } finally {
    if (owner) { await cleanupTestWorkspace(owner.id); await deleteTestUser(owner.id); }
  }
});

/**
 * A23: every part of the "Search in" cards (their radio marks and labels) that lies under the recent-searches menu,
 * and whether the menu is the topmost thing there. The walk saw "All" and "Requests" paint through the menu.
 */
function cardsUnderMenu(page: Page) {
  return page.getByRole("listbox", { name: "Recent searches" }).evaluate(list => {
    const menu = list.parentElement!.getBoundingClientRect();
    const group = [...document.querySelectorAll("fieldset")].find(fieldset => fieldset.querySelector("legend")?.textContent === "Search in")!;
    return [...group.querySelectorAll("label > span, label strong")].flatMap(part => {
      const rect = part.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (!rect.width || x < menu.left || x > menu.right || y < menu.top || y > menu.bottom) return [];
      return [{ part: part.textContent || part.tagName, menuOnTop: list.parentElement!.contains(document.elementFromPoint(x, y)) }];
    });
  });
}

async function search(page: Page, query: string) {
  await searchField(page).fill(query);
  await page.keyboard.press("Enter");
  // The answer is in: "3 results for checkout" (not "Searching for checkout").
  await expect(page.locator('[aria-label="Search results"] p[role="status"]')).toHaveText(new RegExp(`^\\d+ results? for ${query}$`));
}

test("workspace search: recent searches, empty results, names, labels, the phone and loading ahead", async ({ page }) => {
  test.setTimeout(600_000);
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser("search-polish-owner", undefined, { borrowFrom: "last" });
    const orgId = await provisionAndSignIn(page, owner, { name: "Search Polish Owner", workspaceName: "Search polish" });
    const website = await seedProject(orgId, owner.id, "Website");
    const first = await seedTestRequest(owner.id, "Checkout button misaligned");
    const second = await seedTestRequest(owner.id, "Checkout total is wrong");
    const third = await seedTestRequest(owner.id, "Checkout coupon ignored");
    await withDatabase(async sql => {
      await sql`UPDATE requests SET project_id = ${website} WHERE id = ${first.id}`;
      await sql`UPDATE requests SET status = 'in_progress' WHERE id = ${second.id}`;
      await sql`INSERT INTO workspace_labels (org_id, name, colour, created_by) VALUES (${orgId}, 'Customer reported through the support inbox', 'yellow', ${owner!.id})`;
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(rows(page)).toHaveCount(3);
    await page.keyboard.press("/");
    await expect(searchField(page)).toBeFocused();

    // Result names say status and Project, so similar titles can be told apart.
    await search(page, "checkout");
    const matches = page.getByRole("listbox", { name: "Search matches" });
    await expect(matches.getByRole("option", { name: /^Checkout button misaligned(, LAN-\d+)?\. Open, Website$/ })).toHaveCount(1);
    await expect(matches.getByRole("option", { name: /^Checkout total is wrong(, LAN-\d+)?\. In progress, No Project$/ })).toHaveCount(1);

    // A230: a wrapped label keeps its dot on the checkbox's first line.
    const label = page.locator('aside[aria-label="Search filters"]').getByText("Customer reported through the support inbox", { exact: true });
    const geometry = await label.evaluate(text => {
      const row = text.closest("fieldset > div")!;
      const dot = row.querySelector('[data-colour]')!.getBoundingClientRect();
      const square = row.querySelector('button[role="checkbox"]')!.getBoundingClientRect();
      const box = text.getBoundingClientRect();
      return { dot: dot.top + dot.height / 2, square: square.top + square.height / 2, lines: Math.round(box.height / parseFloat(getComputedStyle(text).lineHeight)) };
    });
    expect(geometry.lines, "the long label wraps").toBeGreaterThan(1);
    expect(Math.abs(geometry.dot - geometry.square)).toBeLessThanOrEqual(1);

    // Loading ahead: the Request highlighted from the keyboard loads its page; moving fast loads only where it stops.
    const loaded: string[] = [];
    page.on("request", request => {
      const { pathname } = new URL(request.url());
      if (request.headers()["rsc"] === "1" && pathname.startsWith("/requests/")) loaded.push(pathname);
    });
    await searchField(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => loaded.length).toBeGreaterThan(0);
    const firstHighlighted = await matches.locator('[role="option"][aria-selected="true"]').getAttribute("data-search-result");
    expect(loaded).toEqual([`/requests/${firstHighlighted}`]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const last = await matches.locator('[role="option"][aria-selected="true"]').getAttribute("data-search-result");
    await expect.poll(() => loaded).toContain(`/requests/${last}`);
    await page.waitForTimeout(400);
    expect(loaded, "the result passed over is not loaded").toHaveLength(2);
    expect([first.id, second.id, third.id]).toContain(last);

    // A229: with no results, the preview column doesn't ask for a selection.
    await searchField(page).focus();
    await search(page, "zebra");
    await expect(page.getByText("No results found")).toBeVisible();
    await expect(page.locator('aside[aria-label="Result preview"]')).not.toContainText("Select a result");

    // A23: with four recent searches, the menu is the topmost thing over the "Search in" cards.
    await search(page, "alpha");
    await search(page, "bravo");
    await searchField(page).fill("");
    await page.locator('aside[aria-label="Search filters"]').getByText("Labels", { exact: true }).click();
    await searchField(page).focus();
    const menu = page.getByRole("listbox", { name: "Recent searches" });
    await expect(menu.getByRole("option")).toHaveCount(4);
    const cards = await page.getByRole("group", { name: "Search in" }).boundingBox();
    const menuBox = await menu.boundingBox();
    expect(cards && menuBox && menuBox.x < cards.x + cards.width && menuBox.y + menuBox.height > cards.y, "the menu lies over the cards").toBeTruthy();
    const covered = await cardsUnderMenu(page);
    expect(covered.length, "some of the cards lie under the menu").toBeGreaterThan(0);
    for (const part of covered) expect(part, `the menu is drawn over the card's "${part.part}"`).toMatchObject({ menuOnTop: true });

    // A24: a long recent search is cut with "…" inside the menu, and its full text shows on hover.
    // A search as long as the field takes (200 characters), wider than the menu at 1440.
    const long = "checkout misaligned on the payment step when the coupon field is open and the phone keyboard covers the total, so the customer cannot see what they will pay before confirming the order on a small pho";
    await search(page, long);
    await searchField(page).fill("");
    await page.locator('aside[aria-label="Search filters"]').getByText("Labels", { exact: true }).click();
    await searchField(page).focus();
    const longRow = menu.getByRole("option", { name: long });
    const cut = await longRow.evaluate(option => {
      const text = option.querySelector("span")!;
      const menuBox = option.closest('[role="listbox"]')!.getBoundingClientRect();
      return { cut: text.scrollWidth > text.clientWidth, ellipsis: getComputedStyle(text).textOverflow, inside: option.getBoundingClientRect().right <= menuBox.right + 0.5 };
    });
    expect(cut).toEqual({ cut: true, ellipsis: "ellipsis", inside: true });
    await longRow.locator("span").hover();
    await expect(page.getByRole("tooltip")).toContainText(long);
    await page.keyboard.press("Escape");

    // On a phone: the sort row waits for a query, and the placeholder fits its field.
    await page.setViewportSize({ width: 390, height: 844 });
    await searchField(page).fill("");
    await expect(page.getByRole("group", { name: "Sort results" })).toBeHidden();
    const placeholder = await searchField(page).evaluate(input => {
      const field = input as HTMLInputElement;
      const style = getComputedStyle(field);
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return { text: field.placeholder, needed: context.measureText(field.placeholder).width, room: field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
    });
    expect(placeholder.needed, `"${placeholder.text}" fits in ${placeholder.room}px`).toBeLessThanOrEqual(placeholder.room);
    await searchField(page).fill("checkout");
    await expect(page.getByRole("group", { name: "Sort results" })).toBeVisible();
  } finally {
    if (owner) { await cleanupTestWorkspace(owner.id); await deleteTestUser(owner.id); }
  }
});
