import { expect, type APIResponse, type Locator, type Page, type Request, type Route } from "@playwright/test";
import { commandPalette, runPaletteCommand } from "./command-palette";

export const navigationSurfaces = [
  { width: 1440, colorScheme: "light" }, { width: 1440, colorScheme: "dark" },
  { width: 390, colorScheme: "light" }, { width: 390, colorScheme: "dark" },
] as const;
export type NavigationRequest = { id: string; title: string; code: string };
export type NavigationFixture = {
  filter: string; requests: NavigationRequest[];
  project: { id: string; name: string };
};
type Capture = (name: string) => Promise<void>;
const rows = (page: Page) => page.locator('[role="row"][data-request-id]:visible');
const requestRow = (page: Page, id: string) => rows(page).filter({ has: page.locator(`a[href^="/requests/${id}"]`) });
const pages = (page: Page) => page.getByRole("navigation", { name: "Request pages", exact: true });
const search = (page: Page) => page.getByRole("combobox", { name: "Search workspace", exact: true });

export async function openNavigation(page: Page) {
  const open = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await open.isVisible()) await open.click();
  const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
  if (await expand.isVisible()) await expand.click();
  const navigation = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  await expect(navigation).toBeVisible();
  return navigation;
}

export async function chooseSidebarProject(page: Page, name: string) {
  const link = (await openNavigation(page)).getByRole("link", { name, exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  await link.press("Enter");
}

export async function createNavigationProject(page: Page, name: string) {
  await page.goto("/");
  await openNavigation(page);
  await page.getByRole("button", { name: "New Project", exact: true }).click();
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Create Project", exact: true }).press("Enter");
  const link = page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link", { name, exact: true });
  await expect(link).toBeVisible();
  const id = new URL((await link.getAttribute("href"))!, page.url()).searchParams.get("project");
  expect(id).toMatch(/^[\da-f-]{36}$/);
  return { id: id!, name };
}

async function setDisplay(page: Page) {
  await page.getByRole("button", { name: "Display", exact: true }).click();
  for (const [label, value] of [["Group by", "No grouping"], ["Order by", "Title A–Z"]]) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: value, exact: true }).click();
  }
  await page.keyboard.press("Escape");
}

async function expectKeptControls(page: Page, fixture: NavigationFixture) {
  await expect(page.getByRole("combobox", { name: "Requests per page", exact: true })).toContainText("10");
  await page.getByRole("button", { name: "Filter Requests by title", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Filter Requests by title", exact: true })).toHaveValue(fixture.filter);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Display", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Group by", exact: true })).toContainText("No grouping");
  await expect(page.getByRole("combobox", { name: "Order by", exact: true })).toContainText("Title A–Z");
  await page.keyboard.press("Escape");
}

/** Requires at least 26 actual saved Requests; no private state or pagination injection. */
export async function prepareNavigationList(page: Page, fixture: NavigationFixture) {
  expect(fixture.requests.length).toBeGreaterThan(25);
  await page.goto("/?project=none");
  await expect(rows(page).first()).toBeVisible();
  await page.getByRole("button", { name: "Filter Requests by title", exact: true }).click();
  await page.getByRole("searchbox", { name: "Filter Requests by title", exact: true }).fill(fixture.filter);
  await page.keyboard.press("Escape");
  await setDisplay(page);
  await page.getByRole("combobox", { name: "Requests per page", exact: true }).click();
  await page.getByRole("option", { name: "10", exact: true }).click();
  await expect(rows(page)).toHaveCount(10);
  await expect(pages(page).getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
  return rows(page).evaluateAll(elements => elements.map(element => element.getAttribute("data-request-id")));
}

export async function verifyProjectReselection(page: Page, fixture: NavigationFixture, capture: Capture) {
  const firstPage = await prepareNavigationList(page, fixture);
  const historyLength = await page.evaluate(() => history.length);
  for (const source of ["sidebar", "palette"] as const) {
    await pages(page).getByRole("button", { name: "Page 2", exact: true }).press("Enter");
    await expect(pages(page).getByRole("button", { name: "Page 2", exact: true })).toHaveAttribute("aria-current", "page");
    if (source === "sidebar") await chooseSidebarProject(page, "No Project");
    else await runPaletteCommand(page, "No Project", "Project", "Control+k");
    await expect(pages(page).getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
    await expect.poll(() => rows(page).evaluateAll(elements => elements.map(element => element.getAttribute("data-request-id")))).toEqual(firstPage);
    await expectKeptControls(page, fixture);
    await expect(page).toHaveURL(url => url.pathname === "/" && url.searchParams.get("project") === "none");
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await capture(`${source}-reselected`);
  }
}

export async function verifyDetailHistoryAndSearch(page: Page, fixture: NavigationFixture, capture: Capture) {
  await prepareNavigationList(page, fixture);
  await pages(page).getByRole("button", { name: "Page 2", exact: true }).click();
  const row = rows(page).first();
  const id = (await row.getAttribute("data-request-id"))!;
  const listUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await row.focus();
  await row.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === `/requests/${id}`);
  await expect(page.locator("#request-title")).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  // The same sequence exists on phones, where its buttons are visually folded.
  const next = page.locator('[data-detail-sequence="next"]');
  const nextHref = await next.getAttribute("data-href");
  expect(nextHref).toBeTruthy();
  await page.keyboard.press("j");
  await expect(page).toHaveURL(new URL(nextHref!, page.url()).href);
  await expect(page.locator("#request-title")).toBeFocused();
  await page.keyboard.press("k");
  await expect(page).toHaveURL(url => url.pathname === `/requests/${id}`);
  await expect(page.locator("#request-title")).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  await page.goBack();
  await expect(page).toHaveURL(listUrl);
  await expect(requestRow(page, id)).toBeFocused();
  await expect(pages(page).getByRole("button", { name: "Page 2", exact: true })).toHaveAttribute("aria-current", "page");
  await expectKeptControls(page, fixture);
  await page.goForward();
  await expect(page).toHaveURL(url => url.pathname === `/requests/${id}`);
  await expect(page.locator("#request-title")).toBeVisible();
  await page.goBack();
  await expect(requestRow(page, id)).toBeFocused();

  const target = fixture.requests.find(request => request.id !== id)!;
  await runPaletteCommand(page, "Search workspace");
  await expect(search(page)).toBeFocused();
  await search(page).fill(target.code);
  await search(page).press("Enter");
  await expect(page).toHaveURL(url => url.pathname === `/requests/${target.id}`);
  await expect(page.locator("#request-title")).toContainText(target.title);
  await expect(page.locator("#request-title")).toBeFocused();
  await expect(page.getByRole("group", { name: /Request \d+ of \d+ in the list/ })).toHaveCount(0);
  await capture("search-arrival");
  await page.goBack();
  await expect(page).toHaveURL(listUrl);
  await expectKeptControls(page, fixture);
}

/** Real new tabs/windows: neither dispatchEvent nor window.open stands in for a link click. */
async function nativeClicks(page: Page, link: Locator, target: (url: URL) => boolean, kept: () => Promise<void>) {
  const modifier = await page.evaluate(() => /Mac/i.test(navigator.platform) ? "Meta" : "Control");
  for (const click of [{ modifiers: [modifier] }, { modifiers: ["Shift"] }, { button: "middle" }] as const) {
    await link.focus();
    const originalUrl = page.url();
    const historyLength = await page.evaluate(() => history.length);
    const opened = page.context().waitForEvent("page");
    await link.click(click.button ? { button: click.button } : { modifiers: [...click.modifiers] });
    const child = await opened;
    try { await expect(child).toHaveURL(target); }
    finally { await child.close(); }
    await page.bringToFront();
    await expect(page).toHaveURL(originalUrl);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await expect(link).toBeFocused();
    await kept();
  }
}

export async function verifyNativeNavigation(page: Page, fixture: NavigationFixture, capture: Capture) {
  await prepareNavigationList(page, fixture);
  await pages(page).getByRole("button", { name: "Page 2", exact: true }).click();
  const navigation = await openNavigation(page);
  const project = navigation.getByRole("link", { name: fixture.project.name, exact: true });
  await nativeClicks(page, project, url => url.pathname === "/" && url.searchParams.get("project") === fixture.project.id, async () => {
    await expect(navigation).toBeVisible();
    // The page beneath a phone drawer is inert, but its saved pagination stays intact.
    await expect(page.locator('[aria-label="Request pages"] [aria-label="Page 2"]')).toHaveAttribute("aria-current", "page");
  });
  const close = page.getByRole("button", { name: "Close navigation", exact: true });
  if (await close.isVisible()) await close.click();
  await runPaletteCommand(page, "Search workspace");
  const target = fixture.requests[0];
  await search(page).fill(target.title);
  await search(page).press("Enter");
  const matches = page.getByRole("listbox", { name: "Search matches", exact: true });
  const option = matches.getByRole("option").filter({ hasText: target.title });
  await expect(option).toHaveCount(1);
  await option.click();
  const open = page.getByRole("link", { name: "Open Request", exact: true }).filter({ visible: true });
  await nativeClicks(page, open, url => url.pathname === `/requests/${target.id}`, async () => {
    await expect(open).toBeVisible();
    await expect(page.getByRole("listbox", { name: "Search matches", exact: true })).toBeAttached();
  });
  await capture("native-search-preserved");
  await open.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === `/requests/${target.id}`);
  await expect(page.locator("#request-title")).toBeFocused();
}

/** Hold delivery of one real response; never synthesize its data or status. */
async function holdResponse(page: Page, match: (request: Request) => boolean) {
  let claimed: Request | undefined;
  let response: APIResponse | undefined;
  let error: unknown;
  let finished = false;
  const delivery = Promise.withResolvers<void>();
  const handler = async (route: Route) => {
    if (claimed || !match(route.request())) return route.continue();
    claimed = route.request();
    try {
      response = await route.fetch();
      await delivery.promise;
      await route.fulfill({ response });
    } catch (failure) { error = failure; }
    finally { finished = true; }
  };
  await page.route("**/*", handler);
  return {
    async received() {
      await expect.poll(() => Boolean(response) || Boolean(error), { timeout: 30_000 }).toBe(true);
      if (error) throw error;
      expect(response!.ok()).toBe(true);
      return response!.text();
    },
    async deliver({ allowCanceled = false } = {}) {
      delivery.resolve();
      await expect.poll(() => finished, { timeout: 30_000 }).toBe(true);
      if (error && !(allowCanceled && claimed?.failure())) throw error;
      await page.waitForTimeout(300);
    },
    async stop() { delivery.resolve(); await page.unroute("**/*", handler); },
  };
}

export async function verifyPendingNavigation(page: Page, fixture: NavigationFixture, openRequest: NavigationRequest, orgId: string, capture: Capture) {
  await page.goto("/?project=none");
  const row = requestRow(page, openRequest.id);
  await expect(row).toBeVisible();
  const priority = row.getByRole("button", { name: /^Priority:/ });
  const chosen = await priority.getAttribute("aria-label") === "Priority: High" ? "Low" : "High";
  const hold = await holdResponse(page, request => {
    if (request.method() !== "POST" || !request.headers()["next-action"]) return false;
    try {
      const args: unknown = JSON.parse(request.postData() ?? "null");
      return Array.isArray(args) && args.length === 3 && args[0] === openRequest.id && args[1] === chosen.toLowerCase() &&
        args[2]?.orgId === orgId;
    } catch { return false; }
  });
  try {
    await priority.click();
    await page.getByRole("menuitemcheckbox", { name: chosen, exact: true }).click();
    const body = await hold.received();
    expect(body).toContain('"success":true');
    expect(body).toContain(`"priority":"${chosen.toLowerCase()}"`);
    await expect(row.getByRole("button", { name: `Priority: ${chosen}`, exact: true })).toBeVisible();
    const originalUrl = page.url();
    await chooseSidebarProject(page, fixture.project.name);
    await expect(page.getByRole("heading", { name: "No matching Requests", exact: true }).or(page.getByRole("heading", { name: "No Requests in this Project yet", exact: true }))).toBeVisible();
    await expect(page).toHaveURL(originalUrl);
    await capture("pending-url-held");
    await hold.deliver();
    await expect(page).toHaveURL(url => url.pathname === "/" && url.searchParams.get("project") === fixture.project.id);
  } finally { await hold.stop(); }
}

export async function verifySupersededSearch(page: Page, fixture: NavigationFixture, capture: Capture) {
  await page.goto("/?project=none");
  await expect(rows(page).first()).toBeVisible();
  await runPaletteCommand(page, "Search workspace");
  const target = fixture.requests[0];
  const hold = await holdResponse(page, request => {
    const url = new URL(request.url());
    return request.method() === "GET" && url.pathname === "/api/search" && url.searchParams.get("q") === target.code;
  });
  try {
    await search(page).fill(target.code);
    await search(page).press("Enter");
    expect(await hold.received()).toContain(target.id);
    await chooseSidebarProject(page, fixture.project.name);
    await expect(page).toHaveURL(url => url.pathname === "/" && url.searchParams.get("project") === fixture.project.id);
    await page.locator("#lane-main").focus();
    await page.keyboard.press("Meta+k");
    const field = commandPalette(page).getByRole("combobox", { name: "Find an action or place" });
    await expect(field).toBeFocused();
    await field.fill("All Requests");
    await hold.deliver({ allowCanceled: true });
    await expect(page).toHaveURL(url => url.pathname === "/" && url.searchParams.get("project") === fixture.project.id);
    await expect(field).toHaveValue("All Requests");
    await expect(field).toBeFocused();
    await capture("superseded-search");
    await field.press("Escape");
  } finally { await hold.stop(); }
}
