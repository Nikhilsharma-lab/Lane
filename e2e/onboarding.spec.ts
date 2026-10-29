import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

import {
  cleanupTestWorkspace,
  getProfileFullName,
} from "./helpers/cleanup";
import {
  createClerkTestOrganization,
  createTestUser,
  deleteTestUser,
  signInTestUser,
} from "./helpers/test-user";
import { registerBrowserTestOrganization } from "./helpers/fixtures";

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

test("a Clerk user chooses a Lane role and enters their active workspace", async ({
  page,
  browser,
}) => {
  const user = await createTestUser("onboarding-existing-org");
  const orgId = await createClerkTestOrganization(
    user.id,
    "Lane E2E Existing Workspace"
  );

  try {
    await signInTestUser(page, user, orgId);
    await page.goto("/onboarding");

    await expect(
      page.getByRole("heading", { name: "Choose your role" })
    ).toBeVisible();
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
      await setupClerkTestingToken({ page: phone });
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

// Risk 1 in the 2.1/2.2 spec: signing in soft-navigates to /, which redirects to
// /onboarding and can sit in the client router cache for 30 s. Choosing a role
// inside that window must still land on / and stay there.
test("a role chosen right after signing in through the form stays on Requests", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const user = await createTestUser("onboarding-form-sign-in");
  const orgId = await createClerkTestOrganization(
    user.id,
    "Lane E2E Form Sign-in Workspace"
  );

  try {
    // Make the workspace the last active one, so the form's sign-in resumes it
    // without Clerk's choose-organization task, then sign out.
    await signInTestUser(page, user, orgId);
    await page.evaluate(async () => { await window.Clerk.signOut(); });

    await setupClerkTestingToken({ page });
    await page.goto("/login");
    await page.locator('input[name="identifier"]').fill(user.email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator('input[name="password"]').fill(user.password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const code = page.getByRole("textbox", { name: "Enter verification code" });
    await expect(code.or(page.getByRole("heading", { name: "Choose your role" }))).toBeVisible({ timeout: 30_000 });
    if (await code.isVisible()) await code.pressSequentially("424242");

    await expect(page).toHaveURL("/onboarding", { timeout: 30_000 });
    const landed = Date.now();
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
    await expect
      .poll(() => page.evaluate(() => window.Clerk.session?.currentTask?.key))
      .toBe("choose-organization");

    // D1 (#257): a reload of Requests, a bookmark or a teammate's Request link ends on the sign-in
    // page's workspace step, never "Page not found", and Clerk's return address survives the hop.
    for (const path of ["/", "/requests/LAN-1?from=link"]) {
      await page.goto(path);
      await expect(page).toHaveURL((url) => url.pathname === "/login");
      const returnTo = new URL(new URL(page.url()).searchParams.get("redirect_url") ?? "", page.url());
      expect(`${returnTo.pathname}${returnTo.search}`).toBe(path);
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
    }

    // Returning directly to Lane must resume Clerk's pending membership task.
    await page.goto("/onboarding");
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.getByRole("radio", { name: "PM", exact: true })).toHaveCount(0);
    expect(await getProfileFullName(user.id)).toBeNull();

    await page.reload();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.getByRole("radio", { name: "PM", exact: true })).toHaveCount(0);

    await page.locator('input[name="name"]').fill(workspaceName);
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "Choose your role" })
    ).toBeVisible();
    const createdOrgId = await page.evaluate(() => window.Clerk.organization?.id);
    await registerBrowserTestOrganization(createdOrgId!, user.id, workspaceName);
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
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
