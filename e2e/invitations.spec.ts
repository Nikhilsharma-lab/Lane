import { expect, type Page } from "@playwright/test";
import { formReady, passHumanCheck, test, typeCode } from "./helpers/auth-forms";
import { provisionTestWorkspace } from "./helpers/cleanup";
import { withE2EDatabase } from "./helpers/database";
import { replaceEmailCode } from "./helpers/email-codes";
import { testEmail } from "./helpers/fixtures";
import { createTestUser, deleteSignedUpUser, deleteTestUser, readTestSession, signInTestUser, type TestUser } from "./helpers/test-user";
import { addTestMember, createTestInvitation, createTestWorkspace, testMemberRole } from "./helpers/workspaces";

test.describe.configure({ timeout: 180_000 });

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const email = (page: Page) => page.getByLabel("Email address", { exact: true });

type Inviting = { orgId: string; workspace: string; admin: TestUser };

/** Runs with an Admin's workspace to be invited to. It and everyone `person` made are deleted after, the Admin first. */
async function withInviting(label: string, run: (inviting: Inviting, person: (label: string) => Promise<TestUser>) => Promise<void>) {
  const people: TestUser[] = [];
  const person = async (of: string) => {
    const user = await createTestUser(of);
    people.push(user);
    return user;
  };
  try {
    const admin = await person(`${label}-admin`);
    const workspace = `Lane E2E ${label} ${Date.now()}`;
    const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Ida Inviter", workspaceName: workspace });
    await run({ orgId, workspace, admin }, person);
  } finally {
    for (const { id } of people) await deleteTestUser(id);
  }
}

/** On Requests, in the workspace they were invited to. */
async function expectOpened(page: Page, { orgId, workspace }: Inviting) {
  await expect(page).toHaveURL("/");
  await expect(heading(page, "Requests")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" }).getByText(workspace, { exact: true })).toBeVisible();
  expect((await readTestSession(page))?.orgId).toBe(orgId);
}

test("signed out with an account: sign in to accept, and back to the invitation", async ({ page }) => {
  await withInviting("invite-account", async (inviting, person) => {
    const { orgId, workspace, admin } = inviting;
    const invited = await person("invited");
    // Already in a workspace, so joining another one asks no role.
    await createTestWorkspace(invited.id, "Lane E2E their own");
    const id = await createTestInvitation(orgId, admin.id, invited.email);

    await page.goto(`/invite/${id}`);
    await expect(heading(page, `Join ${workspace}`)).toBeVisible();
    await expect(page.getByText(`Sign in as ${invited.email} to accept.`, { exact: true })).toBeVisible();
    await expect(page.getByText(`Ida Inviter invited ${invited.email} to join as a Member.`, { exact: true })).toBeVisible();
    await expect(button(page, "Accept and join")).toHaveCount(0);
    await button(page, "Sign in to accept").click();

    await expect(heading(page, "Sign in to Lane")).toBeVisible();
    await formReady(page);
    await expect(email(page)).toHaveValue(invited.email);
    await page.getByLabel("Password", { exact: true }).fill(invited.password);
    await button(page, "Sign in").click();

    await expect(page).toHaveURL(`/invite/${id}`);
    await expect(page.getByText(`You’re signed in as ${invited.email}.`, { exact: true })).toBeVisible();
    expect(await testMemberRole(orgId, invited.id)).toBeNull();
    await button(page, "Accept and join").click();
    await expectOpened(page, inviting);
    expect(await testMemberRole(orgId, invited.id)).toBe("member");
  });
});

test("signed out without an account: sign up, back to the invitation, accept, then the role step", async ({ page }) => {
  const address = testEmail("invited-new");
  try {
    await withInviting("invite-new", async (inviting) => {
      const { orgId, workspace, admin } = inviting;
      const id = await createTestInvitation(orgId, admin.id, address, { role: "viewer" });

      await page.goto(`/invite/${id}`);
      await expect(heading(page, `Join ${workspace}`)).toBeVisible();
      await expect(page.getByText(`Create a Lane account with ${address} to accept.`, { exact: true })).toBeVisible();
      await expect(page.getByText(`Ida Inviter invited ${address} to join as a Viewer.`, { exact: true })).toBeVisible();
      await button(page, "Create an account").click();

      await expect(heading(page, "Create your Lane account")).toBeVisible();
      await formReady(page);
      await expect(email(page)).toHaveValue(address);
      await page.getByLabel("Your name", { exact: true }).fill("Lane E2E Invited");
      await page.getByLabel("Choose a password", { exact: true }).fill("LaneSignupE2E1234!");
      await passHumanCheck(page);
      await button(page, "Create account").click();
      await expect(heading(page, "Confirm your email")).toBeVisible();
      await typeCode(page, "Confirmation code", await replaceEmailCode(address, "email-verification"));
      await button(page, "Confirm email").click();

      await expect(page).toHaveURL(`/invite/${id}`);
      await expect(page.getByText(`You’re signed in as ${address}.`, { exact: true })).toBeVisible();
      const { userId } = (await readTestSession(page))!;
      expect(await testMemberRole(orgId, userId)).toBeNull();
      await button(page, "Accept and join").click();

      await expect(heading(page, "Choose your role")).toBeVisible();
      await expect(page).toHaveURL("/onboarding");
      expect(await testMemberRole(orgId, userId)).toBe("viewer");
      await page.getByRole("radio", { name: /^Developer\b/ }).click();
      await button(page, "Continue").click();
      await expectOpened(page, inviting);
    });
  } finally {
    await deleteSignedUpUser(address);
  }
});

test("signed in with a different email: told whose it is, and not let in", async ({ page, baseURL }) => {
  await withInviting("invite-wrong", async ({ orgId, admin }, person) => {
    const invited = await person("rightful");
    const other = await person("someone-else");
    await createTestWorkspace(other.id, "Lane E2E someone else's");
    const id = await createTestInvitation(orgId, admin.id, invited.email);

    await signInTestUser(page, other);
    await page.goto(`/invite/${id}`);
    await expect(heading(page, "This invitation is for someone else")).toBeVisible();
    await expect(page.getByText(`It was sent to ${invited.email}, and you’re signed in as ${other.email}.`)).toBeVisible();
    await expect(button(page, `Stay signed in as ${other.email}`)).toBeVisible();
    await expect(button(page, "Accept and join")).toHaveCount(0);

    // Accepting it past the screen, as the person signed in here, is refused too.
    const forged = await page.request.post("/api/auth/organization/accept-invitation", { data: { invitationId: id }, headers: { origin: baseURL! } });
    expect(forged.status()).toBe(403);
    expect(await forged.json()).toMatchObject({ code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION" });
    expect(await testMemberRole(orgId, other.id)).toBeNull();

    await button(page, `Sign out and sign in as ${invited.email}`).click();
    await expect(heading(page, "Sign in to Lane")).toBeVisible();
    await expect(email(page)).toHaveValue(invited.email);
    expect(await readTestSession(page)).toBeNull();
    expect(await testMemberRole(orgId, other.id)).toBeNull();
    expect(await testMemberRole(orgId, invited.id)).toBeNull();
  });
});

test("on a phone, a long email or workspace name wraps instead of widening the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withInviting("invite-long", async ({ orgId, admin }, person) => {
    const invited = await person("someone-with-a-long-name");
    const other = await person("somebody-else-entirely");
    await createTestWorkspace(other.id, "Lane E2E someone else's");
    const workspace = `Lane${"longworkspacename".repeat(4)}`;
    await withE2EDatabase((sql) => sql`update organizations set name = ${workspace} where id = ${orgId}`);
    const fits = async () => expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBe(390);

    const id = await createTestInvitation(orgId, admin.id, invited.email);
    await page.goto(`/invite/${id}`);
    await expect(heading(page, `Join ${workspace}`)).toBeVisible();
    await fits();
    await signInTestUser(page, other);
    await page.goto(`/invite/${id}`);
    await expect(button(page, `Sign out and sign in as ${invited.email}`)).toBeVisible();
    await fits();
    await addTestMember(orgId, other.id, "member");
    await page.goto(`/invite/${await createTestInvitation(orgId, admin.id, other.email, { status: "accepted" })}`);
    await expect(button(page, `Open ${workspace}`)).toBeVisible();
    await fits();
  });
});

test("expired: told to ask an Admin to send it again", async ({ page }) => {
  await withInviting("invite-expired", async ({ orgId, workspace, admin }, person) => {
    const invited = await person("late");
    const id = await createTestInvitation(orgId, admin.id, invited.email, { expired: true });

    await signInTestUser(page, invited);
    await page.goto(`/invite/${id}`);
    await expect(heading(page, "This invitation has expired")).toBeVisible();
    await expect(page.getByText(`Invitations last 7 days. Ask an Admin of ${workspace} to send it again.`, { exact: true })).toBeVisible();
    await expect(button(page, "Accept and join")).toHaveCount(0);
    expect(await testMemberRole(orgId, invited.id)).toBeNull();
    await button(page, "Go to Lane").click();
    await expect(page).toHaveURL("/onboarding");
    await expect(heading(page, "Create your workspace")).toBeVisible();
  });
});

test("already accepted: opens that workspace", async ({ page }) => {
  await withInviting("invite-accepted", async (inviting, person) => {
    const { orgId, workspace, admin } = inviting;
    const joined = await person("joined");
    await addTestMember(orgId, joined.id, "member");
    const id = await createTestInvitation(orgId, admin.id, joined.email, { status: "accepted" });
    // The session is in their other workspace, so Open has to switch it.
    await signInTestUser(page, joined, await createTestWorkspace(joined.id, "Lane E2E their other one"));

    await page.goto(`/invite/${id}`);
    await expect(heading(page, `You’re already in ${workspace}`)).toBeVisible();
    await expect(page.getByText("This invitation has been accepted.", { exact: true })).toBeVisible();
    await button(page, `Open ${workspace}`).click();
    await expectOpened(page, inviting);
  });
});
