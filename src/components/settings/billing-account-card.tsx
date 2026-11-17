import { Alert } from "@/components/arc/alert/alert";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
import { BILLING_PAGES_UNAVAILABLE, PAID_SEAT_MINIMUM } from "@/lib/billing-plan-rules";
import type { PlanState } from "@/lib/free-request-rules";
import { SettingsBlock, SettingsGroup, SettingsRow, SettingsRowList } from "./settings-group";
import account from "./billing-account-card.module.css";

export type InvoiceStatus = "open" | "paid" | "void" | "uncollectible";
/** One invoice as Settings → Billing lists it, already in words: its day, amount and the provider's own page. */
export type InvoiceLine = { id: string; number: string | null; issuedOn: string; amount: string; status: InvoiceStatus; url: string | null };

export type BillingAccountCardProps = {
  planState: PlanState;
  /** The day a cancelled plan ends, if it does. */
  endsOn: string | null;
  /** Admins and Members on the live roster, and the paid seats that makes (at least 3); null when it can't be counted. */
  seats: { adminsAndMembers: number; paid: number } | null;
  /** What the payment provider says, or why it can't: not set up, or not reachable. */
  account: { nextBill: { amount: string; on: string } | null; invoices: InvoiceLine[] } | "unavailable" | "failed";
};

const STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  paid: { label: "Paid", tone: "success" },
  open: { label: "Due", tone: "warning" },
  uncollectible: { label: "Not paid", tone: "danger" },
  void: { label: "Void", tone: "neutral" },
};
const ABOUT_SEATS = `Admins and Members, at least ${PAID_SEAT_MINIMUM}. Guests and Viewers are free.`;
const FAILED = "Couldn’t load the next bill and invoices from the payment provider. Reload the page to try again.";

function nextBillText(props: BillingAccountCardProps, nextBill: { amount: string; on: string } | null): string {
  // Lane's own plan state comes first: a provider's preview of a cancelled or lapsed plan isn't a bill to expect.
  if (props.endsOn) return `None. The plan ends on ${props.endsOn}.`;
  if (props.planState === "lapsed") return "None while the plan has lapsed.";
  if (props.planState === "free") return "None until this workspace pays.";
  return nextBill ? `${nextBill.amount} on ${nextBill.on}` : "None";
}

/**
 * #216 Settings → Billing, for Admins: the workspace's paid seats (counted from the live roster), the next bill and
 * the latest invoices, each opening on the payment provider's own page. Nothing here is about any one person.
 */
export function BillingAccountCard(props: BillingAccountCardProps) {
  const { seats, account: reading } = props;
  return <SettingsGroup label="Seats and invoices" labelId="billing-account-title">
    {reading === "failed" && <SettingsBlock><Alert role="alert" tone="danger" title={FAILED} /></SettingsBlock>}
    <SettingsRow label="Paid seats"
      hint={seats && seats.adminsAndMembers < PAID_SEAT_MINIMUM
        ? `${seats.adminsAndMembers} ${seats.adminsAndMembers === 1 ? "Admin or Member" : "Admins and Members"}, billed as the ${PAID_SEAT_MINIMUM}-seat minimum.`
        : ABOUT_SEATS}
      control={seats ? seats.paid : "Couldn’t count this workspace’s seats. Reload the page to try again."} />
    {typeof reading === "object" && <SettingsRow label="Next bill" control={nextBillText(props, reading.nextBill)} />}
    {reading === "unavailable" && <SettingsBlock><p>{BILLING_PAGES_UNAVAILABLE}</p></SettingsBlock>}
    {typeof reading === "object" && <SettingsBlock>
      <h4 className={account.heading}>Invoices</h4>
      {reading.invoices.length === 0 && <p>No invoices yet.</p>}
    </SettingsBlock>}
    {typeof reading === "object" && reading.invoices.length > 0 && <SettingsRowList label="Invoices">
      {reading.invoices.map((invoice) => {
        const name = invoice.number ?? "Invoice";
        return <SettingsRow as="li" key={invoice.id} label={invoice.issuedOn} hint={name}
          control={<>
            <span className={account.amount}>{invoice.amount}</span>
            <Badge tone={STATUS[invoice.status].tone} size="sm">{STATUS[invoice.status].label}</Badge>
            {invoice.url && <a className={account.link} href={invoice.url} target="_blank" rel="noopener noreferrer"
              aria-label={`View invoice ${name} on the payment provider’s page`}>View</a>}
          </>} />;
      })}
    </SettingsRowList>}
  </SettingsGroup>;
}
