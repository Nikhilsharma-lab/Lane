import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { createRequestThroughIntake, createReviewTeam } from "./helpers/reviewers";
import { signInTestUser } from "./helpers/test-user";
import { assertE2ETarget } from "./helpers/safety";
import { assertLocalUndoTarget } from "./helpers/server-action-identity";
import type { CoordinationRecorder } from "./helpers/move-coordination-transport";
import { prepareMoveCoordination, verifyMoveCancellations, verifyPartialPickup, verifyPartialBulkUndo, verifyPendingMoveNavigation, type MoveFixtures } from "./helpers/request-move-coordination";

// Standard fresh-fixture suite. Quota-bound acceptance uses these same helpers with
// separately verified retained identities and a serialized durable receipt ledger.
// Requires this checkout's local dev manifest; never reuse another build's action IDs.
test("single and batch moves preserve their distinct contracts across real navigation and partial results", async ({ browser, page }, testInfo) => {
  test.setTimeout(900_000); assertLocalUndoTarget();
  const team = await createReviewTeam(browser, page);
  const secondContext = await browser.newContext(); const second = await secondContext.newPage();
  const requests: MoveFixtures["a"][] = [];
  try {
    for (const name of ["A", "B", "C"]) {
      const title = `Move coordination retained ${name}`;
      const saved = await createRequestThroughIntake(team, title);
      await testInfo.attach(`saved-request-${name}`, { body: JSON.stringify(saved), contentType: "application/json" });
      const sql = postgres(assertE2ETarget().databaseUrl, { ssl: "require", max: 1 });
      try {
        await sql.begin("read only", async tx => {
          const [row] = await tx`select title,request_number from requests where id=${saved.id} and org_id=${team.orgId}`;
          expect(row.title).toBe(title); requests.push({ id: saved.id, title, code: `LAN-${row.request_number}` });
        });
      } finally { await sql.end(); }
    }
    const fixture: MoveFixtures = { a: requests[0], b: requests[1], c: requests[2], reviewerName: "Review Designer" };
    await signInTestUser(second, team.users[0], team.orgId);
    let sequence = 0, event = 0;
    const attach = async (name: string, value: unknown) => { await testInfo.attach(`${++event}-${name}`, { body: JSON.stringify(value), contentType: "application/json" }); };
    const recorder: CoordinationRecorder = {
      async intent(kind, ids) { const id = `${++sequence}-${kind}`; await attach(`intent-${id}`, { kind, ids, at: new Date().toISOString() }); return id; },
      transport: (id, metadata) => attach(`transport-${id}`, metadata),
      response: (id, ids, result) => attach(`response-${id}`, { ids, result }),
      delivered: (id, ids) => attach(`delivery-${id}`, { ids }),
      settled: id => attach(`settled-${id}`, {}), cancelled: id => attach(`cancelled-${id}`, { writes: 0 }),
      async blockedGate() { await attach("blocked-unexpected-ai", { dispatched: false }); },
    };
    const capture = async (name: string, receipt?: unknown) => {
      await testInfo.attach(name, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
      if (receipt) await attach(`${name}-receipt`, receipt);
    };
    await prepareMoveCoordination(page, team.orgId, fixture, recorder, capture);
    await verifyMoveCancellations(page, team.orgId, fixture, recorder, capture);
    await verifyPartialPickup(page, second, team.orgId, fixture, recorder, capture);
    await verifyPartialBulkUndo(page, second, team.orgId, fixture, recorder, capture);
    await verifyPendingMoveNavigation(page, team.orgId, fixture, recorder, capture);
  } finally { await secondContext.close(); await team.close(testInfo); }
});
