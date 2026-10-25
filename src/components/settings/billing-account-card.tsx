import { Alert } from "@/components/arc/alert/alert";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
import { BILLING_PAGES_UNAVAILABLE, PAID_SEAT_MINIMUM } from "@/lib/billing-plan-rules";
import type { PlanState } from "@/lib/free-request-rules";
import styles from "./settings.module.css";
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
  if (nextBill) return `${nextBill.amount} on ${nextBill.on}`;
  if (props.endsOn) return `None. The plan ends on ${props.endsOn}.`;
  if (props.planState === "lapsed") return "None while the plan has lapsed.";
  if (props.planState === "free") return "None until this workspace pays.";
  return "None";
}

/**
 * #216 Settings → Billing, for Admins: the workspace's paid seats (counted from the live roster), the next bill and
 * the latest invoices, each opening on the payment provider's own page. Nothing here is about any one person.
 */
export function BillingAccountCard(props: BillingAccountCardProps) {
  const { seats, account: reading } = props;
  return <section className={styles.card} aria-labelledby="billing-account-title">
    <div className={styles.cardBody}>
      <h3 id="billing-account-title">Seats and invoices</h3>
      {reading === "failed" && <Alert role="alert" tone="danger" title={FAILED} />}
      <div className={styles.rows}>
        <div className={styles.row}>
          <div>
            <strong>Paid seats</strong>
            <p>{seats && seats.adminsAndMembers < PAID_SEAT_MINIMUM
              ? `${seats.adminsAndMembers} ${seats.adminsAndMembers === 1 ? "Admin or Member" : "Admins and Members"}, billed as the ${PAID_SEAT_MINIMUM}-seat minimum.`
              : ABOUT_SEATS}</p>
          </div>
          <span className={styles.value}>{seats ? seats.paid : "Couldn’t count this workspace’s seats. Reload the page to try again."}</span>
        </div>
        {typeof reading === "object" && <div className={styles.row}>
          <div><strong>Next bill</strong></div>
          <span className={styles.value}>{nextBillText(props, reading.nextBill)}</span>
        </div>}
      </div>
      {reading === "unavailable" && <p className={styles.note}>{BILLING_PAGES_UNAVAILABLE}</p>}
      {typeof reading === "object" && <>
        <h4 className={account.heading}>Invoices</h4>
        {reading.invoices.length === 0
          ? <p className={styles.note}>No invoices yet.</p>
          : <ul className={styles.rows} aria-label="Invoices">
            {reading.invoices.map((invoice) => {
              const name = invoice.number ?? "Invoice";
              return <li key={invoice.id} className={styles.row}>
                <div>
                  <strong>{invoice.issuedOn}</strong>
                  <p className={account.number}>{name}</p>
                </div>
                <div className={account.line}>
                  <span className={account.amount}>{invoice.amount}</span>
                  <Badge tone={STATUS[invoice.status].tone} size="sm">{STATUS[invoice.status].label}</Badge>
                  {invoice.url && <a className={account.link} href={invoice.url} target="_blank" rel="noopener noreferrer"
                    aria-label={`View invoice ${name} on the payment provider’s page`}>View</a>}
                </div>
              </li>;
            })}
          </ul>}
      </>}
    </div>
  </section>;
}
