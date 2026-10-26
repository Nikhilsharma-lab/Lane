"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { BillingPlanCardProps } from "@/components/settings/billing-plan-card";
import { openBillingPage, startPlanCheckout } from "./billing-actions";

/**
 * Every Settings page carries the Billing section (for Admins only), so the plan card loads after the page instead
 * of in its first load, as the Members controls do (#210).
 */
const BillingPlanCard = dynamic(() => import("@/components/settings/billing-plan-card").then((module) => module.BillingPlanCard), {
  loading: () => <Skeleton label="Loading the Lane plan…" lines={4} />,
});

/** #214/#216 Settings → Billing's plan card, paying and opening the provider's billing pages through this workspace's actions. */
export function BillingForm({ orgId, ...card }: Omit<BillingPlanCardProps, "onCheckout" | "onOpenPage"> & { orgId: string }) {
  return <BillingPlanCard {...card} onCheckout={(period) => startPlanCheckout({ period }, { orgId })} onOpenPage={(flow) => openBillingPage({ flow }, { orgId })} />;
}
