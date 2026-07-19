import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

async function onboard(
  context: BrowserContext,
  email: string,
  password: string,
  name: string,
  workspaceName: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/onboarding");
  await page.locator("#fullName").fill(name);
  await page.getByRole("radio", { name: /^Designer/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#workspaceName").fill(workspaceName);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Bring one teammate" })
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
  return page;
}

test("fresh users cannot read requests across workspaces", async ({ browser }) => {
  const userA = await createTestUser("isolation-a");
  const userB = await createTestUser("isolation-b");
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    const pageA = await onboard(
      contextA,
      userA.email,
      userA.password,
      "Isolation User A",
      "Isolation Workspace A"
    );
    const pageB = await onboard(
      contextB,
      userB.email,
      userB.password,
      "Isolation User B",
      "Isolation Workspace B"
    );

    const request = await seedTestRequest(userA.id, "Workspace A private request");

    await pageA.reload();
    await expect(pageA.getByText("Workspace A private request")).toBeVisible();

    await pageB.reload();
    await expect(pageB.getByText("Workspace A private request")).toHaveCount(0);

    await pageB.goto(`/requests/${request.id}`);
    await expect(pageB.getByText(/could not be found/i)).toBeVisible();
    await expect(pageB.getByText("Workspace A private request")).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
    await cleanupTestWorkspace(userA.id);
    await cleanupTestWorkspace(userB.id);
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
  }
});
