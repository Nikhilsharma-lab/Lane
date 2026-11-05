import { chromium, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { assertE2ETarget, safeClerkClient } from "./safety";

/**
 * Same normal Clerk test sign-in as test-user.ts; a native default context has no relative baseURL.
 * The testing token goes on before the first page loads, so Clerk's first Frontend API calls already carry it, and
 * Clerk's load is awaited by interval polling: `clerk.signIn` polls on animation frames, which a headed window behind
 * other windows doesn't paint, so it timed out at 15 s here on main and Build 4 alike.
 */
export async function signInNativeTestUser(page: Page, emailAddress: string, orgId: string) {
  await safeClerkClient();
  await setupClerkTestingToken({ context: page.context() });
  await page.goto(new URL("/login", assertE2ETarget().baseURL).href);
  await page.waitForFunction(() => window.Clerk?.loaded === true, undefined, { polling: 250, timeout: 60_000 });
  await clerk.signIn({ page, emailAddress });
  await page.evaluate(async organization => { await window.Clerk.setActive({ organization }); }, orgId);
}

/** Brings the dedicated browser's page to the front and waits until the browser reports it visible. */
export async function showOnScreen(page: Page) {
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState), { message: "The dedicated browser's page should be visible once in front" }).toBe("visible");
}

/** A dedicated browser with native tab visibility; Playwright's normal focus override keeps tabs visible. */
export async function withNativeVisibility<T>(run: (page: Page) => Promise<T>) {
  const profile = await mkdtemp(join(tmpdir(), "lane-undo-visibility-"));
  const child = spawn(chromium.executablePath(), ["--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    // macOS hides a window other windows cover: no frames, so a Pick up there never showed Mark Done and the run hung
    // until its 15-minute timeout. Other windows (other runs) come and go on this machine; only a tab switch, which
    // the checks make on purpose, should hide the page.
    "--disable-backgrounding-occluded-windows", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      let buffer = "";
      const timeout = setTimeout(() => reject(new Error("Dedicated native browser did not start.")), 15_000);
      child.stderr.on("data", chunk => {
        buffer += String(chunk);
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buffer);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
      child.once("error", error => { clearTimeout(timeout); reject(error); });
    });
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.newPage();
    await showOnScreen(page);
    return await run(page);
  } finally {
    if (browser) {
      try { await (await browser.newBrowserCDPSession()).send("Browser.close"); } catch { /* Browser may already be closed by the test. */ }
    }
    if (child.exitCode === null) child.kill("SIGTERM");
    if (child.exitCode === null) await new Promise<void>(resolve => child.once("exit", () => resolve()));
    await rm(profile, { recursive: true, force: true });
  }
}

/** No property overrides, fake events or clock installation: this tab genuinely becomes hidden. */
export async function pauseInNativeBackground(page: Page, durationMs: number) {
  await showOnScreen(page);
  const initialState = await page.evaluate(() => {
    const events: { state: string; trusted: boolean; time: number }[] = [];
    const target = window as typeof window & { laneUndoVisibility?: typeof events };
    target.laneUndoVisibility = events;
    document.addEventListener("visibilitychange", event => events.push({ state: document.visibilityState, trusted: event.isTrusted, time: performance.now() }));
    return document.visibilityState;
  });
  expect(initialState).toBe("visible");
  const other = await page.context().newPage();
  try {
    await other.goto("about:blank");
    await other.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe("hidden");
    const startedAt = Date.now();
    // The actual ten-second Arc timer must remain paused through this real elapsed interval.
    await other.waitForTimeout(durationMs);
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(durationMs);
    await page.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe("visible");
    const events = await page.evaluate(() => (window as typeof window & { laneUndoVisibility?: { state: string; trusted: boolean; time: number }[] }).laneUndoVisibility);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ state: "hidden", trusted: true }), expect.objectContaining({ state: "visible", trusted: true })]));
    return { technique: "native Chromium tabs; connectOverCDP noDefaults", initialState, elapsedMs, events };
  } finally { await other.close(); await page.bringToFront(); }
}
