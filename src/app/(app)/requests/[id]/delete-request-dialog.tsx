"use client";
import type { RefObject } from "react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/popup/adaptive-dialog";
import styles from "@/components/requests/detail.module.css";

/** The "Delete this Request?" confirmation (delete-request.tsx keeps the opener and what it does). */
export function DeleteRequestDialog({ open, onOpenChange, opener, title, error, busy, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLElement | null>;
  title: string;
  error: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="Delete this Request?" description={`“${title}” will be deleted for good, with its comments, files and reviews. This can’t be undone.`} returnFocus={() => opener.current}>
      {error && <p role="alert">{error}</p>}
      <div className={styles.dialogActions}>
        <DialogClose asChild><Button variant="ghost" disabled={busy}>Cancel</Button></DialogClose>
        <Button variant="danger" loading={busy} onClick={onConfirm}>Delete Request</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
