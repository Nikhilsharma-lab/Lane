import type { ReactNode } from "react";
import { readDeliveryChoice } from "@/lib/delivery-preferences";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { DeliveryForm } from "./delivery-form";

/**
 * #206 Settings → Inbox delivery, as every Settings page renders it: the signed-in person's saved choice for
 * this workspace (Email when nothing is saved). A Guest gets no section, so nothing is read for them.
 */
export async function inboxDeliveryPanel(workspace: Pick<WorkspaceContext, "orgId" | "userId" | "email" | "role">): Promise<ReactNode> {
  if (workspace.role === "guest") return undefined;
  const choice = await readDeliveryChoice({ orgId: workspace.orgId, userId: workspace.userId });
  return <DeliveryForm initialChoice={choice} email={workspace.email ?? ""} orgId={workspace.orgId} />;
}
