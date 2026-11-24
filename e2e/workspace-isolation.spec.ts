import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

async function openWorkspace(
  context: BrowserContext,
  user: Awaited<ReturnType<typeof createTestUser>>,
  name: string,
  workspaceName: string
): Promise<Page> {
  const page = await context.newPage();
  await provisionAndSignIn(page, user, { name, workspaceName });
  await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
  return page;
}

test("fresh users cannot read requests across workspaces", async ({ browser }) => {
  // On staging, fixtures and their teardown cross regions and can exceed two minutes.
  test.setTimeout(180_000);
  const userA = await createTestUser("isolation-a");
  const userB = await createTestUser("isolation-b");
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    const pageA = await openWorkspace(
      contextA,
      userA,
      "Isolation User A",
      "Isolation Workspace A"
    );
    const pageB = await openWorkspace(
      contextB,
      userB,
      "Isolation User B",
      "Isolation Workspace B"
    );

    const request = await seedTestRequest(userA.id, "Workspace A private request");

    await pageA.reload();
    // Its row's link: while the page streams in, the row's hidden second copy holds the same text.
    await expect(pageA.getByRole("link", { name: "Workspace A private request", exact: true })).toBeVisible();

    await pageB.reload();
    await expect(pageB.getByText("Workspace A private request")).toHaveCount(0);

    await pageB.goto(`/requests/${request.id}`);
    await expect(pageB.getByText(/couldn.t be found/i)).toBeVisible();
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
