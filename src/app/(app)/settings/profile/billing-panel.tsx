import { Suspense, type ReactNode } from "react";
import { Alert } from "@/components/arc/alert/alert";
import type { CheckoutResult, PlanCheckout, PlanPages } from "@/components/settings/billing-plan-card";
import { FreeRequestsCard } from "@/components/settings/free-requests-card";
import { decideFreeRequests, readFreeRequests, readPlan } from "@/lib/billing";
import type { WorkspaceContext } from "@/lib/ensure-workspace";
import { billingEnforced } from "@/lib/feature-switches";
import { BILLING_PILOT_LINE } from "@/lib/billing-plan-rules";
import { paymentProvider } from "@/lib/payment-provider";
import { zoneFreeDay } from "@/lib/dates";
import { BillingAccount, seatsOf } from "./billing-account";
import { BillingForm } from "./billing-form";
import { Placeholder } from "@/components/loading/placeholder";

const RESULTS: readonly CheckoutResult[] = ["done", "cancelled"];

const day = (at: Date | null) => at && zoneFreeDay(at);

/**
 * #213/#214/#216 Settings → Billing, as every Settings page renders it, for Admins only: the Lane plan (pay by card
 * on the provider's hosted page, change the period, update the card or cancel there, the founding discount,
 * Enterprise), the seats, next bill and invoices (streamed after the page), and the Free Requests left. Anyone
 * else gets no section, so nothing is read for them. A workspace Lane saw before Free Requests existed has its
 * allowance decided here, from its creator. `checkout` is how the return from the checkout page went.
 *
 * #287: while billing isn't enforced, Billing is the pilot line, the plan with its prices (nothing to pay), then the
 * Free Requests; seats and invoices are neither shown nor read (no Clerk roster, no payment provider). Once billing
 * is enforced, a paying workspace sees its plan, seats and invoices, then Free Requests; any other, Free Requests
 * first.
 */
export async function billingPanel(workspace: Pick<WorkspaceContext, "orgId" | "role">, checkout?: string): Promise<ReactNode> {
  if (workspace.role !== "admin") return undefined;
  const enforced = billingEnforced();
  // #265: Clerk's roster for the seats is asked first, so it runs alongside the reads below, not after them.
  const seats = enforced ? seatsOf(workspace.orgId) : null;
  await decideFreeRequests(workspace);
  const [{ planState, free }, plan] = await Promise.all([readFreeRequests(workspace), readPlan(workspace)]);
  const provider = paymentProvider() !== null;
  const availability: PlanCheckout = !enforced ? "not_charging" : provider ? "available" : "unavailable";
  // The provider's pages are offered whenever there is a provider, so a workspace that pays can always change or stop.
  const pages: PlanPages = provider ? { card: plan.customer, plan: plan.subscription } : "unavailable";
  const endsOn = day(plan.endsAt);
  const card = <BillingForm key="plan" orgId={workspace.orgId} planState={plan.planState} period={plan.period} checkout={availability}
    founding={{ offered: plan.founding.offered, endsOn: day(plan.founding.endsAt) }} endsOn={endsOn} pages={pages}
    result={RESULTS.find((known) => known === checkout)} />;
  const freeRequests = <FreeRequestsCard key="free" planState={planState} free={free} enforced={enforced} />;
  if (!seats) return [<Alert key="pilot" tone="info" role="note" title={BILLING_PILOT_LINE} />, card, freeRequests];
  const account = <Suspense key="account" fallback={<Placeholder label="Loading seats and invoices…" lines={4} />}>
    <BillingAccount orgId={workspace.orgId} planState={plan.planState} endsOn={endsOn} seats={seats} />
  </Suspense>;
  return planState === "paying" ? [card, account, freeRequests] : [freeRequests, card, account];
}
