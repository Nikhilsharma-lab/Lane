import { expect, test, type Page } from "@playwright/test";

import { finishFirstRuns } from "./helpers/cleanup";
import { withE2EDatabase } from "./helpers/database";
import { createRoleWorkspace, hydrated, seedRoleRequest, type Person } from "./helpers/role-workspace";
import { createTestWorkspace, removeTestMember, setTestMemberRole, type WorkspaceRole } from "./helpers/workspaces";

/**
 * #402 (#383 stories 59, 60 and 72): Next keeps the app frame across in-app moves, so after a removal, a role change
 * or a switch in another tab, the next move ends in a full load of the person's current workspace and role, and
 * nothing of the old one stays on screen, in memory or behind Back.
 */

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Workspace sidebar" });
const inWorkspace = (page: Page, name: string) => sidebar(page).getByRole("heading", { name, exact: true });
const sidebarLink = (page: Page, name: string) => sidebar(page).getByRole("link", { name, exact: true });
const requestLink = (page: Page, title: string) => page.getByRole("main").getByRole("link", { name: title, exact: true });
const newRequest = (page: Page) => page.getByRole("main").getByRole("link", { name: "New Request", exact: true });

/** Counts what the page does from here on: full loads, and the frame's own questions to the server. */
function watch(page: Page) {
  const seen = { loads: 0, checks: 0 };
  page.on("domcontentloaded", () => { seen.loads++; });
  page.on("request", (request) => { if (new URL(request.url()).searchParams.get("only") === "role") seen.checks++; });
  return seen;
}

/** The list, with its links' pages read ahead, as it stands a moment after a visit. */
async function settleOnList(page: Page, title: string) {
  await page.goto("/");
  await expect(requestLink(page, title)).toBeVisible();
  await hydrated(sidebarLink(page, "Impact"));
  await page.waitForLoadState("networkidle");
}

async function expectWholeLighthouse(page: Page) {
  await expect(inWorkspace(page, "Lighthouse")).toBeVisible();
  await expect(requestLink(page, "Lighthouse request")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByText(/Harbour/)).toHaveCount(0);
}

/** A Harbour team whose Member, Mina, is also in Lighthouse, with a Request in each; Harbour is the one she has open. */
async function teamWithMinaInTwo(browser: Parameters<typeof createRoleWorkspace>[0], roles: WorkspaceRole[] = ["admin", "member"]) {
  const team = await createRoleWorkspace(browser, "Harbour", roles);
  try {
    const { admin, member } = team.people;
    const lighthouse = await createTestWorkspace(member.id, "Lighthouse");
    await withE2EDatabase(async (sql) => {
      await finishFirstRuns(sql, lighthouse, [member.id], "first_request");
      await sql`update profiles set last_workspace_id = ${team.orgId} where id = ${member.id}`;
    });
    await seedRoleRequest(lighthouse, member, "Lighthouse request");
    const harbourRequest = await seedRoleRequest(team.orgId, admin, "Harbour request");
    return { ...team, harbourRequest };
  } catch (error) {
    await team.close();
    throw error;
  }
}

/** Runs the test on a team of its own and closes it. */
async function withTeam<T extends { close: () => Promise<void> }>(made: Promise<T>, run: (team: T) => Promise<void>) {
  const team = await made;
  try { await run(team); } finally { await team.close(); }
}

test("a removed person's next in-app click lands whole in their other workspace", async ({ browser }) => {
  test.setTimeout(180_000);
  await withTeam(teamWithMinaInTwo(browser), async (team) => {
    const { page, id } = team.people.member;
    await settleOnList(page, "Harbour request");
    await removeTestMember(team.orgId, id);
    const seen = watch(page);

    await sidebarLink(page, "Impact").click();
    await expectWholeLighthouse(page);
    expect(seen.loads, "one full load").toBe(1);

    await test.step("nothing of it is behind Back or on an old address, and moves after it load nothing more", async () => {
      await page.goBack();
      await expectWholeLighthouse(page);
      await page.goto(`/requests/${team.harbourRequest}`);
      await expect(page.getByRole("heading", { name: "This Request can’t be opened" })).toBeVisible();
      await settleOnList(page, "Lighthouse request");
      seen.loads = 0;
      seen.checks = 0;
      await sidebarLink(page, "Impact").click();
      await expect(page).toHaveURL(/\/impact$/);
      await sidebarLink(page, "Inbox").click();
      await expect(page).toHaveURL(/\/inbox$/);
      await page.waitForLoadState("networkidle");
      expect(seen).toEqual({ loads: 0, checks: 2 });
    });
  });
});

test("a removal also shows on a click the app answers from memory, and behind Back", async ({ browser }) => {
  test.setTimeout(180_000);
  await withTeam(teamWithMinaInTwo(browser), async (team) => {
    const { page, id } = team.people.member;
    await settleOnList(page, "Harbour request");
    await sidebarLink(page, "Inbox").click();
    await expect(page).toHaveURL(/\/inbox$/);
    await page.waitForLoadState("networkidle");
    await removeTestMember(team.orgId, id);

    // The list is seconds old, so the router shows it again without asking the server.
    await page.goBack();
    await expectWholeLighthouse(page);
  });
});

test("a removed person with no workspace left can't go Back to it from Onboarding", async ({ browser }) => {
  test.setTimeout(180_000);
  await withTeam(createRoleWorkspace(browser, "Harbour", ["admin", "member"]), async (team) => {
    const { page, id } = team.people.member;
    await seedRoleRequest(team.orgId, team.people.admin, "Harbour request");
    await settleOnList(page, "Harbour request");
    await removeTestMember(team.orgId, id);

    const notice = page.getByText("You’re no longer in Harbour", { exact: true });
    await sidebarLink(page, "Impact").click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(notice).toBeVisible();
    await page.waitForLoadState("networkidle");
    const sawTheList = await watchFor(page, "Harbour request");
    await page.goBack();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(notice).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
    expect(sawTheList()).toBe(false);
  });
});

/** Watches every frame from here on, full loads included, for the words on screen. */
async function watchFor(page: Page, words: string) {
  let shown = false;
  await page.exposeFunction("laneSaw", () => { shown = true; });
  const watchFrames = (text: string) => {
    const look = () => {
      if (document.body?.innerText.includes(text)) (window as unknown as { laneSaw: () => void }).laneSaw();
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  };
  await page.addInitScript(watchFrames, words);
  await page.evaluate(watchFrames, words);
  return () => shown;
}

for (const [to, changed] of [
  ["viewer", async (page: Page) => {
    await expect(requestLink(page, "Harbour request")).toBeVisible();
    await expect(newRequest(page)).toHaveCount(0);
  }],
  ["guest", async (page: Page) => {
    await expect(page.getByRole("heading", { name: "My Requests", level: 1 })).toBeVisible();
    await expect(page.getByText("Harbour request")).toHaveCount(0);
  }],
] as const) {
  test(`a Member made a ${to} has that role's app from their next in-app click`, async ({ browser }) => {
    test.setTimeout(180_000);
    await withTeam(createRoleWorkspace(browser, "Harbour", ["admin", "member"]), async (team) => {
      const { page, id }: Person = team.people.member;
      await seedRoleRequest(team.orgId, team.people.admin, "Harbour request");
      await settleOnList(page, "Harbour request");
      await expect(newRequest(page).first()).toBeVisible();
      await setTestMemberRole(team.orgId, id, to);
      const seen = watch(page);

      await sidebarLink(page, "Inbox").click();
      await expect.poll(() => seen.loads, "one full load").toBe(1);
      await expect(page).toHaveURL(/\/inbox$/);
      await expect(inWorkspace(page, "Harbour")).toBeVisible();
      await page.waitForLoadState("networkidle");

      await test.step("the list behind Back, and its link, are that role's", async () => {
        await page.goBack();
        await changed(page);
        await sidebarLink(page, "Impact").click();
        await expect(page).toHaveURL(/\/impact$/);
        await sidebarLink(page, to === "guest" ? "My Requests" : "All Requests").click();
        await changed(page);
        expect(seen.loads, "no other full load").toBe(1);
      });
    });
  });
}

test("a workspace switched in another tab is this tab's from its next in-app click", async ({ browser }) => {
  test.setTimeout(180_000);
  await withTeam(teamWithMinaInTwo(browser), async (team) => {
    const { page, name } = team.people.member;
    await settleOnList(page, "Harbour request");
    const other = await page.context().newPage();
    await settleOnList(other, "Harbour request");
    await sidebar(other).getByRole("button", { name: `Account menu, ${name}` }).click();
    await other.getByRole("menuitem", { name: "Switch workspace" }).click();
    await other.getByRole("menuitemradio", { name: "Lighthouse" }).or(other.getByRole("menuitem", { name: "Lighthouse" })).click();
    await expectWholeLighthouse(other);

    await expect(inWorkspace(page, "Harbour")).toBeVisible();
    await sidebarLink(page, "Impact").click();
    await expectWholeLighthouse(page);
  });
});

test("an unsent Request survives the full load a role change brings", async ({ browser }) => {
  test.setTimeout(180_000);
  await withTeam(createRoleWorkspace(browser, "Harbour", ["admin", "member"]), async (team) => {
    const { page, id } = team.people.member;
    await seedRoleRequest(team.orgId, team.people.admin, "Harbour request");
    await settleOnList(page, "Harbour request");
    await sidebarLink(page, "Impact").click();
    await expect(page).toHaveURL(/\/impact$/);
    await sidebarLink(page, "All Requests").click();
    const composer = page.getByRole("dialog", { name: "New Request", exact: true });
    await newRequest(page).first().click();
    await composer.getByRole("textbox", { name: "Request title", exact: true }).fill("Typed before the role change");
    await setTestMemberRole(team.orgId, id, "admin");
    const seen = watch(page);

    // The composer stays open over the page Back brings, so this is a full load with typed words on screen.
    await page.goBack();
    await expect.poll(() => seen.loads, "one full load").toBe(1);
    await settleOnList(page, "Harbour request");
    if (!(await composer.isVisible())) await newRequest(page).first().click();
    await expect(composer.getByRole("textbox", { name: "Request title", exact: true })).toHaveValue("Typed before the role change");
  });
});

test("typing a filter, switching status views and closing popups ask nothing", async ({ browser }) => {
  test.setTimeout(180_000);
  await withTeam(createRoleWorkspace(browser, "Harbour", ["admin"]), async (team) => {
    const { page } = team.people.admin;
    await seedRoleRequest(team.orgId, team.people.admin, "Harbour request");
    await settleOnList(page, "Harbour request");
    const seen = watch(page);
    await page.getByRole("button", { name: "Open", exact: true }).first().click();
    await expect(page).toHaveURL(/status=open/);
    await page.getByRole("button", { name: "Filter by title" }).click();
    await page.keyboard.type("harb");
    await expect(page).toHaveURL(/title=harb/);
    await page.keyboard.press("Escape");
    await sidebar(page).getByRole("button", { name: /^Account menu/ }).click();
    await page.keyboard.press("Escape");
    await page.waitForLoadState("networkidle");
    expect(seen).toEqual({ loads: 0, checks: 0 });
  });
});
