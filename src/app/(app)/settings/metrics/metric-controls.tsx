"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/popup/adaptive-dialog";
import { PermanentActionConfirmation } from "@/components/popup/permanent-action-confirmation";
import { offerUndo } from "@/components/requests/undo-toast";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Select } from "@/components/arc/select/select";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import dynamic from "next/dynamic";
import { MetricDefinitionForm, type MetricDefinitionValues } from "@/components/metrics/metric-definition-form";
import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import type { MetricUnit } from "@/lib/metric-definition-rules";
import { addMetricDefinition, archiveMetricDefinition, editMetricDefinition, mergeMetricDefinitions, restoreMetricDefinition } from "./actions";
import styles from "./metrics.module.css";

const GuidedMetricForm = dynamic(() => import("@/components/metrics/guided-metric-form").then(module => module.GuidedMetricForm), { loading: () => <p role="status">Loading metric setup…</p> });

/** Settings → Metrics controls (#197) that save through the library's actions. */



/** "Add metric" and its dialog. The new definition appears in the list once saved; focus returns to the button. */
export function AddMetricDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState("");
  const [pending, setPending] = useState(false);
  return <>
    <Dialog guardTypedText dismissible={!pending} open={open} onOpenChange={next => { if (pending) return; setOpen(next); if (next) setAdded(""); }}>
      <DialogTrigger asChild><Button><Plus data-icon-size="sm" aria-hidden="true" />Add metric</Button></DialogTrigger>
      <DialogContent className={styles.createDialog} title="Create metric" description="Define it once so your team can reuse it on Requests.">
        <GuidedMetricForm onPendingChange={setPending} onCancel={() => setOpen(false)}
          onSubmit={async values => {
            const result = await callAction(() => addMetricDefinition(values, { orgId }));
            if ("ok" in result) setAdded(`Added ${values.name.trim()}.`);
            return result;
          }}
          onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
    <span className="sr-only" role="status">{added}</span>
  </>;
}

/**
 * #288 (#318): "Add how it's counted", for a metric saved without a definition, on the list and the metric's page
 * (Members and Admins; the pages render it for no one else). It opens the guide's questions in the metric's own unit;
 * once saved the definition is read-only, and the server refuses to replace it. Focus then goes to the first control
 * of what it sits in (`data-metric-definition`): the metric's name on the list, its Name field on its page.
 */
export function AddHowCountedDialog({ orgId, definition }: { orgId: string; definition: { id: string; name: string; unit: MetricUnit; link: string | null; howCounted: string | null } }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState("");
  const anchor = useRef<HTMLSpanElement>(null);
  const justSaved = useRef(false);
  const after = () => anchor.current?.closest("[data-metric-definition]")?.querySelector<HTMLElement>("a[href], input:not([disabled]):not([readonly])") ?? null;
  // The link goes once the page shows the saved definition; focus moves on then, not to where the link was.
  useEffect(() => {
    if (!definition.howCounted || !justSaved.current) return;
    justSaved.current = false;
    after()?.focus({ preventScroll: true });
  }, [definition.howCounted]);
  return <span ref={anchor} className={styles.addDefinition}>
    {!definition.howCounted && <Dialog guardTypedText dismissible={!pending} open={open} onOpenChange={next => { if (!pending) setOpen(next); }}>
      <DialogTrigger asChild><button type="button" className={styles.addDefinitionLink}>Add how it’s counted<span className="sr-only"> for {definition.name}</span></button></DialogTrigger>
      <DialogContent className={styles.createDialog} title="Add how it’s counted" description={`Answer a few questions about ${definition.name}. Once saved, its definition can’t change.`}
        onCloseAutoFocus={event => { if (justSaved.current) event.preventDefault(); }}>
        <GuidedMetricForm initialName={definition.name} unit={definition.unit} submitLabel="Save definition" onPendingChange={setPending} onCancel={() => setOpen(false)}
          onSubmit={async values => {
            const result = await callAction(() => editMetricDefinition({ id: definition.id, name: values.name, unit: definition.unit, link: definition.link ?? "", howCounted: values.howCounted }, { orgId }));
            if ("ok" in result) { justSaved.current = true; setSaved(`Saved how ${values.name.trim()} is counted.`); }
            return result;
          }}
          onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>}
    <span className="sr-only" role="status">{saved}</span>
  </span>;
}

/** The definition page's form: change the name, unit and dashboard link; retain saved calculation notes. */
export function EditMetricForm({ orgId, definition, unitLocked = false }: { orgId: string; definition: { id: string } & MetricDefinitionValues; unitLocked?: boolean }) {
  const { id, ...initial } = definition;
  return <MetricDefinitionForm initial={initial} submitLabel="Save changes" confirmSaved unitLocked={unitLocked}
    note="Keep the same definition for current and actual values. To measure something different, create a new metric."
    onSubmit={values => callAction(() => editMetricDefinition({ id, ...values }, { orgId }))} />;
}

/**
 * Archive or restore, for Admins only (the page doesn't render it for anyone else; the server refuses them too).
 * #288 (D31): Archive happens at once, and its message offers Undo, which restores it; Restore stays as it was.
 */
export function ArchiveMetricControl({ orgId, id, name, archived }: { orgId: string; id: string; name: string; archived: boolean }) {
  const stack = useToastStack();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restore = () => callAction(() => restoreMetricDefinition({ id }, { orgId }));
  async function toggle() {
    setPending(true); setError(null);
    try {
      const result = archived ? await restore() : await callAction(() => archiveMetricDefinition({ id }, { orgId }));
      if ("error" in result) { setError(result.error); return; }
      if (!archived) offerUndo(stack, `metric-archived-${id}`, { title: "Metric archived", description: `${name} isn’t offered for new goals.` }, {
        undoing: { title: "Restoring the metric", description: name },
        undone: { title: "Metric restored", description: `${name} is offered for new goals again.` },
        run: async failed => {
          try {
            const back = await restore();
            if ("error" in back) { failed(back.error); return false; }
            return true;
          } catch (thrown) {
            failed(thrownMessage(thrown, "We couldn’t restore this metric. Check your connection and try again."));
            return false;
          }
        },
      });
    } catch (thrown) {
      setError(thrownMessage(thrown, `We couldn’t ${archived ? "restore" : "archive"} this metric. Check your connection and try again.`));
    } finally {
      setPending(false);
    }
  }
  return <div className={styles.archive}>
    <Button variant="secondary" loading={pending} onClick={toggle}>{archived ? "Restore metric" : "Archive metric"}</Button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}

export type MergeCandidate = { id: string; name: string; archived: boolean };

/**
 * Merging (#202), for Admins only (the page doesn't render it for anyone else; the server refuses them too). Choose
 * another metric in the same unit and which of the two is kept, then confirm: merging can't be undone.
 */
export function MergeMetricControl({ orgId, current, candidates }: { orgId: string; current: { id: string; name: string }; candidates: MergeCandidate[] }) {
  const { toast } = useToastStack();
  const [otherId, setOtherId] = useState("");
  const [keep, setKeep] = useState<"this" | "other">("this");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other = candidates.find(candidate => candidate.id === otherId);
  const kept = keep === "this" || !other ? current : other;
  const merged = keep === "this" ? other : current;

  function review(next: boolean) {
    if (next && !other) { setError("Choose the metric to merge with."); return; }
    setError(null);
    setOpen(next);
  }
  async function confirm() {
    if (!merged) return;
    setPending(true); setError(null);
    try {
      const result = await callAction(() => mergeMetricDefinitions({ keptId: kept.id, mergedId: merged.id }, { orgId }));
      if ("error" in result) { setError(result.error); return; }
      setOpen(false);
      setOtherId(""); setKeep("this");
      toast({ type: "success", title: `Merged ${merged.name} into ${kept.name}` });
    } catch (thrown) {
      setError(thrownMessage(thrown, "We couldn’t merge these metrics. Check your connection and try again."));
    } finally {
      setPending(false);
    }
  }

  return <div className={styles.merge}>
    <Select label="Merge with" placeholder="Choose a metric" value={otherId}
      options={candidates.map(candidate => ({ value: candidate.id, label: candidate.archived ? `${candidate.name} (archived)` : candidate.name }))}
      onValueChange={value => { setOtherId(value); setError(null); }} />
    {other && <RadioGroup label="Keep" value={keep} onValueChange={value => setKeep(value === "other" ? "other" : "this")} options={[
      { value: "this", label: current.name, description: `${other.name} is merged into it.` },
      { value: "other", label: other.name, description: `${current.name} is merged into it.` },
    ]} />}
    <p className={styles.note}>{other && merged
      ? `${merged.name} leaves the picker and the metric list, and the Requests that used it count under ${kept.name}. ${kept.name} stays as it is.`
      : "Choose the metric to merge with, then which one to keep."}</p>
    {error && !open && <p className={styles.error} role="alert">{error}</p>}
    {/* #288: Lane's shared confirmation for what can't be undone: red Merge metrics, opening on Cancel. */}
    <PermanentActionConfirmation open={open} onOpenChange={review} busy={pending}
      trigger={<Button variant="secondary" className={styles.mergeButton}>Review merge</Button>}
      title={merged ? `Merge ${merged.name} into ${kept.name}?` : "Merge metrics?"}
      description={merged ? `${merged.name} will leave the picker and the metric list. Requests that used it will count under ${kept.name} from now on, and their results add up together. No Request is changed. This can’t be undone.` : ""}
      confirmLabel="Merge metrics" onConfirm={() => void confirm()}>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </PermanentActionConfirmation>
  </div>;
}

/** Active or archived definitions, kept in the address so the view survives a reload. */
export function MetricLibraryFilter({ show }: { show: "active" | "archived" }) {
  const router = useRouter();
  return <SegmentedControl label="Show metrics" value={show}
    options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]}
    onValueChange={value => router.push(value === "archived" ? "/settings/metrics?show=archived" : "/settings/metrics")} />;
}
