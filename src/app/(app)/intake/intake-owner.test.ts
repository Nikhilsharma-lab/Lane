import { expect, it } from "vitest";
import { createIntakeSession } from "./intake-uploads";
import type { UnfinishedUploads } from "@/lib/unfinished-uploads";

function owner(overrides: Partial<Parameters<typeof createIntakeSession>[0]> = {}) {
  let record: UnfinishedUploads | null = null;
  let draft = "An unsaved problem";
  let prepared = 0;
  const failures: unknown[] = [];
  const saved: string[] = [];
  const finished: string[] = [];
  const session = createIntakeSession({
    scope: crypto.randomUUID(),
    prepare: async ({ fileName }) => { prepared++; return { success: true, attachmentId: `attachment-${fileName}`, signedUrl: "https://storage.invalid/upload", mimeType: "image/png" }; },
    put: async () => {}, finalize: async () => ({ success: true }), discard: async () => ({ success: true }),
    record: { read: () => record, write: value => { record = value.files.length ? value : null; return true; }, clear: () => { record = null; return true; } },
    clearDraft: () => { draft = ""; },
    ...overrides,
  });
  session.attach({ busy: () => {}, finish: id => { finished.push(id); } });
  return { session, failures, saved, finished, draft: () => draft, prepared: () => prepared, record: () => record };
}

it("a failed production save retains its draft and starts no attachment reservation", async () => {
  const app = owner();
  await app.session.save({
    run: async () => ({ success: false, error: { code: "save_failed", message: "Saved version changed." } }),
    title: "Problem", attachments: [{ key: "a", file: new File(["bytes"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }],
    saved: result => { app.saved.push(result.requestId); }, failed: error => { app.failures.push(error); },
  });
  expect(app.draft()).toBe("An unsaved problem");
  expect(app.prepared()).toBe(0);
  expect(app.saved).toEqual([]);
  expect(app.finished).toEqual([]);
  expect(app.failures).toEqual([{ code: "save_failed", message: "Saved version changed." }]);
  expect(app.session.getSnapshot().busy).toBe(false);
  app.session.detach();
});

it("hands a no-file save off once and never saves it again after completion", async () => {
  const app = owner();
  const pending = Promise.withResolvers<{ success: true; requestId: string }>();
  let saves = 0;
  const input = { run: () => { saves++; return pending.promise; }, title: "Problem", attachments: [], saved: (result: { requestId: string }) => { app.saved.push(result.requestId); }, failed: (error: unknown) => { app.failures.push(error); } };
  const first = app.session.save(input);
  await app.session.save(input);
  pending.resolve({ success: true, requestId: "saved-request" });
  await first;
  await app.session.save(input);
  expect(saves).toBe(1);
  expect(app.saved).toEqual(["saved-request"]);
  expect(app.draft()).toBe("");
  expect(app.finished).toEqual(["saved-request"]);
  expect(app.failures).toEqual([]);
  app.session.detach();
});

it("keeps a saved Request in recovery when its second attachment fails", async () => {
  const transferred: string[] = [];
  const app = owner({ put: async (_url, file) => { transferred.push(file.name); if (file.name === "b.png") throw new Error("Connection lost"); } });
  const attachments = ["a", "b"].map((key): import("./intake-uploads").QueuedAttachment => ({ key, file: new File(["bytes"], `${key}.png`, { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }));
  await app.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Problem", attachments,
    saved: result => { app.saved.push(result.requestId); }, failed: error => { app.failures.push(error); } });
  expect(transferred).toEqual(["a.png", "b.png"]);
  expect(app.saved).toEqual(["saved-request"]);
  expect(app.draft()).toBe("");
  expect(app.finished).toEqual([]);
  expect(app.failures).toEqual([]);
  expect(app.record()).toEqual({ requestId: "saved-request", title: "Problem", files: [{ key: "b", name: "b.png", attachmentId: null }] });
  app.session.detach();
});

it("retries only the unfinished file through the same owner without another save", async () => {
  const transferred: string[] = [];
  let fail = true;
  let saves = 0;
  const app = owner({ put: async (_url, file) => { transferred.push(file.name); if (file.name === "b.png" && fail) throw new Error("Connection lost"); } });
  const attachments = ["a", "b"].map((key): import("./intake-uploads").QueuedAttachment => ({ key, file: new File(["bytes"], `${key}.png`, { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }));
  await app.session.save({ run: async () => { saves++; return { success: true, requestId: "saved-request" }; }, title: "Problem", attachments,
    saved: result => { app.saved.push(result.requestId); }, failed: error => { app.failures.push(error); } });
  fail = false;
  await app.session.retry();
  await app.session.retry();
  expect(transferred).toEqual(["a.png", "b.png", "b.png"]);
  expect(saves).toBe(1);
  expect(app.finished).toEqual(["saved-request"]);
  expect(app.record()).toBeNull();
  app.session.detach();
});

it("does not relabel a saved Request as a failed save when its handoff observer throws", async () => {
  const app = owner();
  const attachments = [{ key: "a", file: new File(["bytes"], "a.png", { type: "image/png" }), status: "queued" as const, progress: 0, attachmentId: null, error: null }];
  await app.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Problem", attachments,
    saved: result => { app.saved.push(result.requestId); throw new Error("Observer failed"); }, failed: error => { app.failures.push(error); } });
  expect(app.session.getSnapshot()).toMatchObject({ requestId: "saved-request", phase: "recovery", busy: false });
  expect(app.failures).toEqual([]);
  expect(app.record()).toEqual({ requestId: "saved-request", title: "Problem", files: [{ key: "a", name: "a.png", attachmentId: null }] });
  expect(app.prepared()).toBe(0);
  expect(app.draft()).toBe("");
  app.session.detach();
});

it("does not let a second same-scope owner replace a pending save's recovery record", async () => {
  let record: UnfinishedUploads | null = null;
  const records = { read: () => record, write: (value: UnfinishedUploads) => { record = value.files.length ? value : null; return true; }, clear: () => { record = null; return true; } };
  const scope = crypto.randomUUID();
  const first = owner({ scope, record: records });
  const pending = Promise.withResolvers<{ success: true; requestId: string }>();
  const saving = first.session.save({ run: () => pending.promise, title: "First problem", attachments: [], saved: () => {}, failed: () => {} });
  first.session.detach();
  const second = owner({ scope, record: records });
  let secondSaves = 0;
  await second.session.save({ run: async () => { secondSaves++; return { success: true, requestId: "second" }; }, title: "Second problem", attachments: [], saved: () => {}, failed: () => {} });
  expect(secondSaves).toBe(0);
  pending.resolve({ success: true, requestId: "first" });
  await saving;
  expect(first.finished).toEqual([]);
  expect(second.finished).toEqual([]);
  second.session.detach();
});

it.each([false, true])("a detached save clears only its own persisted draft (newer draft detached: %s)", async newer => {
  let draft = "First draft";
  const scope = crypto.randomUUID();
  const first = owner({ scope, clearDraft: () => { draft = ""; } });
  first.session.persistDraft(() => true);
  const pending = Promise.withResolvers<{ success: true; requestId: string }>();
  const saving = first.session.save({ run: () => pending.promise, title: "First problem", attachments: [], saved: () => {}, failed: () => {} });
  first.session.detach();
  if (newer) {
    const second = owner({ scope, clearDraft: () => { draft = ""; } });
    second.session.persistDraft(() => { draft = "Newer draft"; return true; });
    second.session.detach();
  }
  pending.resolve({ success: true, requestId: "first" });
  await saving;
  expect(draft).toBe(newer ? "Newer draft" : "");
  expect(first.finished).toEqual([]);
});

it("keeps saved Files in recovery without preparing when the initial record cannot persist", async () => {
  const app = owner({ record: { read: () => null, write: () => false, clear: () => false } });
  await app.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Problem",
    attachments: [{ key: "a", file: new File(["bytes"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }],
    saved: result => { app.saved.push(result.requestId); }, failed: error => { app.failures.push(error); } });
  expect(app.prepared()).toBe(0);
  expect(app.session.getSnapshot()).toMatchObject({ requestId: "saved-request", phase: "recovery" });
  expect(app.session.getSnapshot().error).toBeTruthy();
  expect(app.draft()).toBe("");
  expect(app.saved).toEqual(["saved-request"]);
  expect(app.failures).toEqual([]);
  app.session.detach();
});

it("does not PUT when reservation persistence fails and retains a refused discard's ID", async () => {
  let record: UnfinishedUploads | null = null;
  const discarded: string[] = [];
  let puts = 0;
  const app = owner({
    record: { read: () => record, write: value => { if (value.files.some(file => file.attachmentId)) return false; record = value; return true; }, clear: () => { record = null; return true; } },
    put: async () => { puts++; },
    discard: async ({ attachmentId }) => { discarded.push(attachmentId); return { success: false, error: { code: "storage_unavailable", message: "Could not confirm cleanup." } }; },
  });
  await app.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Problem",
    attachments: [{ key: "a", file: new File(["bytes"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }], saved: () => {}, failed: error => { app.failures.push(error); } });
  expect(puts).toBe(0);
  expect(discarded).toEqual(["attachment-a.png"]);
  expect(app.session.getSnapshot().files[0]).toMatchObject({ status: "failed", attachmentId: "attachment-a.png" });
  expect(app.failures).toEqual([]);
  app.session.detach();
});

it("hands unpersisted reservation metadata to the next same-scope owner instead of allowing another save", async () => {
  const scope = crypto.randomUUID();
  let stored: UnfinishedUploads | null = null;
  const record = { read: () => stored, write: (value: UnfinishedUploads) => { if (value.files.some(file => file.attachmentId)) return false; stored = value; return true; }, clear: () => { stored = null; return true; } };
  const first = owner({ scope, record, discard: async () => ({ success: false, error: { code: "storage_unavailable", message: "Cleanup not confirmed." } }) });
  await first.session.save({ run: async () => ({ success: true, requestId: "first" }), title: "First problem",
    attachments: [{ key: "a", file: new File(["bytes"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }], saved: () => {}, failed: () => {} });
  await first.session.detach();
  const second = owner({ scope, record });
  let saves = 0;
  await second.session.save({ run: async () => { saves++; return { success: true, requestId: "second" }; }, title: "Second problem", attachments: [], saved: () => {}, failed: () => {} });
  expect(saves).toBe(0);
  expect(second.session.getSnapshot()).toMatchObject({ phase: "lost", lost: { requestId: "first", files: [{ key: "a", name: "a.png", attachmentId: "attachment-a.png" }] } });
  second.session.detach();
});

it("cancelled AI cannot publish or release a replacement check's busy state", async () => {
  const app = owner();
  const old = Promise.withResolvers<string>();
  const next = Promise.withResolvers<string>();
  const answers: string[] = [];
  const checking = app.session.check({ run: () => old.promise, receive: value => { answers.push(value); }, failed: () => { answers.push("old error"); } });
  app.session.cancelCheck();
  const replacement = app.session.check({ run: () => next.promise, receive: value => { answers.push(value); }, failed: () => { answers.push("new error"); } });
  old.resolve("old answer");
  await checking;
  expect(answers).toEqual([]);
  expect(app.session.getSnapshot().busy).toBe(true);
  next.resolve("new answer");
  await replacement;
  expect(answers).toEqual(["new answer"]);
  expect(app.session.getSnapshot().busy).toBe(false);
  app.session.detach();
});

it("detaching an AI check releases its scope without publishing its late answer", async () => {
  const scope = crypto.randomUUID();
  const first = owner({ scope });
  const pending = Promise.withResolvers<string>();
  const answers: string[] = [];
  const checking = first.session.check({ run: () => pending.promise, receive: value => { answers.push(value); }, failed: () => { answers.push("old error"); } });
  first.session.detach();
  const second = owner({ scope });
  await second.session.check({ run: async () => "new answer", receive: value => { answers.push(value); }, failed: () => {} });
  pending.resolve("old answer");
  await checking;
  expect(answers).toEqual(["new answer"]);
  second.session.detach();
});

it.each(["save", "prepare", "put", "finalize"] as const)("Leave during %s finishes only current work and confirms cleanup before releasing ownership", async stage => {
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const prepared: string[] = [];
  const transferred: string[] = [];
  const wait = async (at: string) => { if (stage === at) { reached.resolve(); await release.promise; } };
  const app = owner({
    prepare: async ({ fileName }) => { prepared.push(fileName); await wait("prepare"); return { success: true, attachmentId: `reserved-${fileName}`, signedUrl: "https://storage.invalid/upload", mimeType: "image/png" }; },
    put: async (_url, file) => { transferred.push(file.name); await wait("put"); },
    finalize: async () => { await wait("finalize"); return { success: false, error: { code: "storage_unavailable", message: "Could not finalize." } }; },
  });
  const saving = app.session.save({ run: async () => { await wait("save"); return { success: true, requestId: "saved-request" }; }, title: "Problem",
    attachments: ["a", "b"].map(key => ({ key, file: new File(["bytes"], `${key}.png`, { type: "image/png" }), status: "queued" as const, progress: 0, attachmentId: null, error: null })), saved: () => {}, failed: error => { app.failures.push(error); } });
  await reached.promise;
  app.session.leave();
  release.resolve();
  await saving;
  expect(prepared).toEqual(stage === "save" ? [] : ["a.png"]);
  expect(transferred).toEqual(stage === "save" ? [] : ["a.png"]);
  expect(app.finished).toEqual([]);
  expect(app.failures).toEqual([]);
  expect(app.record()).toBeNull();
  expect(app.session.getSnapshot().busy).toBe(false);
  app.session.detach();
});

it("rebinding committed presentation uses the latest callbacks without replacing a pending operation", async () => {
  const app = owner();
  const pending = Promise.withResolvers<{ success: true; requestId: string }>();
  const newer: string[] = [];
  const saving = app.session.save({ run: () => pending.promise, title: "Problem", attachments: [], saved: () => {}, failed: () => {} });
  app.session.bind({ busy: () => {}, finish: id => { newer.push(id); } });
  pending.resolve({ success: true, requestId: "saved-request" });
  await saving;
  expect(newer).toEqual(["saved-request"]);
  expect(app.finished).toEqual([]);
  app.session.detach();
});

it("a detached save finishes all files and confirmed cleanup without presenting into another form", async () => {
  const pending = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const transferred: string[] = [];
  const app = owner({ put: async (_url, file) => { transferred.push(file.name); if (file.name === "a.png") { started.resolve(); await pending.promise; } } });
  const saving = app.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Problem",
    attachments: ["a", "b"].map(key => ({ key, file: new File(["bytes"], `${key}.png`, { type: "image/png" }), status: "queued" as const, progress: 0, attachmentId: null, error: null })), saved: () => {}, failed: () => {} });
  await started.promise;
  app.session.detach();
  pending.resolve();
  await saving;
  expect(transferred).toEqual(["a.png", "b.png"]);
  expect(app.record()).toBeNull();
  expect(app.finished).toEqual([]);
});

it("removal and Skip preserve a refused reservation and serialize behind retry", async () => {
  let cleanupAllowed = false;
  const app = owner({ finalize: async () => ({ success: false, error: { code: "storage_unavailable", message: "Finalize unavailable." } }),
    discard: async () => cleanupAllowed ? { success: true } : { success: false, error: { code: "storage_unavailable", message: "Cleanup unavailable." } } });
  await app.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Problem",
    attachments: [{ key: "a", file: new File(["bytes"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }], saved: () => {}, failed: () => {} });
  await app.session.remove("a");
  await app.session.continueWithout();
  expect(app.session.getSnapshot().files[0].attachmentId).toBe("attachment-a.png");
  expect(app.finished).toEqual([]);
  cleanupAllowed = true;
  await app.session.remove("a");
  expect(app.session.getSnapshot().files).toEqual([]);
  expect(app.record()).toBeNull();
  await app.session.continueWithout();
  expect(app.finished).toEqual(["saved-request"]);
  app.session.detach();
});

it("an initial persistence failure can only retry after names persist, without another save", async () => {
  let writable = false;
  let record: UnfinishedUploads | null = null;
  const app = owner({ record: { read: () => record, write: value => { if (!writable) return false; record = value.files.length ? value : null; return true; }, clear: () => { record = null; return true; } } });
  await app.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Problem",
    attachments: [{ key: "a", file: new File(["bytes"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }], saved: () => {}, failed: () => {} });
  await app.session.retry();
  expect(app.prepared()).toBe(0);
  writable = true;
  await app.session.retry();
  expect(app.prepared()).toBe(1);
  expect(app.finished).toEqual(["saved-request"]);
  app.session.detach();
});

it("reconciles names-only recovery without PUT and keeps unresolved IDs reachable after Dismiss", async () => {
  const original: UnfinishedUploads = { requestId: "old-request", title: "Earlier problem", origin: 123,
    files: [{ key: "a", name: "a.png", attachmentId: "reserved-a" }, { key: "b", name: "b.png", attachmentId: "reserved-b" }] };
  let record: UnfinishedUploads | null = original;
  let allowed = false;
  let puts = 0;
  const app = owner({ record: { read: () => record, write: value => { record = value; return true; }, clear: () => { record = null; return true; } },
    put: async () => { puts++; }, discard: async ({ attachmentId }) => attachmentId === "reserved-a" ? { success: true, alreadyUploaded: true }
      : allowed ? { success: true } : { success: false, error: { code: "session_expired", message: "Sign in again." } } });
  await app.session.recover();
  expect(app.session.getSnapshot()).toMatchObject({ phase: "lost", files: [], lost: { origin: 123, files: [{ key: "b", name: "b.png", attachmentId: "reserved-b" }] } });
  app.session.dismissLost();
  expect(record?.files[0].attachmentId).toBe("reserved-b");
  expect(app.session.getSnapshot().phase).toBe("lost");
  allowed = true;
  await app.session.recover();
  expect(record?.files).toEqual([{ key: "b", name: "b.png", attachmentId: null }]);
  app.session.dismissLost();
  expect(record).toBeNull();
  expect(app.session.getSnapshot().phase).toBe("idle");
  expect(puts).toBe(0);
  app.session.detach();
});

it("late upload progress cannot rewrite a later operation or same-scope form", async () => {
  let late: ((progress: number) => void) | undefined;
  const app = owner({ put: async (_url, _file, progress) => { late = progress; } });
  await app.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Problem",
    attachments: [{ key: "a", file: new File(["bytes"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }], saved: () => {}, failed: () => {} });
  late?.(3);
  expect(app.session.getSnapshot().files[0]).toMatchObject({ status: "uploaded", progress: 100 });
  await app.session.detach();
});

it("a superseded mounted form cannot overwrite the newer form's persisted draft", async () => {
  const scope = crypto.randomUUID();
  let draft = "First";
  const first = owner({ scope }); first.session.persistDraft(() => true);
  const second = owner({ scope }); second.session.persistDraft(() => { draft = "Second"; return true; });
  first.session.persistDraft(() => { draft = "Stale first"; return true; });
  expect(draft).toBe("Second");
  await first.session.detach(); await second.session.detach();
});

it("an earlier owner cannot clear a newer recovery record even for the same saved Request ID", async () => {
  const scope = crypto.randomUUID();
  let stored: UnfinishedUploads | null = null;
  const record = { read: () => stored, write: (value: UnfinishedUploads) => { stored = value.files.length ? value : null; return true; }, clear: () => { stored = null; return true; } };
  const finalize = async () => ({ success: false as const, error: { code: "storage_unavailable" as const, message: "Not finalized." } });
  const first = owner({ scope, record, finalize, discard: async () => ({ success: false, error: { code: "storage_unavailable", message: "Cleanup not confirmed." } }) });
  await first.session.save({ run: async () => ({ success: true, requestId: "same-request" }), title: "First", attachments: [{ key: "a", file: new File(["a"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }], saved: () => {}, failed: () => {} });
  await first.session.detach();
  const second = owner({ scope, record, finalize });
  await second.session.recover(); second.session.dismissLost();
  await second.session.save({ run: async () => ({ success: true, requestId: "same-request" }), title: "Second", attachments: [{ key: "b", file: new File(["b"], "b.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }], saved: () => {}, failed: () => {} });
  const before = structuredClone(stored);
  await first.session.detach();
  expect(stored).toEqual(before);
  expect(record.read()?.files[0].attachmentId).toBe("attachment-b.png");
  await second.session.detach();
});

it("does not treat a still-mounted owner's retained Files as orphan recovery", async () => {
  const scope = crypto.randomUUID();
  let stored: UnfinishedUploads | null = null;
  let discards = 0;
  const record = { read: () => stored, write: (value: UnfinishedUploads) => { stored = value.files.length ? value : null; return true; }, clear: () => { stored = null; return true; } };
  const first = owner({ scope, record, finalize: async () => ({ success: false, error: { code: "storage_unavailable", message: "Not finalized." } }) });
  await first.session.save({ run: async () => ({ success: true, requestId: "saved-request" }), title: "Retained", attachments: [{ key: "a", file: new File(["a"], "a.png", { type: "image/png" }), status: "queued", progress: 0, attachmentId: null, error: null }], saved: () => {}, failed: () => {} });
  const second = owner({ scope, record, discard: async () => { discards++; return { success: true }; } });
  expect(second.session.recoveryRecord()).toBeNull();
  await second.session.recover();
  expect(discards).toBe(0);
  expect(record.read()?.files[0].attachmentId).toBe("attachment-a.png");
  await second.session.detach(); await first.session.detach();
});

it.each([false, true])("a mounted form with no remaining recovery record does not block another save (first saved: %s)", async success => {
  const scope = crypto.randomUUID();
  const first = owner({ scope });
  await first.session.save({ run: async () => success ? { success: true, requestId: "first" } : { success: false, error: { code: "save_failed", message: "Not saved." } }, title: "First", attachments: [], saved: () => {}, failed: () => {} });
  const second = owner({ scope });
  let saves = 0;
  await second.session.save({ run: async () => { saves++; return { success: true, requestId: "second" }; }, title: "Second", attachments: [], saved: () => {}, failed: () => {} });
  expect(saves).toBe(1);
  expect(second.finished).toEqual(["second"]);
  await first.session.detach(); await second.session.detach();
});
