import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// Build 2 speed fix: the parts Build 2 loads lazily (the pressed state and fade, the popup's phone behaviour, the
// offline line, the discard prompt) wait for the page's `load` event and the first idle moment after it
// (src/lib/after-page-load.ts). Fetched earlier, they held `load` back on a slow phone until Next.js had started
// reading Request pages ahead, and those reads' code files held it back further (+2s on Impact).

/** Text that only each lazy part's script carries. */
const LAZY_PARTS = {
  "pressed state and fade": "loadingFeel",
  "popup phone behaviour": '"AdaptiveForm"',
  "offline line": "offline-guard-module",
  "discard prompt": "Discard what you typed",
} as const;

const PAGES = ["/", "/intake", "/impact", "/settings/profile?section=billing"];

// Slow 4G and a 4x slower processor, as the staging speed check's phone.
const PHONE_NET = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

type Timing = { load: number; idle: number; scripts: { name: string; start: number }[] };

/** A cold visit to `path`: when `load` fired, when the page was first idle after it, and when each script started. */
async function coldVisit(page: Page, path: string): Promise<Timing> {
  await page.goto(path, { waitUntil: "load", timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __loadOrder?: { idle?: number } }).__loadOrder?.idle ?? null), { timeout: 30_000 }).not.toBeNull();
  // Whatever waits for idle has started by now.
  await page.waitForTimeout(1_500);
  return page.evaluate(() => {
    const order = (window as unknown as { __loadOrder: { load: number; idle: number } }).__loadOrder;
    const scripts = performance.getEntriesByType("resource")
      .filter(entry => /\.js(\?|$)/.test(entry.name))
      .map(entry => ({ name: new URL(entry.name).pathname, start: entry.startTime }));
    return { load: order.load, idle: order.idle, scripts };
  });
}

/** Watches a cold visit from before Lane's first script: `load`, the first idle after it, and every script's body. */
async function watchColdVisits(page: Page) {
  // Registered before any of Lane's scripts, so this idle callback is the first one queued after `load`.
  await page.addInitScript(() => {
    const order: { load?: number; idle?: number } = {};
    (window as unknown as { __loadOrder: typeof order }).__loadOrder = order;
    addEventListener("load", () => {
      order.load = performance.now();
      const idle = () => { order.idle = performance.now(); };
      if (typeof window.requestIdleCallback === "function") requestIdleCallback(idle); else setTimeout(idle, 1);
    }, { once: true });
  });
  const bodies = new Map<string, Promise<string>>();
  page.on("response", response => {
    const url = new URL(response.url());
    if (/\/_next\/static\/.+\.js$/.test(url.pathname) && !bodies.has(url.pathname)) bodies.set(url.pathname, response.text().catch(() => ""));
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await cdp.send("Network.emulateNetworkConditions", PHONE_NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return { bodies, done: () => cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }) };
}

/** Each lazy part (by `markers`) whose script started on this visit, and those that started before the first idle after `load`. */
async function lazyStarts(path: string, timing: Timing, bodies: Map<string, Promise<string>>, markers: Record<string, string>) {
  const seen = new Set<string>(), early: string[] = [];
  for (const script of timing.scripts) {
    const body = await (bodies.get(script.name) ?? Promise.resolve(""));
    for (const [part, marker] of Object.entries(markers)) {
      if (!body.includes(marker)) continue;
      seen.add(part);
      if (script.start < timing.idle) early.push(`${path}: ${part} started ${Math.round(script.start - timing.load)}ms after load, before the first idle (${Math.round(timing.idle - timing.load)}ms after load)`);
    }
  }
  return { seen, early };
}

test("on a cold first visit, Build 2's lazy parts wait for the page's load and the first idle moment after it", async ({ page }) => {
  test.setTimeout(420_000);
  const user = await createTestUser("load-order");
  try {
    await provisionAndSignIn(page, user, { name: "Load Order PM", workspaceName: "Lane E2E Load order", role: "pm" });
    for (let i = 0; i < 4; i++) await seedTestRequest(user.id, `Load order Request ${i + 1}`);

    const { bodies, done } = await watchColdVisits(page);
    const early: string[] = [];
    const seen = new Set<string>();
    for (const path of PAGES) {
      const result = await lazyStarts(path, await coldVisit(page, path), bodies, LAZY_PARTS);
      result.seen.forEach(part => seen.add(part));
      early.push(...result.early);
    }
    await done();

    // The check means something only if the lazy parts did load on these visits.
    expect([...seen]).toEqual(expect.arrayContaining(["pressed state and fade", "popup phone behaviour", "offline line"]));
    expect(early).toEqual([]);
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

// Build 3: on the Request page the "Iterations of this problem" list's code came in during hydration. When the page
// was drawn before Clerk's script had arrived (2 in 5 of main's staging phone loads, 6 in 15 of Build 3's), that held
// `load` back, so the popups' loads ahead and Clerk's own windows' code all came before it too: usable at 6.1-6.5s
// instead of about 4.2s. Clerk's script is held here to recreate that order every time.
const CLERK_SCRIPT = /\/npm\/@clerk\/clerk-js@[^/]+\/dist\/clerk\.browser\.js/;
const REQUEST_PAGE_LAZY_PARTS = { ...LAZY_PARTS, "Iterations list": "Not linked as Same problem now." } as const;

test("on a cold first visit to a Request drawn before Clerk's script arrives, its lazy parts still wait for load and the first idle moment after it", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("load-order-request");
  try {
    await provisionAndSignIn(page, user, { name: "Load Order PM", workspaceName: "Lane E2E Load order request", role: "pm" });
    const { id } = await seedTestRequest(user.id, "Load order Request page");
    const { bodies, done } = await watchColdVisits(page);
    await page.route(CLERK_SCRIPT, async route => { await new Promise(resolve => setTimeout(resolve, 3_000)); await route.continue(); });

    const path = `/requests/${id}`;
    const { seen, early } = await lazyStarts(path, await coldVisit(page, path), bodies, REQUEST_PAGE_LAZY_PARTS);
    await done();

    // The check means something only if the Iterations list's code did load on this visit.
    expect([...seen]).toContain("Iterations list");
    expect(early).toEqual([]);
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
