"use client";
import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { popupCode, popupOpener, usePopupCode } from "@/components/popup/lazy-popup";
import styles from "@/components/requests/detail.module.css";
import { deleteRequest } from "./actions";

// #267: the confirmation's code loads on a press of Delete (or focus on it), or when it opens.
const dialogCode = popupCode(() => import("./delete-request-dialog"));

/** Before pickup, the requester (or an admin) deletes a Request for good. */
export function DeleteRequest({ requestId, title, orgId }: { requestId: string; title: string; orgId: string }) {
  const router = useRouter();
  const { toast } = useToastStack();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const result = await callAction(() => deleteRequest(requestId, { orgId }));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast({ type: "success", title: "Request deleted" });
      router.push("/");
    } catch (thrown) {
      setError(thrownMessage(thrown, "Couldn’t delete the Request. Try again."));
    } finally {
      setBusy(false);
    }
  }
  const dialog = usePopupCode(dialogCode, open, { id: "popup-unavailable:delete-request", close: () => setOpen(false), retry: () => setOpen(true) });
  return <>
    <Button ref={opener} variant="ghost" size="sm" morph="plain" className={styles.editTrigger} aria-label="Delete Request" {...popupOpener(open)}
      onClick={() => setOpen(true)} onPointerDown={dialogCode.preload} onFocus={dialogCode.preload}>
      <Trash2 className={styles.editIcon} strokeWidth={1.75} aria-hidden="true" /><span className={styles.editLabel}>Delete</span>
    </Button>
    {dialog && <dialog.DeleteRequestDialog open={open} onOpenChange={next => { if (!busy) { setOpen(next); setError(""); } }} opener={opener}
      title={title} error={error} busy={busy} onConfirm={() => void confirm()} />}
  </>;
}
