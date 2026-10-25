import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, type Request, type Route } from "@playwright/test";
import { assertLocalUndoTarget, flightResultShape } from "./server-action-identity";

export type CoordinatedChange = "pickup" | "done" | "undo" | "bulk-pickup" | "bulk-done" | "edit" | "reviewers" | "release";
const actionExports = {
  pickup: ["src/app/(app)/requests/[id]/actions.ts", "pickUpRequest"],
  done: ["src/app/(app)/requests/[id]/actions.ts", "markDone"],
  undo: ["src/app/(app)/requests/[id]/actions.ts", "undoMarkDone"],
  "bulk-pickup": ["src/app/(app)/requests/[id]/actions.ts", "pickUpRequests"],
  "bulk-done": ["src/app/(app)/requests/[id]/actions.ts", "markDoneMany"],
  edit: ["src/app/(app)/requests/[id]/edit-actions.ts", "saveRequestEdits"],
  reviewers: ["src/app/(app)/requests/[id]/reviewer-actions.ts", "addReviewers"],
  release: ["src/app/(app)/requests/[id]/release-actions.ts", "changeRequestRelease"],
  triage: ["src/app/(app)/intake/actions.ts", "runTriage"],
} as const;
async function compiled(kind: keyof typeof actionExports) {
  assertLocalUndoTarget();
  const source = await readFile(resolve(process.cwd(), ".next-e2e/dev/server/server-reference-manifest.json"), "utf8");
  const manifest: { node?: Record<string, { filename?: string; exportedName?: string }> } = JSON.parse(source);
  const [filename, exportedName] = actionExports[kind];
  const matches = Object.entries(manifest.node ?? {}).filter(([, value]) => value.filename === filename && value.exportedName === exportedName);
  expect(matches, `Unique current-runtime ${exportedName}`).toHaveLength(1);
  const id = matches[0][0]; expect(id).toMatch(/^[a-f0-9]+$/);
  return { id, filename, exportedName, manifestSha256: createHash("sha256").update(source).digest("hex") };
}
export type CoordinationTransport = Awaited<ReturnType<typeof compiled>> & { method: string; stage: "intercepted" | "response" | "refused"; refusal?: "unexpected-arguments" | "duplicate-write"; status?: number; shape?: ReturnType<typeof flightResultShape>; requestIds: string[] };
export type CoordinationRecorder = {
  intent: (kind: CoordinatedChange, ids: string[]) => Promise<string>;
  transport: (operation: string, metadata: CoordinationTransport) => Promise<void>;
  response: (operation: string, ids: string[], result: Record<string, unknown>) => Promise<void>;
  delivered: (operation: string, ids: string[]) => Promise<void>;
  settled: (operation: string) => Promise<void>;
  cancelled: (operation: string) => Promise<void>;
  blockedGate: () => Promise<void>;
};
function requestIds(request: Request, kind: CoordinatedChange, orgId: string, expected: string[]) {
  let args: unknown;
  try { args = JSON.parse(request.postData() ?? "null"); } catch { return null; }
  if (!Array.isArray(args)) return null;
  let ids: unknown;
  if (kind === "edit") { if (args.length !== 3 || args[2]?.orgId !== orgId) return null; ids = [args[0]]; }
  else if (kind === "reviewers" || kind === "release") {
    if (args.length !== 2 || args[0]?.orgId !== orgId || (kind === "release" && args[1]?.kind !== "release")) return null;
    ids = [args[0]?.requestId];
  } else {
    if (args.length !== 2 || args[1]?.orgId !== orgId) return null;
    ids = kind.startsWith("bulk-") ? args[0] : [args[0]];
  }
  if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === "string" && expected.includes(id))) return null;
  if (kind.startsWith("bulk-") && JSON.stringify([...ids].sort()) !== JSON.stringify([...expected].sort())) return null;
  return ids as string[];
}
function resultFrom(body: string) {
  for (const line of body.split("\n")) {
    const match = /^[\da-f]+:(.+)$/.exec(line); if (!match) continue;
    try {
      const value = JSON.parse(match[1]);
      if (value && (value.success === true || typeof value.error === "string" || (Array.isArray(value.moved) && Array.isArray(value.failed)))) return value as Record<string, unknown>;
    } catch { /* Flight controls are not action results. */ }
  }
  throw new Error("Unknown actual write result; preserve pending intent and reconcile before retry.");
}

/** Real writes only. Holds response delivery, never fabricates results or retries ambiguous writes. */
export async function beginCoordinatedChange(page: Page, orgId: string, kind: CoordinatedChange, ids: string[], recorder: CoordinationRecorder, trigger: () => Promise<void>, hold = false) {
  const identity = await compiled(kind);
  const expectedCalls = kind === "undo" ? ids.length : 1;
  if (hold && expectedCalls !== 1) throw new Error("Do not hold parallel per-ID Undo responses; client action queues may serialize them.");
  const operation = await recorder.intent(kind, ids);
  const received = Promise.withResolvers<Record<string, unknown>[]>();
  const delivered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  // A route error must remain observable without an unhandled secondary rejection.
  void received.promise.catch(() => {}); void delivered.promise.catch(() => {});
  const seen = new Set<string>(), results: Record<string, unknown>[] = [];
  let calls = 0, responses = 0, deliveries = 0, settled = false;
  const pattern = `${new URL(page.url()).origin}/**`;
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.headers()["next-action"] !== identity.id) return route.fallback();
    calls++;
    const targetIds = request.method() === "POST" ? requestIds(request, kind, orgId, ids) : null;
    const refuse = async (reason: "unexpected-arguments" | "duplicate-write") => {
      const failure = new Error(`Coordinated write refused before dispatch: ${reason}. Preserve the pending intent for diagnosis.`);
      try {
        // No unvalidated arguments, target IDs or headers enter the receipt.
        await recorder.transport(operation, { ...identity, method: request.method(), stage: "refused", refusal: reason, requestIds: targetIds ?? [] });
      } finally {
        try { await route.abort("failed"); } finally { received.reject(failure); delivered.reject(failure); }
      }
    };
    if (!targetIds) return refuse("unexpected-arguments");
    const key = [...targetIds].sort().join(",");
    if (seen.has(key)) return refuse("duplicate-write");
    seen.add(key);
    try {
      const metadata = { ...identity, method: request.method(), requestIds: targetIds };
      await recorder.transport(operation, { ...metadata, stage: "intercepted" });
      const response = await route.fetch({ maxRetries: 0 });
      const body = await response.text();
      await recorder.transport(operation, { ...metadata, stage: "response", status: response.status(), shape: flightResultShape(body) });
      const result = resultFrom(body); await recorder.response(operation, targetIds, result);
      results.push(result); responses++;
      if (responses === expectedCalls) {
        await recorder.settled(operation); settled = true; received.resolve(results);
      }
      if (hold) await release.promise;
      await route.fulfill({ response }); await recorder.delivered(operation, targetIds); deliveries++;
      if (deliveries === expectedCalls) delivered.resolve();
    } catch (error) { received.reject(error); delivered.reject(error); }
  };
  await page.route(pattern, handler);
  try { await trigger(); } catch (error) { await page.unroute(pattern, handler); throw error; }
  return {
    operation, count: () => calls, received: () => received.promise,
    async finish() { release.resolve(); try { await received.promise; await delivered.promise; expect(calls).toBe(expectedCalls); expect(settled).toBe(true); } finally { await page.unroute(pattern, handler); } },
    async cancelled() { try { expect(calls).toBe(0); await recorder.cancelled(operation); } finally { await page.unroute(pattern, handler); } },
  };
}

/** Unchanged-wording Edit must never call AI. Abort a positively identified attempt before dispatch. */
export async function forbidTriage(page: Page, recorder: CoordinationRecorder) {
  const identity = await compiled("triage");
  let attempts = 0;
  const blocked = Promise.withResolvers<never>(); void blocked.promise.catch(() => {});
  const pattern = `${new URL(page.url()).origin}/**`;
  const handler = async (route: Route) => {
    if (route.request().method() !== "POST" || route.request().headers()["next-action"] !== identity.id) return route.fallback();
    attempts++; await recorder.blockedGate(); await route.abort("failed"); blocked.reject(new Error("Unexpected AI gate attempt blocked before dispatch; stop acceptance."));
  };
  await page.route(pattern, handler);
  return { blocked: blocked.promise, assertUnused: () => expect(attempts, "Unchanged Edit did not request AI").toBe(0), close: () => page.unroute(pattern, handler) };
}
