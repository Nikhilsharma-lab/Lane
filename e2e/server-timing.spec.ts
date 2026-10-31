import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// #265: Lane records where a signed-in page's server time goes. With LANE_SERVER_TIMING_HEADER=1 the page's
// response (and the Request preview's read route) carries the steps as a Server-Timing header, which the browser
// exposes in its navigation timing; with the switch off it carries none. Either way the timings name only the
// route pattern and the steps, never an id, name, email, title or workspace.
//
// The switch is the app server's, so this spec checks whichever state the server was started in. Run it twice:
// once with LANE_SERVER_TIMING_HEADER=1 in the shell (Playwright passes it to the server it starts), once without.
const switchOn = process.env.LANE_SERVER_TIMING_HEADER === "1";

const STEP_NAMES = ["proxy", "route", "cold", "session", "workspace", "shell", "data", "clerk", "render"];
const ROUTE_NAMES = ["Requests list", "Request page", "Settings: Profile", "Request preview"];

type Seen = { header: string | null; timing: { name: string; duration: number; description: string }[] };

/** A full load of `path`, as a person opening it: the response's header and what the browser's navigation timing holds. */
async function open(page: Page, path: string): Promise<Seen> {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return nav.serverTiming.map(({ name, duration, description }) => ({ name, duration, description }));
  });
  return { header: (await response!.allHeaders())["server-timing"] ?? null, timing };
}

test(`a signed-in page's response ${switchOn ? "carries" : "leaves out"} the server timing steps, and never anyone's data`, async ({ page }) => {
  test.setTimeout(240_000);
  const user = await createTestUser("server-timing");
  const personName = "Timing Check PM";
  const workspaceName = "Lane E2E Server timing";
  const title = "Server timing check Request";
  try {
    const orgId = await provisionAndSignIn(page, user, { name: personName, workspaceName, role: "pm" });
    const { id: requestId } = await seedTestRequest(user.id, title);
    const secrets = [requestId, orgId, user.id, user.email, personName, workspaceName, title, "lane-e2e"];

    const pages: [string, string][] = [["/", "Requests list"], [`/requests/${requestId}`, "Request page"], ["/settings/profile", "Settings: Profile"]];
    for (const [path, route] of pages) {
      const seen = await open(page, path);
      if (!switchOn) {
        expect(seen.header, `${path} has no Server-Timing header`).toBeNull();
        expect(seen.timing, `${path} shows no server timing`).toEqual([]);
        continue;
      }
      expect(seen.header, `${path} has a Server-Timing header`).not.toBeNull();
      const names = seen.timing.map(entry => entry.name);
      // The session checks, the workspace lookup and the render are on every signed-in page's critical path.
      for (const step of ["proxy", "session", "workspace", "render"]) expect(names, `${path} times ${step}`).toContain(step);
      expect(seen.timing.find(entry => entry.name === "route")?.description, `${path} names its route pattern`).toBe(route);
      for (const entry of seen.timing) {
        expect(STEP_NAMES, `${path}: ${entry.name} is a known step`).toContain(entry.name);
        expect(entry.description === "" || ROUTE_NAMES.includes(entry.description), `${path}: "${entry.description}" is a route pattern`).toBe(true);
        expect(entry.duration, `${path}: ${entry.name} has a duration`).toBeGreaterThanOrEqual(0);
      }
      for (const secret of secrets) expect(seen.header, `${path}'s header holds no ${secret}`).not.toContain(secret);
    }

    // The Request preview's read route, as the list's preview calls it.
    const preview = await page.evaluate(async ([id, org]) => {
      const response = await fetch(`/api/requests/${id}?org=${org}`);
      return { status: response.status, header: response.headers.get("server-timing") };
    }, [requestId, orgId]);
    expect(preview.status).toBe(200);
    if (!switchOn) {
      expect(preview.header, "the preview's read has no Server-Timing header").toBeNull();
    } else {
      expect(preview.header).toContain('route;desc="Request preview"');
      expect(preview.header).toMatch(/session;dur=[\d.]+/);
      expect(preview.header).toMatch(/data;dur=[\d.]+/);
      for (const secret of secrets) expect(preview.header, `the preview's header holds no ${secret}`).not.toContain(secret);
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
