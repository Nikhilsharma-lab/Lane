import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { cleanupTestWorkspace, getTestWorkspaceId, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";

// #271 (Build 4 of #256, walk findings A114, A117, A118, A119): every tab names its page, a Request's tab its
// typed title, and a missing page or Request answers a real 404. Signed in, "Page not found" keeps the sidebar;
// signed out, it shows the Lane mark and Sign in, never "your Requests".

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Workspace sidebar" });
const main = (page: Page) => page.locator("#lane-main");

async function expectHeadings(page: Page, scope: ReturnType<Page["locator"]>, names: string[]) {
  await expect(scope.getByRole("heading").first()).toBeVisible();
  expect(await scope.getByRole("heading").allInnerTexts()).toEqual(names);
}

test("each signed-in page names its tab, a Request uses its typed title, and missing pages answer 404 inside the frame", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("frame-titles");
  try {
    await provisionAndSignIn(page, user, { name: "Titles PM", workspaceName: "Lane E2E Titles", role: "pm" });
    const request = await seedTestRequest(user.id, "Checkout button misaligned");

    // A114: one name per page, "Page · Lane".
    for (const [path, title] of [
      ["/", "Requests · Lane"],
      ["/inbox", "Inbox · Lane"],
      ["/impact", "Impact · Lane"],
      ["/intake", "New Request · Lane"],
      ["/settings/profile", "Settings · Lane"],
      ["/settings/members", "Settings · Lane"],
      ["/settings/metrics", "Settings · Lane"],
      [`/requests/${request.id}`, "Checkout button misaligned · Lane"],
    ] as const) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page, path).toHaveTitle(title);
    }

    // A114: the title follows a move inside the app, so a screen reader hears where it landed.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle("Requests · Lane");
    await sidebar(page).getByRole("link", { name: "Impact", exact: true }).click();
    await expect(page).toHaveURL(/\/impact$/);
    await expect(page).toHaveTitle("Impact · Lane");

    // A118: a signed-in "Page not found" keeps the sidebar, has one heading and Go to Requests, and answers 404.
    for (const path of ["/nope", "/settings/nope", "/requests/abc/more"]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(404);
      await expect(page).toHaveTitle("Page not found · Lane");
      await expect(sidebar(page)).toBeVisible();
      await expectHeadings(page, main(page), ["This page doesn’t exist"]);
      await expect(main(page).getByRole("link", { name: "Go to Requests" })).toHaveAttribute("href", "/");
    }
    // A Metric that doesn't exist is a missing page too, answered 404 in the Settings frame (no workspace sidebar
    // there, as on every Settings page).
    for (const path of [`/settings/metrics/${randomUUID()}`, "/settings/metrics/abc"]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(404);
      await expect(page).toHaveTitle("Page not found · Lane");
      await expectHeadings(page, main(page), ["This page doesn’t exist"]);
      await expect(main(page).getByRole("link", { name: "Go to Requests" })).toHaveAttribute("href", "/");
    }
    await page.goto("/nope", { waitUntil: "domcontentloaded" });
    await main(page).getByRole("link", { name: "Go to Requests" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle("Requests · Lane");

    // A117: an unknown Request keeps its own screen in the frame and answers 404.
    for (const path of ["/requests/abc", `/requests/${randomUUID()}`]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(404);
      await expect(main(page).getByRole("heading", { name: "This Request can’t be opened" })).toBeVisible();
      await expect(sidebar(page)).toBeVisible();
      await expect(page).toHaveTitle("Request unavailable · Lane");
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

test("signed out, a missing page shows the Lane mark and Sign in, without the app frame, and answers 404", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    for (const path of ["/nope", "/settings/nope"]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(404);
      await expect(page).toHaveTitle("Page not found · Lane");
      await expect(page.getByRole("main").getByText("Lane", { exact: true })).toBeVisible();
      await expectHeadings(page, page.getByRole("main"), ["This page doesn’t exist"]);
      await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/login");
      // A119: no promise of Requests to someone who has none, and no sidebar.
      await expect(page.getByRole("main")).not.toContainText("Requests");
      await expect(sidebar(page)).toHaveCount(0);
    }
    // A114: the sign-in pages by name.
    for (const [path, title] of [["/login", "Sign in · Lane"], ["/signup", "Sign up · Lane"], ["/forgot-password", "Forgot password · Lane"]] as const) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page, path).toHaveTitle(title);
    }
  } finally {
    await context.close();
  }
});

test("signed in without a workspace, a missing page shows the Lane mark and Go to Lane, which leads on, and answers 404", async ({ page }) => {
  test.setTimeout(300_000);
  // A person in no workspace yet: Clerk's choose-a-workspace step is still ahead of them.
  const user = await createTestUser("not-found-no-workspace");
  try {
    await signInTestUser(page, user);
    for (const path of ["/nope", "/settings/nope"]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(404);
      await expect(page).toHaveTitle("Page not found · Lane");
      await expect(page.getByRole("main").getByText("Lane", { exact: true })).toBeVisible();
      await expectHeadings(page, page.getByRole("main"), ["This page doesn’t exist"]);
      await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toHaveCount(0);
      await expect(page.getByRole("main").getByRole("link", { name: "Go to Lane", exact: true })).toHaveAttribute("href", "/");
      await expect(page.getByRole("main")).not.toContainText("Requests");
      await expect(sidebar(page)).toHaveCount(0);
    }
    // "/" takes them on to where they stopped: choosing or creating a workspace, never the sign-in form.
    await page.getByRole("main").getByRole("link", { name: "Go to Lane", exact: true }).click();
    await expect(page).not.toHaveURL(/\/nope|\/settings\/nope/);
    await expect(page.locator('input[name="identifier"]')).toHaveCount(0);
  } finally {
    await deleteTestUser(user.id);
  }
});

// Fix round 3: with the database refusing connections (a paused database), the root error screen shows and the tab
// finishes loading, as before Build 4. Build 4's root not-found read the frame a second time on every page, and those
// reads kept the tab loading for 30 to 120 s. Local runs only: it stops this machine's test database for a moment.
test("with the database refusing connections, the root error screen appears and the tab finishes loading", async ({ browser }) => {
  test.skip(process.env.LANE_E2E_LOCAL_DATABASE !== "1", "stops the database's connections: a local lane_test_* database only");
  test.setTimeout(300_000);
  const user = await createTestUser("root-error-load");
  const database = new URL(process.env.DATABASE_URL!);
  const name = database.pathname.slice(1);
  expect(name).toMatch(/^lane_test_[a-z0-9_]+$/);
  const admin = postgres(Object.assign(new URL(database), { pathname: "/postgres" }).toString(), { max: 1 });
  // Fresh sessions, as a person arriving: four tabs, one after another.
  const contexts = await Promise.all([0, 1, 2, 3].map(() => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  try {
    const pages = [];
    for (const context of contexts) {
      const page = await context.newPage();
      if (!pages.length) await provisionAndSignIn(page, user, { name: "Root Error PM", workspaceName: "Lane E2E Root error", role: "pm" });
      else await signInTestUser(page, user, await getTestWorkspaceId(user.id));
      pages.push(page);
    }
    await admin.unsafe(`ALTER DATABASE "${name}" WITH ALLOW_CONNECTIONS false`);
    try {
      await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${name} AND pid <> pg_backend_pid()`;
      for (const [index, page] of pages.entries()) {
        const started = Date.now();
        await page.goto("/", { waitUntil: "commit", timeout: 180_000 });
        await expect(page.getByRole("alert").filter({ hasText: "Lane can’t load your workspace right now" })).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState("load", { timeout: 180_000 });
        const seconds = (Date.now() - started) / 1000;
        expect(seconds, `tab ${index + 1} finished loading in ${seconds.toFixed(1)} s`).toBeLessThan(10);
      }
    } finally {
      await admin.unsafe(`ALTER DATABASE "${name}" WITH ALLOW_CONNECTIONS true`);
    }
  } finally {
    await admin.end();
    for (const context of contexts) await context.close();
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
