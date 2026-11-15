import { expect, test, type Page } from "@playwright/test";
import { addReviewerPopover, createReviewTeam, createRequestThroughIntake } from "./helpers/reviewers";
import { e2eDatabase } from "./helpers/cleanup";
import { holdNextAction } from "./helpers/held-action";

// #279 (Build 6.3, spec #256 "Reviewers"): adding and removing a reviewer, Looks good and Raise a concern show at once,
// before the server answers. Raise a concern opens in the Journey popup and Add reviewer is an Arc popover; once
// answered, the button reads Change answer and the reason is labelled "Concern:". Removing a reviewer offers Undo for
// 10 seconds, which puts them back exactly as they were (question and answer) and tells nobody.

const ACTIONS = "src/app/(app)/requests/[id]/reviewer-actions.ts";
const panelOf = (page: Page) => page.getByRole("region", { name: "Reviewers", exact: true });
const rowOf = (page: Page, name: string) => panelOf(page).getByRole("listitem").filter({ hasText: name });
const messages = (page: Page) => page.getByRole("region", { name: /^Messages/ });

/** Notifications about the Request written since `since`. */
async function notificationsSince(requestId: string, since: Date) {
  const sql = e2eDatabase();
  try {
    const [row] = await sql`select count(*)::int as count from notifications where request_id=${requestId} and created_at >= ${since}`;
    return row.count as number;
  } finally { await sql.end(); }
}

test("reviewers answer instantly: add, Looks good, Raise a concern and Change answer show at once; Undo puts a removed reviewer back exactly", async ({ browser, page }, testInfo) => {
  test.setTimeout(600_000);
  const team = await createReviewTeam(browser, page);
  try {
    for (const participant of team.pages) await participant.setViewportSize({ width: 1440, height: 900 });
    const request = await createRequestThroughIntake(team, "Reviewers answer instantly");
    const path = `/requests/${request.id}`;
    const [pm, designer, developer] = team.pages;

    // Add reviewer is a popover: both picked, one question, and the rows show before the server answers.
    const panel = panelOf(pm);
    await panel.getByRole("button", { name: "Add reviewer", exact: true }).click();
    const popover = addReviewerPopover(pm);
    for (const name of ["Review Designer", "Review Developer"])
      await popover.getByRole("option").filter({ has: pm.getByText(name, { exact: true }) }).click();
    await popover.getByLabel("Question (optional)").fill("Can we keep the card on file?");
    let held = await holdNextAction(pm, ACTIONS, "addReviewers");
    await popover.getByRole("button", { name: "Add 2 reviewers", exact: true }).click();
    await held.seen;
    await expect(popover).toHaveCount(0);
    await expect(rowOf(pm, "Review Designer")).toContainText("Waiting");
    await expect(rowOf(pm, "Review Developer")).toContainText("Asked: Can we keep the card on file?");
    await held.release();
    await expect(rowOf(pm, "Review Designer").getByRole("button", { name: "Remove Review Designer" })).toBeEnabled({ timeout: 20_000 });

    // The designer: Looks good is secondary (the strip's Pick up is the one main button) and shows at once.
    await designer.goto(path);
    const designerRow = rowOf(designer, "Review Designer");
    const looksGood = designerRow.getByRole("button", { name: "Looks good", exact: true });
    await expect(looksGood).not.toHaveClass(/primary/);
    await expect(looksGood).toHaveClass(/secondary/);
    held = await holdNextAction(designer, ACTIONS, "answerReview");
    await looksGood.click();
    await held.seen;
    await expect(designerRow).toContainText("Looks good");
    const change = designerRow.getByRole("button", { name: "Change answer", exact: true });
    await expect(change).toBeVisible();
    await expect(designerRow.getByRole("button", { name: "Raise a concern", exact: true })).toHaveCount(0);
    await held.release();
    await expect(change).toBeEnabled({ timeout: 20_000 });
    // Change answer opens the Journey popup, starting from the answer given.
    await change.click();
    const changing = designer.getByRole("dialog", { name: "Change answer", exact: true });
    await expect(changing.getByRole("radio", { name: "Looks good" })).toBeChecked();
    await changing.getByText("Raise a concern", { exact: true }).click();
    await changing.getByLabel("What concerns you?").fill("The saved card needs a consent line");
    held = await holdNextAction(designer, ACTIONS, "answerReview");
    await changing.getByRole("button", { name: "Save answer", exact: true }).click();
    await held.seen;
    await expect(changing).toHaveCount(0);
    await expect(designerRow).toContainText("Raised a concern");
    await expect(designerRow).toContainText("Concern: The saved card needs a consent line");
    await expect(change).toBeFocused();
    await held.release();
    await designer.reload();
    await expect(rowOf(designer, "Review Designer")).toContainText("Concern: The saved card needs a consent line");

    // The developer raises a concern from the Journey popup; it shows at once, labelled, and Change answer follows.
    await developer.goto(path);
    const developerRow = rowOf(developer, "Review Developer");
    await developerRow.getByRole("button", { name: "Raise a concern", exact: true }).click();
    const concern = developer.getByRole("dialog", { name: "Raise a concern", exact: true });
    await expect(concern.getByLabel("What concerns you?")).toBeFocused();
    await concern.getByLabel("What concerns you?").fill("Card storage needs the payments team");
    held = await holdNextAction(developer, ACTIONS, "answerReview");
    await concern.getByRole("button", { name: "Raise concern", exact: true }).click();
    await held.seen;
    await expect(developerRow).toContainText("Concern: Card storage needs the payments team");
    await expect(developerRow.getByRole("button", { name: "Change answer", exact: true })).toBeVisible();
    await held.release();
    await testInfo.attach("reviewer-answered", { body: await developer.screenshot({ fullPage: true }), contentType: "image/png" });

    // The PM removes the designer: gone at once, with Undo in the message; Undo puts back the same entry, question and
    // concern included, in its place, and nobody is told anything new.
    await pm.reload();
    await expect(rowOf(pm, "Review Designer")).toContainText("Concern: The saved card needs a consent line");
    const since = new Date();
    held = await holdNextAction(pm, ACTIONS, "removeReviewer");
    await rowOf(pm, "Review Designer").getByRole("button", { name: "Remove Review Designer" }).click();
    await held.seen;
    await expect(rowOf(pm, "Review Designer")).toHaveCount(0);
    await held.release();
    await expect(messages(pm)).toContainText("Reviewer removed", { timeout: 20_000 });
    await messages(pm).getByRole("button", { name: "Undo", exact: true }).click();
    await expect(messages(pm)).toContainText("Reviewer back", { timeout: 20_000 });
    const names = await panelOf(pm).getByRole("listitem").allTextContents();
    expect(names.map(text => text.includes("Review Designer") ? "Designer" : text.includes("Review Developer") ? "Developer" : text)).toEqual(["Designer", "Developer"]);
    await pm.reload();
    const back = rowOf(pm, "Review Designer");
    await expect(back).toContainText("Raised a concern");
    await expect(back).toContainText("Asked: Can we keep the card on file?");
    await expect(back).toContainText("Concern: The saved card needs a consent line");
    expect(await notificationsSince(request.id, since)).toBe(0);
    // The designer can still change their answer: they're the same reviewer.
    await designer.reload();
    await expect(rowOf(designer, "Review Designer").getByRole("button", { name: "Change answer", exact: true })).toBeVisible();
  } finally {
    await team.close(testInfo);
  }
});
