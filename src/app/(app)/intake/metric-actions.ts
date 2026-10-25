"use server";

import { refusal, requireActiveMember } from "@/lib/auth-guard";
import type { MetricChoice } from "@/lib/metric-definition-rules";
import { predictionMetricChoices } from "@/lib/metrics-library";

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
