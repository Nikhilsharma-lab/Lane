"use client";

import { MetricDefinitionForm, type MetricDefinitionValues } from "@/components/metrics/metric-definition-form";
import { callAction } from "@/lib/action-call";
import { editMetricDefinition } from "./actions";

/** The definition page's form: change the name, unit, link and how it's counted. */
export function EditMetricForm({ orgId, definition, unitLocked = false }: { orgId: string; definition: { id: string } & MetricDefinitionValues; unitLocked?: boolean }) {
  const { id, ...initial } = definition;
  return <MetricDefinitionForm initial={initial} submitLabel="Save changes" confirmSaved unitLocked={unitLocked}
    note="If what's counted changes, add a new metric instead, so results already measured keep their meaning."
    onSubmit={values => callAction(() => editMetricDefinition({ id, ...values }, { orgId }))} />;
}
