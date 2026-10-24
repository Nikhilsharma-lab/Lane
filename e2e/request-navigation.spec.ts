import { expect, test } from "@playwright/test";
import { createReviewTeam, createRequestThroughIntake } from "./helpers/reviewers";
import { signInTestUser } from "./helpers/test-user";
import {
  createNavigationProject, navigationSurfaces, verifyDetailHistoryAndSearch,
  verifyNativeNavigation, verifyPendingNavigation, verifyProjectReselection, verifySupersededSearch,
  type NavigationRequest,
} from "./helpers/request-navigation";

// The production footer appears only above the default 25 rows. These are
// ordinary Intake saves using the existing signed-review seam, not seeded rows
// or injected React state. Retain confirmed IDs for inspection and later checks.
test("Requests navigation preserves list context, native links, history and the newest intent", async ({ browser, page }, testInfo) => {
  test.setTimeout(1_200_000);
  const team = await createReviewTeam(browser, page);
  try {
    const project = await createNavigationProject(page, "Navigation acceptance Project");
    await testInfo.attach("navigation-project", { body: JSON.stringify(project), contentType: "application/json" });
    const requests: NavigationRequest[] = [];
    const filter = "navigation owned";
    for (let index = 1; index <= 26; index++) {
      const title = `Navigation owned ${String(index).padStart(2, "0")}: recover checkout details`;
      const saved = await createRequestThroughIntake(team, title);
      const copy = page.getByRole("button", { name: /^Copy code LAN-/ });
      await expect(copy).toBeVisible();
      const code = (await copy.getAttribute("aria-label"))!.replace("Copy code ", "");
      const request = { id: saved.id, title, code };
      requests.push(request);
      await testInfo.attach(`saved-navigation-request-${index}`, {
        body: JSON.stringify({ ...request, url: page.url() }), contentType: "application/json",
      });
    }
    const fixture = { filter, requests, project };
    for (const surface of navigationSurfaces) {
      const context = await browser.newContext({ viewport: { width: surface.width, height: 900 }, colorScheme: surface.colorScheme });
      try {
        const viewer = await context.newPage();
        await signInTestUser(viewer, team.users[0], team.orgId);
        const capture = async (name: string) => {
          await testInfo.attach(`${surface.width}-${surface.colorScheme}-${name}`, { body: await viewer.screenshot(), contentType: "image/png" });
        };
        await verifyProjectReselection(viewer, fixture, capture);
        await verifyDetailHistoryAndSearch(viewer, fixture, capture);
        await verifyNativeNavigation(viewer, fixture, capture);
        await verifySupersededSearch(viewer, fixture, capture);
        if (surface.width === 1440 && surface.colorScheme === "light") {
          await verifyPendingNavigation(viewer, fixture, requests.at(-1)!, team.orgId, capture);
        }
      } finally { await context.close(); }
    }
  } finally { await team.close(testInfo); }
});
