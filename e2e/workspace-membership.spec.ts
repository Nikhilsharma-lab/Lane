import { expect, test, type Browser, type Page } from "@playwright/test";

import { captureAction, sendAs } from "./helpers/captured-action";
import { finishFirstRuns } from "./helpers/cleanup";
import { withE2EDatabase } from "./helpers/database";
import { createRoleWorkspace, hydrated, seedComment, seedRoleRequest } from "./helpers/role-workspace";
import { createTestWorkspace, type WorkspaceRole } from "./helpers/workspaces";

/**
 * #402 (#383 stories 53–60): removing someone, changing their role, leaving and renaming, as the people involved meet
 * them. A removal or a role change applies on the person's next click, in the browser they already have open.
 */

const ONLY_ADMIN = "You’re the only Admin. Make someone else an Admin before you leave.";
const VIEWER_REFUSED = "You’re a Viewer in this workspace, so you can read everything but can’t change anything. Ask an Admin if you need to.";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Workspace sidebar" });
/** The workspace that the frame around the page names. */
const inWorkspace = (page: Page, name: string) => sidebar(page).getByRole("heading", { name, exact: true });
const requestLink = (page: Page, title: string) => page.getByRole("link", { name: title, exact: true });
const people = (page: Page) => page.getByRole("list", { name: "People in this workspace" });
const commentBox = (page: Page) => page.getByRole("textbox", { name: "Comment", exact: true });
const details = (page: Page) => page.getByRole("region", { name: "Workspace details", exact: true });
const leaveButton = (page: Page) => details(page).getByRole("button", { name: "Leave workspace", exact: true });
const confirmation = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });

async function openMembers(page: Page) {
  await page.goto("/settings/members");
  await expect(people(page)).toBeVisible();
  await hydrated(page.getByRole("searchbox", { name: "Search people" }));
}

async function openWorkspaceDetails(page: Page) {
  await page.goto("/settings/profile?section=workspace");
  await hydrated(leaveButton(page));
}

async function removeFromWorkspace(admin: Page, name: string, workspace: string) {
  await openMembers(admin);
  await people(admin).getByRole("button", { name: `Remove ${name}`, exact: true }).click();
  const asked = confirmation(admin, `Remove ${name}?`);
  await expect(asked).toContainText(`${name} loses access to ${workspace} straight away. Their Requests, comments and history stay.`);
  await asked.getByRole("button", { name: `Remove ${name.split(" ")[0]}`, exact: true }).click();
  await expect(admin.getByRole("status").filter({ hasText: `${name} was removed from ${workspace}.` })).toBeVisible();
  await expect(people(admin).getByText(name, { exact: true })).toHaveCount(0);
}

async function changeRole(admin: Page, name: string, from: string, to: string) {
  await openMembers(admin);
  await people(admin).getByRole("combobox", { name: `Role for ${name}: ${from}`, exact: true }).click();
  await admin.getByRole("option", { name: new RegExp(`^${to}`) }).click();
  await expect(people(admin).getByRole("combobox", { name: `Role for ${name}: ${to}`, exact: true })).toBeVisible();
  await expect(admin.getByRole("status").filter({ hasText: `${name} is now a` })).toBeVisible();
}

/** A team whose Member, Mina, is in Lighthouse too, with a Request in each; Harbour is the one she has open. */
async function teamWithMinaInTwo(browser: Browser, roles: WorkspaceRole[]) {
  const team = await createRoleWorkspace(browser, "Harbour", roles);
  try {
    const { member } = team.people;
    const lighthouse = await createTestWorkspace(member.id, "Lighthouse");
    await withE2EDatabase(async (sql) => {
      await finishFirstRuns(sql, lighthouse, [member.id], "first_request");
      await sql`update profiles set last_workspace_id = ${team.orgId} where id = ${member.id}`;
    });
    await seedRoleRequest(lighthouse, member, "Lighthouse request");
    const harbourRequest = await seedRoleRequest(team.orgId, member, "Harbour request");
    return { ...team, harbourRequest };
  } catch (error) {
    await team.close();
    throw error;
  }
}

test("a removal applies on the next page: the person's other workspace opens, or Onboarding says why, and their work stays", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await teamWithMinaInTwo(browser, ["admin", "member", "guest"]);
  try {
    const { admin, member, guest } = team.people;
    await seedComment(team.harbourRequest, member, "Written before the removal.");
    for (const { page } of [member, guest]) {
      await page.goto("/");
      await expect(inWorkspace(page, "Harbour")).toBeVisible();
    }
    await expect(requestLink(member.page, "Harbour request")).toBeVisible();

    await removeFromWorkspace(admin.page, member.name, "Harbour");
    await removeFromWorkspace(admin.page, guest.name, "Harbour");

    await test.step("with another workspace, the next page load opens it, and nothing of this one", async () => {
      await member.page.reload();
      await expect(inWorkspace(member.page, "Lighthouse")).toBeVisible();
      await expect(inWorkspace(member.page, "Harbour")).toHaveCount(0);
      await expect(requestLink(member.page, "Lighthouse request")).toBeVisible();
      await expect(member.page.getByText("Harbour request")).toHaveCount(0);
      await member.page.goto(`/requests/${team.harbourRequest}`);
      await expect(member.page.getByRole("heading", { name: "This Request can’t be opened" })).toBeVisible();
      await expect(member.page.getByText("Harbour request")).toHaveCount(0);
    });

    await test.step("with none, the next click is Onboarding's notice", async () => {
      await sidebar(guest.page).getByRole("link", { name: "Impact", exact: true }).click();
      await expect(guest.page).toHaveURL(/\/onboarding$/);
      await expect(guest.page.getByText("You’re no longer in Harbour", { exact: true })).toBeVisible();
      await expect(guest.page.getByText("Your Requests and comments stay in that workspace.", { exact: true })).toBeVisible();
      await expect(guest.page.getByRole("button", { name: "Create workspace", exact: true })).toBeVisible();
    });

    await test.step("an Admin still sees the removed person's Request and comment, under their name", async () => {
      await admin.page.goto(`/requests/${team.harbourRequest}`);
      await expect(admin.page.getByRole("heading", { name: "Harbour request", level: 1 })).toBeVisible();
      await expect(admin.page.getByText("Requester: Mina Member", { exact: true })).toBeVisible();
      await expect(admin.page.getByRole("article", { name: "Comment by Mina Member" })).toContainText("Written before the removal.");
    });
  } finally {
    await team.close();
  }
});

test("a role change applies on the person's next click, up and down", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await createRoleWorkspace(browser, "Harbour", ["admin", "member"]);
  try {
    const { admin, member } = team.people;
    const request = await seedRoleRequest(team.orgId, admin, "Harbour request");
    await member.page.goto(`/requests/${request}`);
    await commentBox(member.page).fill("Typed while a Member.");
    await expect(member.page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();

    await changeRole(admin.page, member.name, "Member", "Viewer");

    await test.step("made a Viewer, their next click on the open page is refused, and the next page has no controls", async () => {
      await member.page.getByRole("button", { name: "Post comment", exact: true }).click();
      await expect(member.page.getByText(VIEWER_REFUSED, { exact: true })).toBeVisible();
      await sidebar(member.page).getByRole("link", { name: "Inbox", exact: true }).click();
      await expect(member.page).toHaveURL(/\/inbox$/);
      await member.page.goto(`/requests/${request}`);
      await expect(member.page.getByRole("heading", { name: "Harbour request", level: 1 })).toBeVisible();
      await expect(member.page.getByText("0 comments", { exact: true })).toBeVisible();
      await expect(commentBox(member.page)).toHaveCount(0);
      await expect(member.page.getByRole("button", { name: "Pick up", exact: true })).toHaveCount(0);
      await member.page.goto("/settings/members");
      await expect(member.page.getByText("Members is for Admins and Members of this workspace.", { exact: true })).toBeVisible();
    });

    await test.step("made an Admin, they can invite on their next page", async () => {
      await changeRole(admin.page, member.name, "Viewer", "Admin");
      await openMembers(member.page);
      await expect(member.page.getByRole("button", { name: "Invite people", exact: true })).toBeVisible();
    });
  } finally {
    await team.close();
  }
});

test("the only Admin can't leave, not even by asking the server; with a second Admin, they can", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await createRoleWorkspace(browser, "Harbour", ["admin", "member", "guest"]);
  try {
    const { admin, member, guest } = team.people;
    // The Guest's own Leave, kept back: the only Admin's button sends none.
    await openWorkspaceDetails(guest.page);
    const leave = await captureAction(guest.page, team.orgId, async () => {
      await leaveButton(guest.page).click();
      await confirmation(guest.page, "Leave Harbour?").getByRole("button", { name: "Leave workspace", exact: true }).click();
    });

    await openWorkspaceDetails(admin.page);
    await expect(leaveButton(admin.page)).toBeDisabled();
    await expect(leaveButton(admin.page)).toHaveAccessibleDescription(`${ONLY_ADMIN} Make someone an Admin`);

    expect(await sendAs(admin.page, leave)).toEqual({ ok: false, code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER" });
    await openMembers(admin.page);
    await expect(people(admin.page).getByRole("combobox", { name: "Role for Ada Admin: Admin", exact: true })).toBeVisible();

    await test.step("the kept-back Leave is a real one: it takes the Guest out", async () => {
      expect(await sendAs(guest.page, leave)).toEqual({ ok: true });
      await guest.page.goto("/");
      await expect(guest.page).toHaveURL(/\/onboarding$/);
      await expect(guest.page.getByText("You’re no longer in Harbour", { exact: true })).toBeVisible();
    });

    await test.step("Make someone an Admin leads to the People list", async () => {
      await openWorkspaceDetails(admin.page);
      await details(admin.page).getByRole("link", { name: "Make someone an Admin", exact: true }).click();
      await expect(admin.page.locator("#people")).toBeFocused();
      await changeRole(admin.page, member.name, "Member", "Admin");
    });

    await test.step("with a second Admin, Leave works, and the one left is now the only Admin", async () => {
      await openWorkspaceDetails(admin.page);
      await leaveButton(admin.page).click();
      const asked = confirmation(admin.page, "Leave Harbour?");
      await expect(asked).toContainText("You lose access straight away. Your Requests and comments stay.");
      await asked.getByRole("button", { name: "Leave workspace", exact: true }).click();
      await expect(admin.page).toHaveURL(/\/onboarding$/);
      await openMembers(member.page);
      await expect(people(member.page).getByRole("listitem")).toHaveCount(1);
      await expect(people(member.page)).toContainText("Mina Member (you)");
      await openWorkspaceDetails(member.page);
      await expect(leaveButton(member.page)).toBeDisabled();
    });
  } finally {
    await team.close();
  }
});

test("a person who leaves lands in their other workspace, and the one they left keeps their Request", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await teamWithMinaInTwo(browser, ["admin", "member"]);
  try {
    const { admin, member } = team.people;
    await openWorkspaceDetails(member.page);
    await leaveButton(member.page).click();
    await confirmation(member.page, "Leave Harbour?").getByRole("button", { name: "Leave workspace", exact: true }).click();
    await expect(inWorkspace(member.page, "Lighthouse")).toBeVisible();
    await expect(inWorkspace(member.page, "Harbour")).toHaveCount(0);
    await expect(requestLink(member.page, "Lighthouse request")).toBeVisible();
    await expect(member.page.getByText("Harbour request")).toHaveCount(0);

    await admin.page.goto("/");
    await expect(requestLink(admin.page, "Harbour request")).toBeVisible();
    await openMembers(admin.page);
    await expect(people(admin.page).getByRole("listitem")).toHaveCount(1);
  } finally {
    await team.close();
  }
});

test("an Admin renames the workspace and everyone in it sees the new name; no one else can", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await createRoleWorkspace(browser, "Harbour");
  try {
    const { admin, member, guest, viewer } = team.people;
    const name = details(admin.page).getByRole("textbox", { name: "Workspace name" });
    const save = details(admin.page).getByRole("form", { name: "Workspace name" }).getByRole("button", { name: "Save", exact: true });
    await openWorkspaceDetails(admin.page);
    await hydrated(name);
    await name.fill("Harbour North");
    const rename = await captureAction(admin.page, "Harbour North", () => save.click());

    for (const { page } of [member, guest, viewer]) {
      expect(await sendAs(page, rename)).toEqual({ ok: false, code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION" });
    }
    await openWorkspaceDetails(admin.page);
    await hydrated(name);
    await expect(name).toHaveValue("Harbour");

    await name.fill("Harbour North");
    await save.click();
    await expect(details(admin.page).getByText("Leave Harbour North", { exact: true })).toBeVisible();
    await admin.page.getByRole("link", { name: "Back to Requests", exact: true }).click();
    await expect(inWorkspace(admin.page, "Harbour North")).toBeVisible();
    for (const { page } of [member, guest, viewer]) {
      await page.goto("/");
      await expect(inWorkspace(page, "Harbour North")).toBeVisible();
      await openWorkspaceDetails(page);
      await expect(details(page).getByText("Harbour North", { exact: true })).toBeVisible();
      await expect(details(page).getByText("Only Admins can change it.", { exact: true })).toBeVisible();
      await expect(details(page).getByRole("textbox", { name: "Workspace name" })).toHaveCount(0);
    }
  } finally {
    await team.close();
  }
});
