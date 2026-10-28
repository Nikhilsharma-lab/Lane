"use client";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { RequestDetail } from "@/components/requests/detail-view";
import type { IntakeCloseAttempt, RegisterIntakeCloseAttempt } from "@/components/requests/intake-navigation-guard";
import styles from "@/components/requests/detail.module.css";
const EditRequestForm = dynamic(() => import("./edit-request-form"), { loading: () => <Skeleton label="Loading Request editor" lines={5}/> });
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
    const closeAttempt = useRef<IntakeCloseAttempt | null>(null);
    const registerCloseAttempt = useCallback<RegisterIntakeCloseAttempt>(attempt => {
        closeAttempt.current = attempt;
        return () => { if (closeAttempt.current === attempt) closeAttempt.current = null; };
    }, []);
    function holdOpen() {
        if (closeAttempt.current) {
            closeAttempt.current(() => { setBusy(false); setOpen(false); });
            return true;
        }
        return busy;
    }
    const { toast } = useToastStack();
    const title = writePrediction ? "Write the prediction" : "Edit Request";
    return <div>
    <Dialog open={open} onOpenChange={next => { if (next || !holdOpen()) {
        setOpen(next);
    } }}>
      {writePrediction
        ? <DialogTrigger asChild><Button variant="primary" size="sm">Write the prediction</Button></DialogTrigger>
        // At 640px and below the strip has room for an icon only; the name stays "Edit Request".
        : <DialogTrigger asChild><Button variant="secondary" size="sm" morph="plain" className={styles.editTrigger} aria-label="Edit Request"><Pencil className={styles.editIcon} strokeWidth={1.75} aria-hidden="true" /><span className={styles.editLabel}>Edit Request</span></Button></DialogTrigger>}
      <DialogContent title={title} description={writePrediction ? "You took this on, so its prediction is yours to write: what it should change, and how you’ll know." : "Edit this Request while it is Open."} layout="composer" onEscapeKeyDown={event => { if (holdOpen())
        event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
        <EditRequestForm request={request} orgId={orgId} draftOwnerId={draftOwnerId} withoutPrediction={withoutPrediction} onBusyChange={setBusy} registerCloseAttempt={registerCloseAttempt} onSaved={() => { setOpen(false); toast({ type: "success", title: writePrediction ? "Prediction saved" : "Changes saved" }); }}/>
      </DialogContent>
    </Dialog>
  </div>;
}
