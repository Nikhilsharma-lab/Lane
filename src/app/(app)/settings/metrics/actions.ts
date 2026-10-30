"use server";

import { revalidatePath } from "next/cache";
import { guardCanChange } from "@/lib/auth-guard";
import { metricDefinitionFieldErrors, metricDefinitionInputSchema, type MetricDefinitionField } from "@/lib/metric-definition-rules";
import {
  addMetricDefinition as addToLibrary, archiveMetricDefinition as archiveInLibrary, editMetricDefinition as editInLibrary,
  mergeMetricDefinitions as mergeInLibrary, restoreMetricDefinition as restoreInLibrary, type MetricsLibraryRefusal,
} from "@/lib/metrics-library";

/**
 * Settings → Metrics (#197): keeping the workspace's Metrics library accurate. Members and Admins add
 * and edit definitions; only Admins archive, restore and merge them (#202); Guests are refused everything. The
 * workspace comes from the page; who is acting, and their role, only from the session.
 */

type FieldErrors = Partial<Record<MetricDefinitionField, string>>;
export type MetricActionResult<T = object> = ({ ok: true } & T) | { error: string; sessionExpired?: true; fields?: FieldErrors };
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
  const auth = await guardCanChange(context.orgId, LIBRARY_REFUSAL);
  if ("error" in auth) return auth;

  const result = await addToLibrary(auth, auth.userId, parsed.data);
  if ("error" in result) return refused(result);
  revalidate(result.id);
  return { ok: true, id: result.id };
}

export async function editMetricDefinition(data: DefinitionData & { id: string }, context: { orgId: string }): Promise<MetricActionResult> {
  const parsed = metricDefinitionInputSchema.safeParse(data);
  if (!parsed.success) return { error: CHECK_FIELDS, fields: metricDefinitionFieldErrors(parsed.error) };
  const auth = await guardCanChange(context.orgId, LIBRARY_REFUSAL);
  if ("error" in auth) return auth;

  const id = String(data.id);
  const result = await editInLibrary(auth, auth.userId, id, parsed.data);
  if ("error" in result) return refused(result);
  if (result.changed) revalidate(id);
  return { ok: true };
}

const ADMIN_ONLY = "Only Admins can archive or restore metrics.";

/** Archive, restore and merge are for Admins: a Member is told so, a Guest gets the library refusal. */
async function adminFor(orgId: string, adminOnly = ADMIN_ONLY) {
  const auth = await guardCanChange(orgId, LIBRARY_REFUSAL);
  if ("error" in auth) return auth;
  if (auth.role !== "admin") return { error: adminOnly };
  return { admin: auth };
}

export async function archiveMetricDefinition(data: { id: string }, context: { orgId: string }): Promise<MetricActionResult> {
  const allowed = await adminFor(context.orgId);
  if ("error" in allowed) return allowed;
  const { admin } = allowed;
  const id = String(data?.id);
  const result = await archiveInLibrary({ orgId: admin.orgId }, admin.userId, id);
  if ("error" in result) return refused(result);
  if (result.changed) revalidate(id);
  return { ok: true };
}

export async function restoreMetricDefinition(data: { id: string }, context: { orgId: string }): Promise<MetricActionResult> {
  const allowed = await adminFor(context.orgId);
  if ("error" in allowed) return allowed;
  const { admin } = allowed;
  const id = String(data?.id);
  const result = await restoreInLibrary({ orgId: admin.orgId }, admin.userId, id);
  if ("error" in result) return refused(result);
  if (result.changed) revalidate(id);
  return { ok: true };
}

/**
 * Merges `mergedId` into `keptId` (#202): same unit only, Admins only, and it can't be undone. The kept definition
 * is unchanged; Requests that used the other one count under it from now on.
 */
export async function mergeMetricDefinitions(data: { keptId: string; mergedId: string }, context: { orgId: string }): Promise<MetricActionResult> {
  const allowed = await adminFor(context.orgId, "Only Admins can merge metrics.");
  if ("error" in allowed) return allowed;
  const { admin } = allowed;
  const keptId = String(data?.keptId), mergedId = String(data?.mergedId);
  const result = await mergeInLibrary({ orgId: admin.orgId }, admin.userId, { keptId, mergedId });
  if ("error" in result) return refused(result);
  revalidate(keptId);
  revalidatePath(`/settings/metrics/${mergedId}`);
  return { ok: true };
}
