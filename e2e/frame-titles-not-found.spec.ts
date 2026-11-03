import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

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
