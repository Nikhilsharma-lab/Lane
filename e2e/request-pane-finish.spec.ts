import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase, getTestWorkspaceId } from "./helpers/cleanup";
import { answerIsItLive, journey, journeyPopup, journeyStep, pickEarliestReleaseDay } from "./helpers/journey";
import { focusInside, hiddenButFocusable } from "./helpers/menu-focus";
import { toastRegion } from "./helpers/mark-done-undo";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * #281 (Build 6.5): the Request pane and its properties, finished. "Problem to solve" is a visible label above
 * "Suggested change"; a long description folds after about 10 lines with Show more while comments never fold; web
 * addresses in the description, comments and release evidence open in a new tab (B20, B21, B22). Priority reads as
 * text once the work is picked up, never vanishing (B33). A failed copy shows the link in a field (B34). An open menu
 * leaves nothing behind it reachable (B37). On a phone, taps are 44px (B29) and messages never cover a popup (B30).
 */

const plan = {
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 14, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};

const PROBLEM_LINK = "https://logs.example.test/checkout/run-42";
const COMMENT_LINK = "https://notes.example.test/support/ticket-7";
const EVIDENCE_LINK = "https://rollout.example.test/checkout/42";
/** Fourteen lines, the second naming a log: more than the ten the description shows before Show more. */
const LONG_PROBLEM = [
  "Returning customers give up when checkout asks for their card again.",
  `The payment logs show it: ${PROBLEM_LINK}.`,
  ...Array.from({ length: 11 }, (_, i) => `Observation ${i + 1}: the saved card is missing on the review step.`),
  "Last line of the problem.",
].join("\n");
/** A comment as long as the problem, which still shows in full. */
const LONG_COMMENT = [`Support saw it too: ${COMMENT_LINK}`, ...Array.from({ length: 12 }, (_, i) => `Support call ${i + 1} asked for the card again.`), "Last line of the comment."].join("\n");

type Seed = { status?: "open" | "in_progress" | "done"; priority?: string; noMeasurableImpact?: boolean; problem?: string; comment?: string };

async function seedRequest(userId: string, title: string, seed: Seed = {}) {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();
  const id = randomUUID();
  const status = seed.status ?? "open";
  // Picked up 40 days ago at midday UTC, so a release on the pickup day already has its result due; Done an hour ago.
  const now = new Date();
  const pickedUp = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 40, 12));
  try {
    await sql`INSERT INTO requests ${sql({
      id, org_id: orgId, title, status, created_by: userId, priority: seed.priority ?? "none",
      description: "Checkout asks for the card again.",
      classification: "hybrid", reframed_problem: seed.problem ?? "Returning customers give up when checkout asks for their card again.",
      extracted_solution: "Offer the saved card on the review step.",
      assigned_to: status === "open" ? null : userId,
      created_at: new Date(pickedUp.getTime() - 86_400_000).toISOString(),
      picked_up_at: status === "open" ? null : pickedUp.toISOString(),
      done_at: status === "done" ? new Date(Date.now() - 3_600_000).toISOString() : null,
      ...(seed.noMeasurableImpact
        ? { no_measurable_impact_reason: "Renames the checkout labels; nothing a shopper does changes." }
        : { expected_impact: sql.json(plan as never) }),
    })}`;
    if (seed.comment) await sql`INSERT INTO comments (request_id, author_id, body) VALUES (${id}, ${userId}, ${seed.comment})`;
    return id;
  } finally {
    await sql.end();
  }
}

async function withWorkspace(page: Page, label: string, run: (user: TestUser) => Promise<void>) {
  const user = await createTestUser(label);
  try {
    await provisionAndSignIn(page, user, { name: "Pane Tester", workspaceName: `#281 ${label}` });
    await run(user);
  } finally {
    // A recorded release can never be deleted, so that workspace's rows stay; the Clerk organization goes and a
    // borrowed user is given back either way.
    await cleanupTestWorkspace(user.id).catch((error: unknown) => {
      if (!/^Release history is immutable$/.test(String((error as { message?: string }).message))) throw error;
    }).finally(() => deleteTestUser(user.id));
  }
}

async function openRequest(page: Page, id: string) {
  await page.goto(`/requests/${id}`);
  await expect(page.locator("#request-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html[data-popup-behaviour=ready]")).toHaveCount(1, { timeout: 30_000 });
}

/** A link opens in a new tab: it says so, and following it opens another page while this one stays. */
async function expectOpensInNewTab(page: Page, link: Locator, href: string) {
  await expect(link).toHaveAttribute("href", href);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  const [tab] = await Promise.all([page.context().waitForEvent("page"), link.click()]);
  await tab.waitForLoadState("domcontentloaded");
  expect(tab.url()).toBe(href);
  await tab.close();
  expect(page.url()).toContain("/requests/");
}

/** With a menu open, Tab stays in it and nothing behind it (the sidebar, the skip link, the page) can take focus. */
async function expectNothingReachableBehind(page: Page, role: "menu" | "listbox") {
  await expect(page.getByRole(role)).toBeVisible();
  await expect.poll(() => focusInside(page, role)).toBe(true);
  // The skip link and the sidebar's links are hidden from screen readers while the menu is open...
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "All Requests", exact: true })).toHaveCount(0);
  // ...and, like everything else behind it, out of Tab's reach too.
  expect(await hiddenButFocusable(page)).toEqual([]);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInside(page, role)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole(role)).toHaveCount(0);
  // Closed, the page is whole again: the skip link takes focus.
  const skip = page.getByRole("link", { name: "Skip to content", exact: true });
  await skip.focus();
  await expect(skip).toBeFocused();
}

/** How many lines of text an element shows. */
const shownLines = (element: Locator) => element.evaluate(node => {
  const lineHeight = parseFloat(getComputedStyle(node).lineHeight);
  return Math.round(node.getBoundingClientRect().height / lineHeight);
});

test.describe("#281 the Request pane", () => {
  test.beforeEach(async ({ context }) => {
    // The example addresses answer locally, so following a link opens a real page without the internet.
    await context.route(/^https:\/\/[a-z]+\.example\.test\//, route => route.fulfill({ contentType: "text/html", body: "<title>Example</title><p>Example page</p>" }));
  });

  test("Problem to solve is labelled above Suggested change, a long problem folds with Show more, comments never fold, and web addresses open in a new tab", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "pane", async user => {
      const id = await seedRequest(user.id, "Checkout keeps the saved card", { status: "done", priority: "high", problem: LONG_PROBLEM, comment: LONG_COMMENT });
      await openRequest(page, id);

      // The title stays the heading; "Problem to solve" is a visible label over the problem, above "Suggested change".
      await expect(page.getByRole("heading", { level: 1, name: "Checkout keeps the saved card" })).toBeVisible();
      const problem = page.locator("#problem");
      const label = problem.getByRole("heading", { name: "Problem to solve", exact: true });
      const suggested = problem.getByRole("heading", { name: "Suggested change", exact: true });
      await expect(label).toBeVisible();
      await expect(suggested).toBeVisible();
      const [labelBox, suggestedBox] = await Promise.all([label.boundingBox(), suggested.boundingBox()]);
      expect(labelBox!.y).toBeLessThan(suggestedBox!.y);

      // About ten lines, then Show more; the rest shows in place and Show less folds it again.
      const text = problem.locator("[data-fold-text]");
      const more = problem.getByRole("button", { name: "Show more", exact: true });
      await expect(more).toBeVisible();
      await expect(more).toHaveAttribute("aria-expanded", "false");
      expect(await shownLines(text)).toBeLessThanOrEqual(10);
      expect(await shownLines(text)).toBeGreaterThanOrEqual(9);
      await more.click();
      const less = problem.getByRole("button", { name: "Show less", exact: true });
      await expect(less).toHaveAttribute("aria-expanded", "true");
      expect(await shownLines(text)).toBeGreaterThanOrEqual(14);
      await expect(less).toBeFocused();
      await less.click();
      await expect(more).toBeVisible();
      expect(await shownLines(text)).toBeLessThanOrEqual(10);

      // Checked here, built by Build 5 (#274): label chips are at least 11px.
      const chip = page.getByRole("complementary", { name: "Properties", exact: true }).getByText("No labels", { exact: true });
      expect(await chip.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(11);

      // A short problem doesn't offer Show more.
      const short = await seedRequest(user.id, "Short problem", {});
      await openRequest(page, short);
      await expect(page.locator("#problem").getByRole("button", { name: /^Show (more|less)$/ })).toHaveCount(0);
      await openRequest(page, id);

      // The comment shows in full: no Show more in the conversation, and nothing in it is cut off.
      const conversation = page.locator("#conversation");
      await expect(conversation.getByText("Last line of the comment.", { exact: false })).toBeVisible();
      await expect(conversation.getByRole("button", { name: /^Show (more|less)$/ })).toHaveCount(0);
      const body = conversation.locator("article p").filter({ hasText: "Support saw it too" });
      expect(await body.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
      expect(await shownLines(body)).toBeGreaterThanOrEqual(14);

      // Web addresses in the problem and in a comment are links that open in a new tab.
      await expectOpensInNewTab(page, problem.getByRole("link", { name: new RegExp(`^${PROBLEM_LINK}`) }), PROBLEM_LINK);
      await expectOpensInNewTab(page, conversation.getByRole("link", { name: new RegExp(`^${COMMENT_LINK}`) }), COMMENT_LINK);

      // Release evidence too: recorded from the Done step, its address is a link in the Measuring step.
      await journey(page).getByRole("button", { name: "Record release", exact: true }).click();
      const form = journeyPopup(page, "Record release");
      await pickEarliestReleaseDay(page, form);
      await form.getByLabel("Release evidence", { exact: true }).fill(`Rollout log ${EVIDENCE_LINK}`);
      await form.getByRole("checkbox", { name: "The agreed audience received this work" }).check();
      await form.getByRole("button", { name: "Mark as released", exact: true }).click();
      await expect(form).toHaveCount(0);
      const measuring = journeyStep(page, "Measuring", "current step");
      await expect(measuring).toBeVisible({ timeout: 20_000 });
      await expectOpensInNewTab(page, measuring.getByRole("link", { name: new RegExp(`^${EVIDENCE_LINK}`) }), EVIDENCE_LINK);
      await page.screenshot({ path: test.info().outputPath("281-pane-1440.png"), fullPage: true });
    });
  });

  test("an open Priority or Status menu leaves nothing behind it reachable by Tab (B37), and Priority reads as text once the work is picked up (B33)", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await withWorkspace(page, "menus", async user => {
      const id = await seedRequest(user.id, "Checkout keeps the saved card", { priority: "medium" });
      await openRequest(page, id);
      const properties = page.getByRole("complementary", { name: "Properties", exact: true });

      // Open: Priority is a menu, and so is Status.
      await properties.getByRole("combobox", { name: "Priority: Medium" }).click();
      await expectNothingReachableBehind(page, "listbox");
      await properties.getByRole("button", { name: "Status: Open. Change status" }).click();
      await expectNothingReachableBehind(page, "menu");

      // In progress: Priority reads as text.
      await properties.getByRole("button", { name: "Status: Open. Change status" }).click();
      await page.getByRole("menu", { name: "Change status" }).getByRole("menuitem", { name: "Pick up" }).click();
      const priority = properties.locator("[data-detail-priority]");
      await expect(properties.getByRole("button", { name: /^Status: In progress/ })).toBeVisible({ timeout: 20_000 });
      await expect(priority).toHaveText("Medium");
      await expect(properties.getByRole("combobox", { name: /^Priority/ })).toHaveCount(0);

      // Done, and after a reload: still there, still text.
      await page.locator('[data-slot="request-lifecycle-actions"]:visible').getByRole("button", { name: "Mark Done", exact: true }).click();
      await answerIsItLive(page, "not yet");
      await expect(journeyStep(page, "Done", "current step")).toBeVisible({ timeout: 20_000 });
      await expect(priority).toHaveText("Medium");
      await page.reload();
      await expect(properties.locator("[data-detail-priority]")).toHaveText("Medium");
      await expect(properties.getByRole("combobox", { name: /^Priority/ })).toHaveCount(0);
    });
  });

  test("when copying the link fails, the message shows the link in a read-only field to select (B34)", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    // The browser refuses the clipboard, as the walk's test browser did.
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new DOMException("Clipboard blocked", "NotAllowedError")) } }));
    await withWorkspace(page, "copy", async user => {
      const id = await seedRequest(user.id, "Checkout keeps the saved card");
      await openRequest(page, id);
      await page.locator('[data-slot="page-strip"]').getByRole("button", { name: "Copy link", exact: true }).click();

      const message = toastRegion(page).locator("li").filter({ hasText: "Couldn’t copy" });
      await expect(message).toContainText("Select the link and copy it instead.");
      const field = message.getByRole("textbox", { name: "Link", exact: true });
      const link = new URL(`/requests/${id}`, page.url()).href;
      await expect(field).toHaveValue(link);
      await expect(field).not.toBeEditable();
      // Focusing the field selects the whole link, ready to copy.
      await field.focus();
      expect(await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, link.length]);
      await page.screenshot({ path: test.info().outputPath("281-copy-failed-1440.png") });
      // The message waits until it's closed, so there's time to copy by hand.
      await page.keyboard.press("Tab");
      await page.waitForTimeout(9_000);
      await expect(field).toBeVisible();
      await message.getByRole("button", { name: "Dismiss notification" }).click();
      await expect(message).toHaveCount(0);
    });
  });

  test("on a 390px phone, taps are at least 44px (B29) and messages never cover an open popup (B30)", async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" });
    const page = await context.newPage();
    try {
      await withWorkspace(page, "phone", async user => {
        const id = await seedRequest(user.id, "Checkout keeps the saved card", { noMeasurableImpact: true });
        await openRequest(page, id);
        const strip = page.locator('[data-slot="page-strip"]');
        const lifecycle = page.locator('[data-slot="request-lifecycle-actions"]:visible');

        // B29: every control the walk measured at 26px is at least 44px to tap.
        const taps = [
          strip.getByRole("link", { name: "Back to Requests", exact: true }),
          strip.getByRole("button", { name: "Edit Request", exact: true }),
          strip.getByRole("button", { name: "Delete Request", exact: true }),
          strip.getByRole("button", { name: "More actions", exact: true }),
          lifecycle.getByRole("button", { name: "Pick up", exact: true }),
          page.getByRole("button", { name: "Link a Request", exact: true }),
          page.getByRole("button", { name: "Post comment", exact: true }),
        ];
        for (const tap of taps) {
          await tap.scrollIntoViewIfNeeded();
          const box = await tap.boundingBox();
          expect(box, `${tap}`).not.toBeNull();
          expect(Math.round(box!.height), `${tap} height`).toBeGreaterThanOrEqual(44);
          expect(Math.round(box!.width), `${tap} width`).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: test.info().outputPath("281-phone-strip-390-dark.png") });

        // B30: Mark Done's message sits at the bottom; once the Properties bottom panel opens, it moves to the top
        // and covers none of the panel.
        await lifecycle.getByRole("button", { name: "Pick up", exact: true }).click();
        await lifecycle.getByRole("button", { name: "Mark Done", exact: true }).click();
        const message = toastRegion(page).locator("li").filter({ hasText: "is now Done." });
        await expect(message).toBeVisible({ timeout: 20_000 });
        expect((await message.boundingBox())!.y).toBeGreaterThan(844 / 2);
        await page.locator("[data-detail-state-line]").click();
        const panel = page.getByRole("dialog", { name: "Properties", exact: true });
        await expect(panel).toBeVisible();
        await expect.poll(async () => (await message.boundingBox())?.y ?? 844).toBeLessThan(844 / 4);
        const [toastBox, panelBox] = await Promise.all([message.boundingBox(), panel.boundingBox()]);
        expect(toastBox!.y + toastBox!.height, "the message ends above the panel").toBeLessThanOrEqual(panelBox!.y);
        await page.screenshot({ path: test.info().outputPath("281-phone-message-over-panel-390-dark.png") });
        // Closed, the message goes back to the bottom.
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await expect.poll(async () => (await message.boundingBox())?.y ?? 0).toBeGreaterThan(844 / 2);
      });
    } finally {
      await context.close();
    }
  });
});
