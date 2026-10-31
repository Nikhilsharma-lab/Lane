"use client";
import { useCallback, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { Button } from "@/components/arc/button/button";
import { popupCode, popupOpener, usePopupCode } from "@/components/popup/lazy-popup";
import type { RequestDetail } from "@/components/requests/detail-view";
import type { IntakeCloseAttempt, RegisterIntakeCloseAttempt } from "@/components/requests/intake-navigation-guard";
import styles from "@/components/requests/detail.module.css";

// #267: the dialog and its form load on a press of the button (or focus on it), or when the editor opens.
const dialogCode = popupCode(() => import("./edit-request-dialog"));
const preload = () => { void dialogCode.load().then(module => module.editFormCode.preload(), () => undefined); };

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
    const opener = useRef<HTMLButtonElement>(null);
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
    const dialog = usePopupCode(dialogCode, open, { id: "popup-unavailable:edit-request", close: () => setOpen(false), retry: () => setOpen(true) });
    const trigger = { ref: opener, ...popupOpener(open), onClick: () => setOpen(true), onPointerDown: preload, onFocus: preload };
    return <div>
      {writePrediction
        ? <Button variant="primary" size="sm" {...trigger}>Set the goal</Button>
        // At 640px and below the strip has room for an icon only; the name stays "Edit Request".
        : <Button variant="secondary" size="sm" morph="plain" className={styles.editTrigger} aria-label="Edit Request" {...trigger}><Pencil className={styles.editIcon} strokeWidth={1.75} aria-hidden="true" /><span className={styles.editLabel}>Edit Request</span></Button>}
      {dialog && <dialog.EditRequestDialog open={open} onOpenChange={next => { if (next || !holdOpen()) setOpen(next); }} onClose={() => setOpen(false)} holdOpen={holdOpen} opener={opener}
        request={request} orgId={orgId} draftOwnerId={draftOwnerId} withoutPrediction={withoutPrediction} writePrediction={Boolean(writePrediction)}
        onBusyChange={setBusy} registerCloseAttempt={registerCloseAttempt}
        onSaved={() => { setOpen(false); toast({ type: "success", title: writePrediction ? "Goal saved" : "Changes saved" }); }} />}
    </div>;
}
