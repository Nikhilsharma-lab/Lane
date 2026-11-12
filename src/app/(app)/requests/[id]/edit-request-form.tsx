"use client";
import RequestEditor, { type BackgroundSave, type RefusedSave } from "../../intake/intake-form";
import type { RegisterIntakeCloseAttempt } from "@/components/requests/intake-navigation-guard";
import type { RequestDetail } from "@/components/requests/detail-view";

/** New and Edit share all controls, review presentation and upload recovery.
 * The editor selects the existing guarded save action for an existing Request. */
export default function EditRequestForm({ request, orgId, draftOwnerId, onSaved, onBusyChange, registerCloseAttempt, withoutPrediction = false, saveLabel, saveInBackground, refused }: {
  request: RequestDetail; orgId: string; draftOwnerId: string; onSaved: () => void; onBusyChange: (busy: boolean) => void;
  /** #212: a Guest edits their waiting submission without a prediction. */
  withoutPrediction?: boolean;
  registerCloseAttempt?: RegisterIntakeCloseAttempt;
  /** The save button's name when the edit has one purpose, e.g. "Save goal" (#261). */
  saveLabel?: string;
  /** #280: the dialog runs the save once it has closed, and reopens with `refused` if the server says no. */
  saveInBackground: (save: BackgroundSave) => void;
  refused: RefusedSave | null;
}) {
  return <RequestEditor context={{ orgId }} draftOwnerId={draftOwnerId}
    editing={{ request, onSaved, saveLabel, backLabel: "Back to editing", saveInBackground, refused }} onBusyChange={onBusyChange} registerCloseAttempt={registerCloseAttempt} withoutPrediction={withoutPrediction} />;
}
