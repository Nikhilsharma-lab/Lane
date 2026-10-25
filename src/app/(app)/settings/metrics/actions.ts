"use server";

import { revalidatePath } from "next/cache";
import { refusal, requireMemberOrAbove } from "@/lib/auth-guard";
import { metricDefinitionFieldErrors, metricDefinitionInputSchema, type MetricDefinitionField } from "@/lib/metric-definition-rules";
import { addMetricDefinition as addToLibrary, editMetricDefinition as editInLibrary, type MetricsLibraryRefusal } from "@/lib/metrics-library";

/**
 * Settings → Metrics (#197): keeping the workspace's Metrics library accurate. Members and Admins add
 * and edit definitions; only Admins archive and restore them; Guests are refused everything. The
 * workspace comes from the page; who is acting, and their role, only from the session.
 */

type FieldErrors = Partial<Record<MetricDefinitionField, string>>;
export type MetricActionResult<T = object> = ({ ok: true } & T) | { error: string; fields?: FieldErrors };
type DefinitionData = { name: string; unit: string; link?: string | null; howCounted?: string | null };

const LIBRARY_REFUSAL = "You can't change the Metrics library in this workspace.";
const CHECK_FIELDS = "Check the highlighted fields.";

function revalidate(id: string) {
  revalidatePath("/settings/metrics");
  revalidatePath(`/settings/metrics/${id}`);
}

const refused = (result: MetricsLibraryRefusal) => result.field ? { error: result.error, fields: { [result.field]: result.error } } : { error: result.error };

export async function addMetricDefinition(data: DefinitionData, context: { orgId: string }): Promise<MetricActionResult<{ id: string }>> {
  const parsed = metricDefinitionInputSchema.safeParse(data);
  if (!parsed.success) return { error: CHECK_FIELDS, fields: metricDefinitionFieldErrors(parsed.error) };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: await refusal(LIBRARY_REFUSAL) };

  const result = await addToLibrary({ orgId: auth.orgId }, auth.userId, parsed.data);
  if ("error" in result) return refused(result);
  revalidate(result.id);
  return { ok: true, id: result.id };
}

export async function editMetricDefinition(data: DefinitionData & { id: string }, context: { orgId: string }): Promise<MetricActionResult> {
  const parsed = metricDefinitionInputSchema.safeParse(data);
  if (!parsed.success) return { error: CHECK_FIELDS, fields: metricDefinitionFieldErrors(parsed.error) };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: await refusal(LIBRARY_REFUSAL) };

  const id = String(data.id);
  const result = await editInLibrary({ orgId: auth.orgId }, auth.userId, id, parsed.data);
  if ("error" in result) return refused(result);
  if (result.changed) revalidate(id);
  return { ok: true };
}
