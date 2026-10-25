import type { ReactNode } from "react";
import { FreeRequestsCard } from "@/components/settings/free-requests-card";
import { decideFreeRequests, readFreeRequests } from "@/lib/billing";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { billingEnforced } from "@/lib/feature-switches";

/**
 * #213 Settings → Billing, as every Settings page renders it: the workspace's Free Requests left, for Admins only.
 * Anyone else gets no section, so nothing is read for them. A workspace Lane saw before Free Requests existed has
 * its allowance decided here, from its creator.
 */
export async function billingPanel(workspace: Pick<WorkspaceContext, "orgId" | "role">): Promise<ReactNode> {
  if (workspace.role !== "admin") return undefined;
  await decideFreeRequests({ orgId: workspace.orgId });
  const { planState, free } = await readFreeRequests({ orgId: workspace.orgId });
  return <FreeRequestsCard planState={planState} free={free} enforced={billingEnforced()} />;
}
