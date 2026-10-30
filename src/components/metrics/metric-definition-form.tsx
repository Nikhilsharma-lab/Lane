"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { Textarea } from "@/components/arc/textarea/textarea";
import {
  METRIC_HOW_COUNTED_MAX, METRIC_LINK_MAX, METRIC_NAME_MAX, METRIC_UNITS, metricDefinitionFieldErrors, metricDefinitionInputSchema,
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
 * Adding or editing a Metric definition (#197): name, unit, where it lives and how it's counted. The
 * same rules run here and on the server; the server's answer shows beside the field it is about.
 */
export function MetricDefinitionForm({ initial, submitLabel, note, onSubmit, onSaved, confirmSaved = false, unitLocked = false }: {
  initial: MetricDefinitionValues;
  submitLabel: string;
  /** A Request uses the definition, so its unit shows but can't change (#198). */
  unitLocked?: boolean;
  /** Shown above the button, e.g. the edit form's rule about what's counted. */
  note?: ReactNode;
  onSubmit: (values: MetricDefinitionValues) => Promise<MetricFormResult>;
  onSaved?: () => void;
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
    if (first) form.current?.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] textarea`)?.focus();
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
    }
  }

  return <form ref={form} className={styles.form} onSubmit={submit} noValidate aria-describedby={error ? `${id}-error` : undefined}>
    <div data-field="name"><Input label="Name" value={values.name} onChange={event => set("name")(event.target.value)} maxLength={METRIC_NAME_MAX} error={fields.name} autoComplete="off" required /></div>
    <div data-field="unit" className={styles.unit}>
      {unitLocked
        ? <div className={styles.lockedUnit}>
          <span className={styles.lockedLabel}>Unit</span>
          <span>{UNIT_OPTIONS.find(option => option.value === values.unit)?.label ?? values.unit}</span>
          <p className={styles.note}>{UNIT_LOCKED_NOTE}</p>
        </div>
        : <RadioGroup label="Unit" options={UNIT_OPTIONS} value={values.unit} onValueChange={set("unit")} />}
      <FieldError>{fields.unit}</FieldError>
    </div>
    <div data-field="link"><Input label="Where it lives" description="A link to the dashboard or report that shows it. Optional." type="url" inputMode="url" placeholder="https://" value={values.link} onChange={event => set("link")(event.target.value)} maxLength={METRIC_LINK_MAX} error={fields.link} autoComplete="off" /></div>
    <div data-field="howCounted"><Textarea label="How it's counted" description="One line on what is counted, and over what. Optional." value={values.howCounted} onChange={event => set("howCounted")(event.target.value)} maxLength={METRIC_HOW_COUNTED_MAX} error={fields.howCounted} rows={3} /></div>
    {note && <p className={styles.note}>{note}</p>}
    {error && <p id={`${id}-error`} className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <Button type="submit" loading={pending}>{submitLabel}</Button>
      <span className={styles.saved} role="status">{saved ? "Saved" : ""}</span>
    </div>
  </form>;
}
