import type { ReactNode } from "react";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { timed } from "@/lib/request-timings";
import { accountPanels } from "./account-panels";
import { billingPanel } from "./billing-panel";
import { inboxDeliveryPanel } from "./inbox-delivery";
import { slackPanel } from "./slack-panel";

/**
 * The sections every Settings page renders from its own reads: the account (#394), Inbox delivery (#206), Slack
 * (#207) and Billing (#213/#214/#216). #265: their reads run side by side rather than one after another. `slack`,
 * `checkout` and `googleError` are how a return from Slack, from the payment provider's checkout or from connecting
 * Google went (Settings → Profile only).
 */
export async function sharedPanels(workspace: WorkspaceContext, returns: { slack?: string; checkout?: string; googleError?: string } = {}): Promise<{ account: ReactNode; devices: ReactNode; security: ReactNode; delivery: ReactNode; slack: ReactNode; billing: ReactNode }> {
  const [account, delivery, slack, billing] = await Promise.all([
    timed("data", () => accountPanels(workspace, returns.googleError)),
    timed("data", () => inboxDeliveryPanel(workspace)),
    timed("data", () => slackPanel(workspace, returns.slack)),
    timed("data", () => billingPanel(workspace, returns.checkout)),
  ]);
  return { ...account, delivery, slack, billing };
}
