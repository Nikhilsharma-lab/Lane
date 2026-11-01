"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Select } from "@/components/arc/select/select";
import {
  METRIC_LINK_MAX, METRIC_NAME_MAX, METRIC_UNITS, metricDefinitionFieldErrors, metricDefinitionInputSchema,
  metricUnitName, type MetricDefinitionField,
} from "@/lib/metric-definition-rules";
import styles from "./metric-definition-form.module.css";
import { FieldError } from "@/components/forms/field-error";

export type MetricDefinitionValues = { name: string; unit: string; link: string; howCounted: string };
export type MetricFormResult = { ok: true } | { error: string; fields?: Partial<Record<MetricDefinitionField, string>> };

const UNIT_OPTIONS = METRIC_UNITS.map(unit => ({ value: unit, label: metricUnitName(unit) }));
const FIELD_ORDER: MetricDefinitionField[] = ["name", "unit", "link", "howCounted"];
export const UNIT_LOCKED_NOTE = "A Request uses this metric, so its unit can't change. A metric in another unit needs a new definition.";

/**
 * Adding or editing a Metric definition: name, unit and an optional dashboard link. Saved calculation notes are retained. The
 * same rules run here and on the server; the server's answer shows beside the field it is about.
 */
export function MetricDefinitionForm({ initial, submitLabel, note, onSubmit, onSaved, onCancel, onPendingChange, confirmSaved = false, unitLocked = false }: {
  initial: MetricDefinitionValues;
  submitLabel: string;
  /** A Request uses the definition, so its unit shows but can't change (#198). */
  unitLocked?: boolean;
  /** Shown above the button, e.g. the edit form's rule about what's counted. */
  note?: ReactNode;
  onSubmit: (values: MetricDefinitionValues) => Promise<MetricFormResult>;
  onSaved?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
  /** Say "Saved" in place after a save (the edit form; the add dialog closes instead). */
  confirmSaved?: boolean;
}) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(initial);
  const [fields, setFields] = useState<Partial<Record<MetricDefinitionField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (field: keyof MetricDefinitionValues) => (value: string) => {
    setValues(current => ({ ...current, [field]: value }));
    setFields(current => ({ ...current, [field]: undefined }));
    setSaved(false);
  };

  function focusFirst(problems: Partial<Record<MetricDefinitionField, string>>) {
    const first = FIELD_ORDER.find(field => problems[field]);
    if (first) requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] textarea, [data-field="${first}"] [role="combobox"]`)?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null); setSaved(false);
    const parsed = metricDefinitionInputSchema.safeParse(values);
    if (!parsed.success) {
      const problems = metricDefinitionFieldErrors(parsed.error);
      setFields(problems); focusFirst(problems);
      return;
    }
    setPending(true);
    onPendingChange?.(true);
    try {
      const result = await onSubmit(values);
      if ("error" in result) {
        setFields(result.fields ?? {});
        if (result.fields) focusFirst(result.fields); else setError(result.error);
        return;
      }
      setFields({});
      if (confirmSaved) setSaved(true);
      onSaved?.();
    } catch {
      setError("We couldn't save this metric. Check your connection and try again.");
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return <form ref={form} className={styles.form} onSubmit={submit} noValidate aria-busy={pending || undefined} aria-describedby={error ? `${id}-error` : undefined}>
    <div className={styles.identity}>
      <div data-field="name"><Input label="Name" value={values.name} readOnly={pending} onChange={event => set("name")(event.target.value)} maxLength={METRIC_NAME_MAX} error={fields.name} autoComplete="off" required /></div>
      <div data-field="unit" className={styles.unit}>
        {unitLocked
          ? <div className={styles.lockedUnit}>
            <span className={styles.lockedLabel}>Unit</span>
            <span>{UNIT_OPTIONS.find(option => option.value === values.unit)?.label ?? values.unit}</span>
          </div>
          : <Select label="Unit" placeholder="Choose a unit" options={UNIT_OPTIONS} value={values.unit} onValueChange={set("unit")} required disabled={pending} error={fields.unit} />}
      </div>
    </div>
    {unitLocked && <><p className={styles.note}>{UNIT_LOCKED_NOTE}</p><FieldError>{fields.unit}</FieldError></>}
    <div data-field="link"><Input label="Dashboard link (optional)" description="Link to the report you use to measure this metric." type="url" inputMode="url" placeholder="https://" value={values.link} readOnly={pending} onChange={event => set("link")(event.target.value)} maxLength={METRIC_LINK_MAX} error={fields.link} autoComplete="off" /></div>
    {values.howCounted && <div className={styles.savedDefinition}>
      <span className={styles.lockedLabel}>Saved definition</span>
      <p>{values.howCounted}</p>
    </div>}
    <FieldError>{fields.howCounted}</FieldError>
    {note && <p className={styles.note}>{note}</p>}
    {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <span className={styles.saved} role="status">{saved ? "Saved" : ""}</span>
      {onCancel && <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>}
      <Button type="submit" loading={pending}>{submitLabel}</Button>
    </div>
  </form>;
}
