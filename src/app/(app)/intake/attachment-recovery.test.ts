import { describe, expect, it } from "vitest";
import { createUploadSession, type QueuedAttachment } from "./intake-uploads";

type Attachment = {
  key: string;
  status: "failed" | "uploaded" | "queued" | "uploading";
  attachmentId: string | null;
  error?: string | null;
  file?: { name: string; type: string; size: number };
};
type UploadsRecord = { requestId: string; title: string; files: { key: string; name: string; attachmentId: string | null }[] };

const fileOf = (key: string) => ({ name: `${key}.png`, type: "image/png", size: 5 });
const failed = (key: string): Attachment => ({ key, status: "failed", attachmentId: null, file: fileOf(key) });

/**
 * The upload session (intake-uploads.ts) with fake attachment actions, storage
 * and record. `confirm` is the composer's save step around uploadSaved: it
 * holds the one-operation lock, saves, then uploads every file, as onConfirm.
 */
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
    /** Upload outcomes in order; once empty, failUpload decides. */
    outcomes: [] as boolean[],
    failFinalize: false,
    rejectFinalize: false,
    recordCleared: 0,
    // The unfinished-uploads record as the upload screen last wrote it.
    record: {
      requestId: "saved-request",
      title: "",
      files: files.map(({ key, file, attachmentId }) => ({ key, name: file?.name ?? key, attachmentId })),
    } as UploadsRecord | null,
    busy: [] as boolean[],
    onSave: undefined as (() => void) | undefined,
    onUpload: undefined as (() => void) | undefined,
  };
  const refs = {
    operationInFlight: { current: false },
    leftUploadScreen: { current: false },
    unmounted: { current: false },
    uploadsRequest: { current: null as string | null },
    reservations: { current: new Map<string, string>() },
  };
  const session = () => createUploadSession({
    refs,
    prepare: async ({ fileName }) => ({ success: true, attachmentId: `reservation-${fileName.split(".")[0]}`, signedUrl: "https://test.invalid/upload", mimeType: "image/png" } as never),
    put: async () => {
      state.uploadCalls++;
      state.onUpload?.();
      const outcome = state.outcomes.length ? state.outcomes.shift() : !state.failUpload;
      if (!outcome) throw new Error("upload network failure");
    },
    finalize: async () => {
      if (state.failFinalize) throw new Error("Finalization response lost");
      if (state.rejectFinalize) return { success: false, error: { code: "storage_unavailable", message: "Lane could not finish this upload." } } as never;
      return { success: true } as never;
    },
    discard: async ({ attachmentId }) => {
      state.cleanupIds.push(attachmentId);
      if (state.failCleanup.has(attachmentId)) throw new Error("cleanup unavailable");
      if (state.alreadyUploaded) return { success: true, alreadyUploaded: true } as never;
      return (state.rejectCleanup
        ? { success: false, error: { code: "session_expired", message: "Sign in again to remove this file." } }
        : { success: true }) as never;
    },
    record: {
      read: () => state.record,
      write: (record) => { state.record = record.files.length ? record : null; },
      clear: () => { state.recordCleared++; state.record = null; },
    },
    setAttachments: (update) => { state.files = update(state.files as unknown as QueuedAttachment[]) as unknown as Attachment[]; },
    setBusy: (busy) => { state.busy.push(busy); },
    finish: (id) => state.navigations.push(id),
  });
  const files$ = () => state.files as unknown as QueuedAttachment[];
  async function confirm() {
    if (refs.operationInFlight.current) return;
    refs.operationInFlight.current = true;
    state.busy.push(true);
    try {
      state.saveCalls++;
      state.onSave?.();
      const requestId = "saved-request";
      state.createdRequestId = requestId;
      if (!state.files.length) {
        if (!session().unattended()) state.navigations.push(requestId);
        return;
      }
      state.stage = "uploading";
      const uploaded = await session().uploadSaved(requestId, "", files$());
      if (uploaded === "uploaded") state.navigations.push(requestId);
      else if (uploaded === "recovery") state.stage = "attachment_recovery";
    } finally {
      refs.operationInFlight.current = false;
      if (!refs.unmounted.current) state.busy.push(false);
      session().settleLeft();
    }
  }
  return {
    state, operationInFlight: refs.operationInFlight, leftUploadScreen: refs.leftUploadScreen, uploadsRequest: refs.uploadsRequest,
    leave: () => session().leave(),
    unmount: () => session().unmount(),
    confirm,
    retry: (subset: Attachment[], all: Attachment[] = state.files) => session().retry(subset as unknown as QueuedAttachment[], all as unknown as QueuedAttachment[], state.createdRequestId),
    remove: (file: Attachment) => session().remove(file as unknown as QueuedAttachment, state.createdRequestId),
    skip: () => session().continueWithout(files$(), state.createdRequestId),
  };
}

describe("attachment retry completion", () => {
  // A failed file with no reservation is uploaded again; `outcomes` decides each upload.
  function retryHarness(files: Attachment[], outcomes: boolean[]) {
    const harness = recoveryHarness(files);
    harness.state.outcomes = [...outcomes];
    harness.state.failUpload = true;
    return {
      run: (subset: Attachment[]) => harness.retry(subset, files),
      current: () => harness.state.files,
      navigations: harness.state.navigations,
      operationInFlight: harness.operationInFlight,
    };
  }
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

describe("leaving the upload screen (plan item 2.3, S3)", () => {
  const queued = (key: string): Attachment => ({ ...reserved(key), status: "queued", attachmentId: null });
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
  const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

  it("Leave page finishes the file in flight, starts no other, then clears its reservation and the record", async () => {
    const harness = recoveryHarness([queued("a"), queued("b")]);
    harness.state.stage = "framing";
    harness.state.failUpload = false;
    // The file in flight is stored but its finalization is refused, so its reservation stays open.
    harness.state.rejectFinalize = true;
    harness.state.onUpload = () => harness.leave();
    await harness.confirm();
    await settled();
    expect(harness.state.uploadCalls).toBe(1);
    expect(harness.state.stage).toBe("uploading");
    expect(harness.state.navigations).toEqual([]);
    expect(harness.state.cleanupIds).toEqual(["reservation-a"]);
    expect(harness.state.recordCleared).toBe(1);
    expect(harness.state.record).toBeNull();
    expect(harness.state.busy).toEqual([true, false]);
    expect(harness.operationInFlight.current).toBe(false);
  });

  it("unmounting lets the uploads go on, follows them in the record, and clears it when they end", async () => {
    const harness = recoveryHarness([queued("a"), queued("b"), queued("c")]);
    harness.state.stage = "framing";
    harness.state.failUpload = false;
    const records: unknown[] = [];
    // Back during the first upload; each later upload sees the record as a reload would.
    harness.state.onUpload = () => {
      if (harness.state.uploadCalls === 1) harness.unmount();
      else records.push(snapshot(harness.state.record));
    };
    await harness.confirm();
    await settled();
    expect(harness.state.uploadCalls).toBe(3);
    expect(records).toEqual([
      { requestId: "saved-request", title: "", files: [{ key: "b", name: "b.png", attachmentId: "reservation-b" }, { key: "c", name: "c.png", attachmentId: null }] },
      { requestId: "saved-request", title: "", files: [{ key: "c", name: "c.png", attachmentId: "reservation-c" }] },
    ]);
    // Every file was added, so nothing is reported later and no reservation is left.
    expect(harness.state.record).toBeNull();
    expect(harness.state.cleanupIds).toEqual([]);
    // Nothing renders, navigates or releases the busy flag after unmount.
    expect(harness.state.files.map((file) => file.status)).toEqual(["uploading", "queued", "queued"]);
    expect(harness.state.stage).toBe("uploading");
    expect(harness.state.navigations).toEqual([]);
    expect(harness.state.busy).toEqual([true]);
    expect(harness.operationInFlight.current).toBe(false);
  });

  it("an unmounted composer's failed upload loses its reservation and the record when the loop ends", async () => {
    const harness = recoveryHarness([queued("a"), queued("b")]);
    harness.state.stage = "framing";
    harness.state.failUpload = false;
    harness.state.onUpload = () => {
      if (harness.state.uploadCalls === 1) harness.unmount();
      // The second file is stored but its finalization is refused.
      else harness.state.rejectFinalize = true;
    };
    await harness.confirm();
    expect(harness.state.uploadCalls).toBe(2);
    await settled();
    expect(harness.state.cleanupIds).toEqual(["reservation-b"]);
    expect(harness.state.recordCleared).toBe(1);
    expect(harness.state.record).toBeNull();
    expect(harness.state.stage).toBe("uploading");
    expect(harness.state.navigations).toEqual([]);
  });

  it("a retry under way when the composer unmounts goes on and does not end the flow", async () => {
    const harness = recoveryHarness([reserved("a"), reserved("b")]);
    harness.uploadsRequest.current = "saved-request";
    harness.state.failUpload = false;
    harness.state.onUpload = () => { if (harness.state.uploadCalls === 1) harness.unmount(); };
    await harness.retry(harness.state.files);
    await settled();
    expect(harness.state.uploadCalls).toBe(2);
    // Each earlier reservation is cleared before its file is tried again.
    expect(harness.state.cleanupIds).toEqual(["reservation-a", "reservation-b"]);
    expect(harness.state.record).toBeNull();
    expect(harness.state.navigations).toEqual([]);
    expect(harness.state.busy).toEqual([true]);
  });

  it("Back while the save is pending lists the Request but neither toasts nor navigates", async () => {
    const harness = recoveryHarness([]);
    harness.state.stage = "framing";
    harness.state.record = null;
    harness.state.onSave = () => harness.unmount();
    await harness.confirm();
    await settled();
    expect(harness.state.saveCalls).toBe(1);
    // finishCreatedRequest owns the toast and the push; it never runs.
    expect(harness.state.navigations).toEqual([]);
    expect(harness.state.record).toBeNull();
    expect(harness.state.busy).toEqual([true]);
    expect(harness.operationInFlight.current).toBe(false);
  });

  it("Back while the save is pending with files records them before the first upload, and the uploads go on", async () => {
    const harness = recoveryHarness([queued("a"), queued("b")]);
    harness.state.stage = "framing";
    harness.state.failUpload = false;
    // The upload screen never renders, so its effect never writes the record.
    harness.state.record = null;
    harness.state.onSave = () => harness.unmount();
    const records: unknown[] = [];
    // Each upload sees the record as a reload would.
    harness.state.onUpload = () => records.push(snapshot(harness.state.record));
    await harness.confirm();
    await settled();
    expect(harness.state.uploadCalls).toBe(2);
    expect(records).toEqual([
      { requestId: "saved-request", title: "", files: [{ key: "a", name: "a.png", attachmentId: "reservation-a" }, { key: "b", name: "b.png", attachmentId: null }] },
      { requestId: "saved-request", title: "", files: [{ key: "b", name: "b.png", attachmentId: "reservation-b" }] },
    ]);
    // Every file was added: no record or reservation is left, and nothing navigates.
    expect(harness.state.record).toBeNull();
    expect(harness.state.cleanupIds).toEqual([]);
    expect(harness.state.navigations).toEqual([]);
    expect(harness.state.busy).toEqual([true]);
    expect(harness.operationInFlight.current).toBe(false);
  });

  it("Back while the save is pending with a file that fails clears its reservation and the record when the loop ends", async () => {
    const harness = recoveryHarness([queued("a")]);
    harness.state.stage = "framing";
    harness.state.failUpload = false;
    harness.state.rejectFinalize = true;
    harness.state.record = null;
    harness.state.onSave = () => harness.unmount();
    const records: unknown[] = [];
    harness.state.onUpload = () => records.push(snapshot(harness.state.record));
    await harness.confirm();
    await settled();
    expect(records).toEqual([
      { requestId: "saved-request", title: "", files: [{ key: "a", name: "a.png", attachmentId: "reservation-a" }] },
    ]);
    expect(harness.state.cleanupIds).toEqual(["reservation-a"]);
    expect(harness.state.recordCleared).toBe(1);
    expect(harness.state.record).toBeNull();
    expect(harness.state.navigations).toEqual([]);
  });

  it.each(["leave", "unmount"] as const)("%s settles at once when no upload is running", async (action) => {
    const harness = recoveryHarness([queued("a")]);
    harness.state.stage = "framing";
    harness.state.failUpload = false;
    // A refused finalization leaves the Request in recovery with an open reservation.
    harness.state.rejectFinalize = true;
    await harness.confirm();
    expect(harness.state.stage).toBe("attachment_recovery");
    expect(harness.state.recordCleared).toBe(0);
    harness[action]();
    await settled();
    expect(harness.state.cleanupIds).toEqual(["reservation-a"]);
    expect(harness.state.recordCleared).toBe(1);
    expect(harness.state.navigations).toEqual([]);
  });
});
