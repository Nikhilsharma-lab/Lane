"use client";
import RequestEditor from "../../intake/intake-form";
import type { RequestDetail } from "@/components/requests/detail-view";

/** New and Edit share all controls, review presentation and upload recovery.
 * The editor selects the existing guarded save action for an existing Request. */
export default function EditRequestForm({ request, orgId, draftOwnerId, onSaved, onBusyChange, withoutPrediction = false, saveLabel }: {
  request: RequestDetail; orgId: string; draftOwnerId: string; onSaved: () => void; onBusyChange: (busy: boolean) => void;
  /** #212: a Guest edits their waiting submission without a prediction. */
  withoutPrediction?: boolean;
  /** The save button's name when the edit has one purpose, e.g. "Save goal" (#261). */
  saveLabel?: string;
}) {
  return <RequestEditor context={{ orgId }} draftOwnerId={draftOwnerId}
    editing={{ request, onSaved, saveLabel }} onBusyChange={onBusyChange} withoutPrediction={withoutPrediction} />;
}
