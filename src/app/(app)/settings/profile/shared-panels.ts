import type { ReactNode } from "react";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { timed } from "@/lib/request-timings";
import { billingPanel } from "./billing-panel";
import { inboxDeliveryPanel } from "./inbox-delivery";
import { slackPanel } from "./slack-panel";

/**
 * The sections every Settings page renders from its own reads: Inbox delivery (#206), Slack (#207) and Billing
 * (#213/#214/#216). #265: their reads run side by side rather than one after another. `slack` and `checkout` are
 * how a return from Slack or from the payment provider's checkout went (Settings → Profile only).
 */
export async function sharedPanels(workspace: WorkspaceContext, returns: { slack?: string; checkout?: string } = {}): Promise<{ delivery: ReactNode; slack: ReactNode; billing: ReactNode }> {
  const [delivery, slack, billing] = await Promise.all([
    timed("data", () => inboxDeliveryPanel(workspace)),
    timed("data", () => slackPanel(workspace, returns.slack)),
    timed("data", () => billingPanel(workspace, returns.checkout)),
  ]);
  return { delivery, slack, billing };
}
