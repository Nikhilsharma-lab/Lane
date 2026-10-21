import { expect, test } from "@playwright/test";
import {
  createAgreementTeam,
  createRequestThroughIntake,
  addReviewerThroughUI,
} from "./helpers/agreement";

test("reviewers answer without blocking pickup; the list is read-only after; an unwanted Request is deleted before pickup", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  const team = await createAgreementTeam(browser, page);
  try {
    for (const width of [1440, 390])
      for (const colorScheme of ["light", "dark"] as const) {
        for (const participant of team.pages) {
          await participant.setViewportSize({ width, height: 900 });
          await participant.emulateMedia({ colorScheme });
        }
        const request = await createRequestThroughIntake(
          team,
          `${width} ${colorScheme}: checkout recovery`,
        );
        const path = `/requests/${request.id}`;
        await addReviewerThroughUI(team, "Agreement Designer");
        await addReviewerThroughUI(team, "Agreement Developer");

        // A concern needs a reason; the designer says it looks good.
        const developer = team.pages[2];
        await developer.goto(path);
        const developerPanel = developer.getByRole("region", { name: "Reviewers", exact: true });
        await developerPanel.getByRole("button", { name: "Raise a concern" }).click();
        await developerPanel.getByLabel("What concerns you?").fill("Recovery API is unavailable");
        await developerPanel.getByRole("button", { name: "Raise concern", exact: true }).click();
        await expect(developerPanel).toContainText("Recovery API is unavailable");
        const designer = team.pages[1];
        await designer.goto(path);
        const designerPanel = designer.getByRole("region", { name: "Reviewers", exact: true });
        await designerPanel.getByRole("button", { name: "Looks good", exact: true }).click();
        await expect(designerPanel.getByRole("listitem").filter({ hasText: "Agreement Designer" })).toContainText("Looks good");

        // Reviews never block pickup; afterwards the list is a record.
        await page.goto(path);
        await page.getByRole("button", { name: "Pick up", exact: true }).click();
        await page.reload();
        const reviewers = page.getByRole("region", { name: "Reviewers", exact: true });
        await expect(reviewers).toContainText("Recovery API is unavailable");
        await expect(reviewers.getByRole("button")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Delete Request" })).toHaveCount(0);

        // An unwanted Request is deleted before pickup, for good.
        const unwanted = await createRequestThroughIntake(team, `${width} ${colorScheme}: not needed`);
        await page.goto(`/requests/${unwanted.id}`);
        await page.getByRole("button", { name: "Delete Request" }).click();
        await page.getByRole("button", { name: "Delete Request", exact: true }).last().click();
        await page.waitForURL((url) => url.pathname === "/");
        await page.goto(`/requests/${unwanted.id}`);
        await expect(page.getByText(/can’t be opened|unavailable/i).first()).toBeVisible();

        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        await page.goto(path);
        await testInfo.attach(`${width}-${colorScheme}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }
  } finally {
    await team.close(testInfo);
  }
});
