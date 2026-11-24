import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Request } from "@playwright/test";

import {
  cleanupTestWorkspace,
  e2eDatabase,
  getProfileFullName,
  getProfileRole,
} from "./helpers/cleanup";
import {
  createTestUser,
  deleteTestUser,
  readTestSession,
  signInTestUser,
} from "./helpers/test-user";
import { addTestMember, createTestWorkspace, removeTestMember } from "./helpers/workspaces";
import { registerBrowserTestOrganization } from "./helpers/fixtures";
import { ROLE_STEP_URL } from "../src/lib/onboarding-address";

/** Plan item 2.2: the requests Continue causes. Server action POSTs go in
 * `actions`; RSC GETs a person waits for go in `paths`. Prefetches are left out. */
function recordRscNavigations(page: Page) {
  const paths: string[] = [];
  const actions: string[] = [];
  const listener = (request: Request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && request.headers()["next-action"]) {
      actions.push(url.pathname);
      return;
    }
    if (request.method() !== "GET" || !url.searchParams.has("_rsc")) return;
    if (request.headers()["next-router-prefetch"]) return;
    paths.push(url.pathname);
  };
  page.on("request", listener);
  return { paths, actions, stop: () => page.off("request", listener) };
}

/** #289 (D8), #346: the workspace step in Lane's words, with the header's "Wrong account? Sign out" as on the role step
 * after it, and how a teammate expecting an invitation gets one. */
async function expectWorkspaceStepInLaneWords(page: Page, email: string) {
  await expect(page).toHaveTitle("Create or join a workspace · Lane");
  await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();
  await expect(page.getByText("A workspace is where your team’s Requests live. You can invite people next.", { exact: true })).toBeVisible();
  await expect(page.getByText(`Expecting an invitation? Ask an Admin to invite ${email}. It shows up here.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Invitations" })).toHaveCount(0);
  await expectHeaderSignOut(page);
  await expect(page.getByText(/^Signed in as /)).toHaveCount(0);
  await expect(page.getByText("Sign in to access your Lane workspace.")).toHaveCount(0);
}

async function expectHeaderSignOut(page: Page) {
  const header = page.getByRole("banner");
  await expect(header.getByText("Wrong account?", { exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

/** #289 (D2): on a 390px phone the step has no sideways scroll, the name field and Create workspace are fully on screen, and
 * the name starts empty. */
async function expectWorkspaceStepFitsPhone(page: Page) {
  const desktop = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    const name = page.getByLabel("Workspace name");
    const proceed = page.getByRole("button", { name: "Create workspace", exact: true });
    await expect(name).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth)).toBe(0);
    for (const part of [name, proceed]) {
      const box = (await part.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      await expect(part).toBeInViewport({ ratio: 1 });
    }
    // D7: the name starts empty, with no guess from the email's domain.
    await expect(name).toHaveValue("");
  } finally {
    if (desktop) await page.setViewportSize(desktop);
  }
}

/** Every scroller on the empty Requests page fits: the list pane, the shell's
 * content region and the document. */
async function expectNoVerticalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const scrollers = {
      listPane: document.querySelector("[data-empty-workspace]"),
      content: document.querySelector("#lane-main > div"),
      document: document.scrollingElement,
    };
    return Object.fromEntries(Object.entries(scrollers).map(([name, element]) => [name, element ? element.scrollHeight - element.clientHeight : null]));
  });
  expect(overflow).toEqual({ listPane: 0, content: 0, document: 0 });
}

test("a person chooses a Lane role and enters their active workspace", async ({
  page,
  browser,
}) => {
  const user = await createTestUser("onboarding-existing-org");
  const orgId = await createTestWorkspace(
    user.id,
    "Lane E2E Existing Workspace"
  );

  try {
    await signInTestUser(page, user, orgId);
    await page.goto(ROLE_STEP_URL);

    await expect(
      page.getByRole("heading", { name: "Choose your role" })
    ).toBeVisible();
    await expect(page).toHaveTitle("Choose your role · Lane");
    // #391: shown once, so its marker is off the address.
    await expect(page).toHaveURL("/onboarding");
    await expect(page.getByText(/^Step \d of \d$/)).toHaveCount(0);
    await page.getByRole("radio", { name: "Designer" }).click();

    // Role saved → welcome in one navigation: the save redirects to /, so its
    // response normally carries the welcome. At most one GET of / may follow
    // (a partial seed), none of /onboarding, and the same document throughout.
    await page.evaluate(() => { (window as unknown as { __laneSameDocument: boolean }).__laneSameDocument = true; });
    const navigations = recordRscNavigations(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Requests", exact: true })
    ).toBeVisible();
    await expect(page.locator("[data-requests-welcome]")).toBeVisible();
    navigations.stop();
    expect(navigations.actions).toEqual(["/onboarding"]);
    expect(navigations.paths.filter(path => path === "/").length).toBeLessThanOrEqual(1);
    expect(navigations.paths).not.toContain("/onboarding");
    expect(await page.evaluate(() => (window as unknown as { __laneSameDocument?: boolean }).__laneSameDocument)).toBe(true);
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
    expect(await getProfileFullName(user.id)).toBe("Lane E2E");

    // #217: the workspace's creator lands on the first-run guide, in the welcome's place. Skipped, the
    // welcome is back (first-run.spec.ts follows the guide).
    const guide = page.locator("[data-requests-welcome] [data-first-run='first_request']");
    await expect(guide).toBeVisible();
    await guide.getByRole("button", { name: "Skip the guide", exact: true }).click();
    await expect(guide).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No Requests yet" })).toBeVisible();

    // No scrollbar on the empty page at either width (plan item 2.1).
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect(page.locator("[data-requests-welcome]")).toBeVisible();
      await expectNoVerticalScroll(page);
    }
    // Fine pointers see the C hint.
    await expect(page.getByText("to create a Request.")).toBeVisible();

    // A touch phone hides the keyboard hint; the links still name the shortcut.
    const touch = await browser.newContext({
      storageState: await page.context().storageState(),
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const phone = await touch.newPage();
      await phone.goto("/");
      await expect(phone.locator("[data-requests-welcome]")).toBeVisible();
      await expect(phone.getByText("to create a Request.")).toBeHidden();
      await expect(
        phone.locator("[data-requests-welcome]").getByRole("link", { name: "New Request" })
      ).toHaveAttribute("aria-keyshortcuts", "C");
      await expectNoVerticalScroll(phone);
    } finally {
      await touch.close();
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

// #290 (D9, D10): the role step names only its own keys, and only where there is a keyboard.
test("the role step names its 1, 2 and 3 keys on desktop and no keys on a phone", async ({
  page,
  browser,
}) => {
  const user = await createTestUser("onboarding-role-keys");
  const orgId = await createTestWorkspace(user.id, "Lane E2E Role Keys Workspace");

  try {
    await signInTestUser(page, user, orgId);
    await page.goto(ROLE_STEP_URL);
    await expect(page.getByRole("heading", { name: "Choose your role" })).toBeVisible();
    await expect(page.getByText("C to create")).toHaveCount(0);
    await expect(page.getByText("to search")).toHaveCount(0);
    await expect(page.getByText("Press 1, 2 or 3 to choose", { exact: true })).toBeVisible();

    await page.keyboard.press("2");
    await expect(page.getByRole("radio", { name: "Designer" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Designer" })).toBeFocused();

    const touch = await browser.newContext({
      storageState: await page.context().storageState(),
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const phone = await touch.newPage();
      await phone.goto(ROLE_STEP_URL);
      await expect(phone.getByRole("heading", { name: "Choose your role" })).toBeVisible();
      await expect(phone.getByText("Press 1, 2 or 3 to choose", { exact: true })).toBeHidden();
      await expect(phone.locator("kbd").filter({ visible: true })).toHaveCount(0);
      await expect(phone.getByText("C to create")).toHaveCount(0);
    } finally {
      await touch.close();
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

// Risk 1 in the 2.1/2.2 spec: signing in opens /, which redirects someone with no workspace to /onboarding and can sit
// in the client router cache for 30 s. A role chosen after it must still land on / and stay there.
test("a role chosen right after signing in through the form and creating a workspace stays on Requests", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const user = await createTestUser("onboarding-form-sign-in");
  const workspaceName = `Lane E2E Form Sign-in ${Date.now()}`;

  try {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/onboarding", { timeout: 30_000 });
    const landed = Date.now();
    await page.getByLabel("Workspace name").fill(workspaceName);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose your role" })).toBeVisible();
    await registerBrowserTestOrganization((await readTestSession(page))!.orgId!, user.id, workspaceName);

    await page.evaluate(() => { (window as unknown as { __laneSameDocument: boolean }).__laneSameDocument = true; });
    await page.getByRole("radio", { name: "PM" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL("/");
    expect(Date.now() - landed).toBeLessThan(30_000);
    await expect(page.locator("[data-requests-welcome]")).toBeVisible();

    // Stays: no bounce back through a cached redirect.
    await page.waitForTimeout(3_000);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Choose your role" })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __laneSameDocument?: boolean }).__laneSameDocument)).toBe(true);
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

test("workspace membership comes before a Lane role, including after an interrupted sign-in", async ({
  page,
}) => {
  const user = await createTestUser("onboarding-new-org");
  const workspaceName = `Lane E2E Workspace First ${Date.now()}`;

  try {
    await signInTestUser(page, user);
    expect(await readTestSession(page)).toEqual({ userId: user.id, orgId: null });

    // D1 (#257): a reload of Requests, a bookmark or a teammate's Request link, and the role step's own address, end
    // on Onboarding's workspace step, never "Page not found" or the role step.
    for (const path of ["/", "/requests/LAN-1?from=link", ROLE_STEP_URL, "/onboarding"]) {
      await page.goto(path);
      await expect(page).toHaveURL((url) => url.pathname === "/onboarding");
      await expect(page.getByLabel("Workspace name")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
      await expect(page.getByRole("radio", { name: "PM", exact: true })).toHaveCount(0);
    }

    await page.reload();
    await expect(page.getByLabel("Workspace name")).toBeVisible();
    await expect(page.getByRole("radio", { name: "PM", exact: true })).toHaveCount(0);

    await expectWorkspaceStepInLaneWords(page, user.email);
    await expectWorkspaceStepFitsPhone(page);

    await page.getByLabel("Workspace name").fill(workspaceName);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Choose your role" })
    ).toBeVisible();
    const session = (await readTestSession(page))!;
    expect(session.userId).toBe(user.id);
    await registerBrowserTestOrganization(session.orgId!, user.id, workspaceName);
    await page.getByRole("radio", { name: "PM" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Requests", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText(workspaceName, { exact: true })
    ).toBeVisible();
    expect(await getProfileFullName(user.id)).toBe("Lane E2E");
    expect(await getProfileRole(user.id)).toBe("pm");

    // With a workspace, Onboarding is over.
    await page.goto("/onboarding");
    await expect(page).toHaveURL("/");
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

// #346: a pending invitation comes before starting a workspace, and joining asks the role of someone new to Lane.
test("someone invited joins from Onboarding, chooses a role and lands in that workspace", async ({ page }) => {
  const admin = await createTestUser("onboarding-inviter");
  const invited = await createTestUser("onboarding-invited");
  const workspaceName = `Lane E2E Invited ${Date.now()}`;

  try {
    const orgId = await createTestWorkspace(admin.id, workspaceName);
    const otherOrgId = await createTestWorkspace(admin.id, "Lane E2E Not Pending");
    const sql = e2eDatabase();
    try {
      const invitation = { email: invited.email, role: "member", inviter_id: admin.id, expires_at: new Date(Date.now() + 86_400_000) };
      await sql`insert into invitation ${sql([
        { ...invitation, id: randomUUID(), organization_id: orgId, status: "pending" },
        { ...invitation, id: randomUUID(), organization_id: otherOrgId, status: "canceled" },
        { ...invitation, id: randomUUID(), organization_id: otherOrgId, status: "pending", expires_at: new Date(Date.now() - 60_000) },
      ])}`;
    } finally {
      await sql.end();
    }

    await signInTestUser(page, invited);
    await page.goto("/");
    await expect(page).toHaveURL("/onboarding");
    await expect(page.getByRole("heading", { name: "Join your team" })).toBeVisible();
    await expect(page.getByText(`You’ve been invited to these workspaces as ${invited.email}.`, { exact: true })).toBeVisible();
    // Only the one still pending: not the cancelled or the expired one.
    const row = page.getByRole("list", { name: "Invitations" }).getByRole("listitem");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(workspaceName);
    await expect(row).toContainText("Lane E2E invited you as a Member");
    await expect(page.getByText("Or start a workspace of your own.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create workspace", exact: true })).toBeVisible();
    await expect(page.getByText(/^Expecting an invitation/)).toHaveCount(0);
    await expectHeaderSignOut(page);

    await page.getByRole("button", { name: `Join ${workspaceName}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose your role" })).toBeVisible();
    await page.getByRole("radio", { name: "Developer" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("complementary").getByText(workspaceName, { exact: true })).toBeVisible();
    expect(await readTestSession(page)).toEqual({ userId: invited.id, orgId });
    expect(await getProfileRole(invited.id)).toBe("developer");
  } finally {
    await cleanupTestWorkspace(admin.id);
    await deleteTestUser(admin.id);
    await deleteTestUser(invited.id);
  }
});

// #346: after a removal that leaves no workspace.
test("someone removed from their only workspace is told so on Onboarding, and can sign out", async ({ page }) => {
  const admin = await createTestUser("onboarding-remover");
  const removed = await createTestUser("onboarding-removed");
  const workspaceName = `Lane E2E Removed ${Date.now()}`;

  try {
    const orgId = await createTestWorkspace(admin.id, workspaceName);
    await addTestMember(orgId, removed.id, "member");
    await signInTestUser(page, removed, orgId);
    await page.goto("/");
    await expect(page.getByRole("complementary").getByText(workspaceName, { exact: true })).toBeVisible();

    await removeTestMember(orgId, removed.id);
    await page.reload();
    await expect(page).toHaveURL("/onboarding");
    await expect(page.getByText(`You’re no longer in ${workspaceName}`, { exact: true })).toBeVisible();
    await expect(page.getByText("Your Requests and comments stay in that workspace.", { exact: true })).toBeVisible();
    await expectWorkspaceStepInLaneWords(page, removed.email);

    await page.getByRole("banner").getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/login");
    expect(await readTestSession(page)).toBeNull();
  } finally {
    await cleanupTestWorkspace(admin.id);
    await deleteTestUser(admin.id);
    await deleteTestUser(removed.id);
  }
});
