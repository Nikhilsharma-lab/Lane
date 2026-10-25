import { BillingAccountCard, type BillingAccountCardProps } from "@/components/settings/billing-account-card";
import { readBillingAccount } from "@/lib/billing";
import { money, paidSeats } from "@/lib/billing-plan-rules";
import type { PlanState } from "@/lib/free-request-rules";
import { paymentProvider } from "@/lib/payment-provider";
import { journeyDay } from "@/lib/request-journey";
import { workspaceRoster } from "@/lib/workspace-roster";

/** Admins and Members on the live Clerk roster (Guests and Viewers are free), or null when Clerk can't be read. */
async function seatsOf(orgId: string): Promise<BillingAccountCardProps["seats"]> {
  try {
    const adminsAndMembers = (await workspaceRoster(orgId)).length;
    return { adminsAndMembers, paid: paidSeats(adminsAndMembers) };
  } catch (error) {
    console.error("[billing] seats not counted:", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

async function accountOf(orgId: string): Promise<BillingAccountCardProps["account"]> {
  const provider = paymentProvider();
  if (!provider) return "unavailable";
  const account = await readBillingAccount({ orgId }, provider);
  if (!account) return "failed";
  return {
    nextBill: account.nextBill && { amount: money(account.nextBill.amountCents, account.nextBill.currency), on: journeyDay(account.nextBill.on.toISOString()) },
    invoices: account.invoices.map((invoice) => ({
      id: invoice.id, number: invoice.number, issuedOn: journeyDay(invoice.issuedAt.toISOString()), amount: money(invoice.amountCents, invoice.currency), status: invoice.status, url: invoice.url,
    })),
  };
}

/**
 * #216 Settings → Billing's seats and invoices, streamed after the page (the Settings page wraps it in Suspense):
 * the seats come live from Clerk and the next bill and invoices from the payment provider, so neither holds up
 * the page. Only an Admin's Billing section renders it.
 */
export async function BillingAccount({ orgId, planState, endsOn }: { orgId: string; planState: PlanState; endsOn: string | null }) {
  const [seats, account] = await Promise.all([seatsOf(orgId), accountOf(orgId)]);
  return <BillingAccountCard planState={planState} endsOn={endsOn} seats={seats} account={account} />;
}
