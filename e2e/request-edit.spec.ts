import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";
import { runningActionManifestPath } from "./helpers/server-action-identity";
import { assertOwnedUser } from "./helpers/fixtures";

/**
 * #280: an honest Edit Request. A title-only edit keeps "Problem to solve" and "Suggested change" (B8); before
 * saving, the dialog names the review answers the save clears (B9); Save closes at once with the change showing and
 * reopens with everything typed when the server refuses; the title field wraps on a phone (Z1).
 */

const GOAL = {
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};
const PROBLEM = "Customers abandon checkout when delivery costs surprise them at payment.";
const SUGGESTED = "Show delivery costs on the basket page.";

async function seedHybrid(orgId: string, userId: string, title: string, reviewers: { name: string; kind: "concern" | "looks_good" }[] = []) {
  const sql = e2eDatabase();
  try {
    const id = randomUUID();
    await sql`INSERT INTO requests ${sql({ id, org_id: orgId, title, description: "Add delivery costs to the basket so people stop leaving at payment.", created_by: userId,
      classification: "hybrid", reframed_problem: PROBLEM, extracted_solution: SUGGESTED, expected_impact: sql.json(GOAL) })}`;
    if (reviewers.length) {
      for (const reviewer of reviewers) await sql`INSERT INTO profiles (id, full_name, email) VALUES (${`e2e-reviewer-${id}-${reviewer.name}`}, ${reviewer.name}, ${`${reviewer.name}.${id}@example.test`})`;
      const saved = reviewers.map(reviewer => ({
        id: randomUUID(), nominee: { kind: "member", userId: `e2e-reviewer-${id}-${reviewer.name}` }, displayNameAtSelection: reviewer.name, addedBy: userId, note: "",
        decision: { kind: reviewer.kind, actorId: `e2e-reviewer-${id}-${reviewer.name}`, at: new Date().toISOString(), reason: reviewer.kind === "concern" ? "The basket is already crowded." : "" },
      }));
      await sql`INSERT INTO request_agreements (request_id, org_id, reviewers) VALUES (${id}, ${orgId}, ${sql.json(saved)})`;
    }
    return id;
  } finally { await sql.end(); }
}

async function dropReviewers(requestId: string) {
  const sql = e2eDatabase();
  try {
    await sql`DELETE FROM profiles WHERE id LIKE ${`e2e-reviewer-${requestId}-%`}`;
  } finally { await sql.end(); }
}

const editor = (page: Page) => page.getByRole("dialog", { name: "Edit Request" });

async function openEditor(page: Page) {
  await page.locator('[data-slot="page-strip"]').getByRole("button", { name: "Edit Request", exact: true }).click();
  await expect(editor(page).getByRole("textbox", { name: "Request title" })).toBeVisible({ timeout: 20_000 });
}

test("a title-only edit keeps Problem to solve and Suggested change, with no review (B8)", async ({ page }) => {
  test.setTimeout(180_000);
  let user: TestUser | undefined;
  try {
    user = await createTestUser("edit-title-only");
    await page.setViewportSize({ width: 1440, height: 900 });
    const orgId = await provisionAndSignIn(page, user, { name: "Edit Title", workspaceName: "Edit title only" });
    const id = await seedHybrid(orgId, user.id, "Delivery costs appear late");
    await page.goto(`/requests/${id}`);
    await expect(page.getByText(PROBLEM, { exact: true }).first()).toBeVisible();

    await openEditor(page);
    await editor(page).getByRole("textbox", { name: "Request title" }).fill("Delivery costs show only at payment");
    // No wording check for a new title: the dialog saves straight away.
    const save = editor(page).getByRole("button", { name: "Save changes", exact: true });
    await expect(save).toBeVisible();
    await save.click();
    await expect(editor(page)).toBeHidden();
    await expect(page.getByRole("region", { name: /^Messages/ })).toContainText("Changes saved", { timeout: 20_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#request-title")).toHaveText("Delivery costs show only at payment");
    await expect(page.getByText(PROBLEM, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Suggested change", exact: true })).toBeVisible();
    await expect(page.getByText(SUGGESTED, { exact: true })).toBeVisible();
  } finally {
    if (user) try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
  }
});

test("the Edit dialog names the review answers a save clears, closes at once and reopens with the typing kept when refused (B9)", async ({ page }) => {
  test.setTimeout(240_000);
  let user: TestUser | undefined;
  let id: string | undefined;
  try {
    user = await createTestUser("edit-warning");
    await page.setViewportSize({ width: 1440, height: 900 });
    const orgId = await provisionAndSignIn(page, user, { name: "Edit Warning", workspaceName: "Edit warning" });
    id = await seedHybrid(orgId, user.id, "Delivery costs appear late", [{ name: "Daniel", kind: "concern" }, { name: "Priya", kind: "looks_good" }]);
    await page.goto(`/requests/${id}`);
    await openEditor(page);

    const warning = editor(page).getByText("Saving clears Daniel’s concern and 1 other answer. They’ll be told.", { exact: true });
    const title = editor(page).getByRole("textbox", { name: "Request title" });
    await expect(warning).toHaveCount(0);
    await title.fill("Delivery costs show only at payment");
    await expect(warning).toBeVisible();
    await title.fill("Delivery costs appear late");
    await expect(warning).toHaveCount(0);
    await title.fill("Delivery costs show only at payment");
    await expect(editor(page).getByRole("button", { name: "Save changes", exact: true })).toHaveAccessibleDescription(/Saving clears Daniel’s concern/);

    // The server refuses this save: the dialog has already closed with the new title on the page, then reopens with it.
    const manifest: { node: Record<string, { filename?: string; exportedName?: string }> } = JSON.parse(await readFile(runningActionManifestPath(), "utf8"));
    const [saveId] = Object.entries(manifest.node).find(([, item]) => item.filename === "src/app/(app)/requests/[id]/edit-actions.ts" && item.exportedName === "saveRequestEdits") ?? [];
    expect(saveId).toBeTruthy();
    const path = `**/requests/${id}**`;
    await page.route(path, async route => {
      // The page's own reads are server actions too: hold only the save.
      if (route.request().method() !== "POST" || route.request().headers()["next-action"] !== saveId) return route.fallback();
      await new Promise(resolve => setTimeout(resolve, 600));
      await route.abort("failed");
    });
    await editor(page).getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor(page)).toBeHidden({ timeout: 1_000 });
    await expect(page.locator("#request-title")).toHaveText("Delivery costs show only at payment");
    await expect(editor(page)).toBeVisible({ timeout: 20_000 });
    await expect(editor(page).getByRole("textbox", { name: "Request title" })).toHaveValue("Delivery costs show only at payment");
    await expect(editor(page)).toContainText("Couldn’t save");
    await expect(page.locator("#request-title")).toHaveText("Delivery costs appear late");
    await page.unroute(path);

    // Saving again lands; the answers are cleared.
    await editor(page).getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor(page)).toBeHidden({ timeout: 1_000 });
    await expect(page.getByRole("region", { name: /^Messages/ })).toContainText("Changes saved", { timeout: 20_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#request-title")).toHaveText("Delivery costs show only at payment");
    await openEditor(page);
    await editor(page).getByRole("textbox", { name: "Request title" }).fill("Delivery costs appear late");
    await expect(editor(page).getByText(/^Saving clears/)).toHaveCount(0);
  } finally {
    if (user) try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
    if (id) await dropReviewers(id);
  }
});

test("the Edit Request title wraps on a phone (Z1)", async ({ page }) => {
  test.setTimeout(180_000);
  let user: TestUser | undefined;
  try {
    user = await createTestUser("edit-title-wrap");
    await page.setViewportSize({ width: 390, height: 844 });
    const orgId = await provisionAndSignIn(page, user, { name: "Edit Wrap", workspaceName: "Edit title wraps" });
    const long = "Returning customers on narrow phone screens lose the delivery cost under the keyboard at payment";
    const id = await seedHybrid(orgId, user.id, long);
    await page.goto(`/requests/${id}`);
    await openEditor(page);
    const title = editor(page).getByRole("textbox", { name: "Request title" });
    await expect(title).toHaveValue(long);
    const fits = await title.evaluate((field: HTMLTextAreaElement) => ({ wide: field.scrollWidth <= field.clientWidth + 1, lines: field.getBoundingClientRect().height / parseFloat(getComputedStyle(field).lineHeight) }));
    expect(fits.wide, "the title never scrolls sideways").toBe(true);
    expect(fits.lines, "the title shows on more than one line").toBeGreaterThan(1.5);
  } finally {
    if (user) try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
  }
});

test("B6: the reviewers panel and the Edit warning name a reviewer by their sign-in name now; one who left keeps the name they were picked under", async ({ page }) => {
  test.setTimeout(240_000);
  let user: TestUser | undefined;
  let id: string | undefined;
  try {
    user = await createTestUser("edit-names");
    await page.setViewportSize({ width: 1440, height: 900 });
    const orgId = await provisionAndSignIn(page, user, { name: "Edit Names", workspaceName: "Edit names" });
    // The sign-in name now, as the workspace's people list gives it.
    const clerkUser = await (await assertOwnedUser(user.id)).users.getUser(user.id);
    const signInName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ");
    expect(signInName).not.toBe("");
    // Picked under an older name; Priya (seeded, not in the workspace) has left.
    id = await seedHybrid(orgId, user.id, "Delivery costs appear late", [{ name: "Priya", kind: "looks_good" }]);
    const sql = e2eDatabase();
    try {
      await sql`UPDATE request_agreements SET reviewers = reviewers || ${sql.json([{ id: randomUUID(), nominee: { kind: "member", userId: user.id }, displayNameAtSelection: "Name When Picked", addedBy: user.id, note: "",
        decision: { kind: "concern", actorId: user.id, at: new Date().toISOString(), reason: "The basket is already crowded." } }])}::jsonb WHERE request_id = ${id}`;
    } finally { await sql.end(); }

    await page.goto(`/requests/${id}`);
    const panel = page.getByRole("region", { name: "Reviewers", exact: true });
    await expect(panel.getByRole("listitem").filter({ hasText: signInName })).toContainText("Concern: The basket is already crowded.", { timeout: 20_000 });
    await expect(panel.getByRole("listitem").filter({ hasText: "Priya" })).toHaveCount(1);
    await expect(panel).not.toContainText("Name When Picked");

    await openEditor(page);
    await editor(page).getByRole("textbox", { name: "Request title" }).fill("Delivery costs show only at payment");
    await expect(editor(page).getByText(`Saving clears ${signInName}’s concern and 1 other answer. They’ll be told.`, { exact: true })).toBeVisible();
  } finally {
    if (id) await dropReviewers(id);
    if (user) try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
  }
});
