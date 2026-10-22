import type { DiscardAttachmentResponse, FinalizeAttachmentResponse, PrepareAttachmentResponse } from "./attachment-actions";
import type { UnfinishedUploads } from "@/lib/unfinished-uploads";

/** A file chosen in the composer, as it moves through its upload. */
export type QueuedAttachment = {
  key: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress: number;
  attachmentId: string | null;
  error: string | null;
};

type Ref<T> = { current: T };

/**
 * What an upload session needs from the composer and the outside world. The
 * refs are the composer's own, because the save and the AI check share its
 * one-operation lock and the composer's lifecycle sets leaving and unmounting.
 */
export type UploadSessionDeps = {
  refs: {
    /** One operation at a time: the check, the save, uploads and recovery. */
    operationInFlight: Ref<boolean>;
    /** Leave page was chosen in the navigation guard. */
    leftUploadScreen: Ref<boolean>;
    /** The composer's host unmounted; nothing renders any more. */
    unmounted: Ref<boolean>;
    /** The created Request whose files this document still uploads. */
    uploadsRequest: Ref<string | null>;
    /** Open upload reservations by file key, cleared once settled. */
    reservations: Ref<Map<string, string>>;
  };
  /** The attachment actions, already bound to the workspace. */
  prepare: (input: { requestId: string; fileName: string; mimeType: string; sizeBytes: number }) => Promise<PrepareAttachmentResponse>;
  finalize: (input: { requestId: string; attachmentId: string }) => Promise<FinalizeAttachmentResponse>;
  discard: (input: { requestId: string; attachmentId: string }) => Promise<DiscardAttachmentResponse>;
  /** Stores the file at the signed URL, reporting progress. */
  put: (signedUrl: string, file: File, onProgress: (progress: number) => void) => Promise<void>;
  /** The unfinished-uploads record a reload reads. */
  record: { read: () => UnfinishedUploads | null; write: (record: UnfinishedUploads) => void; clear: () => void };
  setAttachments: (update: (current: QueuedAttachment[]) => QueuedAttachment[]) => void;
  /** The composer's busy state while recovery runs. */
  setBusy: (busy: boolean) => void;
  /** Leaves the upload screen for the created Request. */
  finish: (requestId: string) => void;
};

/**
 * The upload side of a created Request (plan item 2.3): each file is reserved,
 * stored and finalised; a failure keeps its reservation until the server
 * confirms cleanup, so a retry never reserves twice or hides a stored file.
 * Leave page finishes the file in flight and starts no other; an unmounted
 * composer's uploads go on, render nothing, and follow the record so a reload
 * names only the files that weren't added. Once nothing runs, open
 * reservations and the record are cleared.
 */
export function createUploadSession(deps: UploadSessionDeps) {
  const { operationInFlight, leftUploadScreen, unmounted, uploadsRequest, reservations } = deps.refs;

  function updateAttachment(key: string, update: Partial<QueuedAttachment>) {
    // After unmount nothing renders. The record follows the uploads instead,
    // so a reload before they end names only the files that weren't added.
    if (unmounted.current) {
      followUnmountedUpload(key, update);
      return;
    }
    deps.setAttachments((current) =>
      current.map((attachment) => attachment.key === key ? { ...attachment, ...update } : attachment),
    );
  }

  function followUnmountedUpload(key: string, update: Partial<QueuedAttachment>) {
    if (update.status !== "uploaded" && update.attachmentId === undefined) return;
    const record = deps.record.read();
    if (!record || record.requestId !== uploadsRequest.current) return;
    deps.record.write({
      ...record,
      files: update.status === "uploaded"
        ? record.files.filter((file) => file.key !== key)
        : record.files.map((file) => file.key === key ? { ...file, attachmentId: update.attachmentId ?? null } : file),
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
      reservations.current.delete(attachment.key);
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
      reservations.current.set(attachment.key, reserved);
      updateAttachment(attachment.key, { attachmentId: reserved });
      const file = attachment.file.type === prepared.mimeType
        ? attachment.file
        : new File([attachment.file], attachment.file.name, { type: prepared.mimeType, lastModified: attachment.file.lastModified });
      await deps.put(prepared.signedUrl, file, (progress) => updateAttachment(attachment.key, { progress }));
      const finalized = await deps.finalize({ requestId, attachmentId: reserved });
      if (!finalized.success) {
        updateAttachment(attachment.key, { status: "failed", error: finalized.error.message });
        return false;
      }
      reservations.current.delete(attachment.key);
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

  /** Nobody sees the upload screen any more: Leave page was chosen, or the composer unmounted. */
  function unattended() {
    return leftUploadScreen.current || unmounted.current;
  }

  /** Plan item 2.3 (S3): a created Request's files that nobody attends end in
   * this document. Once no upload loop runs, open reservations are cleared and
   * so is the record: no reload happened, so no later reload may report them. */
  function settleLeft() {
    const requestId = uploadsRequest.current;
    if (!unattended() || operationInFlight.current || !requestId) return;
    uploadsRequest.current = null;
    const open = [...reservations.current.values()];
    reservations.current.clear();
    void Promise.allSettled(open.map((attachmentId) => deps.discard({ requestId, attachmentId }))).then(() => {
      if (deps.record.read()?.requestId === requestId) deps.record.clear();
    });
  }

  /** Recovery runs one at a time and always releases the lock and the busy state. */
  async function recovering<T>(run: () => Promise<T>): Promise<T | undefined> {
    if (operationInFlight.current) return undefined;
    operationInFlight.current = true;
    deps.setBusy(true);
    try {
      return await run();
    } finally {
      operationInFlight.current = false;
      if (!unmounted.current) deps.setBusy(false);
      settleLeft();
    }
  }

  return {
    upload,
    unattended,
    settleLeft,

    /**
     * The saved Request's files, uploaded in order inside the save's
     * operation (the caller holds the lock). The record is written before the
     * first upload, so a reload mid-upload still names the files. Returns
     * whether every file was added, or "unattended" when nobody sees the
     * screen any more.
     */
    async uploadSaved(requestId: string, title: string, attachments: QueuedAttachment[]): Promise<"uploaded" | "recovery" | "unattended"> {
      uploadsRequest.current = requestId;
      if (!leftUploadScreen.current) {
        deps.record.write({
          requestId,
          title,
          files: attachments
            .filter((attachment) => attachment.status !== "uploaded")
            .map((attachment) => ({ key: attachment.key, name: attachment.file.name, attachmentId: attachment.attachmentId })),
        });
      }
      const results: boolean[] = [];
      for (const attachment of attachments) {
        // Only Leave page stops the uploads; an unmounted composer's go on.
        if (leftUploadScreen.current) break;
        results.push(await upload(attachment, requestId));
      }
      if (unattended()) return "unattended";
      return results.every(Boolean) ? "uploaded" : "recovery";
    },

    /** Retries `failed`, finishing once every file of `attachments` is added. */
    async retry(failed: QueuedAttachment[], attachments: QueuedAttachment[], requestId: string) {
      const uploadedKeys = new Set<string>();
      const ran = await recovering(async () => {
        for (const attachment of failed) {
          // Only Leave page stops the retries; an unmounted composer's go on.
          if (leftUploadScreen.current) break;
          const cleanup = await discardFailed(attachment, requestId);
          if (cleanup === "failed") continue;
          if (cleanup === "uploaded") {
            uploadedKeys.add(attachment.key);
            continue;
          }
          if (await upload(attachment, requestId)) uploadedKeys.add(attachment.key);
        }
        return true;
      });
      if (!ran || unattended()) return;
      // A per-file retry must not abandon another failed file. Use the retry
      // outcomes as well as the render snapshot; React state updates may lag.
      if (attachments.every((attachment) => attachment.status === "uploaded" || uploadedKeys.has(attachment.key))) deps.finish(requestId);
    },

    /** Removes a failed file once its reservation is cleared. */
    async remove(attachment: QueuedAttachment, requestId: string) {
      await recovering(async () => {
        if ((await discardFailed(attachment, requestId)) !== "discarded" || unmounted.current) return;
        deps.setAttachments((current) => current.filter((item) => item.key !== attachment.key));
      });
    },

    /** Finishes without the unfinished files, once every reservation is cleared. */
    async continueWithout(attachments: QueuedAttachment[], requestId: string) {
      await recovering(async () => {
        const unfinished = attachments.filter((attachment) => attachment.status !== "uploaded" && attachment.attachmentId);
        const discarded = await Promise.all(unfinished.map((attachment) => discardFailed(attachment, requestId)));
        if (!unattended() && discarded.every((result) => result !== "failed")) deps.finish(requestId);
      });
    },

    /** Leave page in the navigation guard, whose copy says files not yet uploaded
     * won't be added. A running loop finishes its file in flight and starts no other. */
    leave() {
      leftUploadScreen.current = true;
      settleLeft();
    },

    /** The composer's host unmounting cancels nothing: the upload loops go on
     * in the background, render nothing, and settle when they end. */
    unmount() {
      unmounted.current = true;
      settleLeft();
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
