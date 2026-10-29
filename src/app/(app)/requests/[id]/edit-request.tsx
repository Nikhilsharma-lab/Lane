"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/popup/adaptive-dialog";
import type { RequestDetail } from "@/components/requests/detail-view";
import styles from "@/components/requests/detail.module.css";
import { Placeholder } from "@/components/loading/placeholder";
const EditRequestForm = dynamic(() => import("./edit-request-form"), { loading: () => <Placeholder label="Loading Request editor" lines={5}/> });
export function EditRequest({ request, orgId, draftOwnerId, withoutPrediction = false, writePrediction }: {
    request: RequestDetail;
    orgId: string;
    draftOwnerId: string;
    /** #212: a Guest edits their waiting submission without a prediction. */
    withoutPrediction?: boolean;
    /** #212: the Member who took a Guest submission on is asked for its prediction. `open` opens the editor at once. */
    writePrediction?: { open: boolean };
}) {
    const [open, setOpen] = useState(writePrediction?.open ?? false);
    const [busy, setBusy] = useState(false);
    const { toast } = useToastStack();
    const title = writePrediction ? "Set the goal" : "Edit Request";
    return <div>
    <Dialog open={open} onOpenChange={next => { if (!busy) {
        setOpen(next);
    } }}>
      {writePrediction
        ? <DialogTrigger asChild><Button variant="primary" size="sm">Set the goal</Button></DialogTrigger>
        // At 640px and below the strip has room for an icon only; the name stays "Edit Request".
        : <DialogTrigger asChild><Button variant="secondary" size="sm" morph="plain" className={styles.editTrigger} aria-label="Edit Request"><Pencil className={styles.editIcon} strokeWidth={1.75} aria-hidden="true" /><span className={styles.editLabel}>Edit Request</span></Button></DialogTrigger>}
      <DialogContent title={title} description={writePrediction ? "You took this on, so its goal is yours to set: what it should change, and how you’ll know." : "Edit this Request while it is Open."} layout="composer" onEscapeKeyDown={event => { if (busy)
        event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
        <EditRequestForm request={request} orgId={orgId} draftOwnerId={draftOwnerId} withoutPrediction={withoutPrediction} saveLabel={writePrediction ? "Save goal" : undefined} onBusyChange={setBusy} onSaved={() => { setOpen(false); toast({ type: "success", title: writePrediction ? "Goal saved" : "Changes saved" }); }}/>
      </DialogContent>
    </Dialog>
  </div>;
}
