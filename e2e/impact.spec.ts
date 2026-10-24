import { test } from "@playwright/test";
import { createReviewTeam, createRequestThroughIntake } from "./helpers/reviewers";
import { signInTestUser } from "./helpers/test-user";
import { impactSurfaces, verifyImpactEmptyAndTeammate, verifyImpactMyWork } from "./helpers/impact";

// Standard owned fixtures remain intact. A bounded external acceptance recipe
// can reuse these same UI checks with separately authorized existing identities.
test("Impact preserves real Request lists, empty work, teammate selection and keyboard filters", async ({ browser, page }, testInfo) => {
  test.setTimeout(480_000);
  const team = await createReviewTeam(browser, page);
  try {
    const title = "Impact acceptance: recover checkout details";
    const request = await createRequestThroughIntake(team, title);
    const requests = [{ id: request.id, title, journey: "Open" }];
    for (const surface of impactSurfaces) {
      const context = await browser.newContext({
        viewport: { width: surface.width, height: 900 }, colorScheme: surface.colorScheme,
      });
      try {
        const owner = await context.newPage();
        await signInTestUser(owner, team.users[0], team.orgId);
        await verifyImpactMyWork(owner, requests, async name => {
          await testInfo.attach(`${surface.width}-${surface.colorScheme}-${name}`, { body: await owner.screenshot(), contentType: "image/png" });
        });
      } finally { await context.close(); }

      const emptyContext = await browser.newContext({
        viewport: { width: surface.width, height: 900 }, colorScheme: surface.colorScheme,
      });
      try {
        const designer = await emptyContext.newPage();
        await signInTestUser(designer, team.users[1], team.orgId);
        await verifyImpactEmptyAndTeammate(designer, {
          viewerId: team.users[1].id, personId: team.users[0].id, personName: "Review PM", requests,
        }, async name => {
          await testInfo.attach(`${surface.width}-${surface.colorScheme}-${name}`, { body: await designer.screenshot(), contentType: "image/png" });
        });
      } finally { await emptyContext.close(); }
    }
  } finally { await team.close(testInfo); }
});
