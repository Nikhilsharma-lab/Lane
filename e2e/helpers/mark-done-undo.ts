import { expect, type APIResponse, type Page, type Request, type Route } from "@playwright/test";
import { commandPalette, paletteOption, runPaletteCommand } from "./command-palette";
import { isItLivePrompt, isItLiveRelease } from "./journey";
import { pauseInNativeBackground } from "./native-visibility";

export type UndoRequest = { id: string; code: string; title: string };
export type UndoMove = "pick-up" | "done" | "undo" | "release";
export type UndoRecorder = {
  intent: (request: UndoRequest, move: UndoMove) => Promise<string>;
  result: (operation: string, result: { outcome: "success" | "refused" | "aborted-before-dispatch"; response?: Record<string, unknown> }) => Promise<void>;
};
export const undoSurfaces = [
  { width: 1440, colorScheme: "light", reducedMotion: "no-preference", ending: "expiry" },
  { width: 1440, colorScheme: "dark", reducedMotion: "reduce", ending: "escape" },
  { width: 390, colorScheme: "light", reducedMotion: "no-preference", ending: "swipe" },
  { width: 390, colorScheme: "dark", reducedMotion: "reduce", ending: "dismiss" },
] as const;
type Capture = (name: string, receipt?: unknown) => Promise<void>;
export const toastRegion = (page: Page) => page.getByRole("region", { name: /^Messages/ });
export const doneToast = (page: Page, request: UndoRequest) => toastRegion(page).locator("li").filter({ hasText: `${request.code} is now Done.` });

function argsFor(request: Request, orgId: string, requestId: string, release = false) {
  if (request.method() !== "POST" || !request.headers()["next-action"]) return false;
  try {
    const args = JSON.parse(request.postData() ?? "null");
    return Array.isArray(args) && args.length === 2 && (release
      ? args[0]?.orgId === orgId && args[0]?.requestId === requestId && args[1]?.kind === "release"
      : args[0] === requestId && args[1]?.orgId === orgId);
  } catch { return false; }
}
function actionResult(body: string): Record<string, unknown> {
  for (const line of body.split("\n")) {
    const match = /^[\da-f]+:(.+)$/.exec(line);
    if (!match) continue;
    try { const value = JSON.parse(match[1]); if (value?.success === true || typeof value?.error === "string") return value; } catch { /* Non-JSON Flight line. */ }
  }
  throw new Error("Actual move response could not be reconciled. Stop before any retry.");
}

/** Records real action results before delivering them, leaving all app/server behavior intact. */
export async function undoDriver(page: Page, orgId: string, request: UndoRequest, recorder: UndoRecorder, navigate = () => page.goto(new URL(`/requests/${request.id}`, page.url()).href).then(() => undefined)) {
  const read = page.waitForResponse(async response => argsFor(response.request(), orgId, request.id) && (await response.text()).includes('"rosterUnavailable":'));
  await navigate();
  const initial = await read;
  const readId = initial.request().headers()["next-action"];
  await expect(page.locator("#request-title")).toBeVisible();
  const matches = (candidate: Request, move: UndoMove) => argsFor(candidate, orgId, request.id, move === "release") && candidate.headers()["next-action"] !== readId;

  async function begin(move: UndoMove, trigger: () => Promise<void>, mode: "normal" | "hold" | "abort" = "normal") {
    const operation = await recorder.intent(request, move);
    const received = Promise.withResolvers<Record<string, unknown>>();
    const finished = Promise.withResolvers<void>();
    const delivery = Promise.withResolvers<void>();
    let claimed = false, count = 0;
    const pattern = `${new URL(page.url()).origin}/**`;
    const handler = async (route: Route) => {
      if (!matches(route.request(), move)) return route.fallback();
      count++;
      if (claimed) return route.fallback();
      claimed = true;
      try {
        if (mode === "abort") {
          await route.abort("failed");
          await recorder.result(operation, { outcome: "aborted-before-dispatch" });
          received.resolve({ abortedBeforeDispatch: true });
        } else {
          const response: APIResponse = await route.fetch({ maxRetries: 0 });
          const result = actionResult(await response.text());
          await recorder.result(operation, { outcome: result.success === true ? "success" : "refused", response: result });
          received.resolve(result);
          if (mode === "hold") await delivery.promise;
          await route.fulfill({ response });
        }
        finished.resolve();
      } catch (error) { received.reject(error); finished.reject(error); }
    };
    await page.route(pattern, handler);
    await trigger();
    return {
      received: () => received.promise,
      async finish() {
        delivery.resolve();
        try { await finished.promise; expect(count).toBe(1); } finally { await page.unroute(pattern, handler); }
      },
    };
  }
  async function move(kind: UndoMove, trigger: () => Promise<void>, abort = false) {
    const action = await begin(kind, trigger, abort ? "abort" : "normal");
    const result = await action.received(); await action.finish();
    if (!abort) expect(result.success).toBe(true);
  }
  async function pickUp() {
    const pickup = page.getByRole("button", { name: "Pick up", exact: true });
    if (await pickup.isVisible()) await move("pick-up", () => pickup.press("Enter"));
    await expect(page.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
  }
  return { page, request, begin, move, pickUp };
}
export type UndoDriver = Awaited<ReturnType<typeof undoDriver>>;

export async function expectPaletteUndo(page: Page, present: boolean, key = "Control+k") {
  await page.locator("#lane-main").focus(); await page.keyboard.press(key);
  await expect(commandPalette(page)).toBeVisible();
  await expect(paletteOption(page, "Undo Mark Done")).toHaveCount(present ? 1 : 0);
  await page.keyboard.press("Escape"); await expect(commandPalette(page)).toBeHidden();
}
export async function markDone(driver: UndoDriver, answer = true) {
  const { page, request } = driver;
  await driver.move("done", () => page.getByRole("button", { name: "Mark Done", exact: true }).press("Enter"));
  await expect(isItLivePrompt(page)).toBeVisible();
  if (answer) {
    await isItLivePrompt(page).getByRole("button", { name: "Not yet", exact: true }).press("Enter");
    await expect(isItLivePrompt(page)).toBeHidden();
    await expect(doneToast(page, request).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  }
}
export async function undoFromToast(driver: UndoDriver, capture: Capture) {
  const { page, request } = driver;
  const item = await doneToast(page, request).elementHandle();
  expect(item).not.toBeNull();
  const action = await driver.begin("undo", () => doneToast(page, request).getByRole("button", { name: "Undo", exact: true }).press("Enter"), "hold");
  expect((await action.received()).success).toBe(true);
  await expect.poll(() => item!.evaluate(node => node.isConnected && node.textContent?.includes("Undoing"))).toBe(true);
  await expectPaletteUndo(page, false);
  await capture("same-toast-undo-loading");
  await action.finish();
  await expect.poll(() => item!.evaluate(node => node.isConnected && node.textContent?.includes("Back to In progress"))).toBe(true);
  await expect(page.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
  await capture("same-toast-undo-success");
}
export async function undoFromPalette(driver: UndoDriver) {
  await driver.move("undo", () => runPaletteCommand(driver.page, "Undo Mark Done", undefined, "Meta+k"));
  await expect(toastRegion(driver.page)).toContainText("Back to In progress");
  await expect(driver.page.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
  await expectPaletteUndo(driver.page, false);
}

export async function verifyEarlyUndo(driver: UndoDriver, capture: Capture) {
  const { page, request } = driver;
  const done = await driver.begin("done", () => page.getByRole("button", { name: "Mark Done", exact: true }).press("Enter"), "hold");
  expect((await done.received()).success).toBe(true);
  await expect(doneToast(page, request).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  const undo = await driver.begin("undo", () => doneToast(page, request).getByRole("button", { name: "Undo", exact: true }).press("Enter"));
  await expect(toastRegion(page)).toContainText("Undoing");
  await done.finish();
  expect((await undo.received()).success).toBe(true); await undo.finish();
  await expect(page.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
  await expect(isItLivePrompt(page)).toHaveCount(0);
  await expectPaletteUndo(page, false); await capture("early-undo-no-late-prompt");
}

export async function verifyPause(driver: UndoDriver, kind: "hover" | "focus" | "touch" | "hidden", capture: Capture) {
  const { page, request } = driver;
  await markDone(driver);
  const stack = toastRegion(page).locator("ol");
  const startedAt = Date.now();
  let native: unknown;
  if (kind === "hidden") {
    await page.mouse.move(0, 0); await page.locator("#lane-main").focus();
    native = await pauseInNativeBackground(page, 11_000);
  } else {
    if (kind === "hover") await doneToast(page, request).hover();
    if (kind === "focus") { await page.mouse.move(0, 0); await page.keyboard.press("Alt+t"); }
    if (kind === "touch") {
      const rect = await doneToast(page, request).boundingBox(); expect(rect).not.toBeNull();
      await page.touchscreen.tap(rect!.x + 30, rect!.y + 25);
    }
    await expect(stack).toHaveAttribute("data-expanded", "true");
    await page.waitForTimeout(11_000); // Real elapsed interval exceeds the unpaused ten-second lifetime.
  }
  await expect(doneToast(page, request).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await capture(`${kind}-pause-real-clock`, { elapsedMs: Date.now() - startedAt, native });
  if (kind === "touch") await page.touchscreen.tap(10, 10);
  await page.mouse.move(0, 0); await page.locator("#lane-main").focus();
  await expectPaletteUndo(page, true); await undoFromPalette(driver);
}

export async function verifyEnding(driver: UndoDriver, ending: (typeof undoSurfaces)[number]["ending"], capture: Capture) {
  const { page, request } = driver;
  await markDone(driver); await expectPaletteUndo(page, true);
  const toast = doneToast(page, request);
  if (ending === "dismiss") await toast.getByRole("button", { name: "Dismiss notification", exact: true }).press("Enter");
  if (ending === "escape") { await toast.getByRole("button", { name: "Undo", exact: true }).focus(); await page.keyboard.press("Escape"); }
  if (ending === "swipe") {
    const rect = await toast.boundingBox(); expect(rect).not.toBeNull();
    const session = await page.context().newCDPSession(page);
    const x = rect!.x + 20, y = rect!.y + 25;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (const distance of [12, 40, 90, 150, 220]) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + distance, y }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await session.detach();
  }
  const startedAt = Date.now();
  if (ending === "expiry") { await page.mouse.move(0, 0); await page.locator("#lane-main").focus(); }
  await expect(toast).toHaveCount(0, { timeout: ending === "expiry" ? 15_000 : 3_000 });
  await expectPaletteUndo(page, false);
  await capture(`${ending}-ends-palette-undo`, { elapsedMs: Date.now() - startedAt });
}

export async function verifyDoneFailure(driver: UndoDriver, capture: Capture) {
  await driver.move("done", () => driver.page.getByRole("button", { name: "Mark Done", exact: true }).press("Enter"), true);
  await expect(toastRegion(driver.page)).toContainText("Could not update this Request");
  await expect(driver.page.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
  await expect(isItLivePrompt(driver.page)).toHaveCount(0); await expectPaletteUndo(driver.page, false);
  await capture("done-transport-failure-no-undo");
}
export async function verifyUndoFailure(driver: UndoDriver, capture: Capture) {
  await markDone(driver);
  const item = await doneToast(driver.page, driver.request).elementHandle(); expect(item).not.toBeNull();
  await driver.move("undo", () => doneToast(driver.page, driver.request).getByRole("button", { name: "Undo", exact: true }).press("Enter"), true);
  await expect.poll(() => item!.evaluate(node => node.isConnected && node.textContent?.includes("Could not undo"))).toBe(true);
  await expect(toastRegion(driver.page).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  await expectPaletteUndo(driver.page, false); await expect(isItLivePrompt(driver.page)).toHaveCount(0);
  await capture("same-toast-undo-failure-no-reoffer");
}
export async function verifyReleaseFailureThenSave(driver: UndoDriver, capture: Capture) {
  const { page } = driver;
  await markDone(driver, false);
  await isItLivePrompt(page).getByRole("button", { name: "Yes, record release", exact: true }).press("Enter");
  const form = isItLiveRelease(page);
  const before = form.getByLabel(/^Value before release/);
  await expect(form.getByLabel("Release evidence", { exact: true })).toBeVisible();
  if (await before.count()) await before.fill("62");
  await form.getByLabel("Release evidence", { exact: true }).fill("174 retained fixture: actual browser release acceptance");
  await form.getByRole("checkbox", { name: "The agreed audience received this work", exact: true }).check();
  const submit = () => form.getByRole("button", { name: "Mark as released", exact: true }).press("Enter");
  await driver.move("release", submit, true);
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Release evidence", { exact: true })).toHaveValue("174 retained fixture: actual browser release acceptance");
  await expect(form.getByRole("checkbox", { name: "The agreed audience received this work", exact: true })).toBeChecked();
  await expect(page.locator('[aria-label^="Messages"]')).not.toContainText("Release recorded");
  await expect(page.locator('[aria-label^="Messages"] li').filter({ hasText: `${driver.request.code} is now Done.` }).getByRole("button", { name: "Undo", exact: true, includeHidden: true })).toHaveCount(1);
  await capture("release-failure-preserves-prompt-and-input");
  await driver.move("release", submit);
  await expect(form).toBeHidden(); await expect(toastRegion(page)).toContainText("Release recorded");
  await expect(toastRegion(page).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  await expectPaletteUndo(page, false); await capture("saved-release-ends-undo");
}

export async function verifyLatestPair(first: UndoDriver, orgId: string, secondRequest: UndoRequest, recorder: UndoRecorder, capture: Capture) {
  const page = first.page;
  await markDone(first);
  // Keep the real stack hovered while keyboard navigation changes Requests; no synthetic pause.
  await doneToast(page, first.request).hover();
  const second = await undoDriver(page, orgId, secondRequest, recorder, async () => {
    await page.getByRole("link", { name: "All Requests", exact: true }).press("Enter");
    await page.locator(`a[href^="/requests/${secondRequest.id}"]`).first().press("Enter");
  });
  await second.pickUp(); await markDone(second);
  await expect(doneToast(page, first.request).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await expect(doneToast(page, secondRequest).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await first.move("undo", () => doneToast(page, first.request).getByRole("button", { name: "Undo", exact: true }).press("Enter"));
  await expect(doneToast(page, secondRequest).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await expectPaletteUndo(page, true);
  await capture("older-toast-undo-preserves-newer-palette");
  await undoFromPalette(second);
  await page.mouse.move(0, 0);
  return second;
}
