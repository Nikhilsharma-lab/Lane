import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createReviewTeam } from "./helpers/reviewers";
import { releaseAndClose, seedPickedUp } from "./helpers/impact-results";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";

// #283 (Build 7.2, spec #256 "Impact screen", "Outcome report" and "Quarter note"; walk findings C4, C6, C16, C29, C33):
// Impact's tab, period and person live in the address; Showing swaps a teammate's list in place and offers only the
// viewer's own teammates; offline moves keep Lane on screen; the Quarter note is a popup that asks before Escape drops
// what was typed; phones get 44px controls; and the report, chart included, prints in light colours.

const OFFLINE_LINE = /^You.re offline$/;
const offlineLine = (page: Page) => page.getByRole("status").filter({ hasText: OFFLINE_LINE });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const panel = (page: Page, name: string) => page.getByRole("tabpanel", { name, exact: true });
const showing = (page: Page) => page.getByRole("combobox", { name: "Showing", exact: true });
const rows = (scope: Locator) => scope.locator("a[data-request-id]");
const search = (page: Page) => new URL(page.url()).searchParams;

/** Marks this document, so a later check can tell no other page was loaded into the tab. */
async function markDocument(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => { (window as unknown as { __laneStayed?: boolean }).__laneStayed = true; });
}
const stayed = (page: Page) => page.evaluate(() => (window as unknown as { __laneStayed?: boolean }).__laneStayed === true);

async function seedRequest(orgId: string, userId: string, title: string) {
  const sql = e2eDatabase();
  try {
    const id = randomUUID();
    await sql`INSERT INTO requests (id, org_id, title, description, status, created_by) VALUES (${id}, ${orgId}, ${title}, 'Impact fixture.', 'open', ${userId})`;
    return id;
  } finally {
    await sql.end();
  }
}

async function heightOf(locator: Locator) {
  return (await locator.boundingBox())!.height;
}

test("Impact keeps its tab and person in the address, swaps a teammate in place (C4) and stays in Lane offline (C6)", async ({ browser, page }, testInfo) => {
  test.setTimeout(480_000);
  const team = await createReviewTeam(browser, page);
  try {
    const [pm, designer, developer] = team.users;
    const designerPage = team.pages[1];
    const pmTitle = "Impact C4: the PM's Request";
    const designerTitle = "Impact C4: the Designer's Request";
    const pmRequest = await seedRequest(team.orgId, pm.id, pmTitle);
    await seedRequest(team.orgId, designer.id, designerTitle);

    // My work opens first for someone who can file, with Showing at the top reading You.
    await designerPage.setViewportSize({ width: 1440, height: 900 });
    await designerPage.goto("/impact");
    await expect(tab(designerPage, "My work")).toHaveAttribute("aria-selected", "true");
    const myWork = panel(designerPage, "My work");
    await expect(rows(myWork)).toHaveCount(1);
    await expect(myWork).toContainText(designerTitle);
    await expect(showing(designerPage)).toMatchAriaSnapshot(`- combobox "Showing": You`);
    // Status and role labels are at least 11px.
    for (const label of ["Requested by you", "Open"]) {
      const size = await myWork.getByText(label, { exact: true }).first().evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
      expect(size).toBeGreaterThanOrEqual(11);
    }

    // C4: only the viewer's own teammates can be chosen: You, then the PM. The Developer filed and picked up nothing.
    await showing(designerPage).click();
    const options = designerPage.getByRole("listbox", { name: "Showing", exact: true }).getByRole("option");
    await expect(options).toHaveText(["You", "Review PM"]);
    await markDocument(designerPage);
    await designerPage.evaluate(() => window.scrollTo(0, 0));
    await options.filter({ hasText: "Review PM" }).click();
    // The list swaps in place: same document, no scroll, the address holds the person.
    await expect(designerPage.getByRole("heading", { name: "Requests by Review PM", exact: true })).toBeVisible();
    await expect.poll(() => search(designerPage).get("person")).toBe(pm.id);
    expect(search(designerPage).get("tab")).toBe("my-work");
    expect(await stayed(designerPage)).toBe(true);
    expect(await designerPage.evaluate(() => scrollY)).toBe(0);
    await expect(rows(myWork)).toHaveCount(1);
    await expect(myWork.locator(`a[data-request-id="${pmRequest}"]`)).toContainText(pmTitle);
    await expect(myWork).toContainText("Requested by Review PM");
    await expect(myWork).not.toContainText(designerTitle);
    await expect(showing(designerPage)).toMatchAriaSnapshot(`- combobox "Showing": Review PM`);
    await designerPage.screenshot({ path: testInfo.outputPath("showing-teammate-1440.png") });

    // Reload keeps the person; You brings the viewer's own list back.
    await designerPage.reload();
    await expect(designerPage.getByRole("heading", { name: "Requests by Review PM", exact: true })).toBeVisible();
    await showing(designerPage).click();
    await designerPage.getByRole("option", { name: "You", exact: true }).click();
    await expect(designerPage.getByRole("heading", { name: /^Requests by / })).toHaveCount(0);
    await expect.poll(() => search(designerPage).get("person")).toBeNull();
    await expect(myWork).toContainText(designerTitle);

    // An address naming someone off the viewer's list (the Developer, the viewer, a made-up id) shows the viewer's own.
    for (const person of [developer.id, designer.id, "user_not_a_teammate"]) {
      await designerPage.goto(`/impact?person=${encodeURIComponent(person)}`);
      await expect(showing(designerPage)).toMatchAriaSnapshot(`- combobox "Showing": You`);
      await expect(designerPage.getByRole("heading", { name: /^Requests by / })).toHaveCount(0);
      await expect(myWork).toContainText(designerTitle);
    }

    // The tab is kept in the address across reload, and arrows move between the tabs.
    await designerPage.goto("/impact");
    await tab(designerPage, "Outcome report").click();
    await expect.poll(() => search(designerPage).get("tab")).toBe("outcome-report");
    await expect(panel(designerPage, "Outcome report")).toContainText("Up to date as of");
    await designerPage.reload();
    await expect(tab(designerPage, "Outcome report")).toHaveAttribute("aria-selected", "true");
    await expect(panel(designerPage, "Outcome report")).toContainText("Up to date as of");
    await tab(designerPage, "Outcome report").focus();
    await designerPage.keyboard.press("ArrowLeft");
    await expect(tab(designerPage, "My work")).toBeFocused();
    await expect(tab(designerPage, "My work")).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => search(designerPage).get("tab")).toBe("my-work");
    await designerPage.keyboard.press("End");
    await expect(tab(designerPage, "Outcome report")).toHaveAttribute("aria-selected", "true");

    // C29: "Show by" and "Period" are labelled alike, level, and the controls stand the same height.
    const report = panel(designerPage, "Outcome report");
    const showBy = report.getByRole("group", { name: "Show by", exact: true });
    const period = report.getByRole("combobox", { name: "Period", exact: true });
    const [showByLabel, periodLabel] = [report.getByText("Show by", { exact: true }), report.getByText("Period", { exact: true })];
    expect(Math.abs((await showByLabel.boundingBox())!.y - (await periodLabel.boundingBox())!.y)).toBeLessThan(2);
    // The Period picker's name is spoken once: "Period", with its value read as the value.
    await expect(period).toHaveAccessibleName("Period");
    expect(Math.abs(await heightOf(showBy) - await heightOf(period))).toBeLessThan(2);
    await designerPage.screenshot({ path: testInfo.outputPath("outcome-report-1440.png") });

    // C6: offline, Month / Quarter / Year and the tabs keep Lane on screen; nothing loads another page.
    await markDocument(designerPage);
    const reportPath = new URL(designerPage.url()).pathname + new URL(designerPage.url()).search;
    await designerPage.context().setOffline(true);
    try {
      await expect(offlineLine(designerPage)).toBeVisible();
      await showBy.getByRole("button", { name: "Year", exact: true }).click();
      await designerPage.waitForTimeout(1_500);
      expect(new URL(designerPage.url()).pathname + new URL(designerPage.url()).search).toBe(reportPath);
      expect(await stayed(designerPage)).toBe(true);
      await expect(designerPage.locator("#lane-main")).toBeVisible();
      await tab(designerPage, "My work").click();
      await expect(panel(designerPage, "My work")).toContainText(designerTitle);
      await tab(designerPage, "Outcome report").click();
      await expect(panel(designerPage, "Outcome report")).toContainText("Up to date as of");
      expect(await stayed(designerPage)).toBe(true);

      // C6: going to Impact offline, from the Requests list, keeps the list on screen.
      await designerPage.context().setOffline(false);
      await expect(offlineLine(designerPage)).toHaveCount(0);
      await designerPage.goto("/");
      await markDocument(designerPage);
      await designerPage.context().setOffline(true);
      await expect(offlineLine(designerPage)).toBeVisible();
      await designerPage.getByRole("link", { name: "Impact", exact: true }).click();
      await designerPage.waitForTimeout(1_500);
      expect(new URL(designerPage.url()).pathname).toBe("/");
      expect(await stayed(designerPage)).toBe(true);
    } finally {
      await designerPage.context().setOffline(false);
    }

    // Phones: Showing, Show by and Period are 44px taps, and nothing scrolls sideways.
    await designerPage.setViewportSize({ width: 390, height: 844 });
    await designerPage.goto("/impact");
    expect(await heightOf(showing(designerPage))).toBeGreaterThanOrEqual(44);
    await tab(designerPage, "Outcome report").click();
    for (const button of await report.getByRole("group", { name: "Show by", exact: true }).getByRole("button").all()) expect(await heightOf(button)).toBeGreaterThanOrEqual(44);
    expect(await heightOf(report.getByRole("combobox", { name: "Period", exact: true }))).toBeGreaterThanOrEqual(44);
    expect(await designerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await designerPage.screenshot({ path: testInfo.outputPath("period-controls-390.png") });

    // An empty My work, for someone who can file: the approved line and New Request, which opens the composer.
    const developerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const developerPage = await developerContext.newPage();
      await signInTestUser(developerPage, developer, team.orgId);
      await developerPage.goto("/impact");
      const empty = panel(developerPage, "My work");
      await expect(empty.getByRole("heading", { name: "Requests you file or pick up show here.", exact: true })).toBeVisible();
      // One sentence, with no second line under it (#283): Arc's empty state without a description.
      await expect(empty.locator("section p")).toBeHidden();
      await expect(showing(developerPage)).toMatchAriaSnapshot(`- combobox "Showing": You`);
      await developerPage.screenshot({ path: testInfo.outputPath("empty-my-work-1440.png") });
      await empty.getByRole("link", { name: "New Request", exact: true }).click();
      await expect(developerPage.getByRole("dialog", { name: "New Request", exact: true })).toBeVisible({ timeout: 20_000 });
      expect(new URL(developerPage.url()).pathname).toBe("/impact");
    } finally {
      await developerContext.close();
    }
  } finally {
    await team.close(testInfo);
  }
});

test("Closed results lead My work; the Quarter note is a popup on desktop and a bottom panel on a phone; the report prints in light", async ({ browser, page }, testInfo) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const user = await createTestUser("impact-quarter-note");
  try {
    const orgId = await provisionAndSignIn(page, user, { name: "Impact Admin", workspaceName: "#283 Impact", role: "pm" });
    const older = await seedPickedUp(user.id, "Keep the card on file");
    const newer = await seedPickedUp(user.id, "Remember the address");
    const open = await seedRequest(orgId, user.id, "Still open: show the saved card");
    await releaseAndClose(page, older.id, "75", "Shoppers trust a card they saved themselves");
    await releaseAndClose(page, newer.id, "84");

    // My work: closed results first, newest closing first, each with What we learned; then the open Request.
    await page.goto("/impact");
    const myWork = panel(page, "My work");
    await expect(rows(myWork)).toHaveCount(3);
    const order = await rows(myWork).evaluateAll(links => links.map(link => link.getAttribute("data-request-id")));
    expect(order).toEqual([newer.id, older.id, open]);
    await expect(myWork.locator(`a[data-request-id="${older.id}"]`)).toContainText("What we learned Shoppers trust a card they saved themselves");

    // The Quarter note opens as a popup with focus in its field. (Escape asking before it drops typed text is
    // e2e/focus-escape-bottom-panel.spec.ts's "Escape on the Quarter note popup" test.)
    await tab(page, "Outcome report").click();
    const report = panel(page, "Outcome report");
    const write = report.getByRole("button", { name: /^Write the Q\d \d{4} note$/ });
    await write.click();
    const popup = page.getByRole("dialog", { name: /^Quarter note, Q\d \d{4}$/ });
    await expect(popup).toBeVisible();
    const field = popup.getByRole("textbox", { name: /^Quarter note for / });
    await expect(field).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("quarter-note-popup-1440.png") });
    const discard = page.getByRole("dialog", { name: "Discard what you typed?", exact: true });

    // Nothing typed: Escape just closes. Then a saved note shows in the report, and focus is back on its button.
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(discard).toHaveCount(0);
    await expect(write).toBeFocused();
    await write.click();
    await field.fill("A quarter of steadier checkouts.");
    await popup.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(report).toContainText("A quarter of steadier checkouts.");
    const edit = report.getByRole("button", { name: /^Edit the Q\d \d{4} note$/ });
    await expect(edit).toBeFocused();

    // On a phone it is the bottom panel, with its field and buttons on screen and 44px tall.
    await page.setViewportSize({ width: 390, height: 844 });
    // The tab is in the address, so a reload at phone width (where the panel's code loads) lands on the report.
    await page.reload();
    await expect(tab(page, "Outcome report")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("html[data-popup-sheet=ready]")).toHaveCount(1, { timeout: 30_000 });
    await edit.click();
    await expect(popup).toBeVisible();
    for (const control of [popup.getByRole("textbox"), popup.getByRole("button", { name: "Save note", exact: true }), popup.getByRole("button", { name: "Cancel", exact: true })]) {
      await expect(control).toBeInViewport();
    }
    for (const name of ["Save note", "Cancel"]) expect(await heightOf(popup.getByRole("button", { name, exact: true }))).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath("quarter-note-panel-390.png") });
    await popup.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(popup).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Print in light, chart included: a dark page drops dark while printing, and the bars keep their colours on paper.
    const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", storageState: await page.context().storageState() });
    try {
      const darkPage = await dark.newPage();
      await darkPage.goto(new URL("/impact?tab=outcome-report", page.url()).toString());
      const chart = panel(darkPage, "Outcome report").getByRole("img", { name: /^Conversion rate, / });
      await expect(chart).toBeVisible({ timeout: 30_000 });
      await expect(darkPage.locator("html.dark")).toHaveCount(1);
      await darkPage.emulateMedia({ media: "print" });
      // The report is in the server's HTML, so the first event may come before the page listens for it.
      await expect(async () => {
        await darkPage.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
        await expect(darkPage.locator("html.dark")).toHaveCount(0, { timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      const bar = chart.locator("[data-series=result]").first();
      expect(await bar.evaluate(element => getComputedStyle(element).printColorAdjust)).toBe("exact");
      expect(await heightOf(bar)).toBeGreaterThan(0);
      const ink = await panel(darkPage, "Outcome report").getByRole("heading", { name: "Totals", exact: true }).evaluate(element => getComputedStyle(element).color);
      const [r, g, b] = ink.match(/[\d.]+/g)!.map(Number);
      expect((r + g + b) / 3).toBeLessThan(110);
      await expect(darkPage.getByRole("tablist", { name: "Impact views" })).toBeHidden();
      await darkPage.pdf({ path: testInfo.outputPath("outcome-report-print.pdf") });
      await darkPage.screenshot({ path: testInfo.outputPath("outcome-report-print.png"), fullPage: true });
      await darkPage.emulateMedia({ media: "screen" });
      await darkPage.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await expect(darkPage.locator("html.dark")).toHaveCount(1);
    } finally {
      await dark.close();
    }
  } finally {
    await cleanupTestWorkspace(user.id).catch((error: unknown) => {
      if (!/^(Release history|Closed Request) is immutable$/.test(String((error as { message?: string }).message))) throw error;
    }).finally(() => deleteTestUser(user.id));
  }
});
