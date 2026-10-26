import { expect, type Page } from "@playwright/test";
import { beginCoordinatedChange, forbidTriage, type CoordinationRecorder } from "./move-coordination-transport";
import { navigationSurfaces, type NavigationRequest } from "./request-navigation";
import { commandPalette, paletteOption, runPaletteCommand } from "./command-palette";
import { doneToast, toastRegion } from "./mark-done-undo";
import { isItLivePrompt } from "./journey";

export type MoveFixtures = { a: NavigationRequest; b: NavigationRequest; c: NavigationRequest; reviewerName: string };
export type MoveCapture = (name: string, receipt?: unknown) => Promise<void>;
const row = (page: Page, request: NavigationRequest) => page.locator(`#request-row-${request.id}`);
const bar = (page: Page) => page.locator("[data-request-selection-bar]");
const confirmation = (page: Page) => page.getByRole("dialog", { name: "Pick up anyway?", exact: true });
const bulkToast = (page: Page) => toastRegion(page).locator("li").filter({ hasText: /^2 Requests marked Done/ });
async function chooseMoveProject(page: Page, name: string) {
  // Keep the pointer out of the hover opener during these keyboard flows. A
  // genuine open peek correctly owns Escape before Request selection does.
  for (const label of ["Open navigation", "Expand sidebar"]) {
    const opener = page.getByRole("button", { name: label, exact: true });
    if (await opener.isVisible()) await opener.press("Enter");
  }
  const link = page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link", { name, exact: true });
  await link.focus(); await expect(link).toBeFocused(); await link.press("Enter");
  await expect(page.locator("#lane-sidebar")).not.toHaveAttribute("data-peeking", "true");
}
async function sidebar(page: Page, name: string) {
  await chooseMoveProject(page, name);
  await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeHidden();
  await expect(page).toHaveURL(url => url.pathname === "/" && (name !== "No Project" || url.searchParams.get("project") === "none"));
}
export async function selectMoveRows(page: Page, requests: NavigationRequest[]) {
  for (const request of requests) {
    await expect(row(page, request)).toBeVisible();
    await row(page, request).focus(); await row(page, request).press("x");
    await expect(row(page, request)).toHaveAttribute("aria-selected", "true");
  }
  await expect(bar(page)).toContainText(`${requests.length} selected`);
}
async function detail(page: Page, request: NavigationRequest) {
  await row(page, request).locator(`a[href^="/requests/${request.id}"]`).press("Enter");
  await expect(page).toHaveURL(url => url.pathname === `/requests/${request.id}`);
  await expect(page.getByRole("region", { name: "Journey", exact: true })).toBeVisible();
}
async function pauseStack(page: Page) {
  await toastRegion(page).locator("ol").hover();
  await expect(toastRegion(page).locator("ol")).toHaveAttribute("data-expanded", "true");
}
async function palettePointer(page: Page, present: boolean) {
  await page.locator("#lane-main").focus(); await page.keyboard.press("Control+k");
  await expect(commandPalette(page)).toBeVisible();
  await expect(paletteOption(page, "Undo Mark Done")).toHaveCount(present ? 1 : 0);
  await page.keyboard.press("Escape"); await expect(commandPalette(page)).toBeHidden();
  if (present) await pauseStack(page);
}

/** Only the saved measurement changes. The actual AI action is blocked before dispatch if unexpectedly requested. */
export async function setCurrentValue(page: Page, orgId: string, request: NavigationRequest, recorder: CoordinationRecorder, value: string) {
  await expect(page.getByRole("button", { name: "Edit Request", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Request", exact: true }).press("Enter");
  const dialog = page.getByRole("dialog", { name: "Edit Request", exact: true });
  const current = dialog.getByLabel("Current value", { exact: true });
  await expect(current).toBeVisible(); await current.fill(value);
  const submit = dialog.getByRole("button", { name: "Save changes", exact: true });
  await expect(submit).toBeEnabled();
  const gate = await forbidTriage(page, recorder);
  try {
    const change = await beginCoordinatedChange(page, orgId, "edit", [request.id], recorder, () => submit.press("Enter"));
    await Promise.race([change.received(), gate.blocked]); await change.finish();
    gate.assertUnused(); await expect(dialog).toBeHidden();
  } finally { await gate.close(); }
}

export async function prepareMoveCoordination(page: Page, orgId: string, fixture: MoveFixtures, recorder: CoordinationRecorder, capture: MoveCapture, resumeAfterConfirmedEdit = false) {
  await page.goto(`/requests/${fixture.c.id}`);
  // Retained-fixture callers may resume only after an exact saved-response/inventory receipt.
  if (!resumeAfterConfirmedEdit) await setCurrentValue(page, orgId, fixture.c, recorder, "");
  await expect(page.getByText("Required before pickup", { exact: true })).toBeVisible();
  await capture("current-value-empty-without-ai");
  await page.goto(`/requests/${fixture.b.id}`);
  const panel = page.getByRole("region", { name: "Reviewers", exact: true });
  await panel.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await panel.getByRole("combobox", { name: "Reviewer", exact: true }).click();
  await page.getByRole("option", { name: fixture.reviewerName, exact: true }).click();
  const change = await beginCoordinatedChange(page, orgId, "reviewers", [fixture.b.id], recorder, () => panel.getByRole("button", { name: "Add", exact: true }).press("Enter"));
  await change.finish();
  await expect(panel.getByRole("listitem").filter({ hasText: fixture.reviewerName })).toContainText("Waiting");
  await capture("existing-optional-reviewer-waiting");
}

/** No lifecycle writes: real selection, one confirmation, Cancel/Escape and native history invalidation. */
export async function verifyMoveCancellations(page: Page, orgId: string, fixture: MoveFixtures, recorder: CoordinationRecorder, capture: MoveCapture, surfaces: readonly (typeof navigationSurfaces)[number][] = navigationSurfaces) {
  for (const surface of surfaces) {
    await page.setViewportSize({ width: surface.width, height: 900 }); await page.emulateMedia({ colorScheme: surface.colorScheme });
    // Sidebar scopes at / intentionally replace history. Enter the list from a
    // real detail route so native Back/Forward traverses genuine app entries.
    await page.goto(`/requests/${fixture.a.id}`);
    await expect(page.getByRole("region", { name: "Journey", exact: true })).toBeVisible();
    await sidebar(page, "All Requests");
    await selectMoveRows(page, [fixture.a, fixture.b, fixture.c]);
    const change = await beginCoordinatedChange(page, orgId, "bulk-pickup", [fixture.a.id, fixture.b.id], recorder, () => bar(page).getByRole("button", { name: "Pick up", exact: true }).press("Enter"));
    await expect(confirmation(page)).toBeVisible(); await expect(confirmation(page)).toContainText(fixture.b.code);
    await expect(confirmation(page).getByRole("listitem")).toHaveCount(1);
    await expect(confirmation(page)).not.toContainText(fixture.c.code);
    await capture(`${surface.width}-${surface.colorScheme}-one-confirmation-mixed-readiness`);
    await confirmation(page).getByRole("button", { name: "Cancel", exact: true }).press("Enter");
    await expect(confirmation(page)).toBeHidden(); await change.cancelled();
    await expect(bar(page)).toContainText("3 selected");
    await expect(page.locator("#lane-sidebar")).not.toHaveAttribute("data-peeking", "true");
    await row(page, fixture.c).focus(); await page.keyboard.press("Escape"); await expect(bar(page)).toBeHidden();
    await selectMoveRows(page, [fixture.a, fixture.b, fixture.c]);
    const history = await beginCoordinatedChange(page, orgId, "bulk-pickup", [fixture.a.id, fixture.b.id], recorder, () => bar(page).getByRole("button", { name: "Pick up", exact: true }).press("Enter"));
    await expect(confirmation(page)).toBeVisible(); await page.goBack();
    await expect(page).toHaveURL(url => url.pathname === `/requests/${fixture.a.id}`); await page.goForward();
    await expect(page).toHaveURL(url => url.pathname === "/");
    if (await confirmation(page).isVisible()) await confirmation(page).getByRole("button", { name: "Pick up anyway", exact: true }).press("Enter");
    await expect(confirmation(page)).toBeHidden(); await expect(bar(page)).toBeHidden(); await history.cancelled();
    await capture(`${surface.width}-${surface.colorScheme}-navigation-scope-return-zero-write`);
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await page.emulateMedia({ colorScheme: "light" });
  await detail(page, fixture.b);
  const single = await beginCoordinatedChange(page, orgId, "pickup", [fixture.b.id], recorder, () => page.getByRole("button", { name: "Pick up", exact: true }).press("Enter"));
  await expect(confirmation(page)).toBeVisible(); await page.goBack(); await expect(page).toHaveURL(url => url.pathname === "/");
  await page.goForward(); await expect(page).toHaveURL(url => url.pathname === `/requests/${fixture.b.id}`);
  if (await confirmation(page).isVisible()) await confirmation(page).getByRole("button", { name: "Pick up anyway", exact: true }).press("Enter");
  await expect(confirmation(page)).toBeHidden(); await expect(page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();
  await single.cancelled(); await capture("detail-confirmation-native-navigation-return-zero-write");
}

/** The second owned context makes B stale through the real UI, producing a genuine partial batch response. */
export async function verifyPartialPickup(page: Page, second: Page, orgId: string, fixture: MoveFixtures, recorder: CoordinationRecorder, capture: MoveCapture) {
  await page.goto("/"); await selectMoveRows(page, [fixture.a, fixture.b, fixture.c]);
  await second.goto(`/requests/${fixture.b.id}`);
  const single = await beginCoordinatedChange(second, orgId, "pickup", [fixture.b.id], recorder, async () => {
    await runPaletteCommand(second, "Pick up", undefined, "Control+k");
    await expect(confirmation(second)).toBeVisible();
    await confirmation(second).getByRole("button", { name: "Pick up anyway", exact: true }).press("Enter");
  });
  await single.finish(); await expect(second.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
  const batch = await beginCoordinatedChange(page, orgId, "bulk-pickup", [fixture.a.id, fixture.b.id], recorder, async () => {
    await bar(page).getByRole("button", { name: "Pick up", exact: true }).press("Enter");
    await expect(confirmation(page)).toBeVisible();
    await confirmation(page).getByRole("button", { name: "Pick up anyway", exact: true }).press("Enter");
  });
  const [result] = await batch.received(); await batch.finish();
  expect(result.moved).toEqual([fixture.a.id]); expect(result.failed).toEqual([expect.objectContaining({ id: fixture.b.id })]);
  await expect(bar(page)).toContainText("2 selected");
  await expect(row(page, fixture.b)).toHaveAttribute("aria-selected", "true"); await expect(row(page, fixture.c)).toHaveAttribute("aria-selected", "true");
  await expect(bar(page).getByRole("alert")).toContainText("no longer Open");
  await expect(bar(page).getByRole("alert")).toContainText("current value");
  await expect(row(page, fixture.a)).toHaveAttribute("aria-selected", "false");
  await capture("real-partial-pickup-retains-failed-and-unready", { requests: { a: fixture.a.id, b: fixture.b.id, c: fixture.c.id }, batchCalls: batch.count(), result });
}

export async function verifyPartialBulkUndo(page: Page, second: Page, orgId: string, fixture: MoveFixtures, recorder: CoordinationRecorder, capture: MoveCapture) {
  await page.goto(`/requests/${fixture.c.id}`); await setCurrentValue(page, orgId, fixture.c, recorder, "62");
  const pickup = await beginCoordinatedChange(page, orgId, "pickup", [fixture.c.id], recorder, () => page.getByRole("button", { name: "Pick up", exact: true }).press("Enter")); await pickup.finish();
  await expect(page.getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
  const done = await beginCoordinatedChange(page, orgId, "done", [fixture.c.id], recorder, () => page.getByRole("button", { name: "Mark Done", exact: true }).press("Enter")); await done.finish();
  await expect(isItLivePrompt(page)).toBeVisible(); await isItLivePrompt(page).getByRole("button", { name: "Not yet", exact: true }).press("Enter"); await expect(isItLivePrompt(page)).toBeHidden();
  await pauseStack(page); await sidebar(page, "All Requests"); await selectMoveRows(page, [fixture.a, fixture.b]);
  const batch = await beginCoordinatedChange(page, orgId, "bulk-done", [fixture.a.id, fixture.b.id], recorder, () => bar(page).getByRole("button", { name: "Mark Done", exact: true }).press("Enter")); await batch.finish();
  await expect(bulkToast(page)).toHaveCount(1); await expect(isItLivePrompt(page)).toBeHidden(); await expect(bar(page)).toBeHidden();
  await palettePointer(page, true); await expect(doneToast(page, fixture.c).getByRole("button", { name: "Undo", exact: true })).toBeVisible(); await pauseStack(page);
  await second.goto(`/requests/${fixture.a.id}`);
  await second.getByRole("region", { name: "Journey", exact: true }).getByRole("button", { name: "Record release", exact: true }).press("Enter");
  const form = second.getByRole("region", { name: "Journey", exact: true }).locator("form").filter({ has: second.getByLabel("Release evidence", { exact: true }) });
  await expect(form.getByLabel("Release evidence", { exact: true })).toBeVisible();
  const exposure = form.getByLabel("Actual exposure date (UTC)", { exact: true });
  const today = await exposure.getAttribute("max"); expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/); await exposure.fill(today!);
  const current = form.getByLabel(/^Value before release/); if (await current.count()) await current.fill("62");
  await form.getByLabel("Release evidence", { exact: true }).fill("175 retained fixture: real Release before partial bulk Undo");
  await form.getByRole("checkbox", { name: "The agreed audience received this work", exact: true }).check();
  const release = await beginCoordinatedChange(second, orgId, "release", [fixture.a.id], recorder, () => form.getByRole("button", { name: "Mark as released", exact: true }).press("Enter")); await release.finish(); await expect(form).toBeHidden();
  await expect(toastRegion(page).locator("ol")).toHaveAttribute("data-expanded", "true");
  const item = await bulkToast(page).elementHandle(); expect(item).not.toBeNull();
  const undo = await beginCoordinatedChange(page, orgId, "undo", [fixture.a.id, fixture.b.id], recorder, async () => {
    const button = bulkToast(page).getByRole("button", { name: "Undo", exact: true }); await button.focus(); await button.press("Enter"); await page.keyboard.press("Enter");
  });
  const outcomes = await undo.received(); await undo.finish(); expect(outcomes.filter(result => result.success === true)).toHaveLength(1); expect(outcomes.filter(result => typeof result.error === "string")).toHaveLength(1);
  await expect.poll(() => item!.evaluate(node => node.isConnected && /1 of 2 could not be undone/.test(node.textContent ?? ""))).toBe(true);
  await expect(toastRegion(page)).toContainText(fixture.a.code);
  await expect(toastRegion(page)).toContainText(String(outcomes.find(result => typeof result.error === "string")!.error));
  await expect.poll(() => item!.evaluate(node => [...node.querySelectorAll("button")].some(button => button.textContent === "Undo"))).toBe(false);
  await palettePointer(page, true); await capture("actual-partial-bulk-undo-one-shot-single-pointer-preserved", { calls: undo.count(), outcomes });
  // The palette must still execute C's single operation, never either bulk ID.
  const singleUndo = await beginCoordinatedChange(page, orgId, "undo", [fixture.c.id], recorder, () => runPaletteCommand(page, "Undo Mark Done", undefined, "Control+k")); await singleUndo.finish(); await palettePointer(page, false);
}

/** Real preview-only navigation must invalidate presentation without losing the saved operation's explicit Undo. */
async function verifyPendingPreview(page: Page, orgId: string, fixture: MoveFixtures, recorder: CoordinationRecorder, capture: MoveCapture, change: "replace" | "close") {
  await sidebar(page, "All Requests");
  const preview = page.getByRole("region", { name: "Request preview", exact: true });
  await row(page, fixture.b).focus(); await row(page, fixture.b).press("Space");
  await expect(preview).toHaveAttribute("data-request-id", fixture.b.id);
  const button = preview.getByRole("button", { name: "Mark Done", exact: true }); await expect(button).toBeVisible();
  const originalUrl = page.url();
  const done = await beginCoordinatedChange(page, orgId, "done", [fixture.b.id], recorder, () => button.press("Enter"), true);
  await done.received();
  if (change === "replace") {
    // J/K operates the actual list/preview keys. A group header may take one step.
    await row(page, fixture.b).focus();
    for (let step = 0; step < 3 && await preview.getAttribute("data-request-id") === fixture.b.id; step++) await page.keyboard.press("k");
    await expect(preview).not.toHaveAttribute("data-request-id", fixture.b.id);
    const nextId = await preview.getAttribute("data-request-id"); expect(nextId).toBeTruthy();
    await expect(page.locator(`#request-row-${nextId}`)).toBeFocused();
  } else {
    await page.keyboard.press("Escape"); await expect(preview).toBeHidden();
    await expect(row(page, fixture.b)).toBeFocused();
  }
  const focused = await page.locator(":focus").elementHandle(); expect(focused).not.toBeNull();
  const nextPreview = change === "replace" ? await preview.getAttribute("data-request-id") : null;
  await done.finish();
  await expect(page).toHaveURL(originalUrl); await expect(isItLivePrompt(page)).toBeHidden();
  await expect.poll(() => focused!.evaluate(node => node.isConnected && node === document.activeElement)).toBe(true);
  if (nextPreview) {
    await expect(preview).toHaveAttribute("data-request-id", nextPreview);
    // The held server action can serialize this new preview's read; wait for its content only after delivery.
    await expect(preview.locator("[data-detail-title]").getByRole("heading", { level: 2 })).toBeVisible();
  } else await expect(preview).toBeHidden();
  await expect(doneToast(page, fixture.b).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await pauseStack(page);
  await capture(`saved-preview-${change}-no-stale-prompt-or-focus`, { requestId: fixture.b.id, previewAfter: nextPreview, unchangedPath: new URL(originalUrl).pathname, calls: done.count() });
  const undo = await beginCoordinatedChange(page, orgId, "undo", [fixture.b.id], recorder, () => doneToast(page, fixture.b).getByRole("button", { name: "Undo", exact: true }).press("Enter")); await undo.finish();
  await expect(row(page, fixture.b)).toHaveAccessibleName(/In progress/);
  if (await preview.isVisible()) { await preview.getByRole("button", { name: "Close preview", exact: true }).press("Enter"); await expect(preview).toBeHidden(); }
  await capture(`saved-preview-${change}-explicit-undo-retained`);
}

/** Preview-only changes and native route changes each keep settlement without reviving old presentation. */
export async function verifyPendingMoveNavigation(page: Page, orgId: string, fixture: MoveFixtures, recorder: CoordinationRecorder, capture: MoveCapture) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await verifyPendingPreview(page, orgId, fixture, recorder, capture, "replace");
  await verifyPendingPreview(page, orgId, fixture, recorder, capture, "close");
  await sidebar(page, "All Requests"); await detail(page, fixture.b);
  const single = await beginCoordinatedChange(page, orgId, "done", [fixture.b.id], recorder, () => page.getByRole("button", { name: "Mark Done", exact: true }).press("Enter"), true);
  await single.received(); await page.goBack(); await expect(page).toHaveURL(url => url.pathname === "/"); await page.goForward(); await expect(page).toHaveURL(url => url.pathname === `/requests/${fixture.b.id}`);
  await page.locator("#lane-main").focus(); await single.finish(); await expect(page.locator("#lane-main")).toBeFocused(); await expect(isItLivePrompt(page)).toBeHidden();
  await expect(doneToast(page, fixture.b).getByRole("button", { name: "Undo", exact: true })).toBeVisible(); await pauseStack(page);
  await capture("saved-single-navigation-return-no-stale-prompt-or-focus");
  const undo = await beginCoordinatedChange(page, orgId, "undo", [fixture.b.id], recorder, () => doneToast(page, fixture.b).getByRole("button", { name: "Undo", exact: true }).press("Enter")); await undo.finish();
  await sidebar(page, "All Requests"); await selectMoveRows(page, [fixture.b, fixture.c]);
  const heldUrl = page.url();
  const batch = await beginCoordinatedChange(page, orgId, "bulk-done", [fixture.b.id, fixture.c.id], recorder, () => bar(page).getByRole("button", { name: "Mark Done", exact: true }).press("Enter"), true);
  await batch.received();
  for (const scope of ["No Project", "All Requests"]) {
    await chooseMoveProject(page, scope);
    await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary navigation", exact: true }).getByRole("link", { name: scope, exact: true })).toHaveAttribute("aria-current", "page");
    // Local scope changes immediately; #172 deliberately holds URL mirroring until the write settles.
    await expect(page).toHaveURL(heldUrl);
  }
  await expect(bar(page)).toBeHidden(); await page.locator("#lane-main").focus();
  const announcements = await page.locator('[data-slot="list-announcer"]').allTextContents();
  await batch.finish(); await expect(page.locator("#lane-main")).toBeFocused(); await expect(bar(page)).toBeHidden(); await expect(bulkToast(page)).toHaveCount(0); await expect(isItLivePrompt(page)).toBeHidden();
  await expect.poll(() => page.locator('[data-slot="list-announcer"]').allTextContents()).toEqual(announcements);
  await capture("saved-bulk-navigation-scope-return-no-stale-summary-selection-or-focus", { batchCalls: batch.count(), navigationScopes: ["All Requests", "No Project", "All Requests"], requestIds: [fixture.b.id, fixture.c.id] });
}
