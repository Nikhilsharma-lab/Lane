"use client";
import { useCallback, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/popup/adaptive-dialog";
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup";
import type { RequestDetail } from "@/components/requests/detail-view";
import type { IntakeCloseAttempt, RegisterIntakeCloseAttempt } from "@/components/requests/intake-navigation-guard";
import styles from "@/components/requests/detail.module.css";
import { Placeholder } from "@/components/loading/placeholder";
import { useServerRefresh } from "@/components/requests/use-optimistic-action";
import { useDelayedBusy } from "@/hooks/use-delayed-busy";
import type { BackgroundSave, RefusedSave } from "../../intake/intake-form";
// The editor's form loads when it first opens.
const formCode = popupCode(() => import("./edit-request-form"));
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
    // #280: a save runs after the dialog closes; the editor can't open again until it lands, and opens with its
    // refusal if the server says no.
    const saving = useRef(false);
    const [pendingSave, setPendingSave] = useState(false);
    const [refused, setRefused] = useState<RefusedSave | null>(null);
    const savingLooksBusy = useDelayedBusy(pendingSave);
    const refresh = useServerRefresh();
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
    const saved = () => toast({ type: "success", title: writePrediction ? "Goal saved" : "Changes saved" });
    function saveInBackground({ run, compose, clearDraft }: BackgroundSave) {
        if (saving.current) return;
        saving.current = true;
        setPendingSave(true);
        setRefused(null);
        setBusy(false);
        setOpen(false);
        void run().catch(() => ({ success: false as const, error: null })).then(result => {
            saving.current = false;
            setPendingSave(false);
            if (result.success) {
                clearDraft();
                saved();
                refresh();
                return;
            }
            setRefused({ failure: result.error, compose });
            setOpen(true);
        });
    }
    const form = usePopupCode(formCode, open, () => couldNotOpen("edit-request", setOpen));
    const title = writePrediction ? "Set the goal" : "Edit Request";
    return <div>
    <Dialog open={open} onOpenChange={next => { if (next && saving.current) return; if (next || !holdOpen()) {
        if (!next) setRefused(null);
        setOpen(next);
    } }}>
      {writePrediction
        ? <DialogTrigger asChild><Button variant="primary" size="sm" aria-disabled={pendingSave || undefined} loading={savingLooksBusy}>Set the goal</Button></DialogTrigger>
        // At 640px and below the strip has room for an icon only; the name stays "Edit Request".
        : <DialogTrigger asChild><Button variant="secondary" size="sm" morph="plain" className={styles.editTrigger} aria-label="Edit Request" aria-disabled={pendingSave || undefined} loading={savingLooksBusy}><Pencil className={styles.editIcon} strokeWidth={1.75} aria-hidden="true" /><span className={styles.editLabel}>Edit Request</span></Button></DialogTrigger>}
      <DialogContent title={title} canDismiss={() => !busy} description={writePrediction ? "You took this on, so its goal is yours to set: what it should change, and how you’ll know." : "Edit this Request while it is Open."} layout="composer" onEscapeKeyDown={event => { if (holdOpen())
        event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
        {form
            ? <form.default request={request} orgId={orgId} draftOwnerId={draftOwnerId} withoutPrediction={withoutPrediction} saveLabel={writePrediction ? "Save goal" : undefined} onBusyChange={setBusy} registerCloseAttempt={registerCloseAttempt} onSaved={() => { setOpen(false); saved(); }} saveInBackground={saveInBackground} refused={refused}/>
            : <Placeholder label="Loading Request editor" lines={5}/>}
      </DialogContent>
    </Dialog>
  </div>;
}
