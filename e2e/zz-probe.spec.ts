import { test, type Page } from "@playwright/test";
import { createRoleWorkspace, seedRoleRequest } from "./helpers/role-workspace";
import { addTestMember, createTestWorkspace, removeTestMember } from "./helpers/workspaces";
import { withE2EDatabase } from "./helpers/database";
import { finishFirstRuns } from "./helpers/cleanup";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Workspace sidebar" });

test("probe", async ({ browser }) => {
  test.setTimeout(400_000);
  const team = await createRoleWorkspace(browser, "Harbour", ["admin", "member"]);
  try {
    const { member } = team.people;
    const page = member.page;
    const other = await createTestWorkspace(member.id, "Lighthouse");
    await withE2EDatabase((sql) => finishFirstRuns(sql, other, [member.id], "first_request"));
    await seedRoleRequest(other, member, "Lighthouse request");
    await seedRoleRequest(team.orgId, member, "Harbour request");
    const show = async (what: string) => {
      await page.waitForTimeout(3000);
      console.log("PROBE", what, "|", page.url(), "| frame:", (await sidebar(page).getByRole("heading").allTextContents()).join(","), "| h1:", (await page.locator("main h1").allTextContents()).join(","), "| harbour row:", await page.locator("main").getByText("Harbour request").count(), "| light row:", await page.locator("main").getByText("Lighthouse request").count(), "| main:", (await page.locator("main").innerText()).slice(0, 200).replace(/\n/g, " / "));
    };
    const clicks: Record<string, () => Promise<void>> = {
      impact: () => sidebar(page).getByRole("link", { name: "Impact", exact: true }).click(),
      inbox: () => sidebar(page).getByRole("link", { name: "Inbox", exact: true }).click(),
      row: () => page.locator("main").getByRole("link", { name: "Harbour request", exact: true }).click(),
      code: () => page.locator("[data-request-code]").first().click(),
      all: () => sidebar(page).getByRole("link", { name: "All Requests", exact: true }).click(),
      status: () => page.getByRole("button", { name: "Done", exact: true }).first().click(),
      reload: async () => { await page.reload(); },
    };
    for (const [name, click] of Object.entries(clicks)) {
      await page.context().clearCookies();
      const { signInTestUser } = await import("./helpers/test-user");
      await signInTestUser(page, member, team.orgId);
      await page.goto("/");
      await page.waitForTimeout(1500);
      await removeTestMember(team.orgId, member.id);
      await page.waitForTimeout(500);
      await click().catch(e => console.log("PROBE click failed", name, String(e).slice(0, 100)));
      await show(name);
      await sidebar(page).getByRole("link", { name: "Impact", exact: true }).click().catch(() => undefined);
      await show(`${name} then impact`);
      await sidebar(page).getByRole("link", { name: "All Requests", exact: true }).click().catch(() => undefined);
      await show(`${name} then all`);
      await addTestMember(team.orgId, member.id, "member");
    }
  } finally { await team.close(); }
});
