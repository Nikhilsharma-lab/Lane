import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase, getTestWorkspaceId } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { chooseJourneyMore, journey, journeyPopup, journeyStep, pickEarliestReleaseDay } from "./helpers/journey";

// #279 (Build 6.3, spec #256 "Close forms" and "Shared result wording"): closing says it's permanent before you press.
// Both close forms end in a red named button with "Closed Requests can’t be reopened." under it and no second confirm;
// the measured close names the goal in its own words, observes from the release date, reads Passed / Didn’t pass, and
// the Journey shows Closed, with the result against the goal, straight after saving. A hosted run can't reach a
// result's date, so the work here was picked up weeks ago (seeded) and released on its pickup day: its result is due.

const PERMANENT = "Closed Requests can’t be reopened.";
const plan = (primary: Record<string, unknown>) => ({
  kind: "measurement", version: 4, primary,
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 14, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
});
const CONVERSION = plan({ key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" });
const CHECK = plan({ key: "check", name: "", unit: "", current: null, target: null, noBaseline: false, check: "keyboard" });
const shownDay = (day: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(day);

async function seedPickedUp(userId: string, title: string, goal: typeof CONVERSION) {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();
  const id = randomUUID();
  // Picked up 40 days ago at midday UTC, so its day is the same in the browser's zone; Done an hour ago.
  const now = new Date();
  const pickedUp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 40, 12));
  try {
    await sql`
      INSERT INTO requests (id, org_id, title, description, status, created_by, assigned_to, expected_impact, created_at, picked_up_at, done_at)
      VALUES (${id}, ${orgId}, ${title}, 'Returning customers give up when checkout asks for their card again.', 'done', ${userId}, ${userId},
        ${sql.json(goal as never)}, ${new Date(pickedUp.getTime() - 86_400_000).toISOString()}, ${pickedUp.toISOString()}, ${new Date(Date.now() - 3_600_000).toISOString()})
    `;
    return { id, pickedUp };
  } finally {
    await sql.end();
  }
}

async function withWorkspace(page: Page, label: string, run: (user: TestUser) => Promise<void>) {
  const user = await createTestUser(label);
  try {
    await provisionAndSignIn(page, user, { name: "Closing Tester", workspaceName: `#279 ${label}` });
    await run(user);
  } finally {
    // A recorded release or a closed Request can never be deleted (both are immutable), so that workspace stays in
    // the test database; its person's sessions and sign-in methods go either way.
    await cleanupTestWorkspace(user.id).catch((error: unknown) => {
      if (!/^(Release history|Closed Request) is immutable$/.test(String((error as { message?: string }).message))) throw error;
    }).finally(() => deleteTestUser(user.id));
  }
}

async function openRequest(page: Page, id: string) {
  await page.goto(`/requests/${id}`);
  await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(1, { timeout: 30_000 });
}

/** Records the release on the pickup day, from the Done step's popup, so the result is already due. */
async function releaseOnPickupDay(page: Page, valueBefore: boolean) {
  await journey(page).getByRole("button", { name: "Record release", exact: true }).click();
  const form = journeyPopup(page, "Record release");
  if (valueBefore) await expect(form.getByLabel("Value before release (%)", { exact: true })).toHaveValue("62");
  await pickEarliestReleaseDay(page, form);
  await form.getByLabel("Release evidence", { exact: true }).fill("Rollout log: every shopper has the new checkout");
  await form.getByRole("checkbox", { name: "The agreed audience received this work" }).check();
  await form.getByRole("button", { name: "Mark as released", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(journeyStep(page, "Measuring", "current step")).toBeVisible({ timeout: 20_000 });
}

/** A close form's final button: red, named, with the permanence line under it, and the only way to close. */
async function expectPermanentClose(form: Locator, name: string) {
  const close = form.getByRole("button", { name, exact: true });
  await expect(form.getByRole("button").last()).toHaveText(name);
  await expect(close).toHaveClass(/danger/);
  await expect(form.getByText(PERMANENT, { exact: true })).toBeVisible();
  const [closeBox, lineBox] = await Promise.all([close.boundingBox(), form.getByText(PERMANENT, { exact: true }).boundingBox()]);
  expect(lineBox!.y).toBeGreaterThan(closeBox!.y + closeBox!.height - 1);
}

/** Opens a date field's calendar, walks back past its earliest day by keyboard, and reads the day it stops on. */
async function earliestDay(page: Page, form: Locator, label: string) {
  await form.getByRole("button", { name: label, exact: true }).click();
  const calendar = form.getByRole("dialog", { name: `${label} calendar`, exact: true });
  await expect(calendar).toBeVisible();
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.date ?? null)).not.toBeNull();
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowLeft");
  const day = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.date ?? null);
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  return day;
}

test.describe("#279 closing says it's permanent", () => {
  test("a measured close on seeded data: the goal in its words, observed from the release, a red Close Request, and Closed at once with the result against the goal", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "closing-measured", async user => {
      const { id, pickedUp } = await seedPickedUp(user.id, "Closing: measured result", CONVERSION);
      await openRequest(page, id);
      await releaseOnPickupDay(page, true);
      const releaseDay = await page.evaluate(at => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }, pickedUp.toISOString());

      await journey(page).getByRole("button", { name: "Close Request", exact: true }).click();
      const form = journeyPopup(page, "Close Request");
      await expect(form.getByText("Goal: Conversion rate, 80% (from 62%)", { exact: true })).toBeVisible();
      await expect(form).not.toContainText("Close with measured result");
      await expectPermanentClose(form, "Close Request");

      // Story 38: Observed from starts on the release day, and its calendar goes no earlier.
      await expect(form.getByRole("button", { name: "Observed from", exact: true })).toContainText(shownDay(pickedUp));
      expect(await earliestDay(page, form, "Observed from")).toBe(releaseDay);
      await expect(form).toBeVisible();

      await form.getByLabel("Actual Conversion rate (%)", { exact: true }).fill("75");
      await form.getByLabel("Evidence and source", { exact: true }).fill("Checkout dashboard, the 14 days after release");
      // Story 39: What we learned wraps over lines; a line break becomes a space, and it counts down near its limit.
      const learned = form.getByRole("textbox", { name: "What we learned (optional)" });
      await expect(learned).toHaveJSProperty("tagName", "TEXTAREA");
      await learned.fill("Shoppers come back\nwhen their card is kept.");
      await expect(learned).toHaveValue("Shoppers come back when their card is kept.");
      await learned.fill("x".repeat(250));
      await expect(form.getByText("30 characters left", { exact: true })).toBeVisible();
      await learned.fill("Shoppers come back when their card is kept.");
      await page.screenshot({ path: test.info().outputPath("close-request.png") });

      // No second "are you sure": the red button closes, and the Journey shows Closed at once.
      await form.getByRole("button", { name: "Close Request", exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      const closed = journeyStep(page, "Closed", "current step");
      await expect(closed).toBeVisible();
      await expect(closed).toContainText("Reached 75%, 5 points short of the goal");
      await expect(closed).toContainText("Conversion rate: 80% (from 62%)");
      await expect(closed).toContainText("What we learned: Shoppers come back when their card is kept.");
      await expect(closed).toContainText(PERMANENT);
      await page.reload();
      await expect(journeyStep(page, "Closed", "current step")).toContainText("Reached 75%, 5 points short of the goal");

      // Story 41: with no guardrails agreed, Add correction never offers Guardrails.
      await journey(page).getByRole("button", { name: "Add correction", exact: true }).click();
      const correcting = journeyPopup(page, "Add correction");
      await correcting.getByRole("combobox", { name: "What needs correcting" }).click();
      const options = page.getByRole("option");
      await expect(options.filter({ hasText: "Actual result" })).toHaveCount(1);
      await expect(options.filter({ hasText: "Guardrails" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await correcting.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(correcting).toHaveCount(0);
    });
  });

  test("a pass/fail close reads the check's own words and Passed / Didn’t pass; closing without a result ends in its own red button", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 900 });
    await withWorkspace(page, "closing-check", async user => {
      const check = await seedPickedUp(user.id, "Closing: pass/fail", CHECK);
      await openRequest(page, check.id);
      await releaseOnPickupDay(page, false);
      await journey(page).getByRole("button", { name: "Close Request", exact: true }).click();
      const form = journeyPopup(page, "Close Request");
      await expect(form.getByText("Goal: Complete the flow using only a keyboard", { exact: true })).toBeVisible();
      await expectPermanentClose(form, "Close Request");
      // C2-8: the Result select asks in Lane's words, not Arc's default "Select an option".
      const result = form.getByRole("combobox", { name: "Result" });
      await expect(result).toContainText("Choose Passed or Didn’t pass");
      await expect(result).not.toContainText("Select an option");
      await result.click();
      await expect(page.getByRole("option")).toHaveText(["Passed", "Didn’t pass"]);
      await page.getByRole("option", { name: "Didn’t pass", exact: true }).click();
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await form.getByLabel("Evidence and source", { exact: true }).fill("Keyboard walkthrough on the release build");
      await page.screenshot({ path: test.info().outputPath("close-request-phone.png") });
      await form.getByRole("button", { name: "Close Request", exact: true }).click();
      await expect(form).toHaveCount(0);
      const closed = journeyStep(page, "Closed", "current step");
      await expect(closed).toContainText("Didn’t pass");
      await expect(closed).toContainText("Complete the flow using only a keyboard");
      await expect(closed).not.toContainText("Did not pass");

      // Close without a result: its own red named button and the same line, then Closed at once.
      const other = await seedPickedUp(user.id, "Closing: without a result", CONVERSION);
      await openRequest(page, other.id);
      await releaseOnPickupDay(page, true);
      await chooseJourneyMore(page, "Close without a result");
      const without = journeyPopup(page, "Close without a result");
      await expectPermanentClose(without, "Close without a result");
      await without.getByRole("combobox", { name: "Why" }).click();
      await page.getByRole("option", { name: "Rolled back", exact: true }).click();
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await without.getByRole("button", { name: "Close without a result", exact: true }).click();
      await expect(without).toHaveCount(0);
      await expect(journeyStep(page, "Closed without a result", "current step")).toContainText(PERMANENT);
    });
  });
});
