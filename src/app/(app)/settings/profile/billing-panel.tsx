import { Suspense, type ReactNode } from "react";
import type { CheckoutResult, PlanCheckout, PlanPages } from "@/components/settings/billing-plan-card";
import { FreeRequestsCard } from "@/components/settings/free-requests-card";
import { decideFreeRequests, readFreeRequests, readPlan } from "@/lib/billing";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { billingEnforced } from "@/lib/feature-switches";
import { paymentProvider } from "@/lib/payment-provider";
import { journeyDay } from "@/lib/request-journey";
import { BillingAccount } from "./billing-account";
import { BillingForm } from "./billing-form";
import { Placeholder } from "@/components/loading/placeholder";

const RESULTS: readonly CheckoutResult[] = ["done", "cancelled"];
const day = (at: Date | null) => at && journeyDay(at.toISOString());

/**
 * #213/#214/#216 Settings → Billing, as every Settings page renders it, for Admins only: the Lane plan (pay by card
 * on the provider's hosted page, change the period, update the card or cancel there, the founding discount,
 * Enterprise), the seats, next bill and invoices (streamed after the page), and the Free Requests left. Anyone
 * else gets no section, so nothing is read for them. A workspace Lane saw before Free Requests existed has its
 * allowance decided here, from its creator. `checkout` is how the return from the checkout page went.
 */
export async function billingPanel(workspace: Pick<WorkspaceContext, "orgId" | "role">, checkout?: string): Promise<ReactNode> {
  if (workspace.role !== "admin") return undefined;
  await decideFreeRequests(workspace);
  const [{ planState, free }, plan] = await Promise.all([readFreeRequests(workspace), readPlan(workspace)]);
  const enforced = billingEnforced();
  const provider = paymentProvider() !== null;
  const availability: PlanCheckout = !enforced ? "not_charging" : provider ? "available" : "unavailable";
  // The provider's pages are offered whenever there is a provider, so a workspace that pays can always change or stop.
  const pages: PlanPages = provider ? { card: plan.customer, plan: plan.subscription } : "unavailable";
  const endsOn = day(plan.endsAt);
  const card = <BillingForm key="plan" orgId={workspace.orgId} planState={plan.planState} period={plan.period} checkout={availability}
    founding={{ offered: plan.founding.offered, endsOn: day(plan.founding.endsAt) }} endsOn={endsOn} pages={pages}
    result={RESULTS.find((known) => known === checkout)} />;
  const account = <Suspense key="account" fallback={<Placeholder label="Loading seats and invoices…" lines={4} />}>
    <BillingAccount orgId={workspace.orgId} planState={plan.planState} endsOn={endsOn} />
  </Suspense>;
  const freeRequests = <FreeRequestsCard key="free" planState={planState} free={free} enforced={enforced} />;
  return planState === "paying" ? [card, account, freeRequests] : [freeRequests, card, account];
}
