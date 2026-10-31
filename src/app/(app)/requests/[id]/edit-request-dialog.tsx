"use client";
import type { ReactNode, RefObject } from "react";
import { Placeholder } from "@/components/loading/placeholder";
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog";
import { popupCode, usePopupCode } from "@/components/popup/lazy-popup";
import type { RequestDetail } from "@/components/requests/detail-view";
import type { RegisterIntakeCloseAttempt } from "@/components/requests/intake-navigation-guard";

/** The editor's form, which loads with the dialog's code on a press of Edit Request, or when the dialog opens. */
export const editFormCode = popupCode(() => import("./edit-request-form"));

/** Edit Request's dialog (edit-request.tsx keeps the opener and its state). */
export function EditRequestDialog({ open, onOpenChange, onClose, holdOpen, opener, request, orgId, draftOwnerId, withoutPrediction, writePrediction, onBusyChange, registerCloseAttempt, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Closes it without asking, when the form's code can't load. */
  onClose: () => void;
  holdOpen: () => boolean;
  opener: RefObject<HTMLElement | null>;
  request: RequestDetail;
  orgId: string;
  draftOwnerId: string;
  withoutPrediction: boolean;
  writePrediction: boolean;
  onBusyChange: (busy: boolean) => void;
  registerCloseAttempt: RegisterIntakeCloseAttempt;
  onSaved: () => void;
}): ReactNode {
  const form = usePopupCode(editFormCode, open, { id: "popup-unavailable:edit-request", close: onClose });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title={writePrediction ? "Set the goal" : "Edit Request"} description={writePrediction ? "You took this on, so its goal is yours to set: what it should change, and how you’ll know." : "Edit this Request while it is Open."} layout="composer"
      returnFocus={() => opener.current}
      onEscapeKeyDown={event => { if (holdOpen()) event.preventDefault(); }} onInteractOutside={event => event.preventDefault()}>
      {form
        ? <form.default request={request} orgId={orgId} draftOwnerId={draftOwnerId} withoutPrediction={withoutPrediction} saveLabel={writePrediction ? "Save goal" : undefined} onBusyChange={onBusyChange} registerCloseAttempt={registerCloseAttempt} onSaved={onSaved}/>
        : <Placeholder label="Loading Request editor" lines={5}/>}
    </DialogContent>
  </Dialog>;
}
