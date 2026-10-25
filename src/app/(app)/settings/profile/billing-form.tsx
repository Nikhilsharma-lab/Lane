"use client";

import { BillingPlanCard, type BillingPlanCardProps } from "@/components/settings/billing-plan-card";
import { startPlanCheckout } from "./billing-actions";

/** #214 Settings → Billing's plan card, paying through this workspace's checkout action. */
export function BillingForm({ orgId, ...card }: Omit<BillingPlanCardProps, "onCheckout"> & { orgId: string }) {
  return <BillingPlanCard {...card} onCheckout={(period) => startPlanCheckout({ period }, { orgId })} />;
}
