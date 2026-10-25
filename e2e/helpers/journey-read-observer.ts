import type { Page, Request, Response } from "@playwright/test";
import { compiledJourneyRead } from "./server-action-identity";

/** Passive transport metadata only; never changes reads, retains bodies, or records auth URLs. */
export async function observeJourneyReads(page: Page, orgId: string, requestId: string) {
  const identity = await compiledJourneyRead();
  const startedAt = new Date().toISOString();
  const reads: { sequence: number; dispatchedAt: string; respondedAt?: string; status?: number }[] = [];
  const pending = new Map<Request, (typeof reads)[number]>();
  let count = 0;
  const onRequest = (request: Request) => {
    if (request.method() !== "POST" || request.headers()["next-action"] !== identity.id) return;
    try {
      const args = JSON.parse(request.postData() ?? "null");
      if (!Array.isArray(args) || args.length !== 2 || args[0] !== requestId || args[1]?.orgId !== orgId) return;
    } catch { return; }
    const row = { sequence: ++count, dispatchedAt: new Date().toISOString() };
    if (reads.length < 64) { reads.push(row); pending.set(request, row); }
  };
  const onResponse = (response: Response) => {
    const row = pending.get(response.request());
    if (row) { row.respondedAt = new Date().toISOString(); row.status = response.status(); pending.delete(response.request()); }
  };
  page.on("request", onRequest); page.on("response", onResponse);
  return {
    count: () => count,
    snapshot: () => ({ ...identity, requestId, orgId, startedAt, count, reads, scope: "Observed after initial detail readiness; initial navigation reads are not counted." }),
    stop: () => { page.off("request", onRequest); page.off("response", onResponse); },
  };
}
