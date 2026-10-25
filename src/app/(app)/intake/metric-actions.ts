"use server";

import { revalidatePath } from "next/cache";
import { refusal, requireActiveMember, requireMemberOrAbove } from "@/lib/auth-guard";
import { inlineMetricInputSchema, metricDefinitionFieldErrors, type MetricChoice } from "@/lib/metric-definition-rules";
import { addOrOfferMetricDefinition, predictionMetricChoices } from "@/lib/metrics-library";

export type PredictionMetricsResult =
  | { metrics: MetricChoice[]; saved: (MetricChoice | null)[]; /** Whether the Metrics page is open to this person (not to Guests). */ canOpenLibrary: boolean }
  | { error: string };

/**
 * The Metrics library as the prediction picker offers it (#198), for anyone who can write a prediction in the
 * workspace. `impact` is the prediction already in the form (the Request being edited, or a recovered draft): any
 * definition it names stays offered, and its older metrics are resolved by position. Nothing is written beyond the
 * starter metrics a library is filled with the first time it is read.
 */
export async function listPredictionMetrics(input: { impact: unknown }, context: { orgId: string }): Promise<PredictionMetricsResult> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("You can't use the Metrics library in this workspace.") };
  try {
    return { ...await predictionMetricChoices({ orgId: auth.orgId }, input?.impact ?? null), canOpenLibrary: auth.role !== "guest" };
  } catch (error) {
    console.error("[intake] Metrics library read failed:", error);
    return { error: "The Metrics library could not be loaded. Try again." };
  }
}

export type InlineMetricResult =
  | { ok: true; /** The definition to select: the one just added, or the active one that already had the name. */ metric: MetricChoice; existing: boolean }
  | { error: string; fields?: Partial<Record<"name" | "unit", string>> };

/**
 * Adding a metric that isn't in the library from the prediction form (#199): a name and a unit only. The
 * definition is added through the Metrics library, recorded in its history as added by the person, and comes back
 * ready to select. If an active definition already has that name, nothing is added and that one comes back as
 * `existing`, to be offered instead. Members and Admins only: Guests pick from the library as it is.
 */
export async function addPredictionMetric(data: { name: string; unit: string }, context: { orgId: string }): Promise<InlineMetricResult> {
  const parsed = inlineMetricInputSchema.safeParse(data);
  if (!parsed.success) return { error: "Check the highlighted fields.", fields: metricDefinitionFieldErrors(parsed.error) };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: await refusal("Guests can't add metrics to the Metrics library. Pick one that's there, or ask a Member to add it.") };
  try {
    const result = await addOrOfferMetricDefinition({ orgId: auth.orgId }, auth.userId, parsed.data);
    if (!result.existing) {
      revalidatePath("/settings/metrics");
      revalidatePath(`/settings/metrics/${result.metric.id}`);
    }
    return { ok: true, ...result };
  } catch (error) {
    console.error("[intake] Inline metric add failed:", error);
    return { error: "The metric could not be added. Try again; your Request is still here." };
  }
}
