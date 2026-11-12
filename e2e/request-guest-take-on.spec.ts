import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { compiledUndoAction } from "./helpers/server-action-identity";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * #280 (Z2, decisions.md item 6): a Guest submission a Member took on can't be picked up before its goal is set,
 * neither from the strip nor by calling the move. The reason is visible text beside the greyed Pick up, never a
 * hover-only tip (B19).
 */

/** A goal measured as a conversion rate: 62% now, 80% after release. */
const GOAL = {
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};

const strip = (page: Page) => page.locator('[data-slot="page-strip"] [data-slot="request-lifecycle-actions"]');

/** The strip's reason is shown as text: laid out at its own size, not a 1px screen-reader-only box. */
async function expectVisibleReason(page: Page, reason: string) {
  const text = strip(page).getByText(reason, { exact: true });
  await expect(text).toBeVisible();
  const box = await text.boundingBox();
  expect(box?.width ?? 0, "the reason is laid out as text").toBeGreaterThan(40);
  await expect(strip(page).getByRole("button", { name: "Pick up", exact: true })).toBeDisabled();
}

/** Calls the compiled pickUpRequest server action from the page, as a crafted request would, and reads its answer. */
async function callPickUp(page: Page, requestId: string, orgId: string) {
  const { id } = await compiledUndoAction("pick-up");
  return page.evaluate(async ({ id, requestId, orgId }) => {
    const response = await fetch(location.pathname, {
      method: "POST",
      headers: { "Next-Action": id, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify([requestId, { orgId }]),
    });
    const body = await response.text();
    for (const line of body.split("\n")) {
      const match = /^[\da-f]+:(.+)$/.exec(line);
      if (!match) continue;
      try { const value = JSON.parse(match[1]); if (value?.success === true || typeof value?.error === "string") return value as { success?: true; error?: string }; } catch { /* Not JSON. */ }
    }
    throw new Error(`No action result (status ${response.status})`);
  }, { id, requestId, orgId });
}

test("a taken-on Guest submission can't be picked up before its goal is set (Z2)", async ({ page }) => {
  test.setTimeout(240_000);
  let user: TestUser | undefined;
  const guestId = `e2e-guest-${randomUUID()}`;
  try {
    user = await createTestUser("guest-take-on");
    await page.setViewportSize({ width: 1440, height: 900 });
    const orgId = await provisionAndSignIn(page, user, { name: "Take On Member", workspaceName: "Guest take-on" });
    const sql = e2eDatabase();
    let requestId: string;
    try {
      await sql`INSERT INTO profiles (id, full_name, email) VALUES (${guestId}, 'Gita Guest', ${`${guestId}@example.test`})`;
      [{ id: requestId }] = await sql<{ id: string }[]>`
        INSERT INTO requests ${sql({ org_id: orgId, title: "Invoices need a PDF download", description: "Finance can't file invoices that only open in the browser.", created_by: guestId, guest_submission: true })}
        RETURNING id`;
    } finally { await sql.end(); }

    // The list's preview reads the Request first, so a stale copy would be in its memory after the take-on.
    await page.goto("/");
    const row = page.locator(`[data-request-grid] [role="row"][data-request-id="${requestId}"]`);
    const preview = page.getByRole("region", { name: "Request preview" });
    const previewSlot = preview.locator('[data-slot="request-lifecycle-actions"]');
    await row.locator("[data-request-code]").click();
    await expect(previewSlot.getByText("Take this Guest submission on before picking it up.", { exact: true })).toBeVisible({ timeout: 20_000 });

    // In-app navigation keeps the preview's memory of it.
    await preview.getByRole("link", { name: "Open full page" }).click();
    await expect(page).toHaveURL(new RegExp(`/requests/${requestId}`));
    await expect(page.locator("#request-title")).toHaveText("Invoices need a PDF download");
    await expectVisibleReason(page, "Take this Guest submission on before picking it up.");

    // Take it on; the goal editor opens at once. Leave it without setting the goal.
    await page.getByRole("region", { name: "Guest submission" }).getByRole("button", { name: "Take this on", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Set the goal" });
    await expect(editor).toBeVisible({ timeout: 20_000 });
    // Z3: one name for the goal dialog: "Set the goal", its "Goal" section and Save goal.
    await expect(editor.getByRole("heading", { name: "Goal", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(editor.getByRole("button", { name: "Save goal", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();

    // The strip has no enabled Pick up, and says why.
    await expectVisibleReason(page, "Set the goal before picking up this Request.");
    // Back in the list within the preview's 30 seconds of memory, the preview says the same, not what it read first.
    await page.goBack();
    await expect(row).toBeVisible();
    if (!await preview.isVisible()) await row.locator("[data-request-code]").click();
    await expect(previewSlot.getByText("Set the goal before picking up this Request.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(previewSlot.getByRole("button", { name: "Pick up", exact: true })).toBeDisabled();

    // The server refuses the move with the same words.
    await page.goto(`/requests/${requestId}`);
    expect(await callPickUp(page, requestId, orgId)).toEqual({ error: "Set the goal before picking up this Request." });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectVisibleReason(page, "Set the goal before picking up this Request.");

    // Once the goal is saved, Pick up is offered.
    const db = e2eDatabase();
    try { await db`UPDATE requests SET expected_impact = ${db.json(GOAL)} WHERE id = ${requestId}`; } finally { await db.end(); }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(strip(page).getByRole("button", { name: "Pick up", exact: true })).toBeEnabled();
  } finally {
    if (user) try { await cleanupTestWorkspace(user.id); } finally {
      await deleteTestUser(user.id);
      const sql = e2eDatabase();
      try { await sql`DELETE FROM profiles WHERE id = ${guestId}`; } finally { await sql.end(); }
    }
  }
});
