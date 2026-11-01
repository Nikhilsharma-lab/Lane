"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { popupCode, popupOpener, usePopupCode } from "@/components/popup/lazy-popup";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Select } from "@/components/arc/select/select";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import { archiveMetricDefinition, mergeMetricDefinitions, restoreMetricDefinition } from "./actions";
import styles from "./metrics.module.css";

/** Settings → Metrics controls (#197) that save through the library's actions. */

// #267: Add metric's form and the merge confirmation load on a press of their button (or focus on it), or when they open.
const dialogCode = popupCode(() => import("./metric-dialogs"));

/** "Add metric" and its dialog. The new definition appears in the list once saved; focus returns to the button. */
export function AddMetricDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const show = () => { setAdded(""); setOpen(true); };
  const dialogs = usePopupCode(dialogCode, open, { id: "popup-unavailable:add-metric", close: () => setOpen(false), retry: show });
  return <>
    <Button ref={opener} {...popupOpener(open)} onClick={show} onPointerDown={dialogCode.preload} onFocus={dialogCode.preload}><Plus data-icon-size="sm" aria-hidden="true" />Add metric</Button>
    {dialogs && <dialogs.AddMetricBody open={open} onOpenChange={setOpen} opener={opener} orgId={orgId} onAdded={setAdded} />}
    <span className="sr-only" role="status">{added}</span>
  </>;
}

/** Archive or restore, for Admins only (the page doesn't render it for anyone else; the server refuses them too). */
export function ArchiveMetricControl({ orgId, id, archived }: { orgId: string; id: string; archived: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setPending(true); setError(null);
    try {
      const result = archived
        ? await callAction(() => restoreMetricDefinition({ id }, { orgId }))
        : await callAction(() => archiveMetricDefinition({ id }, { orgId }));
      if ("error" in result) setError(result.error);
    } catch (thrown) {
      setError(thrownMessage(thrown, `We couldn't ${archived ? "restore" : "archive"} this metric. Check your connection and try again.`));
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
  const opener = useRef<HTMLButtonElement>(null);
  const dialogs = usePopupCode(dialogCode, open, { id: "popup-unavailable:merge-metric", close: () => setOpen(false), retry: () => review(true) });

  function review(next: boolean) {
    if (pending) return;
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
      setError(thrownMessage(thrown, "We couldn't merge these metrics. Check your connection and try again."));
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
    <Button ref={opener} variant="secondary" className={styles.mergeButton} {...popupOpener(open)} onClick={() => review(true)} onPointerDown={dialogCode.preload} onFocus={dialogCode.preload}>Review merge</Button>
    {dialogs && <dialogs.MergeMetricDialog open={open} onOpenChange={review} opener={opener} kept={kept} merged={merged} error={error} pending={pending} onConfirm={() => void confirm()} />}
  </div>;
}

/** Active or archived definitions, kept in the address so the view survives a reload. */
export function MetricLibraryFilter({ show }: { show: "active" | "archived" }) {
  const router = useRouter();
  return <SegmentedControl label="Show metrics" value={show}
    options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]}
    onValueChange={value => router.push(value === "archived" ? "/settings/metrics?show=archived" : "/settings/metrics")} />;
}
