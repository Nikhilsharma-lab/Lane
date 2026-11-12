import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase, getTestWorkspaceId } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { holdNextAction } from "./helpers/held-action";

// #279 (Build 6.3, spec #256 "Same problem section", B10, stories 68 and 69): Remove stays instant and its message
// offers Undo, which re-links the Request to the same group through the link action; the Iteration numbers after Undo
// match the ones before. While the section loads it is shaped like the section.

const ACTIONS = "src/app/(app)/requests/[id]/same-problem-actions.ts";
const section = (page: Page) => page.locator("#iterations");
const messages = (page: Page) => page.getByRole("region", { name: /^Messages/ });
/** Each Iteration as it reads: its number, code, title and status. */
const numbers = (page: Page) => section(page).locator('ol[aria-label^="Iterations"] > li').evaluateAll(items => items.map(item => item.textContent?.replace(/\s+/g, " ").trim() ?? ""));

/** Three Open Requests filed a day apart, in one Same problem group. */
async function seedGroup(userId: string) {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();
  const group = randomUUID();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  try {
    for (const [index, id] of ids.entries()) {
      await sql`INSERT INTO requests ${sql({ id, org_id: orgId, title: `Same problem attempt ${index + 1}`, description: "Shoppers give up at the card step.", created_by: userId, created_at: new Date(Date.now() - (3 - index) * 86_400_000) })}`;
      await sql`INSERT INTO same_problem_members ${sql({ org_id: orgId, request_id: id, group_id: group, added_by: userId })}`;
    }
    return ids;
  } finally { await sql.end(); }
}

test("Same problem: Remove shows at once, Undo re-links it with the same Iteration numbers, and loading holds the section's shape", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const user = await createTestUser("same-problem-undo");
  try {
    await provisionAndSignIn(page, user, { name: "Same Problem Tester", workspaceName: "#279 same problem" });
    const [first, second] = await seedGroup(user.id);
    // Story 69: while the read is held, the section shows its heading and placeholder lines, not a line of text.
    const read = await holdNextAction(page, ACTIONS, "readSameProblem");
    await page.goto(`/requests/${second}`);
    await read.seen;
    await expect(section(page).getByRole("heading", { name: "Iterations of this problem" })).toBeVisible();
    await expect(section(page).getByRole("status", { name: "Loading Iterations" })).toBeAttached();
    await expect(section(page)).not.toContainText("Loading Iterations…");
    await read.release();

    await expect(section(page).locator('ol[aria-label^="Iterations"] > li')).toHaveCount(3, { timeout: 20_000 });
    const before = await numbers(page);
    expect(before[0]).toMatch(/^1st iteration/);
    await expect(section(page)).toContainText("This Request is the 2nd iteration of 3.");

    // Remove the first attempt: it leaves at once, the rest are numbered again, and the message offers Undo.
    const remove = await holdNextAction(page, ACTIONS, "removeSameProblemLink");
    await section(page).getByRole("button", { name: /^Remove LAN-\d+ from this group$/ }).first().click();
    await remove.seen;
    await expect(section(page).locator('ol[aria-label^="Iterations"] > li')).toHaveCount(2);
    await expect(section(page)).toContainText("This Request is the 1st iteration of 2.");
    await remove.release();
    await expect(messages(page)).toContainText("Taken out of this group", { timeout: 20_000 });
    await messages(page).getByRole("button", { name: "Undo", exact: true }).click();
    await expect(messages(page)).toContainText("Linked again", { timeout: 20_000 });

    // Undo re-linked it to the same group: the same three Iterations, numbered as before.
    await expect(section(page).locator('ol[aria-label^="Iterations"] > li')).toHaveCount(3);
    await expect(section(page)).toContainText("This Request is the 2nd iteration of 3.");
    expect(await numbers(page)).toEqual(before);
    await page.reload();
    await expect(section(page).locator('ol[aria-label^="Iterations"] > li')).toHaveCount(3, { timeout: 20_000 });
    expect(await numbers(page)).toEqual(before);
    await expect(section(page).getByRole("link", { name: /Same problem attempt 1/ })).toHaveAttribute("href", `/requests/${first}`);
  } finally {
    await cleanupTestWorkspace(user.id).finally(() => deleteTestUser(user.id));
  }
});
