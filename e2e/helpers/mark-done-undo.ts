import { expect, type APIResponse, type Page, type Request, type Route } from "@playwright/test";
import { commandPalette, paletteOption, runPaletteCommand } from "./command-palette";
import { isItLivePrompt, isItLiveRelease, journeyStep } from "./journey";
import { observeJourneyReads } from "./journey-read-observer";
import { pauseInNativeBackground } from "./native-visibility";
import { compiledUndoAction, flightResultShape } from "./server-action-identity";

export type UndoRequest = { id: string; code: string; title: string };
export type UndoMove = "pick-up" | "done" | "undo" | "release";
export type UndoRecorder = {
  intent: (request: UndoRequest, move: UndoMove) => Promise<string>;
  result: (operation: string, result: { outcome: "success" | "refused" | "aborted-before-dispatch" | "skipped-before-dispatch"; response?: Record<string, unknown> }) => Promise<void>;
  delivered?: (operation: string) => Promise<void>;
  transport?: (operation: string, metadata: { stage: "intercepted" | "response"; actionId: string; exportedName: string; filename: string; manifestSha256: string; method: string; status?: number; resultShape?: ReturnType<typeof flightResultShape> }) => Promise<void>;
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
  await navigate();
  await expect(page.locator("#request-title")).toBeVisible();
  const matches = (candidate: Request, move: UndoMove, id: string) => candidate.headers()["next-action"] === id && argsFor(candidate, orgId, request.id, move === "release");

  async function begin(move: UndoMove, trigger: () => Promise<void>, mode: "normal" | "hold" | "abort" | "hold-abort" = "normal") {
    const identity = await compiledUndoAction(move);
    const operation = await recorder.intent(request, move);
    const received = Promise.withResolvers<Record<string, unknown>>();
    const finished = Promise.withResolvers<void>();
    const delivery = Promise.withResolvers<void>();
    let claimed = false, count = 0;
    const pattern = `${new URL(page.url()).origin}/**`;
    const handler = async (route: Route) => {
      if (!matches(route.request(), move, identity.id)) return route.fallback();
      count++;
      if (claimed) return route.fallback();
      claimed = true;
      try {
        const metadata = { actionId: identity.id, exportedName: identity.exportedName, filename: identity.filename, manifestSha256: identity.manifestSha256, method: route.request().method() };
        await recorder.transport?.(operation, { stage: "intercepted", ...metadata });
        if (mode === "abort" || mode === "hold-abort") {
          if (mode === "hold-abort") await delivery.promise;
          await route.abort("failed");
          await recorder.result(operation, { outcome: "aborted-before-dispatch" });
          received.resolve({ abortedBeforeDispatch: true });
        } else {
          const response: APIResponse = await route.fetch({ maxRetries: 0 });
          const body = await response.text();
          await recorder.transport?.(operation, { stage: "response", ...metadata, status: response.status(), resultShape: flightResultShape(body) });
          const result = actionResult(body);
          await recorder.result(operation, { outcome: result.success === true ? "success" : "refused", response: result });
          received.resolve(result);
          if (mode === "hold") await delivery.promise;
          await route.fulfill({ response });
          await recorder.delivered?.(operation);
        }
        finished.resolve();
      } catch (error) { received.reject(error); finished.reject(error); }
    };
    await page.route(pattern, handler);
    await trigger();
    return {
      operation,
      intercepted: () => expect.poll(() => claimed).toBe(true),
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
  async function skippedUndo(trigger: () => Promise<void>, settleEarlier: () => Promise<void>) {
    const identity = await compiledUndoAction("undo");
    const operation = await recorder.intent(request, "undo");
    let outgoingUndo = 0;
    const observe = (candidate: Request) => { if (matches(candidate, "undo", identity.id)) outgoingUndo++; };
    page.on("request", observe);
    try {
      await trigger(); await expect(toastRegion(page)).toContainText("Undoing");
      await settleEarlier();
      await expect(toastRegion(page)).toContainText("Couldn't undo");
      await expect(toastRegion(page)).toContainText("An earlier change failed. Check this Request and try again.");
      expect(outgoingUndo).toBe(0);
      await recorder.result(operation, { outcome: "skipped-before-dispatch", response: { publicFeedback: "Couldn't undo", detail: "An earlier change failed. Check this Request and try again.", observedUndoRequests: outgoingUndo } });
    } finally { page.off("request", observe); }
  }
  return { page, request, begin, move, pickUp, skippedUndo };
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
/** Restore the real same-operation toast while its actual exit is in flight. */
export async function restoreDoneDuringExit(page: Page, request: UndoRequest, capture: Capture) {
  const prompt = isItLivePrompt(page);
  await expect(prompt).toBeVisible();
  const item = await doneToast(page, request).elementHandle(); expect(item).not.toBeNull();
  const answer = prompt.getByRole("button", { name: "Not yet", exact: true }); await answer.focus();
  const activation = await item!.evaluateHandle(node => {
    const state: { value: null | { at: number; trusted: boolean; connected: boolean; inert: boolean } } = { value: null };
    const observe = (event: MouseEvent) => {
      const button = event.composedPath().find(target => target instanceof HTMLButtonElement);
      if (!(button instanceof HTMLButtonElement) || button.textContent?.trim() !== "Not yet") return;
      state.value = { at: performance.now(), trusted: event.isTrusted, connected: node.isConnected, inert: node.hasAttribute("inert") };
    };
    document.addEventListener("click", observe, true);
    return { state, dispose: () => document.removeEventListener("click", observe, true) };
  });
  try {
    const exit = await item!.evaluate(node => new Promise<{ at: number; inert: boolean }>((resolve, reject) => {
      // Observe the public inert transition rather than polling past the short exit.
      const finish = () => { if (!node.hasAttribute("inert")) return; observer.disconnect(); clearTimeout(timeout); resolve({ at: performance.now(), inert: true }); };
      const observer = new MutationObserver(finish);
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error("The actual Done toast did not enter its exit interval.")); }, 15_000);
      observer.observe(node, { attributes: true, attributeFilter: ["inert"] }); finish();
    }));
    await answer.press("Enter"); await expect(prompt).toBeHidden();
    const activated = await activation.evaluate(({ state }) => state.value);
    await capture("same-done-toast-exit-activation", { exit, activated });
    expect(activated).toMatchObject({ trusted: true, connected: true, inert: true });
    await expect(doneToast(page, request)).toHaveCount(1);
    await expect(doneToast(page, request)).not.toHaveAttribute("inert", "");
    const undo = doneToast(page, request).getByRole("button", { name: "Undo", exact: true });
    await expect(undo).toBeVisible(); await undo.focus(); await expect(undo).toBeFocused();
    await capture("same-done-toast-restored-during-exit", { exit, sameElement: await item!.evaluate(node => node.isConnected) });
  } finally { await activation.evaluate(({ dispose }) => dispose()); await activation.dispose(); }
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
  if (kind === "hidden") {
    await page.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe("visible");
  }
  await markDone(driver);
  const stack = toastRegion(page).locator("ol");
  const startedAt = Date.now();
  let native: unknown;
  if (kind === "hidden") {
    await page.mouse.move(0, 0); await page.locator("#lane-main").focus();
    await expect(stack).toHaveAttribute("data-expanded", "false");
    await expect.poll(() => toastRegion(page).evaluate(region => region.contains(document.activeElement))).toBe(false);
    native = await pauseInNativeBackground(page, 11_000);
  } else {
    if (kind === "hover") await doneToast(page, request).hover();
    if (kind === "focus") { await page.mouse.move(0, 0); await page.keyboard.press("Alt+t"); }
    if (kind === "touch") {
      await doneToast(page, request).click({ trial: true, position: { x: 30, y: 25 } });
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
    await toast.click({ trial: true, position: { x: 20, y: 25 } });
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
  await expect(toastRegion(driver.page)).toContainText("Couldn't save");
  await expect(driver.page.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
  await expect(isItLivePrompt(driver.page)).toHaveCount(0); await expectPaletteUndo(driver.page, false);
  await capture("done-transport-failure-no-undo");
}
export async function verifyUndoFailure(driver: UndoDriver, capture: Capture) {
  await markDone(driver);
  const item = await doneToast(driver.page, driver.request).elementHandle(); expect(item).not.toBeNull();
  await driver.move("undo", () => doneToast(driver.page, driver.request).getByRole("button", { name: "Undo", exact: true }).press("Enter"), true);
  await expect.poll(() => item!.evaluate(node => node.isConnected && node.textContent?.includes("Couldn't undo"))).toBe(true);
  await expect(toastRegion(driver.page).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  await expectPaletteUndo(driver.page, false); await expect(isItLivePrompt(driver.page)).toHaveCount(0);
  await capture("same-toast-undo-failure-no-reoffer");
}
async function prepareReleaseForm(driver: UndoDriver) {
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
  return { form, submit };
}
async function failedReleaseForm(driver: UndoDriver, capture: Capture) {
  const { page } = driver;
  const { form, submit } = await prepareReleaseForm(driver);
  await driver.move("release", submit, true);
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Release evidence", { exact: true })).toHaveValue("174 retained fixture: actual browser release acceptance");
  await expect(form.getByRole("checkbox", { name: "The agreed audience received this work", exact: true })).toBeChecked();
  await expect(page.locator('[aria-label^="Messages"]')).not.toContainText("Release recorded");
  await capture("release-failure-preserves-prompt-and-input");
  await page.keyboard.press("Escape"); await expect(form).toBeHidden();
  await expect(doneToast(page, driver.request).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await undoFromToast(driver, capture);
  await capture("release-failure-restored-undo-saved-in-progress");
}
/** A successful old Release must end only its own Undo after a newer Done opens another prompt. */
export async function verifyReleaseFailureThenNewerPrompt(driver: UndoDriver, orgId: string, newer: UndoRequest, recorder: UndoRecorder, capture: Capture) {
  const { page, request } = driver;
  await failedReleaseForm(driver, capture);
  const { form, submit } = await prepareReleaseForm(driver);
  const release = await driver.begin("release", submit, "hold");
  expect((await release.received()).success).toBe(true); // Receipt and saved-state reconciliation precede newer mutations.
  await capture("old-release-saved-delivery-held", { operation: release.operation, savedResponseConfirmed: true, deliveryStillHeld: true });
  await page.keyboard.press("Escape"); await expect(form).toBeHidden();
  await doneToast(page, request).hover();
  const second = await undoDriver(page, orgId, newer, recorder, async () => {
    await page.getByRole("link", { name: "All Requests", exact: true }).press("Enter");
    await page.locator(`a[href^="/requests/${newer.id}"]`).first().press("Enter");
  });
  await second.pickUp(); await markDone(second, false);
  await expect(isItLivePrompt(page)).toContainText(`${newer.code} is Done.`);
  await release.finish();
  await expect(isItLivePrompt(page)).toBeVisible();
  await expect(isItLivePrompt(page)).toContainText(`${newer.code} is Done.`);
  const oldToast = page.locator('[aria-label^="Messages"] li').filter({ hasText: `${request.code} is now Measuring.` });
  await expect(oldToast).toContainText("Release recorded");
  await expect(oldToast.getByRole("button", { name: "Undo", exact: true, includeHidden: true })).toHaveCount(0);
  await capture("old-release-delivered-newer-prompt-preserved", { operation: release.operation, deliveryComplete: true });
  await isItLivePrompt(page).getByRole("button", { name: "Not yet", exact: true }).press("Enter");
  await expect(isItLivePrompt(page)).toBeHidden();
  await expectPaletteUndo(page, true); await undoFromPalette(second); await page.mouse.move(0, 0);
}

/** Hold the real Release before dispatch; Escape and Undo remain ordinary UI actions. */
export async function verifyPendingReleaseSkippedUndo(driver: UndoDriver, capture: Capture) {
  const { page, request } = driver;
  const { form, submit } = await prepareReleaseForm(driver);
  const release = await driver.begin("release", submit, "hold-abort");
  await release.intercepted();
  await page.keyboard.press("Escape"); await expect(form).toBeHidden();
  await expect(doneToast(page, request).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await driver.skippedUndo(() => doneToast(page, request).getByRole("button", { name: "Undo", exact: true }).press("Enter"), () => release.finish());
  await expect(toastRegion(page).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  await expectPaletteUndo(page, false);
  await expect(page.getByRole("region", { name: "Journey", exact: true }).getByRole("button", { name: "Record release", exact: true })).toBeVisible();
  await capture("failed-earlier-release-skips-undo-with-terminal-feedback");
}

/** Real saved-status regression: no reload, unchanged agreement revision, passive read evidence. */
export async function verifySavedStatusSkippedUndo(driver: UndoDriver, orgId: string, capture: Capture) {
  const { page } = driver;
  await expect(journeyStep(page, "Open", "current step")).toBeVisible();
  const observer = await observeJourneyReads(page, orgId, driver.request.id);
  const phases: { name: string; at: string; readCount: number }[] = [];
  const phase = (name: string) => phases.push({ name, at: new Date().toISOString(), readCount: observer.count() });
  try {
    phase("before-pickup");
    await driver.pickUp();
    await expect(journeyStep(page, "In progress", "current step")).toBeVisible();
    phase("saved-pickup-visible");
    expect(observer.count()).toBeGreaterThan(0);
    const beforeDone = observer.count();
    await verifyPendingReleaseSkippedUndo(driver, capture);
    await expect(journeyStep(page, "Done", "current step")).toBeVisible();
    phase("saved-done-visible-after-skipped-undo");
    expect(observer.count()).toBeGreaterThan(beforeDone);
    // No extra read is required for the unchanged-status refresh after skipped Undo.
  } finally {
    observer.stop();
    await capture("saved-status-journey-read-receipt", { ...observer.snapshot(), phases });
  }
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
