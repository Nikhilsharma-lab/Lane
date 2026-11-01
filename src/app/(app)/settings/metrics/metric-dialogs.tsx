"use client";

import type { RefObject } from "react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/popup/adaptive-dialog";
import { MetricDefinitionForm, type MetricDefinitionValues } from "@/components/metrics/metric-definition-form";
import { callAction } from "@/lib/action-call";
import { addMetricDefinition } from "./actions";
import styles from "./metrics.module.css";

/** Settings → Metrics dialogs (#197, #202); metric-controls.tsx keeps their buttons and state. */

const EMPTY: MetricDefinitionValues = { name: "", unit: "", link: "", howCounted: "" };

/** Add metric's dialog and form. */
export function AddMetricBody({ open, onOpenChange, opener, orgId, onAdded }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLElement | null>;
  orgId: string;
  /** What the page's status line reads once a definition is added. */
  onAdded: (message: string) => void;
}) {
  return <Dialog guardTypedText open={open} onOpenChange={onOpenChange}>
    <DialogContent title="Add metric" description="Add a metric your workspace measures, so Requests can set goals on it." returnFocus={() => opener.current}>
      <MetricDefinitionForm initial={EMPTY} submitLabel="Add metric"
        onSubmit={async values => {
          const result = await callAction(() => addMetricDefinition(values, { orgId }));
          if ("ok" in result) onAdded(`Added ${values.name.trim()}.`);
          return result;
        }}
        onSaved={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>;
}

type Named = { id: string; name: string };

/** "Merge … into …?": merging can't be undone. */
export function MergeMetricDialog({ open, onOpenChange, opener, kept, merged, error, pending, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLElement | null>;
  kept: Named;
  merged: Named | undefined;
  error: string | null;
  pending: boolean;
  onConfirm: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
      {merged && <DialogContent title={`Merge ${merged.name} into ${kept.name}?`}
        returnFocus={() => opener.current}
        description={`${merged.name} will leave the picker and the metric list. Requests that used it will count under ${kept.name} from now on, and their results add up together. No Request is changed. This can't be undone.`}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.dialogActions}>
          <DialogClose asChild><Button variant="ghost" disabled={pending}>Cancel</Button></DialogClose>
          <Button loading={pending} onClick={onConfirm}>Merge metrics</Button>
        </div>
      </DialogContent>}
    </Dialog>;
}
