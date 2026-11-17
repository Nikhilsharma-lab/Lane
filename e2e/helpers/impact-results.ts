import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { e2eDatabase, getTestWorkspaceId } from "./cleanup";
import { journey, journeyPopup, journeyStep, pickEarliestReleaseDay } from "./journey";

// #282, shared with #283: Requests with real results. A hosted run can't reach a result's date, so each Request was
// picked up weeks ago (seeded), released on its pickup day and closed through the Journey, as
// `request-closing.spec.ts` does. A closed Request can never be deleted, so its rows stay in the test database.

const CONVERSION = {
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 14, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};

/** Picked up 40 days ago at midday UTC (the same day in the browser's zone) and Done an hour ago. */
export async function seedPickedUp(userId: string, title: string) {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();
  const id = randomUUID();
  const now = new Date();
  const pickedUp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 40, 12));
  try {
    const [{ request_number: number }] = await sql<{ request_number: number }[]>`
      INSERT INTO requests (id, org_id, title, description, status, created_by, assigned_to, expected_impact, created_at, picked_up_at, done_at)
      VALUES (${id}, ${orgId}, ${title}, 'Returning customers give up when checkout asks for their card again.', 'done', ${userId}, ${userId},
        ${sql.json(CONVERSION as never)}, ${new Date(pickedUp.getTime() - 86_400_000).toISOString()}, ${pickedUp.toISOString()}, ${new Date(Date.now() - 3_600_000).toISOString()})
      RETURNING request_number
    `;
    return { id, pickedUp, code: `LAN-${number}` };
  } finally {
    await sql.end();
  }
}

/** Releases on the pickup day from 62%, then closes with the given result (and What we learned), both through the Journey. */
export async function releaseAndClose(page: Page, id: string, actual: string, learned = "") {
  await page.goto(`/requests/${id}`);
  await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(1, { timeout: 30_000 });
  await journey(page).getByRole("button", { name: "Record release", exact: true }).click();
  const release = journeyPopup(page, "Record release");
  await expect(release.getByLabel("Value before release (%)", { exact: true })).toHaveValue("62");
  await pickEarliestReleaseDay(page, release);
  await release.getByLabel("Release evidence", { exact: true }).fill("Rollout log: every shopper has the new checkout");
  await release.getByRole("checkbox", { name: "The agreed audience received this work" }).check();
  await release.getByRole("button", { name: "Mark as released", exact: true }).click();
  await expect(journeyStep(page, "Measuring", "current step")).toBeVisible({ timeout: 20_000 });

  await journey(page).getByRole("button", { name: "Close Request", exact: true }).click();
  const close = journeyPopup(page, "Close Request");
  await close.getByLabel("Actual Conversion rate (%)", { exact: true }).fill(actual);
  await close.getByLabel("Evidence and source", { exact: true }).fill("Checkout dashboard, the 14 days after release");
  if (learned) await close.getByLabel("What we learned (optional)", { exact: true }).fill(learned);
  await close.getByRole("button", { name: "Close Request", exact: true }).click();
  await expect(journeyStep(page, "Closed", "current step")).toBeVisible({ timeout: 20_000 });
}
