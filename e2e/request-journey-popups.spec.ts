import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase, getTestWorkspaceId } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { chooseJourneyMore, isItLivePrompt, isItLiveRelease, journey, journeyStep } from "./helpers/journey";

// #277 (Build 6.1, spec #256 "Journey (timeline view)" and "Release form"): every Journey action opens in one popup on
// Lane's adaptive popup (centred on desktop, the bottom panel on a phone). Focus moves in and back, Escape asks before
// dropping typed text (B2, B3, C2-1), the Done step and "Is it live?" open the one release form with the same defaults
// (B14, B15), its date picker starts at the pickup day in the viewer's zone (C2-10), and the Marked Done toast steps
// aside while "Is it live?" is open (C2-12).

// East of UTC, so the pickup's day here is the day after its UTC day.
const ZONE = "Asia/Kolkata";
test.use({ timezoneId: ZONE });

const DISCARD = "Discard what you typed?";
const WARNING = "Once you record the release, you can’t reopen this Request.";
const GOAL = {
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};

const dayIn = (at: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
const shownDay = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short", year: "numeric" }).format(at);
const discardPrompt = (page: Page) => page.getByRole("dialog", { name: DISCARD, exact: true });
const popup = (page: Page, title: string) => page.getByRole("dialog", { name: title, exact: true });

async function seedRequest(userId: string, title: string, more: { status: "open" | "done"; pickedUpAt?: string; doneAt?: string }) {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();
  const id = randomUUID();
  try {
    await sql`
      INSERT INTO requests (id, org_id, title, description, status, created_by, assigned_to, expected_impact, created_at, picked_up_at, done_at)
      VALUES (${id}, ${orgId}, ${title}, 'Returning customers give up when checkout asks for their card again.', ${more.status}, ${userId},
        ${more.status === "open" ? null : userId}, ${sql.json(GOAL)}, ${new Date(Date.now() - 10 * 86_400_000).toISOString()},
        ${more.pickedUpAt ?? null}, ${more.doneAt ?? null})
    `;
    return id;
  } finally {
    await sql.end();
  }
}

async function withWorkspace(page: Page, label: string, run: (user: TestUser) => Promise<void>) {
  const user = await createTestUser(label);
  try {
    await provisionAndSignIn(page, user, { name: "Popup Tester", workspaceName: `#277 ${label}` });
    await run(user);
  } finally {
    // A recorded release or a closed Request can never be deleted (both are immutable), so that workspace's rows stay
    // in the test database; the Clerk organization goes and a borrowed user is given back either way.
    await cleanupTestWorkspace(user.id).catch((error: unknown) => {
      if (!/^(Release history|Closed Request) is immutable$/.test(String((error as { message?: string }).message))) throw error;
    }).finally(() => deleteTestUser(user.id));
  }
}

async function openRequest(page: Page, id: string) {
  await page.goto(`/requests/${id}`);
  await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot="request-workspace-keyboard"][data-ready="true"]')).toHaveCount(1);
  await expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(1, { timeout: 30_000 });
  if (page.viewportSize()!.width < 640) await expect(page.locator("html[data-popup-sheet=ready]")).toHaveCount(1, { timeout: 30_000 });
}

async function blurToPage(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
}

const focusedInside = (dialog: Locator) => dialog.evaluate(element => element.contains(document.activeElement) && document.activeElement?.getAttribute("aria-label") !== "Close dialog");
const box = (locator: Locator) => locator.evaluate(element => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
});

/** Opens the release date's calendar, walks to its earliest and latest days by keyboard, and closes it with Escape. */
async function pickerBounds(page: Page, dialog: Locator) {
  await dialog.getByRole("button", { name: "Release date", exact: true }).click();
  const calendar = dialog.getByRole("dialog", { name: "Release date calendar", exact: true });
  await expect(calendar).toBeVisible();
  const focusedDay = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.date ?? null);
  await expect.poll(focusedDay).not.toBeNull();
  await page.waitForTimeout(500);
  await page.screenshot({ path: test.info().outputPath(`release-calendar-${page.viewportSize()!.width}.png`) });
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
  const earliest = await focusedDay();
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
  const latest = await focusedDay();
  return { calendar, earliest, latest };
}

test.describe("#277 Journey popups and the one release form", () => {
  test("each Journey action opens its popup: focus moves in and back, Escape asks first, and the release picker starts at the pickup day (B2, B3, B14, B15, C2-1, C2-10)", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "journey-popups", async user => {
      // Picked up three days ago at 20:00 UTC: 01:30 the next day in India, so the earliest day here is the day after
      // the UTC pickup day.
      const now = new Date();
      const pickedUp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3, 20));
      const id = await seedRequest(user.id, "Journey popups: release form", { status: "done", pickedUpAt: pickedUp.toISOString(), doneAt: new Date(Date.now() - 3_600_000).toISOString() });
      await openRequest(page, id);
      const steps = journey(page);
      const record = steps.getByRole("button", { name: "Record release", exact: true });

      // B3: opening moves focus into the popup, on its first field, filled with the goal's current value (B15).
      await record.click();
      const release = popup(page, "Record release");
      await expect(release).toBeVisible();
      const valueBefore = release.getByLabel("Value before release (%)", { exact: true });
      await expect(valueBefore).toBeFocused({ timeout: 20_000 });
      await expect(valueBefore).toHaveValue("62");
      // B14: the release date starts as today, the warning reads as #241 says, and the form's own button comes last.
      await expect(release.getByRole("button", { name: "Release date", exact: true })).toContainText(shownDay(now));
      await expect(release.getByText(WARNING, { exact: true })).toBeVisible();
      await expect(release.getByRole("button").last()).toHaveText("Mark as released");
      await expect(release.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
      // Centred on desktop.
      const centred = await box(release);
      expect(Math.abs((centred.left + centred.right) / 2 - centred.width / 2)).toBeLessThan(2);

      // C2-10: the picker's earliest day is the pickup day in the viewer's zone, its latest today. Escape closes only it.
      const { calendar, earliest, latest } = await pickerBounds(page, release);
      expect(earliest).toBe(dayIn(pickedUp));
      expect(latest).toBe(dayIn(now));
      const before = calendar.locator(`[data-present] [data-date="${dayIn(new Date(pickedUp.getTime() - 86_400_000))}"]`);
      if (await before.count()) await expect(before).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(calendar).toHaveCount(0);
      await expect(release).toBeVisible();
      await expect(discardPrompt(page)).toHaveCount(0);

      // B2 and C2-1: Escape with typed text asks first, and nothing is lost.
      const evidence = release.getByLabel("Release evidence", { exact: true });
      await evidence.fill("Rollout log: every shopper has the new checkout");
      await blurToPage(page);
      await page.keyboard.press("Escape");
      const prompt = discardPrompt(page);
      await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
      await prompt.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(prompt).toHaveCount(0);
      await expect(release).toBeVisible();
      await expect(evidence).toHaveValue("Rollout log: every shopper has the new checkout");
      await expect(page).toHaveURL(new RegExp(`/requests/${id}$`));
      await evidence.focus();
      await page.keyboard.press("Escape");
      await prompt.getByRole("button", { name: "Discard", exact: true }).click();
      await expect(release).toHaveCount(0);
      await expect(record).toBeFocused();

      // Cancel is a deliberate discard: it never asks, and focus goes back to the action.
      await record.click();
      await release.getByLabel("Release evidence", { exact: true }).fill("Dropped on purpose");
      await release.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(release).toHaveCount(0);
      await expect(prompt).toHaveCount(0);
      await expect(record).toBeFocused();

      // Recording the release closes the popup; focus goes to the Journey, now Measuring.
      await record.click();
      await release.getByLabel("Release evidence", { exact: true }).fill("Rollout log: every shopper has the new checkout");
      await release.getByRole("checkbox", { name: "The agreed audience received this work" }).check();
      await release.getByRole("button", { name: "Mark as released", exact: true }).click();
      await expect(release).toHaveCount(0, { timeout: 20_000 });
      await expect(journeyStep(page, "Measuring", "current step")).toContainText("Released to ", { timeout: 20_000 });
      await expect(steps.getByRole("heading", { name: "Journey", exact: true })).toBeFocused();

      // Measuring's other actions sit behind More (#278). Correct release starts from the saved facts.
      const more = steps.getByRole("button", { name: "More", exact: true });
      await chooseJourneyMore(page, "Correct release");
      const correction = popup(page, "Correct release");
      await expect(correction.getByLabel("Release evidence", { exact: true })).toHaveValue("Rollout log: every shopper has the new checkout");
      await expect(correction.getByLabel("Value before release (%)", { exact: true })).toHaveValue("62");
      await expect(correction.getByRole("button", { name: "Release date", exact: true })).toContainText(shownDay(now));
      await expect(correction.getByText(WARNING, { exact: true })).toHaveCount(0);
      await expect(correction.getByRole("button").last()).toHaveText("Save correction");
      await correction.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(correction).toHaveCount(0);
      await expect(more).toBeFocused();

      // Every other Measuring action: its own popup, focus in, its own button last, focus back to More on Cancel.
      for (const [title, button] of [
        ["Void incorrect release", "Confirm void"],
        ["Create follow-up Request", "Create follow-up Request"],
        ["Close without a result", "Close without a result"],
      ] as const) {
        await chooseJourneyMore(page, title);
        const dialog = popup(page, title);
        await expect(dialog).toBeVisible();
        await expect.poll(() => focusedInside(dialog)).toBe(true);
        await expect(dialog.getByRole("button").last()).toHaveText(button);
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(more).toBeFocused();
      }

      // Closing without a result, then Add correction on the Closed step: the same popup.
      await chooseJourneyMore(page, "Close without a result");
      const close = popup(page, "Close without a result");
      await close.getByRole("combobox", { name: "Why" }).click();
      await page.getByRole("option").first().click();
      await expect(page.getByRole("listbox")).toHaveCount(0);
      await close.getByLabel(/^(Reason|Details \(optional\))$/).fill("Measured on the wrong cohort; starting over.");
      await close.getByRole("button", { name: "Close without a result", exact: true }).click();
      await expect(close).toHaveCount(0, { timeout: 20_000 });
      const addCorrection = steps.getByRole("button", { name: "Add correction", exact: true });
      await expect(addCorrection).toBeVisible({ timeout: 20_000 });
      await addCorrection.click();
      const corrections = popup(page, "Add correction");
      await expect.poll(() => focusedInside(corrections)).toBe(true);
      await expect(corrections.getByRole("button").last()).toHaveText("Save correction");
      await corrections.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(corrections).toHaveCount(0);
      await expect(addCorrection).toBeFocused();
    });
  });

  test("on a 390px phone the popups are the bottom panel, and Is it live? opens the same release form with the Marked Done toast out of its way (B14, C2-12)", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await withWorkspace(page, "journey-phone", async user => {
      const id = await seedRequest(user.id, "Journey popups: phone", { status: "open" });
      await openRequest(page, id);
      const lifecycle = page.locator('[data-slot="request-lifecycle-actions"]:visible');
      const messages = page.getByRole("region", { name: /^Messages/ });
      await lifecycle.getByRole("button", { name: "Pick up", exact: true }).click();
      // Mark Done shows at once and is pressable once the pickup is saved (#280).
      await expect(lifecycle.getByRole("button", { name: "Mark Done", exact: true })).toBeEnabled({ timeout: 20_000 });
      await lifecycle.getByRole("button", { name: "Mark Done", exact: true }).click();

      // C2-12: while Is it live? is open, the Marked Done toast steps aside instead of covering it.
      const live = isItLivePrompt(page);
      await expect(live).toBeVisible({ timeout: 20_000 });
      await expect(messages.getByText("Marked Done", { exact: true })).toBeHidden();
      await expect(live.getByText(WARNING, { exact: true })).toBeVisible();
      const phone = await box(live);
      expect(phone.left <= 1 && phone.right >= phone.width - 1 && phone.bottom >= phone.height - 1).toBe(true);

      // B14: "Yes, record release" opens the one release form, with the Journey's defaults and button order.
      await live.getByRole("button", { name: "Yes, record release", exact: true }).click();
      const prompted = isItLiveRelease(page);
      await expect(prompted.getByLabel("Value before release (%)", { exact: true })).toHaveValue("62", { timeout: 20_000 });
      await expect(prompted.getByRole("button", { name: "Release date", exact: true })).toContainText(shownDay(new Date()));
      await expect(prompted.getByRole("button").last()).toHaveText("Mark as released");
      await expect(messages.getByText("Marked Done", { exact: true })).toBeHidden();
      await prompted.getByRole("button", { name: "Not yet", exact: true }).click();
      await expect(prompted).toHaveCount(0);
      // Not yet brings the toast back with its Undo.
      await expect(messages.getByText("Marked Done", { exact: true })).toBeVisible();
      await expect(messages.getByRole("button", { name: "Undo", exact: true })).toBeVisible();

      // The Journey's Record release is the bottom panel, and the calendar fits the phone.
      const record = journey(page).getByRole("button", { name: "Record release", exact: true });
      await record.click();
      const release = popup(page, "Record release");
      await expect(release.getByLabel("Value before release (%)", { exact: true })).toBeFocused({ timeout: 20_000 });
      await expect.poll(async () => { const panel = await box(release); return panel.left <= 1 && panel.right >= panel.width - 1 && panel.bottom >= panel.height - 1; }).toBe(true);
      const { calendar, earliest, latest } = await pickerBounds(page, release);
      // Picked up just now: today is both the earliest and the latest day.
      expect(earliest).toBe(dayIn(new Date()));
      expect(latest).toBe(dayIn(new Date()));
      const shown = await box(calendar);
      expect(shown.left).toBeGreaterThanOrEqual(0);
      expect(shown.right).toBeLessThanOrEqual(shown.width);
      await page.keyboard.press("Escape");
      await expect(calendar).toHaveCount(0);

      // Coming back to the tab while the panel is open reads nothing, so nothing typed moves (the Journey reads on return).
      const evidence = release.getByLabel("Release evidence", { exact: true });
      await evidence.fill("Phone rollout log");
      let reads = 0;
      const countRead = (request: Request) => { if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes(id)) reads++; };
      page.on("request", countRead);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForTimeout(500);
      page.off("request", countRead);
      expect(reads).toBe(0);
      await expect(evidence).toHaveValue("Phone rollout log");
      await expect(evidence).toBeFocused();

      // Escape with typed text asks here too; Discard closes the panel and focus goes back to the action.
      await blurToPage(page);
      await page.keyboard.press("Escape");
      await expect(discardPrompt(page).getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
      await discardPrompt(page).getByRole("button", { name: "Discard", exact: true }).click();
      await expect(release).toHaveCount(0);
      await expect(record).toBeFocused();

      // A choice picked from a menu inside the panel keeps the panel open, and a return to the tab reads nothing.
      const closeWithout = journey(page).getByRole("button", { name: /^Close without a result/ });
      await closeWithout.click();
      const close = popup(page, "Close without a result");
      await close.getByRole("combobox", { name: "Why" }).click();
      await page.getByRole("option").first().click();
      await page.waitForTimeout(500);
      await expect(close).toBeVisible();
      const details = close.getByLabel(/^(Reason|Details \(optional\))$/);
      await details.fill("Rolled back after payment errors");
      await details.focus();
      page.on("request", countRead);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForTimeout(500);
      page.off("request", countRead);
      expect(reads).toBe(0);
      await expect(details).toHaveValue("Rolled back after payment errors");
      await expect(details).toBeFocused();
      await close.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(close).toHaveCount(0);
      await expect(closeWithout).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
});
