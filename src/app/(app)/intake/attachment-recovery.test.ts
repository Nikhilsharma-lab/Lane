import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Attachment = {
  key: string;
  status: "failed" | "uploaded" | "queued" | "uploading";
  attachmentId: string | null;
  error?: string | null;
  file?: { name: string; type: string; size: number };
};

function loadHandlers(names: string[], sandbox: Record<string, unknown>) {
  const source = ts.createSourceFile(
    "intake-form.tsx",
    readFileSync(resolve("src/app/(app)/intake/intake-form.tsx"), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const handlers: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) {
      handlers.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const context = createContext(sandbox);
  runInContext(ts.transpile(handlers.join("\n"), { target: ts.ScriptTarget.ES2022 }), context);
  return context;
}

// Execute the real component handler without a browser/Clerk session. Only
// external upload, cleanup, state and navigation boundaries are substituted.
function retryHarness(attachments: Attachment[], outcomes: boolean[]) {
  const source = ts.createSourceFile(
    "intake-form.tsx",
    readFileSync(resolve("src/app/(app)/intake/intake-form.tsx"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const handlers: ts.FunctionDeclaration[] = [];
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && ["retryAttachments", "discardFailedAttachment"].includes(node.name.text)) {
      handlers.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!handlers.length) throw new Error("Intake retry handler was not found");

  const navigations: string[] = [];
  let current = attachments.map((attachment) => ({ ...attachment }));
  const operationInFlight = { current: false };
  const sandbox = {
    attachments,
    createdRequestId: "saved-request",
    context: { orgId: "org-test" },
    operationInFlight,
    onBusyChange: undefined,
    setMutationBusy: () => {},
    discardAttachmentUpload: async () => ({ success: true }),
    updateAttachment: (key: string, patch: Partial<Attachment>) => {
      current = current.map((item) => item.key === key ? { ...item, ...patch } : item);
    },
    uploadAttachment: async (attachment: Attachment) => {
      const success = outcomes.shift() ?? false;
      current = current.map((item) => item.key === attachment.key
        ? { ...item, status: success ? "uploaded" : "failed" }
        : item);
      return success;
    },
    finishCreatedRequest: (id: string) => navigations.push(id),
  };
  const context = createContext(sandbox);
  runInContext(ts.transpile(handlers.map((handler) => handler.getText(source)).join("\n"), {
    target: ts.ScriptTarget.ES2022,
  }), context);

  return {
    run: (subset: Attachment[]) =>
      (context.retryAttachments as (items: Attachment[]) => Promise<void>)(subset),
    current: () => current,
    navigations,
    operationInFlight,
  };
}

const failed = (key: string): Attachment => ({ key, status: "failed", attachmentId: null });

describe("attachment retry completion", () => {
  it("keeps recovery open when one of two failed files succeeds", async () => {
    const files = [failed("a"), failed("b")];
    const retry = retryHarness(files, [true]);
    await retry.run([files[0]]);
    expect(retry.current().map((file) => file.status)).toEqual(["uploaded", "failed"]);
    expect(retry.navigations).toEqual([]);
    expect(retry.operationInFlight.current).toBe(false);
  });

  it("navigates once after the last retained file succeeds despite stale render state", async () => {
    const files: Attachment[] = [{ key: "a", status: "uploaded", attachmentId: "saved-a" }, failed("b")];
    const retry = retryHarness(files, [true]);
    await retry.run([files[1]]);
    expect(files[1].status).toBe("failed");
    expect(retry.current().map((file) => file.status)).toEqual(["uploaded", "uploaded"]);
    expect(retry.navigations).toEqual(["saved-request"]);
  });

  it("does not finish when a retry batch still contains a failure", async () => {
    const files = [failed("a"), failed("b")];
    const retry = retryHarness(files, [true, false]);
    await retry.run(files);
    expect(retry.navigations).toEqual([]);
  });

  it("does not finish a nonempty outstanding queue after an empty retry", async () => {
    const retry = retryHarness([failed("a")], []);
    await retry.run([]);
    expect(retry.navigations).toEqual([]);
  });
});

function recoveryHarness(files: Attachment[]) {
  const state = {
    files: files.map((file) => ({ ...file })),
    stage: "attachment_recovery",
    failure: null as unknown,
    createdRequestId: "saved-request",
    navigations: [] as string[],
    cleanupIds: [] as string[],
    failCleanup: new Set<string>(),
    rejectCleanup: false,
    alreadyUploaded: false,
    uploadCalls: 0,
    saveCalls: 0,
    failUpload: true,
    failFinalize: false,
  };
  const operationInFlight = { current: false };
  const sandbox = {
    attachments: state.files,
    createdRequestId: state.createdRequestId,
    context: { orgId: "org-test" },
    operationInFlight,
    onBusyChange: undefined,
    setMutationBusy: () => {},
    source: {}, triage: { classification: "problem" }, token: "triage-token",
    draftCleared: { current: false }, draftScope: "scope",
    window: { sessionStorage: {} }, clearIntakeDraft: () => {},
    setRestoredDraft: () => {}, setProblemError: () => {},
    setFailure: (failure: unknown) => { state.failure = failure; },
    setStage: (stage: string) => { state.stage = stage; },
    setCreatedRequestId: (id: string) => { state.createdRequestId = id; },
    setAttachments: (update: (files: Attachment[]) => Attachment[]) => {
      state.files = update(state.files);
    },
    updateAttachment: (key: string, patch: Partial<Attachment>) => {
      state.files = state.files.map((item) => item.key === key ? { ...item, ...patch } : item);
    },
    saveRequest: async () => { state.saveCalls++; return { success: true, requestId: "saved-request" }; },
    prepareAttachmentUpload: async () => ({
      success: true, attachmentId: "reservation-a", signedUrl: "https://test.invalid/upload", mimeType: "image/png",
    }),
    uploadToSignedUrl: async () => {
      state.uploadCalls++;
      if (state.failUpload) throw new Error("upload network failure");
    },
    finalizeAttachmentUpload: async () => {
      if (state.failFinalize) throw new Error("Finalization response lost");
      return { success: true };
    },
    discardAttachmentUpload: async ({ attachmentId }: { attachmentId: string }) => {
      state.cleanupIds.push(attachmentId);
      if (state.failCleanup.has(attachmentId)) throw new Error("cleanup unavailable");
      if (state.alreadyUploaded) return { success: true, alreadyUploaded: true };
      return state.rejectCleanup
        ? { success: false, error: { code: "session_expired", message: "Sign in again to remove this file." } }
        : { success: true };
    },
    finishCreatedRequest: (id: string) => state.navigations.push(id),
  };
  const context = loadHandlers([
    "uploadAttachment", "onConfirm", "retryAttachments", "removeFailedFile",
    "continueWithoutFailedFiles", "discardFailedAttachment",
  ], sandbox);
  function render() {
    context.attachments = state.files;
    context.createdRequestId = state.createdRequestId;
  }
  return {
    state, operationInFlight,
    confirm: () => (context.onConfirm as () => Promise<void>)(),
    retry: (files: Attachment[]) => { render(); return (context.retryAttachments as (files: Attachment[]) => Promise<void>)(files); },
    remove: (file: Attachment) => { render(); return (context.removeFailedFile as (file: Attachment) => Promise<void>)(file); },
    skip: () => { render(); return (context.continueWithoutFailedFiles as () => Promise<void>)(); },
  };
}

const reserved = (key: string): Attachment => ({
  ...failed(key), attachmentId: `reservation-${key}`,
  file: { name: `${key}.png`, type: "image/png", size: 5 },
});

describe("attachment cleanup failure recovery", () => {
  it("recognizes a committed upload after a lost finalization response", async () => {
    const harness = recoveryHarness([{ ...reserved("a"), status: "queued", attachmentId: null }]);
    harness.state.failUpload = false;
    harness.state.failFinalize = true;
    harness.state.alreadyUploaded = true;
    await harness.confirm();
    expect(harness.state.files[0]).toMatchObject({ status: "uploaded", attachmentId: "reservation-a", error: null });
    expect(harness.state.navigations).toEqual(["saved-request"]);
    expect(harness.state.failure).toBeNull();
  });

  it.each(["retry", "remove", "skip"] as const)("recognizes an already-uploaded file during %s without replacing or hiding it", async (action) => {
    const file = reserved("a");
    const harness = recoveryHarness([file]);
    harness.state.alreadyUploaded = true;
    if (action === "retry") await harness.retry([file]);
    else if (action === "remove") await harness.remove(file);
    else await harness.skip();
    expect(harness.state.files[0]).toMatchObject({ status: "uploaded", attachmentId: "reservation-a", error: null });
    expect(harness.state.uploadCalls).toBe(0);
    expect(harness.state.navigations).toEqual(action === "remove" ? [] : ["saved-request"]);
  });

  it.each(["retry", "remove", "skip"] as const)("preserves the file after an explicit cleanup failure during %s", async (action) => {
    const file = reserved("a");
    const harness = recoveryHarness([file]);
    harness.state.rejectCleanup = true;
    if (action === "retry") await harness.retry([file]);
    else if (action === "remove") await harness.remove(file);
    else await harness.skip();
    expect(harness.state.files[0]).toMatchObject({
      status: "failed", attachmentId: "reservation-a", error: "Sign in again to remove this file.",
    });
    expect(harness.state.uploadCalls).toBe(0);
    expect(harness.state.navigations).toEqual([]);
    expect(harness.operationInFlight.current).toBe(false);
  });

  it("keeps an already-created Request in recovery when initial upload and cleanup both throw", async () => {
    const file = { ...reserved("a"), status: "queued" as const, attachmentId: null };
    const harness = recoveryHarness([file]);
    harness.state.failCleanup.add("reservation-a");
    await expect(harness.confirm()).resolves.toBeUndefined();
    expect(harness.state.stage).toBe("attachment_recovery");
    expect(harness.state.failure).toBeNull();
    expect(harness.state.saveCalls).toBe(1);
    expect(harness.state.files[0]).toMatchObject({ status: "failed", attachmentId: "reservation-a" });
    expect(harness.state.files[0].error).toBeTruthy();
    expect(harness.state.navigations).toEqual([]);
    expect(harness.operationInFlight.current).toBe(false);
  });

  it("does not reserve/upload again while an earlier cleanup is unconfirmed", async () => {
    const file = reserved("a");
    const harness = recoveryHarness([file]);
    harness.state.failCleanup.add("reservation-a");
    await expect(harness.retry([file])).resolves.toBeUndefined();
    expect(harness.state.uploadCalls).toBe(0);
    expect(harness.state.files[0]).toMatchObject({ status: "failed", attachmentId: "reservation-a" });
    expect(harness.state.files[0].error).toBeTruthy();
    expect(harness.state.navigations).toEqual([]);
    expect(harness.operationInFlight.current).toBe(false);
  });

  it("retains the file after failed removal and allows a later successful removal", async () => {
    const file = reserved("a");
    const harness = recoveryHarness([file]);
    harness.state.failCleanup.add("reservation-a");
    await expect(harness.remove(file)).resolves.toBeUndefined();
    expect(harness.state.files[0]).toMatchObject({ status: "failed", attachmentId: "reservation-a" });
    expect(harness.state.files[0].error).toBeTruthy();
    expect(harness.operationInFlight.current).toBe(false);
    harness.state.failCleanup.clear();
    await harness.remove(harness.state.files[0]);
    expect(harness.state.files).toEqual([]);
  });

  it("keeps skip recovery open for failed cleanup, remembers successful cleanup, and can retry", async () => {
    const harness = recoveryHarness([reserved("a"), reserved("b")]);
    harness.state.failCleanup.add("reservation-b");
    await expect(harness.skip()).resolves.toBeUndefined();
    expect(harness.state.navigations).toEqual([]);
    expect(harness.state.files[0].attachmentId).toBeNull();
    expect(harness.state.files[1]).toMatchObject({ status: "failed", attachmentId: "reservation-b" });
    expect(harness.state.files[1].error).toBeTruthy();
    expect(harness.operationInFlight.current).toBe(false);
    harness.state.failCleanup.clear();
    await harness.skip();
    expect(harness.state.cleanupIds).toEqual(["reservation-a", "reservation-b", "reservation-b"]);
    expect(harness.state.navigations).toEqual(["saved-request"]);
  });
});
