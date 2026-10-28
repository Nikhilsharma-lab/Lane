import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, type Route } from "@playwright/test";
import { assertLocalUndoTarget } from "./server-action-identity";
import type { NavigationRequest } from "./request-navigation";

const lifecycleExports = new Map([
  ["src/app/(app)/requests/[id]/actions.ts", new Set(["pickUpRequest", "pickUpRequests", "markDone", "markDoneMany", "undoMarkDone"])],
  ["src/app/(app)/requests/[id]/release-actions.ts", new Set(["changeRequestRelease"])],
]);
type Capture = (name: string, receipt?: unknown) => Promise<void>;

/** Actual native history and Arc modal focus, with no lifecycle writes or private state injection. */
export async function verifyNativeHistoryFocus(page: Page, request: NavigationRequest, capture: Capture, assertInventoryUnchanged: () => Promise<void>) {
  assertLocalUndoTarget();
  const errors: { at: string; path: string; phase: string; message: string }[] = [];
  const refused: { exportedName: string; filename: string }[] = [];
  let phase = "plain-back";
  const observe = (message: string) => {
    if (/maximum update depth|too many re-renders/i.test(message) && errors.length < 10) errors.push({ at: new Date().toISOString(), path: new URL(page.url()).pathname, phase, message: message.slice(0, 1000) });
  };
  const consoleListener = (message: { text(): string }) => observe(message.text());
  const errorListener = (error: Error) => observe(error.message);
  const pattern = `${new URL(page.url()).origin}/**`;
  const blockLifecycle = async (route: Route) => {
    const id = route.request().headers()["next-action"];
    if (!id) return route.fallback();
    const manifest: { node?: Record<string, { filename?: string; exportedName?: string }> } = JSON.parse(await readFile(resolve(process.cwd(), ".next-e2e/dev/server/server-reference-manifest.json"), "utf8"));
    const entry = manifest.node?.[id];
    if (entry?.filename && entry.exportedName && lifecycleExports.get(entry.filename)?.has(entry.exportedName)) {
      refused.push({ filename: entry.filename, exportedName: entry.exportedName });
      return route.abort("failed");
    }
    return route.fallback();
  };
  const row = page.locator(`#request-row-${request.id}`);
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
  page.on("console", consoleListener); page.on("pageerror", errorListener); await page.route(pattern, blockLifecycle);
  try {
    await page.goto("/"); await expect(row).toBeVisible();
    const enterDetail = async () => {
      await row.locator(`a[href^="/requests/${request.id}"]`).press("Enter");
      await expect(page).toHaveURL(url => url.pathname === `/requests/${request.id}`);
      await expect(page.getByRole("region", { name: "Journey", exact: true })).toBeVisible();
    };
    await enterDetail(); await page.goBack({ waitUntil: "commit" });
    await expect(page).toHaveURL(url => url.pathname === "/"); await expect(row).toBeFocused();
    await capture("plain-native-back-restores-request-focus", { errors, refused });
    await enterDetail(); await page.locator("#lane-main").focus(); await page.keyboard.press("?"); await expect(dialog).toBeVisible();
    phase = "modal-back"; await page.goBack({ waitUntil: "commit" });
    await expect(page).toHaveURL(url => url.pathname === "/"); await expect(dialog).toBeVisible();
    // Observe beyond the existing 20-frame retry window using real browser frames.
    // Do not extend that window, fake a clock, or promise later row focus.
    await page.evaluate(() => new Promise<void>(done => { let frames = 0; const tick = () => { if (++frames === 30) done(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
    await expect(row).toBeAttached(); await expect(dialog.getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
    await capture("modal-native-back-keeps-dialog-focus-without-render-loop", { errors, refused });
    await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
    await assertInventoryUnchanged();
    expect(refused, "Read-only navigation did not attempt a lifecycle action").toEqual([]);
    expect(errors, "Native history must not start an update-depth loop").toEqual([]);
  } finally {
    if (await dialog.isVisible()) { await page.keyboard.press("Escape"); await expect(dialog).toBeHidden(); }
    page.off("console", consoleListener); page.off("pageerror", errorListener); await page.unroute(pattern, blockLifecycle);
  }
}
