import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { compiledActionId } from "./helpers/held-action";
import { createTestUser, deleteTestUser, readTestSession, type TestUser } from "./helpers/test-user";
import { intakeDraftScope, intakeDraftStorageKey, type IntakeDraft } from "../src/lib/intake-draft";
import { createTriageToken } from "../src/lib/triage-token";

// #286 (Build 7.5, spec #256 "Instant Create Request" and "Names and titles"): with no files, Create closes the
// composer at once and the new row shows at the top of the Open group, marked as sending, under its typed title. It
// takes its saved number when the server answers. A save that doesn't land (a lost connection, going offline, a
// refusal) opens the composer again with everything typed and a plain message. C7: the row and Copy title use the
// typed title, never the Problem to solve.

const ACTIONS = "src/app/(app)/intake/actions.ts";
const OFFLINE_ANSWER = /You.re offline, this will work when you.re back/;

/** A reviewed draft this tab keeps, signed as the gate signs it, so Create runs the real save with no AI call. C opens
 * the composer on its review step. */
async function keepReviewedDraft(page: Page, user: TestUser, orgId: string, input: { title: string; problem: string; projectId?: string }) {
  const source = {
    title: input.title,
    description: "Please add a save-card button to checkout so customers stop retyping their details.",
    affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "",
    projectId: input.projectId ?? null, requestType: null,
    expectedImpact: {
      kind: "measurement" as const, version: 2 as const,
      primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target: 80, noBaseline: false, check: "" as const },
      measurement: { audience: "all" as const, platform: "web" as const, windowDays: 30 as const, exactDates: false, startDate: "", endDate: "" },
      guardrails: [],
    },
  };
  const triage = { classification: "hybrid" as const, reframedProblem: input.problem, extractedSolution: "A save-card button at checkout." };
  const draft: IntakeDraft = {
    version: 2, savedAt: Date.now(), source,
    review: { triage, token: createTriageToken(source, triage, { orgId, userId: user.id }), editedProblem: input.problem },
  };
  await page.goto("/");
  // The form saves the draft it starts with once it loads; the reviewed one goes in after that, and a reload reads it.
  await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 60_000 });
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: intakeDraftStorageKey(intakeDraftScope(user.id, orgId)), value: draft,
  });
  await page.reload();
  expect(await readTestSession(page)).toEqual({ userId: user.id, orgId });
  await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 60_000 });
  // One copy: just after a load, the list's streamed copy can still be in the page beside it, hidden.
  const openGroup = page.locator('[role="row"][data-grid-row="g:status:open"]');
  await expect(openGroup).toHaveCount(1, { timeout: 30_000 });
  await expect(openGroup).toBeVisible();
}

/** The page's next call of one server action (saveRequest by default), held until `settle` says what happens to it. */
async function holdSave(page: Page, filename = ACTIONS, exportedName = "saveRequest") {
  const action = await compiledActionId(filename, exportedName);
  const seen = Promise.withResolvers<void>();
  const answer = Promise.withResolvers<"send" | "lose" | "offline">();
  const done = Promise.withResolvers<void>();
  let claimed = false;
  const handler: Parameters<Page["route"]>[1] = async route => {
    if (claimed || route.request().method() !== "POST" || route.request().headers()["next-action"] !== action) return route.fallback();
    claimed = true;
    seen.resolve();
    const what = await answer.promise;
    try {
      if (what === "send") await route.continue();
      else await route.abort(what === "offline" ? "internetdisconnected" : "failed");
    } finally { done.resolve(); }
  };
  await page.route("**/*", handler);
  return {
    seen: seen.promise,
    async settle(what: "send" | "lose" | "offline") { answer.resolve(what); await done.promise; await page.unroute("**/*", handler); },
  };
}

/** The Request rows in the order the list shows them, the Open group's header among them. */
const gridRows = (page: Page) => page.locator('[role="row"][data-grid-row]');
/** The grid row right under the Open group's header, where a new Request shows. */
async function topOfOpen(page: Page) {
  const keys = await gridRows(page).evaluateAll(rows => rows.map(row => row.getAttribute("data-grid-row")));
  return keys[keys.indexOf("g:status:open") + 1];
}

test("instant Create: the row shows at once, sending, under its typed title, takes its number, and a failed save reopens the composer (#286)", async ({ page, context }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const user = await createTestUser("instant-create");
  try {
    const orgId = await provisionAndSignIn(page, user, { name: "Instant Filer", workspaceName: "Lane E2E Instant create", role: "pm" });
    await seedTestRequest(user.id, "An older Open Request");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const composer = page.getByRole("dialog", { name: "New Request", exact: true });
    const create = composer.getByRole("button", { name: "Create Request", exact: true });
    const sendingRows = page.getByRole("row", { name: /^Sending, / });

    await test.step("the row shows before the server answers, then takes its saved number (C7: under the typed title)", async () => {
      const title = "Saved cards at checkout";
      await keepReviewedDraft(page, user, orgId, { title, problem: "Customers retype their card details at every checkout." });
      await page.keyboard.press("c");
      await expect(create).toBeVisible({ timeout: 45_000 });
      const held = await holdSave(page);
      await create.click();
      await held.seen;
      // Closed at once, with the server still to answer.
      await expect(composer).toHaveCount(0);
      const sending = page.getByRole("row", { name: new RegExp(`^Sending, ${title}\\. Open`) });
      await expect(sending).toBeVisible();
      const key = await sending.getAttribute("data-grid-row");
      expect(await topOfOpen(page)).toBe(key);
      // The same row, from sending to saved.
      const row = page.locator(`[role="row"][data-grid-row="${key}"]`);
      await expect(row.getByRole("link", { name: title, exact: true })).toBeVisible();
      await expect(row).not.toContainText(/LAN-\d+/);
      await held.settle("send");
      await expect(row).toHaveAccessibleName(new RegExp(`^LAN-\\d+, ${title}\\. Open`), { timeout: 20_000 });
      await expect(page.getByText("Request created").first()).toBeVisible();
      await expect(sendingRows).toHaveCount(0);

      // C7: after filing, the row and Copy title read the typed title, not the Problem to solve.
      await page.reload();
      const saved = page.getByRole("row", { name: new RegExp(`^LAN-\\d+, ${title}\\. Open`) });
      await expect(saved).toBeVisible({ timeout: 30_000 });
      await expect(saved).not.toContainText("Customers retype their card details");
      await saved.click({ button: "right", position: { x: 4, y: 4 } });
      await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
      await page.getByRole("menuitem", { name: "Copy title", exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(title);
    });

    await test.step("a save that never arrives reopens the composer with the draft and a plain message", async () => {
      const title = "Lost connection keeps the draft";
      await keepReviewedDraft(page, user, orgId, { title, problem: "Customers lose their basket when the card fails." });
      await page.keyboard.press("c");
      await expect(create).toBeVisible({ timeout: 45_000 });
      const problem = composer.getByRole("textbox", { name: "Problem to solve" });
      await problem.fill("Customers lose their whole basket when a card is declined.");
      const held = await holdSave(page);
      await create.click();
      await held.seen;
      await expect(composer).toHaveCount(0);
      await expect(sendingRows).toHaveCount(1);
      await held.settle("lose");
      await expect(composer).toBeVisible({ timeout: 20_000 });
      await expect(composer.getByText("Request not created")).toBeVisible();
      await expect(composer.getByText("Your Request couldn’t be created. Your text is still here. Try again.")).toBeInViewport();
      await expect(composer.getByRole("heading", { name: title })).toBeVisible();
      await expect(problem).toHaveValue("Customers lose their whole basket when a card is declined.");
      await expect(sendingRows).toHaveCount(0);
    });

    await test.step("going offline while it sends reopens the composer saying so; Create again files it", async () => {
      const held = await holdSave(page);
      await create.click();
      await held.seen;
      await expect(composer).toHaveCount(0);
      await context.setOffline(true);
      await held.settle("offline");
      await expect(composer).toBeVisible({ timeout: 20_000 });
      await expect(composer.getByText(OFFLINE_ANSWER).first()).toBeInViewport();
      await expect(composer.getByRole("textbox", { name: "Problem to solve" })).toHaveValue("Customers lose their whole basket when a card is declined.");
      await expect(sendingRows).toHaveCount(0);
      await context.setOffline(false);
      await create.click();
      await expect(composer).toHaveCount(0);
      await expect(page.getByRole("row", { name: /^LAN-\d+, Lost connection keeps the draft\. Open/ })).toBeVisible({ timeout: 20_000 });
    });

    await test.step("a refusal (the Project went away) reopens the composer on the field it names", async () => {
      const sql = e2eDatabase();
      let projectId: string;
      try {
        [{ id: projectId }] = await sql`INSERT INTO projects (org_id, name, created_by) VALUES (${orgId}, 'Checkout', ${user.id}) RETURNING id`;
      } finally { await sql.end(); }
      const title = "Refused filing keeps the draft";
      await keepReviewedDraft(page, user, orgId, { title, problem: "Customers can't find saved cards.", projectId });
      await page.keyboard.press("c");
      await expect(create).toBeVisible({ timeout: 45_000 });
      const removal = e2eDatabase();
      try { await removal`DELETE FROM projects WHERE id = ${projectId}`; } finally { await removal.end(); }
      await create.click();
      await expect(composer).toBeVisible({ timeout: 20_000 });
      await expect(composer.getByText(/This Project is unavailable/).first()).toBeVisible({ timeout: 20_000 });
      await expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue(title);
      await expect(sendingRows).toHaveCount(0);
    });

    await test.step("with files, Create keeps the visible upload step", async () => {
      // Nothing was typed into the refused draft, so it closes without asking; a fresh page starts an empty composer.
      await page.keyboard.press("Escape");
      await expect(composer).toHaveCount(0);
      await page.evaluate(() => sessionStorage.clear());
      await page.goto("/");
      await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 60_000 });
      await page.keyboard.press("c");
      const title = "Files upload before the composer closes";
      // The composer puts focus on the title as it opens; typing before that lands wherever focus ends up.
      await expect(composer.getByRole("textbox", { name: "Request title", exact: true })).toBeFocused();
      await composer.getByRole("textbox", { name: "Request title", exact: true }).fill(title);
      await composer.getByRole("textbox", { name: "Description", exact: true }).fill("Customers cannot find the receipts they uploaded after returning to checkout.");
      await composer.getByRole("combobox", { name: "Metric", exact: true }).click();
      await page.getByRole("option", { name: "Conversion rate", exact: true }).click();
      await composer.getByRole("spinbutton", { name: "Current value", exact: true }).fill("62");
      await composer.locator('input[type="file"]').setInputFiles({ name: "receipt.txt", mimeType: "text/plain", buffer: Buffer.from("A receipt") });
      await expect(composer.getByRole("list", { name: "Files ready to upload" })).toContainText("receipt.txt");
      // The existing gate runs as it does for everyone.
      await composer.getByRole("button", { name: "Review Request", exact: true }).click();
      await expect(create).toBeVisible({ timeout: 45_000 });
      // The upload is held, then lost, so nothing reaches storage.
      const upload = await holdSave(page, "src/app/(app)/intake/attachment-actions.ts", "prepareAttachmentUpload");
      await create.click();
      await upload.seen;
      await expect(composer.getByRole("heading", { name: "Uploading files" })).toBeVisible();
      await expect(sendingRows).toHaveCount(0);
      await upload.settle("lose");
      await expect(composer.getByRole("heading", { name: "Some files weren’t uploaded" })).toBeVisible({ timeout: 20_000 });
      await composer.getByRole("button", { name: "Skip failed files", exact: true }).click();
      await expect(composer).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByRole("row", { name: new RegExp(`^LAN-\\d+, ${title}\\. Open`) })).toBeVisible({ timeout: 20_000 });
    });
  } finally {
    await context.setOffline(false);
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
