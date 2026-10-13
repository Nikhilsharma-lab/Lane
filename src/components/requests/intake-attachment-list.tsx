"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Transition } from "motion/react";
import { Check, File, FileImage, FileText, RotateCcw, Trash2, X } from "lucide-react";

import { Button } from "@/components/arc/button/button";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import { Progress } from "@/components/arc/progress/progress";
import { formatAttachmentSize } from "@/lib/request-attachments";
import styles from "./intake-attachment-list.module.css";

export type IntakeAttachmentItem = {
  key: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress: number;
  error: string | null;
};

export type IntakeAttachmentListProps<T extends IntakeAttachmentItem> = {
  items: readonly T[];
  mode: "queued" | "uploading" | "recovery";
  disabled?: boolean;
  onRemove?: (item: T) => void | Promise<void>;
  onRetry?: (item: T) => void | Promise<void>;
  /** The Attach files button or recovery heading, when the final row disappears. */
  emptyFocusRef?: RefObject<HTMLElement | null>;
};

const enter: Transition = { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] };
const exit: Transition = { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] };

function AttachmentIcon({ file }: { file: File }) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (file.type.startsWith("image/")) return <FileImage {...props} />;
  if (file.type.startsWith("text/")) return <FileText {...props} />;
  return <File {...props} />;
}

function AttachmentRow<T extends IntakeAttachmentItem>({
  item, mode, disabled, onRemove, onRetry, removeRef,
}: Omit<IntakeAttachmentListProps<T>, "items" | "emptyFocusRef"> & {
  item: T;
  removeRef: (node: HTMLButtonElement | null) => void;
}) {
  const reduce = useReducedMotion();
  const present = useIsPresent();
  const recovering = mode === "recovery" && item.status === "failed";
  const percentage = Math.round(Math.min(Math.max(item.progress, 0), 100));
  const status = item.status === "queued" ? "Waiting"
    : item.status === "uploaded" ? "Uploaded"
      : item.status === "failed" ? "Upload failed" : `${percentage}% uploaded`;

  return (
    <motion.li
      className={styles.fileRow}
      aria-label={item.file.name}
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0, transition: { height: motionTokens.spring.smooth, opacity: exit } }}
      transition={reduce ? { duration: 0 } : { height: motionTokens.spring.smooth, opacity: enter }}
    >
      <div className={styles.fileItem}>
        <span className={styles.fileIcon}><AttachmentIcon file={item.file} /></span>
        <div className={styles.fileCopy}>
          <strong title={item.file.name}>{item.file.name}</strong>
          <div className={styles.meta}>
            <span>{formatAttachmentSize(item.file.size)}</span>
            {mode !== "queued" && <>
              <span aria-hidden="true">·</span>
              <span data-status={item.status}>{status}</span>
            </>}
          </div>
          {mode !== "queued" && item.status === "uploading" && (
            <Progress value={item.progress} aria-label={`Uploading ${item.file.name}`} className={styles.progress} />
          )}
          {item.error && <p className={styles.error}>{item.error}</p>}
          {recovering && <div className={styles.actions}>
            {onRetry && <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => void onRetry(item)}>
              <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />Retry upload
            </Button>}
            {onRemove && <Button ref={removeRef} type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => void onRemove(item)}>
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />Remove
            </Button>}
          </div>}
        </div>
        {mode !== "queued" && item.status === "uploaded" && (
          <motion.span className={styles.ready} initial={reduce ? { opacity: 0 } : { opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} transition={reduce ? { duration: 0 } : motionTokens.spring.snappy}>
            <Check size={16} strokeWidth={1.75} aria-hidden="true" />
          </motion.span>
        )}
        {mode === "queued" && onRemove && (
          <Button ref={removeRef} type="button" size="sm" variant="ghost" className={styles.remove} aria-label={`Remove ${item.file.name}`} disabled={disabled} onClick={() => void onRemove(item)}>
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        )}
      </div>
    </motion.li>
  );
}

/** Arc FileUpload row presentation with Lane's external upload controller. */
export function IntakeAttachmentList<T extends IntakeAttachmentItem>({
  items, mode, disabled = false, onRemove, onRetry, emptyFocusRef,
}: IntakeAttachmentListProps<T>) {
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ removed: string; neighbors: string[]; settled: boolean } | null>(null);
  const [settledRemoval, setSettledRemoval] = useState(0);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    if (items.some((item) => item.key === pending.removed)) {
      if (pending.settled) pendingFocus.current = null;
      return;
    }
    pendingFocus.current = null;
    const next = pending.neighbors.map((key) => removeRefs.current.get(key)).find((node) => node && !node.disabled);
    (next ?? emptyFocusRef?.current)?.focus();
  }, [items, emptyFocusRef, settledRemoval]);

  async function remove(item: T) {
    let pending: typeof pendingFocus.current = null;
    if (document.activeElement === removeRefs.current.get(item.key)) {
      const index = items.findIndex((candidate) => candidate.key === item.key);
      pending = { removed: item.key, settled: false, neighbors: [
        ...items.slice(index + 1).map((candidate) => candidate.key),
        ...items.slice(0, index).reverse().map((candidate) => candidate.key),
      ] };
      pendingFocus.current = pending;
    }
    try {
      await onRemove?.(item);
    } finally {
      if (pending && pendingFocus.current === pending) {
        // Reconcile after the parent's state update commits. Failed removals
        // keep their row and clear this intent, so a later update cannot steal focus.
        pending.settled = true;
        setSettledRemoval((value) => value + 1);
      }
    }
  }

  const uploaded = items.filter((item) => item.status === "uploaded").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const announcement = mode === "queued"
    ? `${items.length} ${items.length === 1 ? "file" : "files"} selected.`
    : `${uploaded} of ${items.length} files uploaded.${failed ? ` ${failed} ${failed === 1 ? "file needs" : "files need"} attention.` : ""}`;

  return <div className={styles.root} hidden={items.length === 0}>
    <p role="status" aria-atomic="true" className={styles.srOnly}>{announcement}</p>
    <ul className={styles.fileList} aria-label={mode === "queued" ? "Files ready to upload" : "Request file uploads"}>
      <AnimatePresence initial={false}>
        {items.map((item) => <AttachmentRow
          key={item.key} item={item} mode={mode} disabled={disabled} onRetry={onRetry} onRemove={onRemove ? remove : undefined}
          removeRef={(node) => { if (node) removeRefs.current.set(item.key, node); else removeRefs.current.delete(item.key); }}
        />)}
      </AnimatePresence>
    </ul>
  </div>;
}
