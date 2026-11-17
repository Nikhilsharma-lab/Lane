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
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      await page.keyboard.press("/");
      await expect(searchDialog(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(searchDialog(page)).toBeHidden();
    });

    await test.step("D21: a search jump marks the row it lands on; Google lands on Manage account", async () => {
      await settled(page);
      for (const [query, target] of [["dark mode", "theme"], ["Google", "manage-account"]] as const) {
        await page.keyboard.press("/");
        await expect(searchDialog(page)).toBeVisible();
        await page.keyboard.type(query);
        await page.keyboard.press("Enter");
        const row = page.locator(`#${target}`);
        await expect(row).toHaveAttribute("data-landed", "");
        await expect(row).toHaveAttribute("data-landed-keyboard", "");
        await expect.poll(() => row.evaluate(node => node.contains(document.activeElement))).toBe(true);
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
      await expect(dialog.getByText("Enter an email address.")).toBeVisible();
      await expect(field).toHaveAttribute("aria-invalid", "true");
      await field.fill("not-an-email");
      await dialog.getByRole("button", { name: "Send invitation" }).click();
      await expect(dialog.getByText("Enter a valid email address.")).toBeVisible();
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
      await page.getByRole("searchbox", { name: "Search people" }).fill("lane e2e member");
      await expect(people.getByRole("listitem")).toHaveCount(1);
      await page.getByRole("searchbox", { name: "Search people" }).fill("nobody-like-this");
      await expect(page.getByText("No one matches “nobody-like-this”.")).toBeVisible();
      await page.getByRole("button", { name: "Clear search" }).click();
      await expect(people.getByRole("listitem")).toHaveCount(2);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByText("What each role can do", { exact: true }).click();
      const region = page.getByRole("region", { name: "What each role can do" });
      await expect(region.getByRole("table")).toBeVisible();
      expect(await region.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 1000 });
    });

    await test.step("Metrics: Add metric has Cancel", async () => {
      await page.goto("/settings/metrics");
      const add = page.getByRole("button", { name: "Add metric" });
      await add.click();
      const dialog = page.getByRole("dialog", { name: "Create metric" });
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await expect(add).toBeFocused();
    });

    await test.step("Metrics: Archive happens at once, and Undo restores it", async () => {
      await page.getByRole("link", { name: "Conversion rate", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Conversion rate", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Archive metric" }).click();
      const message = page.locator("[data-toast-stack]");
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
