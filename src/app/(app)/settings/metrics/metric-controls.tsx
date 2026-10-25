"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { MetricDefinitionForm, type MetricDefinitionValues } from "@/components/metrics/metric-definition-form";
import { callAction } from "@/lib/action-call";
import { addMetricDefinition, archiveMetricDefinition, editMetricDefinition, restoreMetricDefinition } from "./actions";
import styles from "./metrics.module.css";

/** Settings → Metrics controls (#197) that save through the library's actions. */

const EMPTY: MetricDefinitionValues = { name: "", unit: "", link: "", howCounted: "" };

/** "Add metric" and its dialog. The new definition appears in the list once saved; focus returns to the button. */
export function AddMetricDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState("");
  return <>
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (next) setAdded(""); }}>
      <DialogTrigger asChild><Button><Plus data-icon-size="sm" aria-hidden="true" />Add metric</Button></DialogTrigger>
      <DialogContent title="Add metric" description="Add a metric your workspace measures, so Requests can predict it.">
        <MetricDefinitionForm initial={EMPTY} submitLabel="Add metric"
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

/** The definition page's form: change the name, unit, link and how it's counted. */
export function EditMetricForm({ orgId, definition }: { orgId: string; definition: { id: string } & MetricDefinitionValues }) {
  const { id, ...initial } = definition;
  return <MetricDefinitionForm initial={initial} submitLabel="Save changes" confirmSaved
    note="If what's counted changes, add a new metric instead, so results already measured keep their meaning."
    onSubmit={values => callAction(() => editMetricDefinition({ id, ...values }, { orgId }))} />;
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
    } catch {
      setError(`We couldn't ${archived ? "restore" : "archive"} this metric. Check your connection and try again.`);
    } finally {
      setPending(false);
    }
  }
  return <div className={styles.archive}>
    <Button variant="secondary" loading={pending} onClick={toggle}>{archived ? "Restore metric" : "Archive metric"}</Button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}

/** Active or archived definitions, kept in the address so the view survives a reload. */
export function MetricLibraryFilter({ show }: { show: "active" | "archived" }) {
  const router = useRouter();
  return <SegmentedControl label="Show metrics" value={show}
    options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]}
    onValueChange={value => router.push(value === "archived" ? "/settings/metrics?show=archived" : "/settings/metrics")} />;
}
