import { expect, it } from "vitest";
import { readUnfinishedUploads, writeUnfinishedUploads, clearUnfinishedUploads, type UnfinishedUploads } from "@/lib/unfinished-uploads";
import { createIntakeSession, type QueuedAttachment } from "./intake-uploads";

const files = (keys = ["a", "b"]): QueuedAttachment[] => keys.map(key => ({ key, file: new File([`bytes-${key}`], `${key}.png`, { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }));

/** Only external transport/storage are controlled; save/retry/cleanup use the production owner. */
function fixture(overrides: Partial<Parameters<typeof createIntakeSession>[0]> = {}) {
  let record: UnfinishedUploads | null = null;
  const prepared: string[] = [], transferred: string[] = [], discarded: string[] = [], finished: string[] = [];
  const rejectFiles = new Set(["a.png", "b.png"]);
  const rejectCleanup = new Set<string>();
  let saves = 0;
  const session = createIntakeSession({ scope: crypto.randomUUID(),
    prepare: async ({ fileName }) => { prepared.push(fileName); return { success: true, attachmentId: `reserved-${fileName}`, signedUrl: "https://storage.invalid/upload", mimeType: "image/png" }; },
    put: async (_url, file) => { transferred.push(file.name); if (rejectFiles.has(file.name)) throw new Error("Transfer failed"); },
    finalize: async () => ({ success: true }),
    discard: async ({ attachmentId }) => { discarded.push(attachmentId); if (rejectCleanup.has(attachmentId)) return { success: false, error: { code: "storage_unavailable", message: "Cleanup not confirmed." } }; return { success: true }; },
    record: { read: () => record, write: value => { record = value.files.length ? value : null; return true; }, clear: () => { record = null; return true; } },
    clearDraft: () => {}, ...overrides,
  });
  session.attach({ busy: () => {}, finish: id => { finished.push(id); } });
  return { session, prepared, transferred, discarded, finished, rejectFiles, rejectCleanup, record: () => record, saves: () => saves,
    save: (attachments = files()) => session.save({ run: async () => { saves++; return { success: true, requestId: "saved-request" }; }, title: "Problem", attachments, saved: () => {}, failed: () => { throw new Error("A post-save failure was reported as a save failure"); } }),
  };
}

it("a per-file retry keeps its failed sibling and only finishes after the last file succeeds", async () => {
  const app = fixture(); await app.save(); app.rejectFiles.clear();
  await app.session.retry(["a"]);
  expect(app.session.getSnapshot().files.map(file => file.status)).toEqual(["uploaded", "failed"]);
  expect(app.finished).toEqual([]);
  await app.session.retry([]);
  expect(app.finished).toEqual([]);
  await app.session.retry(["b"]);
  await app.session.retry();
  expect(app.transferred).toEqual(["a.png", "b.png", "a.png", "b.png"]);
  expect(app.finished).toEqual(["saved-request"]);
  expect(app.saves()).toBe(1);
  await app.session.detach();
});

it("a retry batch with one failure stays in recovery", async () => {
  const app = fixture(); await app.save(); app.rejectFiles.delete("a.png");
  await app.session.retry();
  expect(app.session.getSnapshot().phase).toBe("recovery");
  expect(app.record()?.files.map(file => file.key)).toEqual(["b"]);
  expect(app.finished).toEqual([]);
  await app.session.detach();
});

it.each(["throw", "typed"] as const)("recognizes an already committed upload after a %s finalization failure", async mode => {
  const app = fixture({ finalize: async () => { if (mode === "throw") throw new Error("Response lost"); return { success: false, error: { code: "storage_unavailable", message: "Response unavailable." } }; }, discard: async () => ({ success: true, alreadyUploaded: true }) });
  app.rejectFiles.clear(); await app.save(files(["a"]));
  if (mode === "typed") await app.session.retry();
  expect(app.prepared).toEqual(["a.png"]);
  expect(app.transferred).toEqual(["a.png"]);
  expect(app.session.getSnapshot().files[0].status).toBe("uploaded");
  expect(app.finished).toEqual(["saved-request"]);
  await app.session.detach();
});

it.each(["throw", "typed"] as const)("retains a failed reservation on %s cleanup and never reserves twice", async mode => {
  let allow = false;
  const app = fixture({ discard: async () => { if (allow) return { success: true }; if (mode === "throw") throw new Error("No response"); return { success: false, error: { code: "session_expired", message: "Sign in again." } }; } });
  await app.save(files(["a"])); await app.session.retry(); await app.session.remove("a"); await app.session.continueWithout();
  expect(app.prepared).toEqual(["a.png"]);
  expect(app.record()?.files[0].attachmentId).toBe("reserved-a.png");
  expect(app.finished).toEqual([]);
  allow = true; await app.session.remove("a"); await app.session.continueWithout();
  expect(app.finished).toEqual(["saved-request"]);
  await app.session.detach();
});

it("Skip remembers each confirmed cleanup and retries only the unresolved reservation", async () => {
  const app = fixture(); app.rejectCleanup.add("reserved-a.png"); app.rejectCleanup.add("reserved-b.png");
  await app.save(); app.rejectCleanup.delete("reserved-a.png");
  await app.session.continueWithout();
  expect(app.session.getSnapshot().files[0].attachmentId).toBeNull();
  expect(app.session.getSnapshot().files[1].attachmentId).toBe("reserved-b.png");
  const before = app.discarded.length; app.rejectCleanup.clear();
  await app.session.continueWithout();
  expect(app.discarded.slice(before)).toEqual(["reserved-b.png"]);
  expect(app.finished).toEqual(["saved-request"]);
  await app.session.detach();
});

it.each(["retry", "remove", "skip"] as const)("serializes %s behind the current retry", async contender => {
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let pending = false;
  const app = fixture({ put: async () => { if (pending) { started.resolve(); await release.promise; } else throw new Error("Offline"); } });
  await app.save(files(["a"])); pending = true;
  const retrying = app.session.retry(); await started.promise;
  if (contender === "retry") await app.session.retry();
  else if (contender === "remove") await app.session.remove("a");
  else await app.session.continueWithout();
  expect(app.prepared).toEqual(["a.png", "a.png"]);
  expect(app.finished).toEqual([]);
  release.resolve(); await retrying;
  expect(app.finished).toEqual(["saved-request"]);
  await app.session.detach();
});

it.each([false, true])("detached retry continues and keeps no record after confirmed cleanup (transfer fails: %s)", async fails => {
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let retry = false;
  const app = fixture({ put: async () => { if (!retry) throw new Error("Initial failure"); started.resolve(); await release.promise; if (fails) throw new Error("Retry failure"); } });
  await app.save(files(["a"])); retry = true;
  const running = app.session.retry(); await started.promise; await app.session.detach(); release.resolve(); await running;
  expect(app.record()).toBeNull();
  expect(app.finished).toEqual([]);
  expect(app.session.getSnapshot().files[0].status).toBe(fails ? "failed" : "uploaded");
});

it.each(["refused", "rejected"] as const)("retains an unattended reservation after %s cleanup", async failure => {
  const app = fixture({ discard: async () => { if (failure === "rejected") throw new Error("No response"); return { success: false, error: { code: "storage_unavailable", message: "Could not discard." } }; } });
  await app.save(files(["a"])); await app.session.detach();
  expect(app.record()).toEqual({ requestId: "saved-request", title: "Problem", files: [{ key: "a", name: "a.png", attachmentId: "reserved-a.png" }] });
  expect(app.finished).toEqual([]);
});

it("persists the reserved ID using the real record adapter before PUT", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const scope = crypto.randomUUID();
  const record = { read: () => readUnfinishedUploads(storage, scope), write: (value: UnfinishedUploads) => writeUnfinishedUploads(storage, scope, value), clear: () => clearUnfinishedUploads(storage, scope) };
  const atTransfer: (UnfinishedUploads | null)[] = [];
  const app = fixture({ scope, record, put: async () => { atTransfer.push(record.read()); } });
  await app.save(files(["a"]));
  expect(atTransfer).toEqual([expect.objectContaining({ requestId: "saved-request", files: [{ key: "a", name: "a.png", attachmentId: "reserved-a.png" }] })]);
  expect(record.read()).toBeNull();
  await app.session.detach();
});
