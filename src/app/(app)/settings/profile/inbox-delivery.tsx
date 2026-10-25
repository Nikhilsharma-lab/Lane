import { readDeliveryChoice } from "@/lib/delivery-preferences";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { DeliveryForm } from "./delivery-form";

/**
 * #206 Settings → Inbox delivery, as every Settings page renders it: the signed-in person's saved choice for
 * this workspace (Email when nothing is saved). Guests get no section, so pages pass nothing for them.
 */
export async function InboxDelivery({ workspace }: { workspace: Pick<WorkspaceContext, "orgId" | "userId" | "email" | "role"> }) {
  if (workspace.role === "guest") return null;
  const choice = await readDeliveryChoice({ orgId: workspace.orgId, userId: workspace.userId });
  return <DeliveryForm initialChoice={choice} email={workspace.email ?? ""} orgId={workspace.orgId} />;
}
