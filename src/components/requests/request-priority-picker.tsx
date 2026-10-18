"use client";

import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-constants";
import { PriorityGlyph } from "./row-presentation";
import { priorityOptions } from "./priority-options";
import styles from "./request-property-pickers.module.css";

export function RequestPriorityPicker({ value, onChange, disabled, className }: {
  value: RequestPriority; onChange: (value: RequestPriority) => void; disabled: boolean; className?: string;
}) {
  return <Select className={className} label="Priority" value={value} disabled={disabled}
    options={priorityOptions}
    onValueChange={next => onChange(next as RequestPriority)} onContentKeyDown={event => event.stopPropagation()}
    trigger={<Button type="button" className={styles.trigger} variant="secondary" size="sm" disabled={disabled} aria-label={`Priority: ${REQUEST_PRIORITY_LABELS[value]}`}>
      <span className={styles.chipContent} data-priority={value}><PriorityGlyph priority={value} /><span className={styles.chipLabel}>{REQUEST_PRIORITY_LABELS[value]}</span></span>
    </Button>} />;
}
