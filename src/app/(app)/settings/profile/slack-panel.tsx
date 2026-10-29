import type { ReactNode } from "react";
import type { SlackConnectionState, SlackConnectResult } from "@/components/settings/slack-connection-card";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { slackDelivery } from "@/lib/feature-switches";
import { zoneFreeDay } from "@/lib/dates";
import { readSlackConnection } from "@/lib/slack-connection";
import { SlackForm } from "./slack-form";

const RESULTS: readonly SlackConnectResult[] = ["connected", "cancelled", "expired", "refused", "failed", "unavailable"];

/**
 * #207 Settings → Slack, as every Settings page renders it: the workspace's Slack connection, for Admins only.
 * Anyone else gets no section, so nothing is read for them. `result` is how the return from Slack went.
 */
export async function slackPanel(workspace: Pick<WorkspaceContext, "orgId" | "role">, result?: string): Promise<ReactNode> {
  if (workspace.role !== "admin") return undefined;
  const on = slackDelivery().on;
  const saved = await readSlackConnection(workspace.orgId);
  const connection: SlackConnectionState = saved
    ? { kind: "connected", teamName: saved.teamName, connectedByName: saved.connectedByName, connectedOn: zoneFreeDay(saved.connectedAt), available: on }
    : on ? { kind: "disconnected" } : { kind: "unavailable" };
  const shown = RESULTS.find((known) => known === result);
  return <SlackForm connection={connection} result={shown} orgId={workspace.orgId} />;
}
