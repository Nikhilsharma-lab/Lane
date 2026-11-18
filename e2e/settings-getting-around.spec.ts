import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase, finishFirstRuns, provisionTestWorkspace } from "./helpers/cleanup";
import { assertOwnedOrganization } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./helpers/test-user";

// #288 (Build 8.2 of #256): Members, Metrics and getting around Settings, as a person uses them. An Admin and a
// Member share one temporary workspace. Nothing is invited for real (the invite checks stop at the field's messages)
// and the Archive is undone; a merge is only opened and cancelled.

const settled = async (page: Page) => {
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.organization), undefined, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
};
const searchDialog = (page: Page) => page.getByRole("dialog", { name: "Search settings" });

test("Settings: getting around, the Role row, Members' invite field, Metrics' Archive Undo and Merge, and who a section is for", async ({ page, browser }) => {
  test.setTimeout(900_000);
  const admin = await createTestUser("settings-288-admin");
  let member: TestUser | undefined;
  try {
    const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Lane E2E", workspaceName: `Lane E2E Settings 288 ${Date.now()}` });
    member = await createTestUser("settings-288-member");
    const client = await assertOwnedOrganization(orgId);
    await client.organizations.createOrganizationMembership({ organizationId: orgId, userId: member.id, role: "org:member" });
    const sql = e2eDatabase();
    try {
      await sql`insert into profiles(id,full_name,email,role) values (${member.id},'Lane E2E Member',${member.email},'designer')
        on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role`;
      await finishFirstRuns(sql, orgId, [member.id], "joined");
      // #288: a metric saved before definitions were guided, with no "how it's counted" yet.
      await sql`insert into metric_definitions(org_id,name,unit,created_by) values (${orgId},'Trials started','count',${admin.id})`;
    } finally {
      await sql.end();
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/login", { timeout: 120_000 });
    await signInTestUser(page, admin, orgId);

    await test.step("D20: / opens Settings search straight after the page loads, with nothing focused first", async () => {
      // "Right after load" as Build 2's shortcut checks mean it (popups-open-at-once.spec.ts): loaded and idle once.
      await page.addInitScript(() => {
        addEventListener("load", () => requestIdleCallback(() => { (window as unknown as { firstIdle?: boolean }).firstIdle = true; }), { once: true });
      });
      await page.goto("/settings/profile", { waitUntil: "load" });
      await expect.poll(() => page.evaluate(() => (window as unknown as { firstIdle?: boolean }).firstIdle === true)).toBe(true);
      // And React has taken over the page (a shortcut listens from then on; before it, no key does anything).
      await expect.poll(() => page.getByRole("button", { name: /Search settings/ }).evaluate(node => Object.keys(node).some(key => key.startsWith("__reactFiber")))).toBe(true);
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      await page.keyboard.press("/");
      await expect(searchDialog(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(searchDialog(page)).toBeHidden();
    });

    await test.step("D20: / pressed before Settings' code has run still opens search once it has", async () => {
      // Hold the page's code (not its styles, which inline scripts wait for) until the key is pressed, so the page
      // is only its HTML and styles when it is. A request the page drops meanwhile can't be continued, and needn't be.
      let release = () => {};
      const pressed = new Promise<void>(resolve => { release = resolve; });
      const held = async (route: import("@playwright/test").Route) => { await pressed; await route.continue().catch(() => undefined); };
      await page.route("**/_next/static/chunks/*.js", held);
      try {
        await page.goto("/settings/profile", { waitUntil: "domcontentloaded" });
        const trigger = page.getByRole("button", { name: /Search settings/ }).first();
        await expect(trigger).toBeVisible();
        expect(await trigger.evaluate(node => Object.keys(node).some(key => key.startsWith("__reactFiber"))), "React hasn't taken over yet").toBe(false);
        await page.keyboard.press("/");
        release();
        await expect(searchDialog(page)).toBeVisible({ timeout: 30_000 });
      } finally {
        release();
        await page.unroute("**/_next/static/chunks/*.js", held);
      }
      await expect(searchDialog(page).getByRole("combobox")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(searchDialog(page)).toBeHidden();
    });

    await test.step("D21: a search jump marks the row it lands on; Google lands on Manage account", async () => {
      await settled(page);
      for (const [query, target] of [["dark mode", "theme"], ["Google", "manage-account"]] as const) {
        await page.keyboard.press("/");
        await expect(searchDialog(page)).toBeVisible();
        await page.keyboard.type(query);
        // The wash lasts a moment (it fades by 1.6 s), so it is watched on every frame from the jump on, for 3 s
        // after the row shows: its background as focus arrives, its neighbour's, its own once the wash is over,
        // and whether the focused control (or the row itself) paints the keyboard ring.
        await page.evaluate(id => {
          const seen = { done: false, focusInside: false, ring: false, washed: "", neighbour: null as string | null, rest: "" };
          (window as unknown as { landing: typeof seen }).landing = seen;
          let shown = 0;
          const frame = (now: number) => {
            const node = document.getElementById(id);
            if (node?.checkVisibility()) {
              shown ||= now;
              const background = getComputedStyle(node).backgroundColor;
              const focused = document.activeElement;
              if (focused && node.contains(focused)) {
                if (!seen.focusInside) seen.washed = background;
                seen.focusInside = true;
                const style = getComputedStyle(focused);
                // A row with nothing to focus inside draws its ring as an inset shadow; a control, as Arc's outline.
                if (focused === node ? style.boxShadow.includes("inset") : style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) seen.ring = true;
              }
              const sibling = node.previousElementSibling ?? node.nextElementSibling;
              seen.neighbour = sibling && getComputedStyle(sibling).backgroundColor;
              seen.rest = background;
            }
            if (shown && now - shown > 3000) seen.done = true;
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        }, target);
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => (window as unknown as { landing: { done: boolean } }).landing.done, undefined, { timeout: 15_000 });
        const seen = await page.evaluate(() => (window as unknown as { landing: { focusInside: boolean; ring: boolean; washed: string; neighbour: string | null; rest: string } }).landing);
        expect(seen.focusInside, `focus lands inside #${target}`).toBe(true);
        expect(seen.ring, `the keyboard ring shows in #${target}`).toBe(true);
        // Washed as it lands: unlike its neighbour (Theme's row has none in its group) and unlike itself afterwards.
        expect(seen.washed, `#${target} is washed as it lands`).not.toBe(seen.rest);
        if (seen.neighbour !== null) {
          expect(seen.washed).not.toBe(seen.neighbour);
          expect(seen.rest, `#${target} looks like its neighbour once the wash is over`).toBe(seen.neighbour);
        }
      }
    });

    await test.step("D35: a pick with the mouse leaves no ring on Role", async () => {
      await page.goto("/settings/profile");
      await settled(page);
      const trigger = page.locator("#role").getByRole("combobox");
      const saved = (await trigger.textContent())!.trim();
      const other = saved === "Developer" ? "Designer" : "Developer";
      await trigger.click();
      await page.getByRole("option", { name: other }).click();
      await expect(trigger).toHaveText(other);
      await expect.poll(() => trigger.evaluate(node => document.activeElement === node && !node.matches(":focus-visible"))).toBe(true);
      // No toast says so: the select is the confirmation (D31).
      await expect(page.getByText("Role changed")).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      await page.reload();
      await expect(page.locator("#role").getByRole("combobox")).toHaveText(other);
    });

    await test.step("D3: offline, a Role change goes back, offers Try again and stays in Lane", async () => {
      await settled(page);
      const row = page.locator("#role");
      const trigger = row.getByRole("combobox");
      const saved = (await trigger.textContent())!.trim();
      const other = saved === "PM" ? "Designer" : "PM";
      let navigations = 0;
      page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
      await page.evaluate(() => { (window as unknown as { stillHere: boolean }).stillHere = true; });
      await page.context().setOffline(true);
      try {
        await trigger.click();
        await page.getByRole("option", { name: other }).click();
        await expect(row.getByRole("button", { name: "Try again" })).toBeVisible();
        await expect(row.getByRole("alert")).toContainText("offline");
        await expect(trigger).toHaveText(saved);
        expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
        expect(new URL(page.url()).pathname).toBe("/settings/profile");
        expect(navigations).toBe(0);
      } finally {
        await page.context().setOffline(false);
      }
      await row.getByRole("button", { name: "Try again" }).click();
      await expect(trigger).toHaveText(other);
      await expect(row.getByRole("button", { name: "Try again" })).toHaveCount(0);
    });

    await test.step("D19: on a phone the section strip shows the open section", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/settings/profile?section=billing");
      const nav = page.getByRole("navigation", { name: "Settings" });
      const active = nav.getByRole("link", { name: "Billing" });
      await expect(active).toHaveAttribute("aria-current", "page");
      await expect.poll(async () => {
        const [box, item] = await Promise.all([nav.boundingBox(), active.boundingBox()]);
        return !!box && !!item && item.x >= box.x - 1 && item.x + item.width <= box.x + box.width + 1;
      }).toBe(true);
      await page.setViewportSize({ width: 1440, height: 1000 });
    });

    await test.step("Members: the invite field says what's wrong, and the draft survives switching sections", async () => {
      await page.goto("/settings/members");
      const inviteButton = page.getByRole("button", { name: "Invite people" });
      await expect(inviteButton).toBeEnabled();
      await inviteButton.click();
      const dialog = page.getByRole("dialog", { name: "Invite people" });
      const field = dialog.getByLabel("Email address");
      await expect(field).toBeFocused();
      await dialog.getByRole("button", { name: "Send invitation" }).click();
      // The message is the field's own (D26): it describes the field, which is marked invalid.
      await expect(field).toHaveAccessibleDescription(/Enter an email address\./);
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await field.fill("not-an-email");
      await dialog.getByRole("button", { name: "Send invitation" }).click();
      await expect(field).toHaveAccessibleDescription(/Enter a valid email address\./);
      await expect(dialog).not.toContainText("Guests and Viewers are free.");
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(inviteButton).toBeFocused();
      const nav = page.getByRole("navigation", { name: "Settings" });
      await nav.getByRole("link", { name: "Profile" }).click();
      await nav.getByRole("link", { name: "Members" }).click();
      await page.getByRole("button", { name: "Invite people" }).click();
      await expect(page.getByRole("dialog", { name: "Invite people" }).getByLabel("Email address")).toHaveValue("not-an-email");
      await page.getByRole("dialog", { name: "Invite people" }).getByRole("button", { name: "Cancel" }).click();
    });

    await test.step("Members: search, and the role guide scrolls inside its own region on a phone", async () => {
      const people = page.getByRole("list", { name: "People in this workspace" });
      // People are listed as Clerk knows them; an address is unique to the Member.
      await page.getByRole("searchbox", { name: "Search people" }).fill(member!.email.slice(0, 24).toUpperCase());
      await expect(people.getByRole("listitem")).toHaveCount(1);
      await page.getByRole("searchbox", { name: "Search people" }).fill("nobody-like-this");
      await expect(page.getByText("No one matches “nobody-like-this”.")).toBeVisible();
      await page.getByRole("button", { name: "Show everyone" }).click();
      await expect(people.getByRole("listitem")).toHaveCount(2);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByText("What each role can do", { exact: true }).click();
      const region = page.getByRole("region", { name: "What each role can do" });
      await expect(region.getByRole("table")).toBeVisible();
      expect(await region.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 1000 });
    });

    await test.step("Metrics: a metric without how it's counted gets it from the guide, and then it's read-only (#288, #318)", async () => {
      await page.goto("/settings/metrics");
      const item = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Trials started", exact: true }) });
      await item.getByRole("button", { name: "Add how it’s counted for Trials started" }).click();
      const dialog = page.getByRole("dialog", { name: "Add how it’s counted" });
      // Asked only what measures in its unit (a count).
      await expect(dialog.getByRole("radio")).toHaveCount(1);
      await dialog.getByText("How many in total?", { exact: true }).click();
      await dialog.getByRole("button", { name: "Continue" }).click();
      await expect(dialog.getByRole("textbox", { name: "Name this metric" })).toHaveValue("Trials started");
      await dialog.getByRole("textbox", { name: "What happens for the count to go up by one?" }).fill("A trial is started");
      await dialog.getByRole("combobox", { name: "If one person does it twice, count…" }).click();
      await page.getByRole("option", { name: "Both times" }).click();
      await dialog.getByRole("button", { name: "Save definition" }).click();
      await expect(dialog).toBeHidden();
      const counted = "Number of times “A trial is started” happens during the measurement period. Include repeat occurrences.";
      await expect(item.getByText(counted)).toBeVisible();
      await expect(item.getByRole("button", { name: /Add how it’s counted/ })).toHaveCount(0);
      await expect(item.getByRole("link", { name: "Trials started", exact: true })).toBeFocused();
      // On its page the definition is read-only: shown, with nothing to add and its unit fixed.
      await item.getByRole("link", { name: "Trials started", exact: true }).click();
      const metric = page.getByRole("region", { name: "Trials started", exact: true });
      await expect(metric.getByText("Saved definition", { exact: true })).toBeVisible();
      await expect(metric.getByText(counted)).toBeVisible();
      await expect(metric.getByRole("button", { name: /Add how it’s counted/ })).toHaveCount(0);
      await expect(metric.getByRole("combobox", { name: "Unit" })).toHaveCount(0);
      await expect(metric.getByRole("textbox", { name: "Name" })).toBeEditable();
    });

    await test.step("Metrics: Add metric has Cancel on both steps, Back on the second, and ends on Add metric", async () => {
      await page.goto("/settings/metrics");
      const add = page.getByRole("button", { name: "Add metric" });
      await add.click();
      const dialog = page.getByRole("dialog", { name: "Add metric" });
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Back" })).toHaveCount(0);
      await dialog.getByText("How many in total?", { exact: true }).click();
      await dialog.getByRole("button", { name: "Continue" }).click();
      await expect(dialog.getByRole("button", { name: "Back" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Add metric" })).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await expect(add).toBeFocused();
    });

    await test.step("Metrics: Archive happens at once, and Undo restores it", async () => {
      await page.getByRole("link", { name: "Conversion rate", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Conversion rate", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Archive metric" }).click();
      const message = page.getByRole("region", { name: /^Messages/ });
      await expect(message.getByText("Metric archived")).toBeVisible();
      await expect(page.getByRole("button", { name: "Restore metric" })).toBeVisible();
      await message.getByRole("button", { name: "Undo" }).click();
      await expect(message.getByText("Metric restored")).toBeVisible();
      await expect(page.getByRole("button", { name: "Archive metric" })).toBeVisible();
    });

    await test.step("Metrics: Merge opens Lane's red confirmation on Cancel", async () => {
      await page.getByRole("combobox", { name: "Merge with" }).click();
      await page.getByRole("option", { name: "Feature adoption rate" }).click();
      await page.getByRole("button", { name: "Review merge" }).click();
      const confirm = page.getByRole("dialog", { name: "Merge Feature adoption rate into Conversion rate?" });
      await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
      await expect(confirm.getByRole("button", { name: "Merge metrics" })).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(confirm).toBeHidden();
      await expect(page.getByRole("button", { name: "Review merge" })).toBeFocused();
    });

    await test.step("A Member is told who Billing is for, and why a metric has no Archive or Merge", async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      try {
        const memberPage = await context.newPage();
        await memberPage.goto("/login", { timeout: 120_000 });
        await signInTestUser(memberPage, member!, orgId);
        await memberPage.goto("/settings/profile?section=billing");
        await expect(memberPage.getByText("Billing is for Admins of this workspace.")).toBeVisible();
        await expect(memberPage.getByRole("heading", { name: "Profile", level: 2 })).toBeVisible();
        await memberPage.goto("/settings/metrics");
        await memberPage.getByRole("link", { name: "Conversion rate", exact: true }).click();
        await expect(memberPage.getByText("Only Admins can archive or merge metrics.")).toBeVisible();
        await expect(memberPage.getByRole("button", { name: "Archive metric" })).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  } finally {
    await cleanupTestWorkspace(admin.id);
    await deleteTestUser(admin.id);
    if (member) {
      await cleanupTestWorkspace(member.id);
      await deleteTestUser(member.id);
    }
  }
});
