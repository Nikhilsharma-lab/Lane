import type { DiscardAttachmentResponse, FinalizeAttachmentResponse, PrepareAttachmentResponse } from "./attachment-actions";
import type { UnfinishedUploads } from "@/lib/unfinished-uploads";
import { createExternalStore } from "@/lib/external-store";
import type { SaveResponse } from "./actions";
import { settleLostUploads } from "./intake-session";

/** A file chosen in the composer, as it moves through its upload. */
export type QueuedAttachment = {
  key: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress: number;
  attachmentId: string | null;
  error: string | null;
};

type AttachmentTransport = {
  /** The attachment actions, already bound to the workspace. */
  prepare: (input: { requestId: string; fileName: string; mimeType: string; sizeBytes: number }) => Promise<PrepareAttachmentResponse>;
  finalize: (input: { requestId: string; attachmentId: string }) => Promise<FinalizeAttachmentResponse>;
  discard: (input: { requestId: string; attachmentId: string }) => Promise<DiscardAttachmentResponse>;
  /** Stores the file at the signed URL, reporting progress. */
  put: (signedUrl: string, file: File, onProgress: (progress: number) => void) => Promise<void>;
};

type SavedRequest = Extract<SaveResponse, { success: true }>;
type SaveFailure = Extract<SaveResponse, { success: false }>["error"];
type IntakePresentation = { busy: (busy: boolean) => void; finish: (requestId: string, options?: { open?: boolean }) => void; cancelCheck?: (cancel: (() => boolean) | null) => void };
type IntakeSessionDeps = AttachmentTransport & {
  scope: string;
  record: { read: () => UnfinishedUploads | null; write: (record: UnfinishedUploads) => boolean; clear: () => boolean };
  clearDraft: () => void;
};

type IntakeSnapshot = {
  busy: boolean;
  error: string | null;
  requestId: string | null;
  files: QueuedAttachment[];
  lost: UnfinishedUploads | null;
  phase: "idle" | "checking" | "saving" | "uploading" | "recovery" | "reconciling" | "lost" | "complete";
};
type IntakeScope = { bindings: Set<symbol>; presentation: symbol | null; operation: symbol | null; draft: symbol | null; recordOwner: symbol | null; unpersisted: UnfinishedUploads | null };
const intakeScopes = new Map<string, IntakeScope>();

function releaseScope(scope: string, entry: IntakeScope) {
  if (!entry.bindings.size && !entry.operation && !entry.unpersisted && intakeScopes.get(scope) === entry) intakeScopes.delete(scope);
}

/** The form's save operation, with transport and presentation kept at its boundaries. */
export function createIntakeSession(deps: IntakeSessionDeps) {
  const state = createExternalStore<IntakeSnapshot>({ busy: false, error: null, requestId: null, files: [], lost: null, phase: "idle" });
  let presentation: IntakePresentation | null = null;
  let binding: symbol | null = null;
  let operation: symbol | null = null;
  let checkingToken: symbol | null = null;
  let presentationIntent = 0;
  const identity = Symbol();
  const scope = () => {
    let entry = intakeScopes.get(deps.scope);
    if (!entry) { entry = { bindings: new Set(), presentation: null, operation: null, draft: null, recordOwner: null, unpersisted: null }; intakeScopes.set(deps.scope, entry); }
    return entry;
  };
  const anotherRetainedOwner = () => {
    const entry = scope();
    return entry.recordOwner !== null && entry.recordOwner !== identity && entry.bindings.has(entry.recordOwner) && record.read() !== null;
  };
  const retainedOwnerError = "Another open form still has this Request’s unfinished files. Return to that form to retry or skip them.";
  const storageError = "Your Request is saved, but this browser could not keep upload recovery information. Keep this tab open and try again.";
  const record = {
    read() {
      if (scope().unpersisted) return scope().unpersisted;
      try { return deps.record.read(); } catch { return null; }
    },
    write(value: UnfinishedUploads) {
      let persisted = false;
      try { persisted = deps.record.write(value); } catch { /* Retain metadata in this document when storage is unavailable. */ }
      scope().unpersisted = persisted ? null : value;
      if (!persisted) state.set({ ...state.get(), error: storageError });
      return persisted;
    },
    clear() {
      const retained = record.read();
      let cleared = false;
      try { cleared = deps.record.clear(); } catch { /* Keep recovery reachable until clearing is confirmed. */ }
      scope().unpersisted = cleared ? null : retained;
      if (!cleared) state.set({ ...state.get(), error: storageError });
      return cleared;
    },
  };
  let left = false;
  let savedTitle = "";
  const reservations = new Map<string, string>();
  function updateAttachment(key: string, update: Partial<QueuedAttachment>) {
    // Recovery follows the operation before another transfer can start;
    // a mounted form's later React effect is not a persistence boundary.
    const persisted = followUploadRecord(key, update);
    state.set({ ...state.get(), files: state.get().files.map(attachment => attachment.key === key ? { ...attachment, ...update } : attachment) });
    return persisted;
  }

  function followUploadRecord(key: string, update: Partial<QueuedAttachment>) {
    if (update.status !== "uploaded" && update.attachmentId === undefined) return true;
    const retained = record.read();
    if (!retained || retained.requestId !== state.get().requestId) return false;
    return record.write({
      ...retained,
      files: update.status === "uploaded"
        ? retained.files.filter((file) => file.key !== key)
        : retained.files.map((file) => file.key === key ? { ...file, attachmentId: update.attachmentId ?? null } : file),
    });
  }

  async function discardFailed(attachment: QueuedAttachment, requestId: string): Promise<"discarded" | "uploaded" | "failed"> {
    const attachmentId = attachment.attachmentId;
    if (!attachmentId) return "discarded";
    try {
      const result = await deps.discard({ requestId, attachmentId });
      if (!result.success) {
        updateAttachment(attachment.key, { status: "failed", error: result.error.message });
        return "failed";
      }
      reservations.delete(attachment.key);
      if (result.alreadyUploaded) {
        updateAttachment(attachment.key, { status: "uploaded", progress: 100, error: null });
        return "uploaded";
      }
      updateAttachment(attachment.key, { attachmentId: null, error: null });
      return "discarded";
    } catch {
      // Keep the reservation ID until the server confirms cleanup. Retrying
      // must not reserve another slot or hide a file that still needs attention.
      updateAttachment(attachment.key, { status: "failed", error: "Lane could not clear this upload. Your Request is saved. Try again." });
      return "failed";
    }
  }

  async function upload(attachment: QueuedAttachment, requestId: string): Promise<boolean> {
    updateAttachment(attachment.key, { status: "uploading", progress: 0, error: null });
    let attachmentId: string | null = null;
    try {
      const prepared = await deps.prepare({ requestId, fileName: attachment.file.name, mimeType: attachment.file.type, sizeBytes: attachment.file.size });
      if (!prepared.success) {
        updateAttachment(attachment.key, { status: "failed", error: prepared.error.message });
        return false;
      }
      const reserved = prepared.attachmentId;
      attachmentId = reserved;
      reservations.set(attachment.key, reserved);
      if (!updateAttachment(attachment.key, { attachmentId: reserved })) {
        const cleanup = await discardFailed({ ...attachment, attachmentId: reserved }, requestId);
        if (cleanup === "uploaded") return true;
        if (cleanup !== "failed") updateAttachment(attachment.key, { status: "failed", error: "This browser could not keep upload recovery information. Keep this tab open and try again." });
        return false;
      }
      const file = attachment.file.type === prepared.mimeType
        ? attachment.file
        : new File([attachment.file], attachment.file.name, { type: prepared.mimeType, lastModified: attachment.file.lastModified });
      const uploading = operation;
      await deps.put(prepared.signedUrl, file, progress => {
        if (operation === uploading) updateAttachment(attachment.key, { progress });
      });
      const finalized = await deps.finalize({ requestId, attachmentId: reserved });
      if (!finalized.success) {
        updateAttachment(attachment.key, { status: "failed", error: finalized.error.message });
        return false;
      }
      reservations.delete(attachment.key);
      updateAttachment(attachment.key, { status: "uploaded", progress: 100, error: null });
      return true;
    } catch {
      if (attachmentId) {
        const cleanup = await discardFailed({ ...attachment, attachmentId }, requestId);
        if (cleanup === "uploaded") return true;
        if (cleanup === "failed") return false;
      }
      updateAttachment(attachment.key, {
        status: "failed",
        attachmentId: null,
        error: "The file did not finish uploading. Your Request was created. Retry the upload.",
      });
      return false;
    }
  }

  async function settleUnattended() {
    const requestId = state.get().requestId;
    if ((!left && binding) || !requestId || state.get().phase === "complete") return;
    for (const [key, attachmentId] of reservations) {
      const file = state.get().files.find(file => file.key === key);
      if (file) await discardFailed({ ...file, attachmentId }, requestId);
    }
    // Only confirmed cleanup can discard names when no document reload happened.
    if (!reservations.size) record.clear();
  }
  function persistFiles() {
    const requestId = state.get().requestId;
    if (!requestId) return false;
    return record.write({ requestId, title: savedTitle, files: state.get().files.filter(file => file.status !== "uploaded")
      .map(file => ({ key: file.key, name: file.file.name, attachmentId: file.attachmentId })) });
  }
  async function perform(run: (current: () => boolean, token: symbol) => Promise<void>) {
    if (operation) return;
    const entry = scope();
    if (state.get().requestId && entry.recordOwner && entry.recordOwner !== identity) return;
    if (binding && entry.presentation !== identity) return;
    if (entry.operation) {
      state.set({ ...state.get(), error: "Another Request is still being saved or its files are being checked. Wait for it to finish before trying again." });
      return;
    }
    const token = Symbol();
    presentationIntent++;
    operation = token; entry.operation = token;
    const from = binding;
    const current = () => operation === token && from !== null && binding === from && entry.presentation === identity && !left;
    state.set({ ...state.get(), busy: true, error: null });
    try {
      if (current()) presentation?.busy(true);
      await run(current, token);
    }
    finally {
      if (operation === token) {
        await settleUnattended();
        const visible = from !== null && binding === from && entry.presentation === identity;
        operation = null;
        if (entry.operation === token) entry.operation = null;
        if (checkingToken === token) {
          checkingToken = null;
          if (visible) presentation?.cancelCheck?.(null);
        }
        state.set({ ...state.get(), busy: false, phase: state.get().phase === "checking" ? "idle" : state.get().phase });
        if (visible) presentation?.busy(false);
        releaseScope(deps.scope, entry);
      }
    }
  }
  function cancelCheck(token = checkingToken) {
    if (!token || operation !== token || checkingToken !== token) return false;
    presentationIntent++;
    const entry = scope();
    operation = null; checkingToken = null;
    if (entry.operation === token) entry.operation = null;
    state.set({ ...state.get(), busy: false, phase: "idle" });
    if (entry.presentation === identity) {
      presentation?.cancelCheck?.(null);
      presentation?.busy(false);
    }
    releaseScope(deps.scope, entry);
    return true;
  }
  function finish(current: () => boolean, options?: { open?: boolean }) {
    const { requestId, phase } = state.get();
    if (!requestId || phase === "complete") return;
    if (!record.clear()) { state.set({ ...state.get(), phase: "recovery" }); return; }
    state.set({ ...state.get(), phase: "complete" });
    if (current()) presentation?.finish(requestId, options);
  }
  function detach() {
    const entry = scope();
    if (entry.presentation === identity) presentation?.cancelCheck?.(null);
    presentation = null; binding = null;
    cancelCheck();
    entry.bindings.delete(identity);
    if (entry.presentation === identity) entry.presentation = null;
    const cleanup = !operation && state.get().requestId && state.get().phase !== "complete" ? perform(async () => {}) : undefined;
    releaseScope(deps.scope, entry);
    return cleanup;
  }
  return {
    getSnapshot: state.get, subscribe: state.subscribe,
    guard<T extends unknown[]>(run: (...args: T) => void) {
      const from = binding; const intent = presentationIntent;
      return (...args: T) => { if (from && from === binding && intent === presentationIntent && scope().presentation === identity) run(...args); };
    },
    syncBusy() { if (binding && scope().presentation === identity) presentation?.busy(state.get().busy); },
    cancelCheck,
    leave() { left = true; return detach(); },
    async check<T>(input: { run: () => Promise<T>; receive: (result: T) => void; failed: () => void }) {
      if (state.get().requestId) return;
      await perform(async (current, token) => {
        checkingToken = token;
        state.set({ ...state.get(), phase: "checking" });
        if (current()) presentation?.cancelCheck?.(() => cancelCheck(token));
        try { const result = await input.run(); if (current()) input.receive(result); }
        catch { if (current()) input.failed(); }
      });
    },
    persistDraft(write: () => boolean) {
      if (!binding || scope().presentation !== identity) return false;
      const written = write();
      if (written) scope().draft = identity;
      return written;
    },
    bind(next: IntakePresentation) { if (binding) presentation = next; },
    attach(next: IntakePresentation) { binding = Symbol(); presentation = next; const entry = scope(); entry.bindings.add(identity); entry.presentation = identity; },
    detach,
    async save(input: { run: () => Promise<SaveResponse>; title: string; attachments: QueuedAttachment[]; saved: (result: SavedRequest) => void; failed: (failure: SaveFailure | null) => void }) {
      if (state.get().requestId) return;
      const attachments = input.attachments.map(file => ({ ...file }));
      await perform(async current => {
        if (anotherRetainedOwner()) { state.set({ ...state.get(), error: retainedOwnerError }); return; }
        const retained = record.read();
        if (retained) {
          state.set({ ...state.get(), phase: "lost", lost: retained, error: "An earlier Request still has unfinished files. Check those files before saving this draft." });
          return;
        }
        scope().recordOwner = identity;
        state.set({ ...state.get(), files: attachments, phase: "saving" });
        try {
          const result = await input.run();
          if (!result.success) {
            if (current()) input.failed(result.error);
            state.set({ ...state.get(), phase: "idle" });
            return;
          }
          savedTitle = input.title;
          state.set({ ...state.get(), requestId: result.requestId, phase: "uploading" });
          const recorded = !attachments.length || record.write({ requestId: result.requestId, title: input.title,
            files: attachments.map(file => ({ key: file.key, name: file.file.name, attachmentId: file.attachmentId })) });
          const draftOwner = scope().draft;
          if (draftOwner === null || draftOwner === identity) deps.clearDraft();
          input.saved(result);
          if (!recorded) {
            state.set({ ...state.get(), phase: "recovery", error: storageError });
            return;
          }
          for (const file of attachments) {
            if (left) break;
            await upload(file, result.requestId);
          }
          if (state.get().files.every(file => file.status === "uploaded")) finish(current);
          else state.set({ ...state.get(), phase: "recovery" });
        } catch {
          if (state.get().requestId) state.set({ ...state.get(), phase: "recovery", error: "Your Request is saved. Its files still need attention." });
          else {
            if (current()) input.failed(null);
            state.set({ ...state.get(), phase: "idle" });
          }
        }
      });
    },
    recoveryRecord() { return scope().operation || anotherRetainedOwner() ? null : record.read(); },
    async recover() {
      if (state.get().requestId) return;
      if (anotherRetainedOwner()) { state.set({ ...state.get(), error: retainedOwnerError }); return; }
      await perform(async current => {
        const lost = record.read();
        if (!lost) return;
        scope().recordOwner = identity;
        state.set({ ...state.get(), phase: "reconciling", lost });
        const files = await settleLostUploads(lost, deps.discard);
        const retained = { ...lost, files };
        if (!record.write(retained)) {
          state.set({ ...state.get(), phase: "lost", lost: retained });
          return;
        }
        state.set({ ...state.get(), phase: files.length ? "lost" : "complete", lost: files.length ? retained : null,
          error: files.some(file => file.attachmentId) ? "Some files could not be checked. Retry cleanup before dismissing this notice." : null });
        if (!files.length && current()) presentation?.finish(lost.requestId);
      });
    },
    openLost() {
      const lost = state.get().lost;
      if (operation || scope().operation || !lost || !binding || scope().presentation !== identity) return;
      if (!lost.files.some(file => file.attachmentId) && !record.clear()) return;
      state.set({ ...state.get(), phase: "complete" });
      presentation?.finish(lost.requestId, { open: true });
    },
    dismissLost() {
      const lost = state.get().lost;
      if (operation || scope().operation || !lost) return;
      if (lost.files.some(file => file.attachmentId)) {
        state.set({ ...state.get(), error: "Some files could not be checked. Retry cleanup before dismissing this notice." });
        return;
      }
      if (record.clear()) state.set({ ...state.get(), phase: "idle", lost: null, error: null });
    },
    async remove(key: string) {
      const { requestId, phase } = state.get();
      if (!requestId || phase === "complete") return;
      await perform(async () => {
        const file = state.get().files.find(file => file.key === key);
        if (!file || file.status === "uploaded") return;
        if (await discardFailed(file, requestId) !== "discarded") return;
        const retained = record.read();
        if (retained && !record.write({ ...retained, files: retained.files.filter(file => file.key !== key) })) return;
        state.set({ ...state.get(), files: state.get().files.filter(file => file.key !== key) });
      });
    },
    async continueWithout({ open = false }: { open?: boolean } = {}) {
      const { requestId, phase } = state.get();
      if (!requestId || phase === "complete") return;
      await perform(async current => {
        const unfinished = state.get().files.filter(file => file.status !== "uploaded");
        for (const file of unfinished) {
          if (await discardFailed(file, requestId) === "failed") return;
        }
        finish(current, { open });
      });
    },
    async retry(keys?: string[]) {
      const { requestId, phase } = state.get();
      if (!requestId || phase === "complete") return;
      await perform(async current => {
        if (!persistFiles()) return;
        left = false;
        const failed = state.get().files.filter(file => file.status !== "uploaded" && (!keys || keys.includes(file.key)));
        state.set({ ...state.get(), phase: "uploading" });
        for (const file of failed) {
          if (left) break;
          const cleanup = await discardFailed(file, requestId);
          if (cleanup === "discarded") await upload(file, requestId);
        }
        if (state.get().files.every(file => file.status === "uploaded")) finish(current);
        else state.set({ ...state.get(), phase: "recovery" });
      });
    },
  };
}

/** Stores a file at a Supabase signed upload URL, reporting progress. */
export function uploadToSignedUrl(signedUrl: string, file: File, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("cacheControl", "0");
    body.append("", file);
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(body);
  });
}
