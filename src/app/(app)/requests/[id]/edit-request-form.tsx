"use client";
import RequestEditor from "../../intake/intake-form";
import type { RequestDetail } from "@/components/requests/detail-view";

/** New and Edit share all controls, review presentation and upload recovery.
 * The editor selects the existing guarded save action for an existing Request. */
export default function EditRequestForm({ request, orgId, draftOwnerId, onSaved, onBusyChange }: {
  request: RequestDetail; orgId: string; draftOwnerId: string; onSaved: () => void; onBusyChange: (busy: boolean) => void;
}) {
  return <RequestEditor context={{ orgId }} draftOwnerId={draftOwnerId}
    editing={{ request, onSaved }} onBusyChange={onBusyChange} />;
}
