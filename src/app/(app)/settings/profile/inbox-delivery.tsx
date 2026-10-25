import type { ReactNode } from "react";
import { readDeliveryState } from "@/lib/delivery-preferences";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { DeliveryForm } from "./delivery-form";

/**
 * #206 Settings → Inbox delivery, as every Settings page renders it: the signed-in person's saved choice for
 * this workspace (Email when nothing is saved), with Slack DM offered while Slack is connected (#207). A Guest
 * gets no section, so nothing is read for them.
 */
export async function inboxDeliveryPanel(workspace: Pick<WorkspaceContext, "orgId" | "userId" | "email" | "role">): Promise<ReactNode> {
  if (workspace.role === "guest") return undefined;
  const state = await readDeliveryState({ orgId: workspace.orgId, userId: workspace.userId });
  return <DeliveryForm initialChoice={state.choice} slackOffered={state.slackOffered} choseSlack={state.choseSlack} email={workspace.email ?? ""} orgId={workspace.orgId} />;
}
