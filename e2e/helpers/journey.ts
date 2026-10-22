import { expect, type Page } from "@playwright/test";
import { IS_IT_LIVE_COPY } from "../../src/components/requests/is-it-live";

// #127 journey helpers: the "Is it live?" prompt after Mark Done (#135), the
// Request page's timeline (#134) and the row's due tag (#133).

/** The "Is it live?" question, asked after a successful single-Request Mark Done. */
export const isItLivePrompt = (page: Page) =>
  page.getByRole("dialog", { name: IS_IT_LIVE_COPY.title, exact: true });

/** The prompt's release step, after "Yes, record release". */
export const isItLiveRelease = (page: Page) =>
  page.getByRole("dialog", { name: IS_IT_LIVE_COPY.releaseTitle, exact: true });

/** The Request page's timeline: Open → In progress → Done → Measuring → Closed. */
export const journey = (page: Page) =>
  page.getByRole("region", { name: "Journey", exact: true });

/** One timeline step, by its label and state ("current step", "finished", "not reached yet", "skipped"). */
export const journeyStep = (page: Page, label: string, state: string) =>
  journey(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: `${label} (${state})`, exact: true }) });

/** Asserts the question and its copy, then answers it. */
export async function answerIsItLive(page: Page, answer: "not yet" | "yes") {
  const prompt = isItLivePrompt(page);
  await expect(prompt).toBeVisible({ timeout: 20_000 });
  await expect(prompt).toContainText(/ is Done\. Has the agreed audience received it\?/);
  await expect(prompt.getByText(IS_IT_LIVE_COPY.endsUndo, { exact: true })).toBeVisible();
  const button = answer === "yes" ? IS_IT_LIVE_COPY.yes : IS_IT_LIVE_COPY.notYet;
  await prompt.getByRole("button", { name: button, exact: true }).click();
  if (answer === "not yet") await expect(prompt).toHaveCount(0);
}

/** Records today's release in the prompt's release step and waits for its confirmation. */
export async function recordReleaseInPrompt(page: Page, evidence: string) {
  const form = isItLiveRelease(page);
  const today = new Date().toISOString().slice(0, 10);
  await expect(form.getByLabel("Actual exposure date (UTC)")).toHaveValue(today);
  await expect(form.getByText(IS_IT_LIVE_COPY.endsUndo, { exact: true })).toBeVisible();
  await form.getByLabel("Release evidence", { exact: true }).fill(evidence);
  await form.getByRole("checkbox", { name: "The agreed audience received this work" }).check();
  await form.getByRole("button", { name: "Mark as released", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("region", { name: /^Messages/ })).toContainText("Release recorded");
}
