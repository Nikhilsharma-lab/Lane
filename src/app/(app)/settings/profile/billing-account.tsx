import { BillingAccountCard, type BillingAccountCardProps } from "@/components/settings/billing-account-card";
import { readBillingAccount, readSeats } from "@/lib/billing";
import { money } from "@/lib/billing-plan-rules";
import type { PlanState } from "@/lib/free-request-rules";
import { paymentProvider } from "@/lib/payment-provider";
import { zoneFreeDay } from "@/lib/dates";

/** Admins and Members on the live Clerk roster (Guests and Viewers are free; #215 counts them), or null when Clerk can't be read. */
async function seatsOf(orgId: string): Promise<BillingAccountCardProps["seats"]> {
  try {
    const { adminsAndMembers, paid } = await readSeats({ orgId });
    return { adminsAndMembers, paid };
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
    nextBill: account.nextBill && { amount: money(account.nextBill.amountCents, account.nextBill.currency), on: zoneFreeDay(account.nextBill.on) },
    invoices: account.invoices.map((invoice) => ({
      id: invoice.id, number: invoice.number, issuedOn: zoneFreeDay(invoice.issuedAt), amount: money(invoice.amountCents, invoice.currency), status: invoice.status, url: invoice.url,
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
