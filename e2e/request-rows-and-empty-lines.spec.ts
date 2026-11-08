import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * Build 5.3 of #256 (#274): Request rows, status pills, empty lines and toolbar menus, driven as a person would.
 * A22 chips never overlap at 768 and 1024; A25 selected rows and the active Project keep their colours; A28 menu
 * icons; A213 priority at every status, changeable only while Open; A228 greyed statuses say why; chip text is at
 * least 11px and the Guest badge passes contrast in light and dark; phone titles take two lines; a slow tap shows
 * it is working. A224 each pill's own empty line; A215 chips and the match bar only for added filters, and Clear all
 * keeps the page's Project; A226 and A227 the Display and Add filter popovers.
 */

const SCHEMES = ["light", "dark"] as const;
const row = (page: Page, id: string) => page.locator(`[data-request-grid] [data-request-id="${id}"]`);
const activeFilters = (page: Page) => page.locator('[aria-label="Active filters"]');

async function withDatabase<T>(run: (sql: ReturnType<typeof e2eDatabase>) => Promise<T>) {
  const sql = e2eDatabase();
  try { return await run(sql); } finally { await sql.end(); }
}

type Seeded = { project: string; emptyProject: string; open: string; done: string; inProgress: string; waiting: string };

async function seed(orgId: string, userId: string): Promise<Seeded> {
  return withDatabase(async sql => {
    const [{ id: project }] = await sql`INSERT INTO projects (org_id, name, created_by) VALUES (${orgId}, 'Checkout and billing redesign', ${userId}) RETURNING id`;
    const [{ id: emptyProject }] = await sql`INSERT INTO projects (org_id, name, created_by) VALUES (${orgId}, 'Onboarding emails', ${userId}) RETURNING id`;
    const labels = [];
    for (const [name, colour] of [["Customer reported through the support inbox", "red"], ["Accessibility", "blue"], ["Mobile web", "green"]])
      labels.push((await sql`INSERT INTO workspace_labels (org_id, name, colour, created_by) VALUES (${orgId}, ${name}, ${colour}, ${userId}) RETURNING id`)[0].id as string);
    const insert = async (title: string, values: Record<string, unknown>) => (await sql`
      INSERT INTO requests ${sql({ org_id: orgId, title, description: "Seeded for the rows check.", created_by: userId, ...values })} RETURNING id`)[0].id as string;
    const open = await insert("Checkout button sits under the keyboard on narrow phone screens", { project_id: project, label_keys: labels, assigned_to: userId });
    const done = await insert("Receipt emails show the wrong currency", { status: "done", priority: "high", picked_up_at: new Date(), done_at: new Date(), assigned_to: userId });
    const inProgress = await insert("Pricing page loads slowly", { status: "in_progress", priority: "medium", picked_up_at: new Date(), assigned_to: userId });
    const waiting = await insert("Guest asks for invoices in PDF", { guest_submission: true });
    return { project, emptyProject, open, done, inProgress, waiting };
  });
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** WCAG contrast of an element's text over what is painted behind it (its see-through washes laid over the page). */
async function textContrast(target: Locator) {
  return target.evaluate(element => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgba = (colour: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255] as const;
    };
    const layers: (readonly [number, number, number, number])[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const layer = rgba(getComputedStyle(node).backgroundColor);
      if (layer[3] > 0) layers.push(layer);
      if (layer[3] >= 1) break;
    }
    let base: [number, number, number] = [255, 255, 255];
    for (const [r, g, b, a] of layers.reverse()) base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    const [tr, tg, tb, ta] = rgba(getComputedStyle(element).color);
    const text = [tr * ta + base[0] * (1 - ta), tg * ta + base[1] * (1 - ta), tb * ta + base[2] * (1 - ta)];
    const luminance = (channels: number[]) => channels.map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
    const [light, dark] = [luminance(text), luminance(base)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  });
}

async function scheme(page: Page, colorScheme: (typeof SCHEMES)[number]) {
  await page.emulateMedia({ colorScheme });
  if (colorScheme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
  else await expect(page.locator("html")).not.toHaveClass(/dark/);
}

/** For the PR's check page: kept in the test's output folder. */
async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled" });
}

/** Escape closes one menu level at a time; press it until no menu is left. */
async function closeMenus(page: Page) {
  await expect(async () => {
    if (await page.getByRole("menu").count()) await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

async function openStatusMenu(page: Page, target: Locator) {
  await target.click({ button: "right", position: { x: 200, y: 10 } });
  const menu = page.getByRole("menu", { name: /^Request / });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Status", exact: true }).click();
  return page.getByRole("menu", { name: "Status", exact: true });
}

test("rows read clearly at every width, in light and dark (#274)", async ({ page }, info) => {
  test.setTimeout(600_000);
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser("rows-read-clearly");
    const orgId = await provisionAndSignIn(page, owner, { name: "Rows Owner", workspaceName: "Rows read clearly" });
    const seeded = await seed(orgId, owner.id);
    const open = row(page, seeded.open);

    // A22: the labels "+N" chip, the first label, the Project chip and the avatar never overlap, and chip text is at least 11px.
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const colorScheme of SCHEMES) {
        await page.goto("/");
        await scheme(page, colorScheme);
        await expect(open).toBeVisible();
        const labels = open.locator('[data-row-property="requestType"] [data-label-tag]');
        await expect(labels).toHaveCount(2);
        await expect(labels.last()).toHaveText("+2");
        const parts = [labels.first(), labels.last(), open.locator('[data-row-property="project"] button'), open.locator('[data-row-property="pickedUpBy"] button')];
        const boxes = await Promise.all(parts.map(part => part.boundingBox()));
        expect(boxes.every(Boolean), `every chip is laid out at ${width}`).toBe(true);
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++)
          expect(overlaps(boxes[a]!, boxes[b]!), `chips ${a} and ${b} overlap at ${width} ${colorScheme}`).toBe(false);
        const rowBox = (await open.boundingBox())!;
        for (const box of boxes) expect(box!.x + box!.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
        for (const chip of [labels.last(), open.locator('[data-row-property="project"] button > *')])
          expect(Number.parseFloat(await chip.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11);

        // The Guest "Waiting to be taken on" badge passes AA for its small text, in both themes.
        const waitingBadge = row(page, seeded.waiting).locator('[data-row-property="waiting"] > *');
        await expect(waitingBadge).toHaveText("Waiting to be taken on");
        expect(await textContrast(waitingBadge), `Waiting badge contrast at ${width} ${colorScheme}`).toBeGreaterThanOrEqual(4.5);
        await shot(page, info, `list-${width}-${colorScheme}`);
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await scheme(page, "light");
    await expect(open).toBeVisible();

    // A213: every status shows its priority, No priority included; only the Open row's priority is a button.
    await expect(open.getByRole("button", { name: "Priority: No priority", exact: true })).toHaveCount(1);
    await expect(open.locator('svg[data-priority="none"] path')).toHaveAttribute("stroke-dasharray", /\d/);
    for (const [id, priority] of [[seeded.done, "high"], [seeded.inProgress, "medium"]] as const) {
      await expect(row(page, id).locator(`svg[data-priority="${priority}"]`)).toBeVisible();
      await expect(row(page, id).getByRole("button", { name: /^Priority:/ })).toHaveCount(0);
    }

    // A28: Select, Open Request and Preview carry their own icons; the menu never falls back to "···".
    await open.click({ button: "right", position: { x: 200, y: 10 } });
    const rowMenu = page.getByRole("menu", { name: /^Request / });
    await expect(rowMenu).toBeVisible();
    for (const name of ["Select", "Open Request", "Preview"]) await expect(rowMenu.getByRole("menuitem", { name: new RegExp(`^${name}`) }).locator("svg").first()).toBeVisible();
    await expect(rowMenu.locator("svg.lucide-ellipsis, svg.lucide-more-horizontal")).toHaveCount(0);
    await shot(page, info, "row-menu");
    await page.keyboard.press("Escape");
    await expect(rowMenu).toHaveCount(0);

    // A228: greyed statuses name the step that comes first, or say Requests don't move back.
    const openStatuses = await openStatusMenu(page, open);
    await expect(openStatuses.getByRole("menuitemcheckbox", { name: /^Done/ })).toHaveAccessibleDescription("Pick it up first");
    await expect(openStatuses.getByRole("menuitemcheckbox", { name: /^Measuring/ })).toHaveAccessibleDescription("Record the release first");
    await expect(openStatuses.getByRole("menuitemcheckbox", { name: /^Closed/ })).toHaveAccessibleDescription("Record the result once it’s Measuring");
    await shot(page, info, "row-menu-status-reasons");
    await closeMenus(page);
    const doneStatuses = await openStatusMenu(page, row(page, seeded.done));
    for (const earlier of ["Open", "In progress"]) await expect(doneStatuses.getByRole("menuitemcheckbox", { name: new RegExp(`^${earlier} Requests`) })).toHaveAccessibleDescription("Requests don’t move back");
    await closeMenus(page);

    // A25: a selected row keeps its Project dot's colour, and so does the sidebar's active Project.
    const dot = open.locator('[data-row-property="project"] [data-tone]');
    const colourOf = (target: Locator) => target.evaluate(element => getComputedStyle(element).backgroundColor);
    const resting = await colourOf(dot);
    await open.getByRole("checkbox").check({ force: true });
    await expect(open).toHaveAttribute("aria-selected", "true");
    expect(await colourOf(dot)).toBe(resting);
    await page.goto(`/?project=${seeded.project}`);
    const sidebarProject = page.locator('a[aria-current="page"]').filter({ hasText: "Checkout and billing redesign" });
    await expect(sidebarProject).toBeVisible();
    expect(await colourOf(sidebarProject.locator("[data-tone]"))).toBe(resting);

    // A226: the Display popover's Properties heading matches the Group by label.
    await page.getByRole("button", { name: "Display", exact: true }).click();
    const display = page.getByRole("dialog", { name: "Display Requests" });
    const style = (target: Locator) => target.evaluate(element => { const s = getComputedStyle(element); return [s.fontSize, s.fontWeight, s.color].join(" "); });
    expect(await style(display.getByText("Properties", { exact: true }))).toBe(await style(display.locator("label").filter({ hasText: "Group by" })));
    await shot(page, info, "display-popover");
    await page.keyboard.press("Escape");

    // A227: Add filter's Status menu fits its longest option.
    await page.locator('[data-slot="requests-toolbar"] [data-filter-trigger]').click();
    const addFilter = page.getByRole("dialog", { name: "Add filter" });
    await addFilter.getByRole("menuitem", { name: /^Status/ }).click();
    const waitingOption = addFilter.getByRole("menuitemradio", { name: /^Waiting to be taken on/ });
    await expect(waitingOption).toBeVisible();
    expect(await waitingOption.evaluate(item => Array.from(item.querySelectorAll("span")).every(span => span.scrollWidth <= span.clientWidth + 0.5))).toBe(true);
    await shot(page, info, "add-filter-status");
    await page.keyboard.press("Escape");

    // Phones: titles wrap to two lines, then end in "…".
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const title = open.locator("a[data-request-title]");
    await expect(title).toBeVisible();
    const lines = await title.evaluate(element => element.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(element).lineHeight));
    expect(Math.round(lines)).toBe(2);
    for (const colorScheme of SCHEMES) { await scheme(page, colorScheme); await shot(page, info, `phone-${colorScheme}`); }
  } finally {
    if (owner) { await cleanupTestWorkspace(owner.id); await deleteTestUser(owner.id); }
  }
});

test("each status pill has its own empty line; chips only for added filters (#274, A224, A215)", async ({ page, browser }, info) => {
  test.setTimeout(600_000);
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser("rows-empty-lines");
    const orgId = await provisionAndSignIn(page, owner, { name: "Empty Lines Owner", workspaceName: "Empty lines" });
    const seeded = await seed(orgId, owner.id);
    await page.setViewportSize({ width: 1440, height: 900 });
    const pills = page.getByRole("group", { name: "Status views", exact: true });
    const pill = (name: string) => pills.getByRole("button", { name, exact: true });
    const line = (title: string) => page.getByRole("heading", { level: 2, name: title, exact: true });

    // On an empty Project page, each pill's line: no chip, no match bar, no Clear filters; Open's has New Request.
    await page.goto(`/?project=${seeded.emptyProject}`);
    await expect(line("No Requests in this Project yet")).toBeVisible();
    const lines = [
      ["Open", "Nothing is Open", "New Requests start here."],
      ["In progress", "Nothing is In progress", "Requests move here when someone picks them up."],
      ["Done", "Nothing is Done", "Requests move here when the work is finished."],
      ["Measuring", "Nothing is Measuring", "Requests move here once their work is released."],
      ["Closed", "Nothing is Closed yet", "Requests close when the result is recorded."],
      ["Due soon or overdue", "No results are due soon", ""],
    ] as const;
    for (const colorScheme of SCHEMES) {
      await scheme(page, colorScheme);
      for (const [name, title, description] of lines) {
        await pill(name).click();
        const heading = line(title);
        await expect(heading).toBeVisible();
        const state = page.locator("section").filter({ has: heading });
        if (description) await expect(state.getByText(description, { exact: true })).toBeVisible();
        await expect(state.getByRole("link", { name: "New Request", exact: true })).toHaveCount(name === "Open" ? 1 : 0);
        await expect(state.getByRole("button")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Clear filters", exact: true })).toHaveCount(0);
        await expect(activeFilters(page)).toHaveCount(0);
        await expect(page).toHaveURL(url => url.searchParams.get("project") === seeded.emptyProject);
        await shot(page, info, `empty-${name}-${colorScheme}`);
      }
    }
    await scheme(page, "light");

    // Waiting to be taken on is chosen from Add filter, joins the pill row and still makes no chip.
    await page.locator('[data-slot="requests-toolbar"] [data-filter-trigger]').click();
    const addFilter = page.getByRole("dialog", { name: "Add filter" });
    await expect(addFilter.getByRole("menuitem", { name: /^Project/ })).toHaveCount(0);
    await addFilter.getByRole("menuitem", { name: /^Status/ }).click();
    await addFilter.getByRole("menuitemradio", { name: /^Waiting to be taken on/ }).click();
    await expect(line("No Guest submissions are waiting")).toBeVisible();
    await expect(pill("Waiting to be taken on")).toHaveAttribute("aria-pressed", "true");
    await expect(activeFilters(page)).toHaveCount(0);

    // An added filter brings the generic line, its chip and the match bar; Clear filters keeps the pill and the Project.
    await pill("Done").click();
    await page.getByRole("button", { name: "Filter by title", exact: true }).click();
    await page.getByRole("searchbox", { name: "Filter by title", exact: true }).fill("zzz");
    await page.keyboard.press("Escape");
    await expect(line("No matching Requests")).toBeVisible();
    await expect(page.getByText("Change or clear your filters.", { exact: true })).toBeVisible();
    await expect(activeFilters(page)).toBeVisible();
    await expect(activeFilters(page).getByRole("button", { name: "Remove Title: zzz", exact: true })).toBeVisible();
    await expect(activeFilters(page).getByRole("button", { name: /^Remove (Status|Project)/ })).toHaveCount(0);
    await expect(page.getByText("0 Requests match", { exact: true })).toBeVisible();
    await shot(page, info, "empty-added-filter");
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(line("Nothing is Done")).toBeVisible();
    await expect(page).toHaveURL(url => url.searchParams.get("project") === seeded.emptyProject && url.searchParams.get("status") === "done" && !url.searchParams.get("title"));
    await expect(activeFilters(page)).toHaveCount(0);

    // On a Project page with Requests, a pill adds no chip; Clear all clears the added filter and keeps the Project.
    await page.goto(`/?project=${seeded.project}`);
    await expect(row(page, seeded.open)).toBeVisible();
    await pill("Open").click();
    await expect(row(page, seeded.open)).toBeVisible();
    await expect(activeFilters(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Filter by title", exact: true }).click();
    await page.getByRole("searchbox", { name: "Filter by title", exact: true }).fill("checkout");
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 Request matches", { exact: true })).toBeVisible();
    await activeFilters(page).getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(activeFilters(page)).toHaveCount(0);
    await expect(page).toHaveURL(url => url.searchParams.get("project") === seeded.project && url.searchParams.get("status") === "open" && !url.searchParams.get("title"));
    await expect(page.getByRole("heading", { level: 1, name: "Checkout and billing redesign" })).toBeVisible();

    // The whole list: a pill with nothing in it says so in its own words too.
    await page.goto("/?status=measuring");
    await expect(line("Nothing is Measuring")).toBeVisible();
    await expect(activeFilters(page)).toHaveCount(0);

    // A29: the "N more" menu insets its items with their glyphs.
    await page.setViewportSize({ width: 480, height: 844 });
    await page.goto("/");
    const more = page.locator("[data-status-more] button").first();
    await expect(more).toBeVisible();
    await more.click();
    const items = page.getByRole("menuitem");
    expect(await items.count()).toBeGreaterThan(0);
    for (const item of await items.all()) await expect(item.locator("svg").first()).toBeVisible();
    await shot(page, info, "status-more");
    await page.keyboard.press("Escape");

    // Touch: a slow tap on a row shows it is pressed and, after 0.15s, a working line.
    const phone = await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      const tapPage = await phone.newPage();
      // Every read of the tapped Request is slow, its load-ahead included, so the tap waits on the network.
      await tapPage.route(`**/requests/${seeded.inProgress}**`, async route => { await new Promise(done => setTimeout(done, 3_000)); await route.continue().catch(() => {}); });
      await tapPage.goto("/");
      const tapped = row(tapPage, seeded.inProgress);
      await expect(tapped).toBeVisible();
      // A29: where no pill fits, the current view opens the menu and is checked there.
      await tapPage.locator("[data-status-more] button").first().tap();
      await expect(tapPage.getByRole("menuitem", { name: "All", exact: true }).locator("svg.lucide-check")).toBeVisible();
      await tapPage.keyboard.press("Escape");
      await expect(tapPage.getByRole("menu")).toHaveCount(0);
      await tapped.locator("a[data-request-title]").tap();
      await expect(tapped).toHaveAttribute("data-pressed", "");
      // The working line is drawn while the page is on its way and waits the placeholder's 0.15s before it shows.
      const working = await tapped.evaluate(element => { const after = getComputedStyle(element, "::after"); return { content: after.content, delay: after.animationDelay.split(",")[0].trim() }; });
      expect(working.content).not.toBe("none");
      expect(working.delay).toBe("0.15s");
      await tapPage.screenshot({ path: info.outputPath("slow-tap.png") });
      await tapPage.unrouteAll({ behavior: "ignoreErrors" });
    } finally { await phone.close(); }
  } finally {
    if (owner) { await cleanupTestWorkspace(owner.id); await deleteTestUser(owner.id); }
  }
});
