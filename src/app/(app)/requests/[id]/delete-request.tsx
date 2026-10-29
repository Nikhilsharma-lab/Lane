"use client";
import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import styles from "@/components/requests/detail.module.css";
import { deleteRequest } from "./actions";

/** Before pickup, the requester (or an admin) deletes a Request for good. */
export function DeleteRequest({ requestId, title, orgId }: { requestId: string; title: string; orgId: string }) {
  const router = useRouter();
  const { toast } = useToastStack();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  return <Dialog open={open} onOpenChange={next => { if (!busy) { setOpen(next); setError(""); } }}>
    <DialogTrigger asChild>
      <Button variant="ghost" size="sm" morph="plain" className={styles.editTrigger} aria-label="Delete Request">
        <Trash2 className={styles.editIcon} strokeWidth={1.75} aria-hidden="true" /><span className={styles.editLabel}>Delete</span>
      </Button>
    </DialogTrigger>
    <DialogContent title="Delete this Request?" description={`“${title}” will be deleted for good, with its comments, files and reviews. This can’t be undone.`}>
      {error && <p role="alert">{error}</p>}
      <div className={styles.dialogActions}>
        <DialogClose asChild><Button variant="ghost" disabled={busy}>Cancel</Button></DialogClose>
        <Button variant="danger" loading={busy} onClick={() => void confirm()}>Delete Request</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
