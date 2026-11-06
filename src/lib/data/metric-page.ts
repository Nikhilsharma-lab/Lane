import "server-only";

import { cache } from "react";
import { readMetricDefinition, type MetricsWorkspace } from "@/lib/metrics-library";
import { timed } from "@/lib/request-timings";

/** One Metric's definition for its Settings page, read once per request: its layout's 404 check and the page share it. */
export const readMetricPage = cache((workspace: MetricsWorkspace, definitionId: string) => timed("data", () => readMetricDefinition(workspace, definitionId)));
