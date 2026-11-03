import { expect, type APIResponse, type Locator, type Page, type Request, type Route } from "@playwright/test";
import { journey } from "./journey";
import { compiledJourneyRead } from "./server-action-identity";

function hasJourneyArguments(request: Request, requestId: string, orgId: string) {
  if (request.method() !== "POST" || !request.headers()["next-action"]) return false;
  try {
    const args: unknown = JSON.parse(request.postData() ?? "null");
    return Array.isArray(args) && args.length === 2 && args[0] === requestId &&
      typeof args[1] === "object" && args[1] !== null && args[1].orgId === orgId;
  } catch { return false; }
}

/** The running build's journey read (its manifest, never a checked-in action ID), checked on a real response. */
export async function observeJourneyReads(page: Page, requestId: string, orgId: string) {
  const { id: actionId } = await compiledJourneyRead();
  // Finish leaving the previous document before listening: a same-URL reload
  // can otherwise capture its in-flight read, whose CDP response body is gone.
  await page.goto("about:blank");
  // The page's Flight reader can stop before the end of the response, and the browser then keeps no body to read
  // back (Network.getResponseBody: "No data found"), so the first read's body is taken as it passes, then delivered.
  const initial = Promise.withResolvers<{ response: APIResponse; body: string }>();
  const capture = async (route: Route) => {
    if (route.request().headers()["next-action"] !== actionId || !hasJourneyArguments(route.request(), requestId, orgId)) return route.continue();
    try {
      const fetched = await route.fetch();
      initial.resolve({ response: fetched, body: await fetched.text() });
      await route.fulfill({ response: fetched });
    } catch (error) { initial.reject(error); }
  };
  await page.route("**/requests/**", capture);
  let read: Awaited<typeof initial.promise>;
  try {
    await page.goto(`/requests/${requestId}`);
    read = await initial.promise;
  } finally { await page.unroute("**/requests/**", capture); }
  const { response, body } = read;
  expect(response.ok()).toBe(true);
  // The two standalone reads have the same arguments. Only the combined action
  // returns both projections and the shared roster state in one Flight response.
  expect(body).toContain('"release":');
  expect(body).toContain('"outcome":');
  expect(body).toContain('"rosterUnavailable":');
  await expect(journey(page).getByRole("button", { name: "Correct release", exact: true })).toBeVisible();
  const matches = (request: Request) => request.headers()["next-action"] === actionId &&
    hasJourneyArguments(request, requestId, orgId);
  let count = 0;
  const record = (request: Request) => { if (matches(request)) count++; };
  page.on("request", record);
  return {
    matches,
    count: () => count,
    stop: () => page.off("request", record),
    async focusRefresh() {
      const before = count;
      const next = page.waitForResponse(response => matches(response.request()));
      await dispatchWindowReturn(page);
      // Its status, not finished(): the page's Flight reader may stop before the response's end (see above).
      expect((await next).ok()).toBe(true);
      await page.waitForTimeout(300);
      expect(count).toBe(before + 1);
    },
  };
}
export type JourneyReads = Awaited<ReturnType<typeof observeJourneyReads>>;

/** Exercise the window-return handler; this does not impersonate an OS focus event. */
export async function dispatchWindowReturn(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

export async function expectOpenFormSurvivesReturn(page: Page, reads: JourneyReads, field: Locator, value: string) {
  await field.focus();
  const before = reads.count();
  await dispatchWindowReturn(page);
  // A bounded observation window catches accidental reads; the callers first
  // establish a successful closed-form refresh as the positive control.
  await page.waitForTimeout(300);
  expect(reads.count()).toBe(before);
  await expect(field).toHaveValue(value);
  await expect(field).toBeFocused();
  await expect(journey(page).getByRole("alert")).toHaveCount(0);
}

/** Delay delivery, not execution: the response and saved facts remain real. */
export async function holdNextJourneyRead(page: Page, reads: JourneyReads) {
  let claimed = false;
  let response: APIResponse | undefined;
  let failure: unknown;
  let finished = false;
  const delivery = Promise.withResolvers<void>();
  const handler = async (route: Route) => {
    if (claimed || !reads.matches(route.request())) return route.continue();
    claimed = true;
    try {
      response = await route.fetch();
      await delivery.promise;
      await route.fulfill({ response });
    } catch (error) {
      failure = error;
    } finally { finished = true; }
  };
  await page.route("**/requests/**", handler);
  return {
    async received() {
      await expect.poll(() => Boolean(response) || Boolean(failure), { timeout: 30_000 }).toBe(true);
      if (failure) throw failure;
      if (!response) throw new Error("The held Journey read did not return a response.");
      expect(response.ok()).toBe(true);
      return response.text();
    },
    async deliver() {
      const arrived = page.waitForResponse(response => reads.matches(response.request()));
      delivery.resolve();
      await expect.poll(() => finished, { timeout: 30_000 }).toBe(true);
      if (failure) throw failure;
      // Its status, not finished(), which can wait forever on a read the page stopped reading (see above).
      expect((await arrived).ok()).toBe(true);
      // Give React a turn to apply (or reject) the actual delivered response.
      await page.waitForTimeout(300);
    },
    async stop() {
      delivery.resolve();
      await page.unroute("**/requests/**", handler);
    },
  };
}

export async function saveReleaseCorrection(page: Page, evidence: string) {
  const panel = journey(page);
  await panel.getByRole("button", { name: "Correct release", exact: true }).click();
  await panel.getByLabel("Release evidence", { exact: true }).fill(evidence);
  await panel.getByLabel("Correction reason").fill("Acceptance: corrected exposure evidence in another tab");
  await panel.getByRole("checkbox", { name: "The agreed audience received this work" }).check();
  await panel.getByRole("button", { name: "Save correction", exact: true }).press("Enter");
  await expect(panel.getByText(`Evidence: ${evidence}`, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole("heading", { name: "Journey", exact: true })).toBeFocused();
}
