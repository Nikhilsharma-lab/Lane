"use client";
import { useState, type FormEvent } from "react";
import { useOptimisticAction } from "@/components/requests/use-optimistic-action";
import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { Input } from "@/components/arc/input/input";
import { Textarea } from "@/components/arc/textarea/textarea";
import { MeasurementPlanFields } from "@/components/requests/measurement-plan-fields";
import { ProjectPicker, RequestTypePicker, RequestPriorityPicker, useWorkspaceProjects } from "@/components/requests/request-property-pickers";
import type { RequestDetail } from "@/components/requests/detail-view";
import { requestEditValues, requestEditSnapshot, requestEditSchema } from "@/lib/request-edit";
import { EMPTY_METRIC_IMPACT, type ExpectedImpactDraft } from "@/lib/request-impact";
import { requestSchema, TITLE_MAX, DESCRIPTION_MAX, USEFUL_LINK_MAX } from "@/lib/request-schema";
import { runTriage } from "../../intake/actions";
import { saveRequestEdits } from "./edit-actions";
import styles from "./edit-request.module.css";
type Draft = Omit<ReturnType<typeof requestEditValues>, "expectedImpact"> & {
    expectedImpact: ExpectedImpactDraft;
};
export default function EditRequestForm({ request, orgId, onSaved, onBusyChange }: {
    request: RequestDetail;
    orgId: string;
    onSaved: () => void;
    onBusyChange: (busy: boolean) => void;
}) {
    const optimistic = useOptimisticAction();
    const [original] = useState(() => requestEditValues(request));
    const [snapshot] = useState(() => requestEditSnapshot(request));
    const [draft, setDraft] = useState<Draft>(() => ({ ...original, expectedImpact: original.expectedImpact ?? { ...EMPTY_METRIC_IMPACT, unit: "" } }));
    const [busy, setBusy] = useState(false);
    const [projectBusy, setProjectBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [review, setReview] = useState<{
        token: string;
        source: string;
    } | null>(null);
    const [reviewed, setReviewed] = useState(false);
    const projects = useWorkspaceProjects(orgId, true);
    const source = JSON.stringify([draft.title.trim(), draft.description.trim()]);
    const changedSource = draft.title.trim() !== original.title || draft.description.trim() !== original.description;
    const needsReview = changedSource && review?.source !== source;
    const disabled = busy || projectBusy;
    function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })); setError(null); }
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        const content = requestSchema.safeParse(draft);
        if (!content.success) {
            setError(content.error.issues[0].message);
            return;
        }
        setBusy(true);
        onBusyChange(true);
        try {
            if (needsReview) {
                const result = await runTriage(content.data, { orgId });
                if (!result.success) {
                    setError(result.error.message);
                    return;
                }
                setReview({ token: result.token, source });
                setDraft(current => ({ ...current, reframedProblem: result.triage.reframedProblem, extractedSolution: result.triage.extractedSolution }));
                setReviewed(true);
                return;
            }
            const parsed = requestEditSchema.safeParse(draft);
            if (!parsed.success) {
                setError(parsed.error.issues[0].message);
                return;
            }
            const result = await optimistic({ id: request.id, waitForPending: true,
                run: () => saveRequestEdits(request.id, { snapshot, changes: parsed.data, token: review?.token }, { orgId }),
                onError: message => setError(message), refreshOnError: false });
            if (result.status !== "success")
                return;
            onSaved();
        }
        catch {
            setError("Couldn’t confirm the save. Your edits are still here. Try again.");
        }
        finally {
            setBusy(false);
            onBusyChange(false);
        }
    }
    return <form onSubmit={submit} className={styles.form}>
    <div className={styles.fields}>
      <Input label="Request title" value={draft.title} maxLength={TITLE_MAX} disabled={disabled} onChange={event => change("title", event.target.value)}/>
      <Textarea label="Original description" value={draft.description} maxLength={DESCRIPTION_MAX} disabled={disabled} onChange={event => change("description", event.target.value)}/>
      <div className={styles.properties}>
        <ProjectPicker orgId={orgId} value={draft.projectId} onChange={value => change("projectId", value)} disabled={busy} state={projects} onBusyChange={setProjectBusy}/>
        <RequestTypePicker value={draft.requestType} onChange={value => change("requestType", value)} disabled={disabled}/>
        <RequestPriorityPicker value={draft.priority} onChange={value => change("priority", value)} disabled={disabled}/>
      </div>
      {reviewed && <Alert tone="info" title="Review the updated problem">Confirm the problem below, then save your changes.</Alert>}
      {draft.reframedProblem !== null && <Textarea label="Problem to solve" value={draft.reframedProblem} maxLength={DESCRIPTION_MAX} disabled={disabled} onChange={event => change("reframedProblem", event.target.value)}/>}
      {draft.extractedSolution !== null && <Textarea label="Suggested change" value={draft.extractedSolution} maxLength={DESCRIPTION_MAX} disabled={disabled} onChange={event => change("extractedSolution", event.target.value)}/>}
      <MeasurementPlanFields value={draft.expectedImpact} onChange={value => change("expectedImpact", value)} requestType={draft.requestType} disabled={disabled}/>
      <Input label="Related link" value={draft.usefulLink} maxLength={USEFUL_LINK_MAX} disabled={disabled} onChange={event => change("usefulLink", event.target.value)}/>
    </div>
    <div className={styles.footer}>
      {error && <Alert tone="danger" title="Changes not saved">{error}</Alert>}
      <Button type="submit" size="sm" loading={busy} disabled={projectBusy}>{needsReview ? "Review changes" : "Save changes"}</Button>
    </div>
  </form>;
}
