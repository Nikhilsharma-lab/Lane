"use client";

import { MetricDefinitionForm, type MetricDefinitionValues } from "@/components/metrics/metric-definition-form";
import { callAction } from "@/lib/action-call";
import { editMetricDefinition } from "./actions";

/** The definition page's form: change the name, unit and dashboard link; retain saved calculation notes. */
export function EditMetricForm({ orgId, definition, unitLocked = false }: { orgId: string; definition: { id: string } & MetricDefinitionValues; unitLocked?: boolean }) {
  const { id, ...initial } = definition;
  return <MetricDefinitionForm initial={initial} submitLabel="Save changes" confirmSaved unitLocked={unitLocked}
    note="Use the same report for current and actual values. If the calculation changes, add a new metric."
    onSubmit={values => callAction(() => editMetricDefinition({ id, ...values }, { orgId }))} />;
}
