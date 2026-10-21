import { expect, test } from "@playwright/test";
import {
  createAgreementTeam,
  createRequestThroughIntake,
  addReviewerThroughUI,
} from "./helpers/agreement";

test("a reviewer added while creating raises a concern; pickup confirms, then goes ahead; the list is read-only after; an unwanted Request is deleted before pickup", async ({
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
        // #78: the developer is asked while the Request is created; the designer from detail.
        const request = await createRequestThroughIntake(
          team,
          `${width} ${colorScheme}: checkout recovery`,
          { reviewers: ["Agreement Developer"] },
        );
        const path = `/requests/${request.id}`;
        const created = page.getByRole("region", { name: "Reviewers", exact: true });
        await expect(created.getByRole("listitem").filter({ hasText: "Agreement Developer" })).toContainText("Waiting");
        await addReviewerThroughUI(team, "Agreement Designer");

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

        // Reviews never block pickup: the picker sees the open concern first, then picks up anyway.
        await page.goto(path);
        await page.getByRole("button", { name: "Pick up", exact: true }).click();
        const confirmation = page.getByRole("dialog", { name: "Pick up anyway?" });
        await expect(confirmation).toContainText("Agreement Developer raised a concern");
        await expect(confirmation).toContainText("Recovery API is unavailable");
        await confirmation.getByRole("button", { name: "Pick up anyway", exact: true }).click();
        await expect(confirmation).toHaveCount(0);
        // Afterwards the list is a record.
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
