import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase, finishFirstRuns, provisionTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { commandPalette, paletteOption } from "./helpers/command-palette";
import { assertOwnedOrganization } from "./helpers/fixtures";
import { NAVIGATION_WIDTH } from "../src/components/shell/sidebar-motion";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./helpers/test-user";

// #269 (Build 4, walk findings A15, A16, A17, A19, A110, A111, A112, A113, A122, A123, A126, A127): the sidebar,
// the account menu and New Project, driven the way a person uses them. An Admin with two workspaces and a
// Member of the first walk them on desktop; the Admin then walks the navigation peek on a phone and a tablet.

// A workspace name of an everyday length: the trail keeps it whole at 1024 (A126).
const WORKSPACE = `Northwind Walk ${String(Date.now()).slice(-4)}`;
const OTHER_WORKSPACE = `Lane E2E Frame Other ${Date.now()}`;
const LONG_PROJECT = "Checkout and payments redesign for returning customers";
const OFFLINE_LINE = /^You.re offline$/;

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Workspace sidebar" });
const accountButton = (page: Page) => page.getByRole("button", { name: /^Account menu,/ });
const row = (page: Page, id: string) => page.locator(`[role=row][data-request-id="${id}"]`);
const preview = (page: Page) => page.getByRole("region", { name: "Request preview" });

/** Nothing under the press reacted: no page change, no preview, picker, menu or dialog. */
async function expectNothingOpened(page: Page, path: string) {
  await page.waitForTimeout(800);
  expect(new URL(page.url()).pathname).toBe(path);
  await expect(preview(page)).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/**
 * A112: the account row shows the whole name beside the arrow, Search and New Request, with no tip, at 1440 and
 * 1024 and in the 768 hover peek, which opens at the expanded sidebar's width.
 */
async function expectWholeName(page: Page, fullName: string, testInfo: TestInfo, who: string) {
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 768) {
      await page.getByRole("button", { name: "Expand sidebar" }).filter({ visible: true }).first().hover();
      await expect(page.locator("#lane-sidebar")).toHaveAttribute("data-peeking", "true");
      const panel = page.locator("[data-sidebar-panel]");
      await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0);
      expect((await panel.boundingBox())!.width, "the peek opens as wide as the expanded sidebar").toBe(NAVIGATION_WIDTH);
    }
    const name = accountButton(page).getByText(fullName, { exact: true });
    await expect(name).toBeVisible();
    expect(await name.evaluate(node => node.scrollWidth - node.clientWidth), `${fullName} at ${width}`).toBeLessThanOrEqual(0);
    await expect(sidebar(page).getByRole("button", { name: "Search workspace", exact: true })).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "New Request", exact: true }).first()).toBeVisible();
    await name.hover();
    await page.waitForTimeout(600);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`A112-account-row-${who}-${width}.png`), clip: { x: 0, y: 0, width: 300, height: 80 } });
    await page.mouse.move(width - 40, 600);
    if (width === 768) await expect(page.locator("#lane-sidebar")).not.toHaveAttribute("data-peeking", /.*/);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** The composer's idle preload marks a hydrated page, so its buttons answer presses. */
const hydrated = (page: Page) => expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 90_000 });

async function signedIn(browser: Browser, user: TestUser, orgId: string, options: BrowserContextOptions) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await signInTestUser(page, user, orgId);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await hydrated(page);
  return { context, page };
}

test("the sidebar, account menu and New Project: menus only close, names and limits are clear, offline never freezes", async ({ page, context, browser }, testInfo) => {
  // Borrowing users at Clerk's cap walks many users through Clerk's API, which can take minutes.
  test.setTimeout(900_000);
  const admin = await createTestUser("frame-admin");
  let member: TestUser | undefined;
  try {
    // Each person joins a workspace as soon as they're borrowed: at Clerk's cap, a parallel run borrows only people in no workspace.
    const otherOrgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Priya Raman", workspaceName: OTHER_WORKSPACE });
    const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Priya Raman", workspaceName: WORKSPACE });
    member = await createTestUser("frame-member");
    const client = await assertOwnedOrganization(orgId);
    await client.organizations.createOrganizationMembership({ organizationId: orgId, userId: member.id, role: "org:member" });
    const request = await seedTestRequest(admin.id, "Frame check Request");
    const other = await seedTestRequest(admin.id, "Another frame Request");
    const sql = e2eDatabase();
    try {
      await sql`insert into profiles(id, full_name, email, role) values (${member.id}, 'Daniel Okafor', ${member.email}, 'developer')
        on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role`;
      await finishFirstRuns(sql, orgId, [member.id], "joined");
      const longProject = randomUUID();
      await sql`insert into projects (id, org_id, name, created_by) values (${randomUUID()}, ${orgId}, 'Checkout', ${admin.id}), (${longProject}, ${orgId}, ${LONG_PROJECT}, ${admin.id})`;
      await sql`update requests set project_id = ${longProject} where id = ${request.id}`;
    } finally {
      await sql.end();
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login", { timeout: 120_000 }); // the dev server compiles sign-in on first visit
    await signInTestUser(page, admin, orgId);
    await page.goto("/");
    await expect(row(page, request.id)).toBeVisible({ timeout: 60_000 });
    await hydrated(page);
    const title = row(page, other.id).getByText("Another frame Request");

    await test.step("A113 and A123: an Admin keeps Invite and manage members; Keyboard shortcuts opens the list", async () => {
      await accountButton(page).click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: "Invite and manage members" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Members", exact: true })).toHaveCount(0);
      const shortcuts = menu.getByRole("menuitem", { name: "Keyboard shortcuts" });
      await expect(shortcuts).toBeVisible();
      await expect(shortcuts.locator("kbd")).toHaveText("?");
      await shortcuts.click();
      const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(accountButton(page)).toBeFocused();
    });

    await test.step("A16: a click outside the account menu only closes it", async () => {
      await accountButton(page).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await title.click();
      await expectNothingOpened(page, "/");
    });

    await test.step("A16: a click outside a Project's right-click menu only closes it", async () => {
      await sidebar(page).getByRole("link", { name: "Checkout", exact: true }).click({ button: "right" });
      await expect(page.getByRole("menu", { name: "Checkout actions" })).toBeVisible();
      await title.click();
      await expectNothingOpened(page, "/");
      // A right-click outside opens nothing else either.
      await sidebar(page).getByRole("link", { name: "Checkout", exact: true }).click({ button: "right" });
      await expect(page.getByRole("menu", { name: "Checkout actions" })).toBeVisible();
      await title.click({ button: "right" });
      await expectNothingOpened(page, "/");
    });

    await test.step("A112: an everyday name fits whole beside the arrow, Search and New Request, in the peek too; a long one is cut, with a tip", async () => {
      await expectWholeName(page, "Priya Raman", testInfo, "admin");
      const sql = e2eDatabase();
      const long = "Priyanka Ramanathan-Venkataraman";
      try {
        await sql`update profiles set full_name = ${long} where id = ${admin.id}`;
        await page.reload();
        await hydrated(page);
        const name = accountButton(page).getByText(long, { exact: true });
        expect(await name.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
        await name.hover();
        await expect(page.getByRole("tooltip")).toHaveText(long);
        await page.mouse.move(800, 600);
      } finally {
        await sql`update profiles set full_name = 'Priya Raman' where id = ${admin.id}`;
        await sql.end();
      }
      await page.reload();
      await expect(row(page, request.id)).toBeVisible({ timeout: 60_000 });
      await hydrated(page);
    });

    await test.step("A17: New Project with keyboard focus reads New Project once", async () => {
      const newProject = sidebar(page).getByRole("button", { name: "New Project", exact: true });
      await sidebar(page).getByRole("button", { name: "Projects", exact: true }).focus();
      for (let presses = 0; presses < 12 && !(await newProject.evaluate(node => node === document.activeElement)); presses += 1) await page.keyboard.press("Tab");
      await expect(newProject).toBeFocused();
      await expect(newProject).toHaveAccessibleName("New Project");
      // The button's own text stays invisible: only the label beside it is drawn.
      expect(await newProject.evaluate(node => getComputedStyle(node).color)).toBe("rgba(0, 0, 0, 0)");
      await expect(newProject.locator("xpath=ancestor::form[1]")).toHaveScreenshot("new-project-keyboard-focus.png", { animations: "disabled" });
    });

    await test.step("A19: a name that exists, in other capitals, is refused under the field and the text stays", async () => {
      await page.keyboard.press("Enter");
      const field = sidebar(page).getByRole("textbox", { name: "Project name" });
      await expect(field).toBeFocused();
      await field.fill("checkout");
      await field.press("Enter");
      // A development server compiles the action on its first call.
      await expect(sidebar(page).getByRole("alert")).toContainText("A Project called Checkout already exists. Choose another name.", { timeout: 45_000 });
      await expect(field).toHaveAccessibleDescription(/A Project called Checkout already exists\. Choose another name\./);
      await expect(field).toHaveValue("checkout");
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(sidebar(page).getByRole("link", { name: "Checkout", exact: true })).toHaveCount(1);
      await page.screenshot({ path: testInfo.outputPath("A19-duplicate-1440.png"), clip: { x: 0, y: 0, width: 260, height: 460 } });
    });

    await test.step("A110: the counter appears near the 80-character limit and the field stops at 80", async () => {
      const field = sidebar(page).getByRole("textbox", { name: "Project name" });
      await field.fill("a".repeat(60));
      await expect(sidebar(page).getByText(/characters? left/)).toHaveCount(0);
      await field.fill("a".repeat(70));
      await expect(sidebar(page).getByText("10 characters left").first()).toBeVisible();
      await field.pressSequentially("b".repeat(15));
      await expect(field).toHaveValue("a".repeat(70) + "b".repeat(10));
      await expect(sidebar(page).getByText("No characters left").first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("A110-counter-1440.png"), clip: { x: 0, y: 0, width: 260, height: 460 } });
      await field.press("Escape");
    });

    await test.step("New Request's Project picker: a name that exists, in other capitals, quietly picks that Project", async () => {
      await page.locator("#lane-main").focus();
      await page.keyboard.press("c");
      const composer = page.getByRole("dialog", { name: "New Request", exact: true });
      await expect(composer).toBeVisible();
      await composer.locator("#intake-project").click();
      const picker = page.getByRole("dialog", { name: "Choose a Project", exact: true });
      await picker.getByRole("button", { name: "New Project", exact: true }).click();
      const field = picker.getByRole("textbox", { name: "Project name", exact: true });
      await field.fill("CHECKOUT");
      await picker.getByRole("button", { name: "Create Project", exact: true }).click();
      await expect(picker).toBeHidden({ timeout: 45_000 });
      await expect(composer.locator("#intake-project")).toHaveAccessibleName("Project: Checkout");
      await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toHaveCount(0);
      // Still one Checkout, in the picker and, once the composer closes, in the sidebar.
      await composer.locator("#intake-project").click();
      await expect(picker.getByRole("option", { name: "Checkout", exact: true })).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(picker).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(composer).toBeHidden();
      await expect(sidebar(page).getByRole("link", { name: "Checkout", exact: true })).toHaveCount(1);
    });

    await test.step("A126: at 1024 the Request trail cuts the Project before the workspace name", async () => {
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.goto(`/requests/${request.id}`);
      const trail = page.getByRole("navigation", { name: "Breadcrumb" }).first();
      const workspace = trail.getByRole("link", { name: WORKSPACE });
      const project = trail.getByRole("link", { name: LONG_PROJECT });
      await expect(project).toBeVisible({ timeout: 30_000 });
      expect(await workspace.evaluate(node => node.scrollWidth - node.getBoundingClientRect().width)).toBeLessThan(1);
      expect(await project.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
      await page.locator("[data-slot=page-strip]").first().screenshot({ path: testInfo.outputPath("A126-trail-1024.png") });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await expect(row(page, request.id)).toBeVisible();
    });

    await test.step("A127: offline, a sidebar link and a ⌘K move keep the page and say it's offline", async () => {
      // The palette's code loads while online, as it does once a page is idle.
      await page.locator("#lane-main").focus();
      await page.keyboard.press("Meta+k");
      await expect(commandPalette(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(commandPalette(page)).toBeHidden();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await context.setOffline(true);
      await page.locator("#lane-main").focus();
      await page.keyboard.press("Meta+k");
      const field = commandPalette(page).getByRole("combobox", { name: "Find an action or place" });
      await field.fill("Inbox");
      await paletteOption(page, "Inbox").click();
      await page.waitForTimeout(1_500);
      expect(new URL(page.url()).pathname).toBe("/");
      await page.keyboard.press("Escape");
      await sidebar(page).getByRole("link", { name: "Impact", exact: true }).click();
      await page.waitForTimeout(1_500);
      expect(new URL(page.url()).pathname).toBe("/");
      await expect(page.getByRole("status").filter({ hasText: OFFLINE_LINE })).toBeVisible();
      await expect(row(page, request.id)).toBeVisible();
    });

    await test.step("A111: offline, Switch workspace says it couldn't and stays usable; online, Try again switches", async () => {
      await accountButton(page).click();
      await page.getByRole("menuitem", { name: "Switch workspace" }).click();
      const workspaces = page.getByRole("menu", { name: "Workspaces" });
      await workspaces.getByRole("menuitemradio", { name: OTHER_WORKSPACE }).click();
      // Curly apostrophes, as in the rest of the menu ("Couldn’t sign out").
      await expect(workspaces.getByRole("alert")).toHaveText("Couldn’t switch workspace. You’re offline, this will work when you’re back.", { timeout: 5_000 });
      // Try again is drawn as a button (Arc's secondary button), not as one more plain menu row.
      const retry = workspaces.getByRole("menuitem", { name: "Try again" });
      const look = await retry.evaluate(node => { const style = getComputedStyle(node); return { border: parseFloat(style.borderTopWidth), color: style.borderTopColor, width: node.getBoundingClientRect().width, menu: node.closest("[role=menu]")!.getBoundingClientRect().width }; });
      expect(look.border, "Try again has a button's border").toBeGreaterThan(0);
      expect(look.color).not.toBe("rgba(0, 0, 0, 0)");
      expect(look.width, "Try again is sized to its label, not a full-width row").toBeLessThan(look.menu / 2);
      await expect(workspaces.getByRole("menuitemradio", { name: WORKSPACE })).toHaveAttribute("aria-checked", "true");
      // Nothing waits on the switch: the page and sidebar take input again.
      await expect(page.locator("#lane-main")).not.toHaveAttribute("aria-busy", "true");
      await expect(page.locator("#lane-main")).not.toHaveAttribute("inert", /.*/);
      await expect(page.locator("#lane-sidebar")).not.toHaveAttribute("inert", /.*/);
      await page.screenshot({ path: testInfo.outputPath("A111-offline-switch-1440.png") });
      await context.setOffline(false);
      await workspaces.getByRole("menuitem", { name: "Try again" }).click();
      await expect(sidebar(page).getByRole("group", { name: OTHER_WORKSPACE })).toBeVisible({ timeout: 60_000 });
      void otherOrgId;
    });

    await test.step("A113: a Member sees Members, which opens Settings → Members", async () => {
      const { context: memberContext, page: memberPage } = await signedIn(browser, member!, orgId, { viewport: { width: 1440, height: 900 } });
      try {
        await expect(accountButton(memberPage)).toBeVisible({ timeout: 60_000 });
        await expectWholeName(memberPage, "Daniel Okafor", testInfo, "member");
        await accountButton(memberPage).click();
        const menu = memberPage.getByRole("menu");
        await expect(menu).toBeVisible();
        await memberPage.screenshot({ path: testInfo.outputPath("A113-member-menu-1440.png") });
        await expect(menu.getByRole("menuitem", { name: "Invite and manage members" })).toHaveCount(0);
        await menu.getByRole("menuitem", { name: "Members", exact: true }).click();
        await memberPage.waitForURL("**/settings/members");
      } finally {
        await memberContext.close();
      }
    });

    for (const device of [
      { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true },
      { name: "tablet", viewport: { width: 768, height: 1024 }, isMobile: false },
    ]) {
      await test.step(`A15: on a ${device.name}, a tap beside the open navigation only closes it`, async () => {
        const { context: touchContext, page: touchPage } = await signedIn(browser, admin, orgId, { viewport: device.viewport, hasTouch: true, isMobile: device.isMobile });
        try {
          const target = row(touchPage, other.id);
          await expect(target).toBeVisible({ timeout: 60_000 });
          for (const spot of [() => target.getByText("Another frame Request"), () => target.getByRole("button", { name: /Assignee/ })]) {
            await touchPage.getByRole("button", { name: "Expand sidebar" }).first().tap();
            await expect(touchPage.locator("#lane-sidebar")).toHaveAttribute("data-peeking", "true");
            // The tap lands beside the peek once it has slid fully in: on a phone it covers the start of each row.
            const panel = touchPage.locator("[data-sidebar-panel]");
            await expect.poll(async () => (await panel.boundingBox())?.x).toBe(0);
            const edge = (await panel.boundingBox())!.width;
            const box = (await spot().boundingBox())!;
            const x = Math.max(box.x + box.width / 2, Math.min(edge + 12, box.x + box.width - 2));
            await touchPage.touchscreen.tap(x, box.y + box.height / 2);
            await expect(touchPage.locator("#lane-sidebar")).not.toHaveAttribute("data-peeking", /.*/);
            await expectNothingOpened(touchPage, "/");
          }
          await touchPage.screenshot({ path: testInfo.outputPath(`A15-after-tap-${device.viewport.width}.png`) });

          if (device.name === "phone") {
            // A122: with motion turned off the phone account sheet is fully there on its first frame.
            await touchPage.emulateMedia({ reducedMotion: "reduce" });
            await touchPage.getByRole("button", { name: "Expand sidebar" }).first().tap();
            await touchPage.evaluate(() => {
              const w = window as unknown as { __laneSheet?: Promise<number> };
              w.__laneSheet = new Promise(resolve => {
                const observer = new MutationObserver(() => {
                  const sheet = document.querySelector<HTMLElement>('[role="menu"]');
                  if (!sheet) return;
                  observer.disconnect();
                  requestAnimationFrame(() => {
                    let opacity = 1;
                    for (let node: HTMLElement | null = sheet; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
                    resolve(opacity);
                  });
                });
                observer.observe(document.body, { childList: true, subtree: true });
              });
            });
            await accountButton(touchPage).tap();
            await expect(touchPage.getByRole("menu")).toBeVisible();
            expect(await touchPage.evaluate(() => (window as unknown as { __laneSheet: Promise<number> }).__laneSheet)).toBe(1);
            // Phones get no Keyboard shortcuts item.
            await expect(touchPage.getByRole("menuitem", { name: "Keyboard shortcuts" })).toHaveCount(0);
          }
        } finally {
          await touchContext.close();
        }
      });
    }
  } finally {
    await context.setOffline(false);
    await cleanupTestWorkspace(admin.id);
    await deleteTestUser(admin.id);
    if (member) {
      await cleanupTestWorkspace(member.id);
      await deleteTestUser(member.id);
    }
  }
});
