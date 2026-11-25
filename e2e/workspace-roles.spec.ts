import { expect, test, type Browser, type Page } from "@playwright/test";

import { captureAction, sendAs, type ActionAnswer, type CapturedAction } from "./helpers/captured-action";
import { testEmail } from "./helpers/fixtures";
import { createRoleWorkspace, hydrated, seedComment, seedRoleRequest } from "./helpers/role-workspace";
import { streamedIn } from "./helpers/streamed";

/**
 * #402 (#383 stories 57–60, 68–72): what an Admin, a Member, a Guest and a Viewer read, change and invite, as
 * REQUIREMENTS.md §2 says and their own screens show; then the same writes sent straight to the server, where only
 * the role stands in their way.
 */

const VIEWER_REFUSED = "You’re a Viewer in this workspace, so you can read everything but can’t change anything. Ask an Admin if you need to.";
const TITLES = ["Ada's request", "Mina's request", "Gita's request", "Vera's request"];

const main = (page: Page) => page.getByRole("main");
const sidebar = (page: Page) => page.getByRole("complementary", { name: "Workspace sidebar" });
const requestLink = (page: Page, title: string) => main(page).getByRole("link", { name: title, exact: true });
const requestTitle = (page: Page, title: string) => page.getByRole("heading", { name: title, level: 1, exact: true });
const button = (page: Page, name: string) => main(page).getByRole("button", { name, exact: true });
const commentBox = (page: Page) => page.getByRole("textbox", { name: "Comment", exact: true });
const commentBy = (page: Page, name: string) => page.getByRole("article", { name: `Comment by ${name}` });
const priorityPicker = (page: Page) => main(page).getByRole("combobox", { name: /^Priority: / });
const people = (page: Page) => page.getByRole("list", { name: "People in this workspace" });
const invitations = (page: Page) => page.getByRole("list", { name: "Pending invitations" });
const roleOf = (page: Page, name: string, role: string) => people(page).getByRole("combobox", { name: `Role for ${name}: ${role}`, exact: true });
const settingsLink = (page: Page, name: string) => page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name, exact: true });

/** All four roles in one workspace, with a Request from each; the Viewer's dates from before they were one. */
async function teamWithRequests(browser: Browser) {
  const team = await createRoleWorkspace(browser, "Harbour");
  try {
    const { admin, member, guest, viewer } = team.people;
    const requests = {
      admin: await seedRoleRequest(team.orgId, admin, "Ada's request"),
      member: await seedRoleRequest(team.orgId, member, "Mina's request"),
      guest: await seedRoleRequest(team.orgId, guest, "Gita's request", { guestSubmission: true }),
      viewer: await seedRoleRequest(team.orgId, viewer, "Vera's request"),
    };
    return { ...team, requests };
  } catch (error) {
    await team.close();
    throw error;
  }
}

async function openRequest(page: Page, id: string, title: string) {
  await page.goto(`/requests/${id}`);
  await expect(requestTitle(page, title)).toBeVisible();
}

async function openMembers(page: Page) {
  await page.goto("/settings/members");
  await expect(people(page)).toBeVisible();
  await hydrated(page.getByRole("searchbox", { name: "Search people" }));
}

async function sendComment(page: Page, body: string) {
  await hydrated(commentBox(page));
  await commentBox(page).fill(body);
  await button(page, "Post comment").click();
}

/** Comments, and waits until the server has it: the thread shows it before that. */
async function comment(page: Page, body: string) {
  await sendComment(page, body);
  await expect(page.getByRole("status").filter({ hasText: "Comment posted." })).toBeAttached();
}

async function pickPriority(page: Page, label: string) {
  await hydrated(priorityPicker(page));
  await priorityPicker(page).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function openInvite(page: Page, email: string, role: string) {
  await button(page, "Invite people").click();
  const dialog = page.getByRole("dialog", { name: "Invite people" });
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByText(role, { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: new RegExp(`^${role}`) })).toBeChecked();
  return dialog;
}

/** The list shows exactly these people's Requests, and so does what Lane's search answers, whatever a screen shows. */
async function expectReads(page: Page, orgId: string, titles: string[]) {
  await page.goto("/");
  for (const title of titles) await expect(requestLink(page, title)).toBeVisible();
  for (const title of TITLES.filter((each) => !titles.includes(each))) await expect(page.getByText(title)).toHaveCount(0);
  const answer = await page.request.get(`/api/search?org=${orgId}&q=request`);
  expect(answer.status()).toBe(200);
  const found = await answer.text();
  expect(TITLES.filter((title) => found.includes(title))).toEqual(titles);
}

/** What Lane answers when this person's browser asks for a Request. */
const readStatus = async (page: Page, orgId: string, id: string) => (await page.request.get(`/api/requests/${id}?org=${orgId}`)).status();

test("an Admin reads everything, changes others' Requests, and invites people and changes their roles", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await teamWithRequests(browser);
  try {
    const { page } = team.people.admin;
    await expectReads(page, team.orgId, TITLES);

    await test.step("changes another person's Request", async () => {
      await openRequest(page, team.requests.member, "Mina's request");
      await comment(page, "From the Admin.");
      await expect(commentBy(page, "Ada Admin")).toContainText("From the Admin.");
      await pickPriority(page, "High");
      await expect(priorityPicker(page)).toHaveAccessibleName("Priority: High");
      await expect(button(page, "Edit Request")).toBeVisible();
      await expect(button(page, "Delete Request")).toBeVisible();
      await button(page, "Pick up").click();
      await expect(button(page, "Mark Done")).toBeEnabled();
      await page.reload();
      await expect(button(page, "Mark Done")).toBeVisible();
      await expect(main(page).getByRole("heading", { name: "In progress (current step)" })).toBeVisible();
      await expect(commentBy(page, "Ada Admin")).toContainText("From the Admin.");
    });

    await test.step("sees everyone, changes a role, and invites", async () => {
      await openMembers(page);
      await expect(people(page).getByRole("listitem")).toHaveCount(4);
      for (const { name } of [team.people.member, team.people.guest, team.people.viewer])
        await expect(people(page).getByRole("button", { name: `Remove ${name}`, exact: true })).toBeVisible();
      await expect(roleOf(page, "Ada Admin", "Admin")).toBeDisabled();

      await roleOf(page, "Gita Guest", "Guest").click();
      await page.getByRole("option", { name: /^Viewer/ }).click();
      await expect(roleOf(page, "Gita Guest", "Viewer")).toBeVisible();

      const invited = testEmail("invited-by-admin");
      const dialog = await openInvite(page, invited, "Viewer");
      await dialog.getByRole("button", { name: "Send invitation", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: `Invitation sent to ${invited} as a Viewer.` })).toBeVisible();
      await expect(invitations(page)).toContainText(invited);
      await page.reload();
      await expect(invitations(page)).toContainText(invited);
      await expect(roleOf(page, "Gita Guest", "Viewer")).toBeVisible();
    });

    await test.step("opens the Admin's sections of Settings", async () => {
      for (const section of ["Members", "Metrics", "Slack", "Billing"]) await expect(settingsLink(page, section)).toBeVisible();
    });
  } finally {
    await team.close();
  }
});

test("a Member reads everything and works on Requests, and invites no one", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await teamWithRequests(browser);
  try {
    const { page } = team.people.member;
    await expectReads(page, team.orgId, TITLES);
    await expect(main(page).getByRole("link", { name: "New Request", exact: true }).first()).toBeVisible();

    await test.step("comments on and picks up another person's Request, and edits only their own", async () => {
      await openRequest(page, team.requests.admin, "Ada's request");
      await comment(page, "From the Member.");
      await expect(commentBy(page, "Mina Member")).toContainText("From the Member.");
      await expect(priorityPicker(page)).toHaveCount(0);
      await expect(button(page, "Edit Request")).toHaveCount(0);
      await expect(button(page, "Delete Request")).toHaveCount(0);
      await button(page, "Pick up").click();
      await expect(button(page, "Mark Done")).toBeEnabled();

      await openRequest(page, team.requests.member, "Mina's request");
      await expect(button(page, "Edit Request")).toBeVisible();
      await pickPriority(page, "Low");
      await expect(priorityPicker(page)).toHaveAccessibleName("Priority: Low");
    });

    await test.step("an Admin sees it", async () => {
      const admin = team.people.admin.page;
      await openRequest(admin, team.requests.admin, "Ada's request");
      await expect(main(admin).getByRole("heading", { name: "In progress (current step)" })).toBeVisible();
      await expect(commentBy(admin, "Mina Member")).toContainText("From the Member.");
    });

    await test.step("sees everyone and their roles, with nothing to invite, change or remove", async () => {
      await openMembers(page);
      await expect(people(page).getByRole("listitem")).toHaveCount(4);
      await expect(button(page, "Invite people")).toHaveCount(0);
      await expect(people(page).getByRole("combobox")).toHaveCount(0);
      await expect(people(page).getByRole("button")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Pending invitations" })).toHaveCount(0);
      await expect(settingsLink(page, "Billing")).toHaveCount(0);
    });

    await test.step("changes the Metrics library", async () => {
      await page.goto("/settings/metrics");
      await expect(button(page, "Add metric")).toBeVisible();
    });
  } finally {
    await team.close();
  }
});

test("a Guest sees and comments on only their own Requests, and invites no one", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await teamWithRequests(browser);
  try {
    const { page } = team.people.guest;

    await test.step("reads only their own, on every screen and from the server", async () => {
      await expectReads(page, team.orgId, ["Gita's request"]);
      await expect(page.getByRole("heading", { name: "My Requests", level: 1 })).toBeVisible();
      await page.goto("/impact");
      await expect(main(page).getByText("Gita's request")).toBeVisible();
      for (const title of TITLES.filter((each) => each !== "Gita's request")) await expect(page.getByText(title)).toHaveCount(0);

      expect(await readStatus(page, team.orgId, team.requests.guest)).toBe(200);
      for (const [author, title] of [["admin", "Ada's request"], ["member", "Mina's request"], ["viewer", "Vera's request"]] as const) {
        expect(await readStatus(page, team.orgId, team.requests[author])).toBe(404);
        await page.goto(`/requests/${team.requests[author]}`);
        await expect(page.getByRole("heading", { name: "This Request can’t be opened" })).toBeVisible();
        await expect(page.getByText(title)).toHaveCount(0);
      }
    });

    await test.step("changes their own while it waits, and can't pick it up or set its goal", async () => {
      await openRequest(page, team.requests.guest, "Gita's request");
      await comment(page, "From the Guest.");
      await expect(commentBy(page, "Gita Guest")).toContainText("From the Guest.");
      await pickPriority(page, "High");
      await expect(priorityPicker(page)).toHaveAccessibleName("Priority: High");
      await expect(button(page, "Edit Request")).toBeVisible();
      for (const name of ["Pick up", "Take this on", "Add reviewer", "Link a Request"]) await expect(button(page, name)).toHaveCount(0);
      await expect(main(page).getByRole("region", { name: "Goal", exact: true })).toHaveCount(0);
    });

    await test.step("a Member sees the Guest's Request and answers on it", async () => {
      const member = team.people.member.page;
      await openRequest(member, team.requests.guest, "Gita's request");
      await expect(commentBy(member, "Gita Guest")).toContainText("From the Guest.");
      await comment(member, "To the Guest.");
      await expect(commentBy(member, "Mina Member")).toContainText("To the Guest.");
      await page.reload();
      await expect(commentBy(page, "Mina Member")).toContainText("To the Guest.");
    });

    await test.step("can't open Members or Metrics", async () => {
      for (const path of ["/settings/members", "/settings/metrics"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "My Requests", level: 1 })).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/");
      }
      await page.goto("/settings/profile?section=members");
      await streamedIn(page);
      await expect(page.getByText("Members is for Admins and Members of this workspace.", { exact: true })).toBeVisible();
      await expect(people(page)).toHaveCount(0);
      for (const section of ["Members", "Metrics", "Billing"]) await expect(settingsLink(page, section)).toHaveCount(0);
    });
  } finally {
    await team.close();
  }
});

test("a Viewer reads what a Member reads except Members, and finds nothing to change", async ({ browser }) => {
  test.setTimeout(240_000);
  const team = await teamWithRequests(browser);
  try {
    const { page } = team.people.viewer;
    await seedComment(team.requests.admin, team.people.member, "A comment the Viewer can read.");

    await test.step("reads every Request, Impact and the Metrics library", async () => {
      await expectReads(page, team.orgId, TITLES);
      await openRequest(page, team.requests.admin, "Ada's request");
      await expect(commentBy(page, "Mina Member")).toContainText("A comment the Viewer can read.");
      await page.goto("/impact");
      await expect(page.getByRole("heading", { name: "Impact", level: 1 })).toBeVisible();
      await expect(page.getByRole("region", { name: /^Quarter note/ })).toBeVisible();
      await page.goto("/settings/metrics");
      await expect(page.getByRole("list", { name: "Metric definitions" })).toContainText("Conversion rate");
      await expect(button(page, "Add metric")).toHaveCount(0);
    });

    await test.step("files nothing", async () => {
      await page.goto("/");
      await expect(requestLink(page, "Ada's request")).toBeVisible();
      await expect(main(page).getByRole("link", { name: "New Request", exact: true })).toHaveCount(0);
      await page.goto("/intake");
      await expect(page.getByRole("heading", { name: "Requests", level: 1 })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/");
    });

    await test.step("has no controls on a Request, not even one they filed before becoming a Viewer", async () => {
      for (const [author, title] of [["admin", "Ada's request"], ["guest", "Gita's request"], ["viewer", "Vera's request"]] as const) {
        await openRequest(page, team.requests[author], title);
        await expect(page.getByRole("region", { name: "Journey" })).toContainText("Open");
        await expect(commentBox(page)).toHaveCount(0);
        await expect(priorityPicker(page)).toHaveCount(0);
        for (const name of ["Pick up", "Take this on", "Edit Request", "Delete Request", "Add reviewer", "Link a Request", "Post comment"])
          await expect(button(page, name)).toHaveCount(0);
      }
    });

    await test.step("can't open Members, and invites no one", async () => {
      await page.goto("/settings/members");
      await expect(page.getByText("Members is for Admins and Members of this workspace.", { exact: true })).toBeVisible();
      await expect(people(page)).toHaveCount(0);
      await expect(button(page, "Invite people")).toHaveCount(0);
      for (const section of ["Members", "Billing"]) await expect(settingsLink(page, section)).toHaveCount(0);
      await page.getByRole("link", { name: "Back to Requests", exact: true }).click();
      await sidebar(page).getByRole("button", { name: "Account menu, Vera Viewer" }).click();
      await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /members/i })).toHaveCount(0);
    });
  } finally {
    await team.close();
  }
});

test("writes a role may not make are refused by the server itself, and change nothing", async ({ browser }) => {
  test.setTimeout(420_000);
  const team = await teamWithRequests(browser);
  try {
    const { admin, member, guest, viewer } = team.people;
    const { page } = admin;
    const invited = testEmail("invited-directly");
    const adas = team.requests.admin;

    // Each write is the Admin's own screen's, kept back. The last steps send the same ones as the Admin, and they work.
    const onRequest = async (id: string, title: string, marker: string, act: () => Promise<void>) => {
      await openRequest(page, id, title);
      await page.waitForLoadState("networkidle");
      return captureAction(page, marker, act);
    };
    const writes = {
      comment: await onRequest(adas, "Ada's request", "Sent straight to the server.", () => sendComment(page, "Sent straight to the server.")),
      priority: await onRequest(adas, "Ada's request", '"urgent"', () => pickPriority(page, "Urgent")),
      pickUp: await onRequest(adas, "Ada's request", adas, () => button(page, "Pick up").click()),
      delete: await onRequest(team.requests.member, "Mina's request", team.requests.member, async () => {
        await button(page, "Delete Request").click();
        await page.getByRole("dialog", { name: "Delete this Request?" }).getByRole("button", { name: "Delete Request", exact: true }).click();
      }),
      invite: await (async () => {
        await openMembers(page);
        return captureAction(page, invited, async () => {
          const dialog = await openInvite(page, invited, "Guest");
          await dialog.getByRole("button", { name: "Send invitation", exact: true }).click();
        });
      })(),
      changeRole: await (async () => {
        await openMembers(page);
        return captureAction(page, guest.id, async () => {
          await roleOf(page, "Gita Guest", "Guest").click();
          await page.getByRole("option", { name: /^Admin/ }).click();
        });
      })(),
      remove: await (async () => {
        await openMembers(page);
        return captureAction(page, guest.id, async () => {
          await people(page).getByRole("button", { name: "Remove Gita Guest", exact: true }).click();
          await page.getByRole("dialog", { name: "Remove Gita Guest?" }).getByRole("button", { name: "Remove Gita", exact: true }).click();
        });
      })(),
    } satisfies Record<string, CapturedAction>;

    const refused = async (who: Page, expected: Partial<Record<keyof typeof writes, ActionAnswer>>) => {
      for (const [name, answer] of Object.entries(expected) as [keyof typeof writes, ActionAnswer][])
        expect(await sendAs(who, writes[name]), name).toEqual(answer);
    };
    const notAnAdmin = {
      invite: { error: "Only Admins can invite people to this workspace." },
      changeRole: { error: "Only Admins can change people’s roles." },
      remove: { ok: false, code: "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER" },
    };

    await test.step("a Member", () => refused(member.page, {
      ...notAnAdmin,
      priority: { error: "Request not found" },
    }));
    await test.step("a Guest", () => refused(guest.page, {
      ...notAnAdmin,
      comment: { error: "Not found" },
      priority: { error: "Request not found" },
      pickUp: { error: "You can’t change Requests in this workspace." },
      delete: { error: "Not found" },
    }));
    await test.step("a Viewer, on anyone's Request and on their own from before", async () => {
      const viewerRefusal = { error: VIEWER_REFUSED };
      await refused(viewer.page, {
        comment: viewerRefusal, priority: viewerRefusal, pickUp: viewerRefusal, delete: viewerRefusal,
        invite: viewerRefusal, changeRole: viewerRefusal, remove: notAnAdmin.remove,
      });
      for (const write of [writes.comment, writes.priority, writes.pickUp])
        expect(await sendAs(viewer.page, write, { [adas]: team.requests.viewer })).toEqual(viewerRefusal);
      expect(await sendAs(viewer.page, writes.delete, { [team.requests.member]: team.requests.viewer })).toEqual(viewerRefusal);
    });
    await test.step("an Admin, about themselves", async () => {
      expect(await sendAs(page, writes.changeRole, { [guest.id]: admin.id })).toEqual({ error: "You can’t change your own role. Ask another Admin to do it." });
      expect(await sendAs(page, writes.remove, { [guest.id]: admin.id })).toEqual({ ok: false, code: "CANNOT_REMOVE_YOURSELF" });
    });
    await test.step("a Member deletes someone else's Request", async () => {
      expect(await sendAs(member.page, writes.delete, { [team.requests.member]: adas })).toEqual({ error: "Only the Requester or a workspace admin can delete this Request." });
    });

    await test.step("nothing changed", async () => {
      await expectReads(page, team.orgId, TITLES);
      for (const [id, title] of [[adas, "Ada's request"], [team.requests.viewer, "Vera's request"]]) {
        await openRequest(page, id, title);
        await expect(page.getByText("0 comments", { exact: true })).toBeVisible();
        await expect(priorityPicker(page)).toHaveAccessibleName("Priority: No priority");
        await expect(button(page, "Pick up")).toBeVisible();
      }
      await openMembers(page);
      await expect(people(page).getByRole("listitem")).toHaveCount(4);
      for (const [name, role] of [["Ada Admin", "Admin"], ["Mina Member", "Member"], ["Gita Guest", "Guest"], ["Vera Viewer", "Viewer"]])
        await expect(roleOf(page, name, role)).toBeVisible();
      await expect(invitations(page)).toHaveCount(0);
    });

    await test.step("the same writes are the Admin's to make", async () => {
      for (const name of ["comment", "priority", "pickUp", "delete", "invite", "changeRole"] as const)
        expect(await sendAs(page, writes[name]), name).toMatchObject({ success: true });
      await openRequest(page, adas, "Ada's request");
      await expect(commentBy(page, "Ada Admin")).toContainText("Sent straight to the server.");
      await expect(main(page).getByRole("heading", { name: "In progress (current step)" })).toBeVisible();
      await openMembers(page);
      await expect(roleOf(page, "Gita Guest", "Admin")).toBeVisible();
      await expect(invitations(page)).toContainText(invited);
    });

    await test.step("a pending invitation is only an Admin's to revoke", async () => {
      const revoke = await captureAction(page, "invitationId", () =>
        invitations(page).getByRole("button", { name: `Revoke the invitation for ${invited}`, exact: true }).click());
      expect(await sendAs(member.page, revoke)).toEqual({ error: "Only Admins can revoke invitations." });
      expect(await sendAs(viewer.page, revoke)).toEqual({ error: VIEWER_REFUSED });
      await openMembers(page);
      await expect(invitations(page)).toContainText(invited);
      expect(await sendAs(page, revoke)).toEqual({ success: true });
      expect(await sendAs(page, writes.remove)).toEqual({ ok: true });
      expect(await sendAs(guest.page, writes.pickUp), "removed, with no workspace").toEqual({ error: "You can’t change Requests in this workspace." });
      await openMembers(page);
      await expect(people(page).getByRole("listitem")).toHaveCount(3);
      await expect(invitations(page)).toHaveCount(0);
    });
  } finally {
    await team.close();
  }
});
