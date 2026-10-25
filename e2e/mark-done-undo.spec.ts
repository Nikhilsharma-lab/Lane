import { expect, test, type TestInfo } from "@playwright/test";
import postgres from "postgres";
import { createTestUser, signInTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";
import { createRequestThroughIntake, type ReviewTeam } from "./helpers/reviewers";
import { assertE2ETarget } from "./helpers/safety";
import { signInNativeTestUser, withNativeVisibility } from "./helpers/native-visibility";
import { assertLocalUndoTarget } from "./helpers/server-action-identity";
import { markDone, undoDriver, undoFromToast, undoSurfaces, verifyDoneFailure, verifyEarlyUndo, verifyEnding, verifyLatestPair, verifyPause, verifySavedStatusSkippedUndo, verifyReleaseFailureThenNewerPrompt, verifyUndoFailure, type UndoRecorder, type UndoRequest } from "./helpers/mark-done-undo";

// This standard suite provisions one owned account and seven normal-UI Requests.
// Quota-bound acceptance uses the same helpers with separately verified retained identities.
// History-bearing fixtures are retained, never deleted or reset by this test.
test("actual toast lifetime and palette agree across keyboard, touch, real time and native visibility", async ({ browser }, testInfo) => {
  test.setTimeout(900_000);
  assertLocalUndoTarget();
  const user = await createTestUser("undo-lifetime");
  const setup = await browser.newContext();
  const page = await setup.newPage();
  const orgId = await provisionAndSignIn(page, user, { name: "Undo acceptance", workspaceName: "Undo lifetime acceptance" });
  const team: ReviewTeam = { users: [user], orgId, pages: [page], close: async () => { await setup.close(); } };
  const fixtures: UndoRequest[] = [];
  try {
    for (let index = 0; index < 7; index++) {
      const title = `Undo lifetime retained Request ${index + 1}`;
      const saved = await createRequestThroughIntake(team, title, { windowDays: 7 });
      await testInfo.attach(`saved-request-${index}`, { body: JSON.stringify(saved), contentType: "application/json" });
      const sql = postgres(assertE2ETarget().databaseUrl, { ssl: "require", max: 1 });
      try {
        await sql.begin("read only", async tx => {
          const [row] = await tx`select request_number,title from requests where id=${saved.id} and org_id=${orgId}`;
          expect(row.title).toBe(title);
          fixtures.push({ id: saved.id, code: `LAN-${row.request_number}`, title });
        });
      } finally { await sql.end(); }
    }
    await testInfo.attach("retained-undo-fixtures", { body: JSON.stringify({ orgId, userId: user.id, fixtures }), contentType: "application/json" });
  } finally { await setup.close(); }
  let sequence = 0;
  const recorder: UndoRecorder = {
    async intent(request, move) {
      const id = `${++sequence}-${request.code}-${move}`;
      await testInfo.attach(`intent-${id}`, { body: JSON.stringify({ id, request, move, at: new Date().toISOString() }), contentType: "application/json" }); return id;
    },
    async transport(operation, metadata) { await testInfo.attach(`transport-${operation}-${metadata.stage}`, { body: JSON.stringify(metadata), contentType: "application/json" }); },
    async result(operation, result) { await testInfo.attach(`result-${operation}`, { body: JSON.stringify(result), contentType: "application/json" }); },
  };
  await withNativeVisibility(async native => {
    await native.setViewportSize({ width: 1440, height: 900 });
    await signInNativeTestUser(native, user.email, orgId);
    const driver = await undoDriver(native, orgId, fixtures[0], recorder); await driver.pickUp();
    await verifyPause(driver, "hidden", capture(testInfo, native, "native"));
  });
  const releaseContext = await browser.newContext();
  try {
    const view = await releaseContext.newPage(); await signInTestUser(view, user, orgId);
    const driver = await undoDriver(view, orgId, fixtures[6], recorder); await driver.pickUp();
    await verifyReleaseFailureThenNewerPrompt(driver, orgId, fixtures[1], recorder, capture(testInfo, view, "release"));
  } finally { await releaseContext.close(); }
  for (const [index, surface] of undoSurfaces.entries()) {
    const context = await browser.newContext({ viewport: { width: surface.width, height: 900 }, colorScheme: surface.colorScheme, reducedMotion: surface.reducedMotion, hasTouch: surface.width === 390 });
    const view = await context.newPage();
    try {
      await signInTestUser(view, user, orgId);
      let driver = await undoDriver(view, orgId, fixtures[index], recorder); await driver.pickUp();
      const record = capture(testInfo, view, `${surface.width}-${surface.colorScheme}`);
      if (index === 0) {
        await verifyDoneFailure(driver, record); await verifyEarlyUndo(driver, record);
        await markDone(driver); await undoFromToast(driver, record);
        await verifyPause(driver, "hover", record); await verifyPause(driver, "focus", record);
        await verifyLatestPair(driver, orgId, fixtures[1], recorder, record);
        driver = await undoDriver(view, orgId, fixtures[0], recorder);
      }
      if (index === 2) await verifyPause(driver, "touch", record);
      await verifyEnding(driver, surface.ending, record);
    } finally { await context.close(); }
  }
  for (const index of [4, 5]) {
    const context = await browser.newContext(); const view = await context.newPage();
    try {
      await signInTestUser(view, user, orgId);
      const driver = await undoDriver(view, orgId, fixtures[index], recorder);
      const record = capture(testInfo, view, `terminal-${index}`);
      if (index === 4) await verifySavedStatusSkippedUndo(driver, orgId, record);
      else { await driver.pickUp(); await verifyUndoFailure(driver, record); }
    } finally { await context.close(); }
  }
});

function capture(testInfo: TestInfo, page: import("@playwright/test").Page, prefix: string) {
  return async (name: string, receipt?: unknown) => {
    await testInfo.attach(`${prefix}-${name}`, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
    if (receipt) await testInfo.attach(`${prefix}-${name}-receipt`, { body: JSON.stringify(receipt), contentType: "application/json" });
  };
}
