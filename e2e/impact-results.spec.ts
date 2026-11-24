import { expect, test } from "@playwright/test";
import { cleanupTestWorkspace } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { releaseAndClose, seedPickedUp } from "./helpers/impact-results";

// #282 (Build 7.1, spec #256 "Impact result wording" and "Chart presenter"; walk finding C2-2): Impact says how each
// result compares with its goal, and the Outcome report's chart shows Request numbers, a value on every bar and a
// three-item legend. A hosted run can't reach a result's date, so each Request was picked up weeks ago (seeded),
// released on its pickup day and closed through the Journey, as `request-closing.spec.ts` does.

const quarterKey = (day: Date) => `${day.getUTCFullYear()}-q${Math.floor(day.getUTCMonth() / 3) + 1}`;

test("Impact words results against the goal, and the chart shows Request numbers, values and a three-item legend", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const user = await createTestUser("impact-results");
  try {
    await provisionAndSignIn(page, user, { name: "Impact Tester", workspaceName: "#282 Impact results" });
    const short = await seedPickedUp(user.id, "Keep the card on file");
    const past = await seedPickedUp(user.id, "Remember the address");
    await releaseAndClose(page, short.id, "75");
    await releaseAndClose(page, past.id, "84");

    // My work: each result against its goal, the goal as its end value, and no total of any kind.
    await page.goto("/impact");
    const myWork = page.getByRole("tabpanel", { name: "My work", exact: true });
    await expect(myWork).toContainText("Goal80% (from 62%)");
    await expect(myWork).toContainText("ResultReached 75%, 5 points short of the goal");
    await expect(myWork).toContainText("ResultReached 84%, 4 points past the goal");
    await expect(myWork).toContainText("Before release62%");
    await expect(myWork).not.toContainText(/total|average|rank|Planning baseline|Predicted|percentage points/i);

    // Outcome report for the quarter they were released in.
    await page.goto(`/impact?tab=outcome-report&period=${quarterKey(short.pickedUp)}`);
    const report = page.getByRole("tabpanel", { name: "Outcome report", exact: true });
    const totals = report.getByRole("region", { name: "Totals", exact: true });
    const line = totals.getByRole("article", { name: /^Conversion rate, %, / });
    await expect(line).toBeVisible({ timeout: 30_000 });

    // C2-2: the chart says each Request's code, title, values and goal in words, with no space before a percent sign.
    const chart = line.getByRole("img");
    await expect(chart).toHaveAccessibleName(
      `Conversion rate, 14 days after release. ${short.code} Keep the card on file: before release 62%, result 75%, goal 80% (from 62%). `
      + `${past.code} Remember the address: before release 62%, result 84%, goal 80% (from 62%).`,
    );
    // Every group is labelled with its Request number underneath, and every bar shows its value.
    const figure = line.locator("figure");
    await expect(figure.getByText(short.code, { exact: true })).toBeVisible();
    await expect(figure.getByText(past.code, { exact: true })).toBeVisible();
    for (const value of ["62%", "75%", "80%", "84%"]) await expect(figure.getByText(value, { exact: true }).first()).toBeVisible();
    await expect(figure.getByText("62%", { exact: true })).toHaveCount(2);
    await expect(figure.getByText("80%", { exact: true })).toHaveCount(2);
    // The three-item legend, in Lane's words.
    await expect(figure.getByRole("listitem")).toHaveText(["Before release", "Result", "Goal"]);
    // A clear gap between groups: the second group's first bar starts well after the first group's last bar ends.
    const [firstCode, secondCode] = await Promise.all([figure.getByText(short.code, { exact: true }).boundingBox(), figure.getByText(past.code, { exact: true }).boundingBox()]);
    expect(secondCode!.x).toBeGreaterThan(firstCode!.x + firstCode!.width);
    // A fixed, modest height, however wide the page.
    const height = (await chart.boundingBox())!.height;
    expect(height).toBeLessThan(260);
    // #158: the bars grow in, and with motion turned down on the device they are simply there.
    const bar = figure.locator("[data-series=result]").first();
    expect(await bar.evaluate(node => getComputedStyle(node).animationName)).not.toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await bar.evaluate(node => getComputedStyle(node).animationName)).toBe("none");
    await page.emulateMedia({ reducedMotion: null });

    // Beside the line, each counted result reads against its goal.
    await expect(line).toContainText("Keep the card on file: Reached 75%, 5 points short of the goal");
    await expect(line).toContainText("Remember the address: Reached 84%, 4 points past the goal");
    await expect(report).toContainText("ResultReached 75%, 5 points short of the goal");
    await expect(report).not.toContainText(/Planning baseline|Predicted|Actual\s?\d|Verified:|good,/);
    await line.screenshot({ path: testInfo.outputPath("outcome-report-chart-1440.png") });

    // On a phone the chart keeps its height and labels, and nothing scrolls sideways.
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(figure.getByText(past.code, { exact: true })).toBeVisible();
    expect((await chart.boundingBox())!.height).toBeCloseTo(height, -1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await line.screenshot({ path: testInfo.outputPath("outcome-report-chart-390.png") });
  } finally {
    // A recorded release or a closed Request can never be deleted, so its workspace stays in the test database;
    // its person's sessions and sign-in methods go either way (as in request-closing.spec.ts).
    await cleanupTestWorkspace(user.id).catch((error: unknown) => {
      if (!/^(Release history|Closed Request) is immutable$/.test(String((error as { message?: string }).message))) throw error;
    }).finally(() => deleteTestUser(user.id));
  }
});
