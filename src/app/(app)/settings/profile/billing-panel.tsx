import type { ReactNode } from "react";
import type { CheckoutResult, PlanCheckout } from "@/components/settings/billing-plan-card";
import { FreeRequestsCard } from "@/components/settings/free-requests-card";
import { decideFreeRequests, readFreeRequests, readPlan } from "@/lib/billing";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { billingEnforced } from "@/lib/feature-switches";
import { paymentProvider } from "@/lib/payment-provider";
import { journeyDay } from "@/lib/request-journey";
import { BillingForm } from "./billing-form";

const RESULTS: readonly CheckoutResult[] = ["done", "cancelled"];

/**
 * #213/#214 Settings → Billing, as every Settings page renders it, for Admins only: the Lane plan (pay by card on
 * the provider's hosted page, the founding discount, Enterprise) and the Free Requests left. Anyone else gets no
 * section, so nothing is read for them. A workspace Lane saw before Free Requests existed has its allowance
 * decided here, from its creator. `checkout` is how the return from the checkout page went.
 */
export async function billingPanel(workspace: Pick<WorkspaceContext, "orgId" | "role">, checkout?: string): Promise<ReactNode> {
  if (workspace.role !== "admin") return undefined;
  await decideFreeRequests({ orgId: workspace.orgId });
  const [{ planState, free }, plan] = await Promise.all([readFreeRequests({ orgId: workspace.orgId }), readPlan({ orgId: workspace.orgId })]);
  const enforced = billingEnforced();
  const availability: PlanCheckout = !enforced ? "not_charging" : paymentProvider() ? "available" : "unavailable";
  const card = <BillingForm key="plan" orgId={workspace.orgId} planState={plan.planState} period={plan.period} checkout={availability}
    founding={{ offered: plan.founding.offered, endsOn: plan.founding.endsAt && journeyDay(plan.founding.endsAt.toISOString()) }}
    result={RESULTS.find((known) => known === checkout)} />;
  const freeRequests = <FreeRequestsCard key="free" planState={planState} free={free} enforced={enforced} />;
  return planState === "paying" ? [card, freeRequests] : [freeRequests, card];
}
