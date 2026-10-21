import { expect, test } from "@playwright/test";
import {
  createAgreementTeam,
  createRequestThroughIntake,
  prepareAgreementThroughUI,
  agreeThroughUI,
} from "./helpers/agreement";

test("three real participants agree, withdraw, recover and supersede across responsive themes", async ({
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
        await prepareAgreementThroughUI(team);
        await page.reload();
        await expect(
          page.getByRole("link", { name: "Agreement blocked", exact: true }),
        ).toBeVisible();
        await agreeThroughUI(team, path);
        await expect(
          page.getByText("All three participants agree", { exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Pick up", exact: true })
          .click();
        const developer = team.pages[2];
        await developer.reload();
        const agreement = developer.getByRole("region", {
          name: "Agreement",
          exact: true,
        });
        await agreement
          .getByRole("textbox", { name: "Reason or resolution" })
          .fill("Recovery API is unavailable");
        await agreement
          .getByRole("button", { name: "Withdraw agreement" })
          .click();
        await developer.reload();
        await expect(agreement).toContainText("Recovery API is unavailable");
        await expect(
          developer.getByRole("button", { name: "Mark Done", exact: true }),
        ).toHaveCount(0);
        await agreement
          .getByRole("textbox", { name: "Reason or resolution" })
          .fill("Recovery API verified with evidence");
        await agreement
          .getByRole("button", { name: "Record resolution" })
          .click();
        await agreement
          .getByRole("button", { name: "Agree as Developer" })
          .click();
        await page.reload();
        await page
          .getByRole("button", { name: "Mark Done", exact: true })
          .click();
        await page.reload();
        const original = page.getByRole("region", {
          name: "Agreement",
          exact: true,
        });
        await original
          .getByText("Corrections and material changes", { exact: true })
          .click();
        await original
          .getByRole("textbox", { name: "Reason or resolution" })
          .fill("New scope requires a different delivery commitment");
        await original
          .getByRole("button", { name: "Create linked replacement" })
          .click();
        await page.waitForURL(
          (url) =>
            url.pathname !== path && url.pathname.startsWith("/requests/"),
        );
        const replacementPath = new URL(page.url()).pathname;
        const replacement = page.getByRole("region", {
          name: "Agreement",
          exact: true,
        });
        await replacement
          .getByRole("textbox", { name: "Included scope" })
          .fill("Checkout recovery and refund confirmation");
        await replacement
          .getByRole("button", { name: "Save preparation" })
          .click();
        await expect(replacement).toContainText(
          "Changed fields: Included scope",
        );
        await page.goto(path);
        await original
          .getByText("Corrections and material changes", { exact: true })
          .click();
        await original
          .getByRole("textbox", { name: "Reason or resolution" })
          .fill("Use the revised scope");
        await original
          .getByRole("button", { name: "Confirm original as Superseded" })
          .click();
        await page.reload();
        await expect(original).toContainText(
          "Superseded · Exception excluded from measured impact",
        );
        await expect(
          original.getByRole("button", { name: /Agree as/ }),
        ).toHaveCount(0);
        await page.goto(replacementPath);
        await expect(
          replacement.getByRole("button", { name: "Request agreement" }),
        ).toBeEnabled();
        await expect(
          page.getByRole("button", { name: "Pick up", exact: true }),
        ).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await testInfo.attach(`${width}-${colorScheme}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }
  } finally {
    await team.close(testInfo);
  }
});
