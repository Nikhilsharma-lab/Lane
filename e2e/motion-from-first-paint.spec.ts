import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// Build 3 (lighter pages), Nikhil's rule: no animation looks or behaves differently at any moment after the first
// paint. A person who presses a button or moves a highlight the moment the page is up, before anything it fetches
// later could have arrived (a fast first tap on a slow phone, a key before the page is idle), sees exactly what they
// see once everything is in. Each fresh tab here holds back every script the page's HTML doesn't ask for, then
// presses "Save view" and moves the Request status highlight at once, and compares how they move frame by frame
// with a tab that had all the time it needed. With motion turned off neither moves at all.

type Sample = { t: number; value: number };
type SamplerWindow = Window & { __laneSamples?: Sample[]; __laneSampling?: boolean; __laneInputAt?: number };

const PRESSABLE = 'button[aria-label="Save view"]';
const THEME = '[role="group"][aria-label="Theme"]';
const HIGHLIGHT = `${THEME} button[aria-pressed="true"] > span[aria-hidden="true"]`;
/** Where each check happens: the Requests list's "Save view", and the theme choice's highlight in Settings. */
const PAGES = { press: { path: "/", query: "", ready: PRESSABLE }, highlight: { path: "/settings/profile", query: "?section=preferences", ready: `${THEME} button[aria-pressed="true"]` } };
type Check = keyof typeof PAGES;

type Viewport = { width: number; height: number };
/**
 * A fresh tab on the check's page. `holdLater` answers only the scripts the page's HTML asks for (its first load);
 * every other script waits until the tab closes, so nothing fetched after the first paint can help.
 */
async function open(context: BrowserContext, check: Check, viewport: Viewport, holdLater: boolean, reducedMotion: "reduce" | "no-preference" = "no-preference"): Promise<Page> {
  const { path, query, ready } = PAGES[check];
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const documentResponse = page.waitForResponse(response => response.request().isNavigationRequest() && new URL(response.url()).pathname === path);
  if (holdLater) {
    const html = documentResponse.then(response => response.text());
    const held: Route[] = [];
    await page.route(/\/_next\/static\/chunks\/.+\.js$/, async route => {
      if ((await html).includes(new URL(route.request().url()).pathname)) await route.continue();
      else held.push(route);
    });
    page.once("close", () => { for (const route of held) void route.abort().catch(() => {}); });
  }
  await page.goto(path + query, { waitUntil: "domcontentloaded" });
  // The control answers as soon as React has hydrated it (its next frame).
  await expect.poll(() => page.locator(ready).first().evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps$"))), { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page;
}

/** Samples `read` (run in the page) on every frame from now on; `stopSampling` returns them timed from the next press or key. */
async function startSampling(page: Page, read: string) {
  await page.evaluate(read => {
    const w = window as SamplerWindow;
    const value = new Function(`return (${read})()`) as () => number;
    w.__laneSamples = [];
    w.__laneSampling = true;
    w.__laneInputAt = undefined;
    const input = (event: Event) => { w.__laneInputAt ??= event.timeStamp; };
    addEventListener("pointerdown", input, { capture: true, once: true });
    addEventListener("keydown", input, { capture: true, once: true });
    const frame = (t: number) => {
      if (!w.__laneSampling) return;
      w.__laneSamples!.push({ t, value: value() });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, read);
}
async function stopSampling(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const w = window as SamplerWindow;
    w.__laneSampling = false;
    const startAt = w.__laneInputAt!;
    return w.__laneSamples!.filter(sample => sample.t >= startAt).map(sample => ({ t: sample.t - startAt, value: sample.value }));
  });
}

/** "Save view"'s scale on every frame of a 300 ms press that is never let go on the button. */
async function pressCurve(page: Page): Promise<Sample[]> {
  const button = page.getByRole("button", { name: "Save view", exact: true });
  const box = (await button.boundingBox())!;
  await startSampling(page, `() => {
    const transform = getComputedStyle(document.querySelector(${JSON.stringify(PRESSABLE)})).transform;
    return transform === "none" ? 1 : Number(/^matrix\\(([^,]+),/.exec(transform)[1]);
  }`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const samples = await stopSampling(page);
  // Let go away from the button, so the press is no click.
  await page.mouse.move(box.x + box.width / 2, box.y + 400);
  await page.mouse.up();
  return samples;
}

/**
 * The status theme choice's highlight: its distance from where it ends, on every frame for 600 ms after one arrow key, as a share of the
 * distance it moves (1 = still where it started, 0 = arrived).
 */
async function highlightCurve(page: Page): Promise<Sample[]> {
  const from = await page.locator(HIGHLIGHT).evaluate(element => element.getBoundingClientRect().left);
  await page.locator(`${THEME} button[aria-pressed="true"]`).focus();
  await startSampling(page, `() => document.querySelector(${JSON.stringify(HIGHLIGHT)})?.getBoundingClientRect().left ?? NaN`);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  const samples = await stopSampling(page);
  const to = await page.locator(HIGHLIGHT).evaluate(element => element.getBoundingClientRect().left);
  expect(Math.abs(to - from)).toBeGreaterThan(20);
  return samples.filter(sample => !Number.isNaN(sample.value)).map(sample => ({ t: sample.t, value: (sample.value - to) / (from - to) }));
}

/** The curve's value at time t, read between the two frames around it; NaN outside the frames sampled. */
function at(samples: Sample[], t: number) {
  const after = samples.findIndex(sample => sample.t >= t);
  if (after < 0) return NaN;
  if (after === 0) return samples[0].t === t ? samples[0].value : NaN;
  const a = samples[after - 1], b = samples[after];
  return a.value + (b.value - a.value) * (t - a.t) / (b.t - a.t);
}
/**
 * Both curves, every 16 ms through `until`, agree within `tolerance`, allowing one frame either way: where the input
 * lands inside a frame differs from tab to tab.
 */
function expectSameMotion(label: string, early: Sample[], loaded: Sample[], until: number, tolerance: number) {
  const points = Array.from({ length: Math.floor(until / 16) + 1 }, (_, i) => i * 16);
  const apart = (t: number) => Math.min(...[-16, -8, 0, 8, 16].map(shift => Math.abs(at(early, t) - at(loaded, t + shift))).filter(value => !Number.isNaN(value)));
  // Before a tab's first frame after the input there is nothing to compare: a busy first moment may paint a frame late.
  const compared = points.filter(t => !Number.isNaN(at(early, t)));
  expect(compared.length).toBeGreaterThan(points.length * 0.8);
  const differences = compared.map(t => ({ t, early: at(early, t), loaded: at(loaded, t), apart: apart(t) }));
  expect.soft(differences.filter(point => !(point.apart <= tolerance)), label).toEqual([]);
}

test("a press and a highlight move right after the first paint look as they do once everything has loaded", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("motion-first-paint");
  try {
    await provisionAndSignIn(page, user, { name: "Motion PM", workspaceName: "Lane E2E Motion first paint", role: "pm" });
    for (let i = 0; i < 3; i++) await seedTestRequest(user.id, `Motion Request ${i + 1}`);
    const context = page.context();

    /** How the check moves in a tab that had all the time it needed: loaded, idle, and three more seconds. */
    const settled = async (check: Check, viewport: Viewport, measure: (page: Page) => Promise<Sample[]>) => {
      const tab = await open(context, check, viewport, false);
      await tab.waitForLoadState("load", { timeout: 60_000 });
      await tab.evaluate(() => new Promise(resolve => requestIdleCallback(() => setTimeout(resolve, 3000))));
      const samples = await measure(tab);
      await tab.close();
      return samples;
    };
    /** How the check moves when it is the first thing done after the first paint, with nothing later arriving. */
    const first = async (check: Check, viewport: Viewport, measure: (page: Page) => Promise<Sample[]>, reducedMotion?: "reduce") => {
      const tab = await open(context, check, viewport, true, reducedMotion);
      const samples = await measure(tab);
      await tab.close();
      return samples;
    };

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await test.step(`at ${viewport.width}: the first press scales as it does once everything is in`, async () => {
        const loaded = await settled("press", viewport, pressCurve);
        // The check means something only if the settled tab does press.
        expect(Math.min(...loaded.map(sample => sample.value))).toBeLessThan(0.99);
        expectSameMotion(`press at ${viewport.width}`, await first("press", viewport, pressCurve), loaded, 288, 0.01);
      });
      await test.step(`at ${viewport.width}: the first highlight move glides as it does once everything is in`, async () => {
        const loaded = await settled("highlight", viewport, highlightCurve);
        // The check means something only if the settled tab's highlight glides (it is still mostly where it was).
        expect(Math.max(...loaded.filter(sample => sample.t <= 50).map(sample => sample.value))).toBeGreaterThan(0.5);
        expectSameMotion(`highlight at ${viewport.width}`, await first("highlight", viewport, highlightCurve), loaded, 592, 0.15);
      });
    }

    await test.step("with motion turned off, the first press doesn't scale and the first highlight move is simply there", async () => {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        expect((await first("press", viewport, pressCurve, "reduce")).every(sample => sample.value === 1)).toBe(true);
        const glide = await first("highlight", viewport, highlightCurve, "reduce");
        expect(glide.filter(sample => sample.t >= 34).every(sample => Math.abs(sample.value) < 0.01)).toBe(true);
      }
    });
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
