"use client";

import { useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { SUPPORT_EMAIL } from "@/app/support-contact";
import { callAction } from "@/lib/action-call";
import { BILLING_PERIODS, FOUNDING_DISCOUNT, NOT_CHARGING, PAYING_UNAVAILABLE, seatPrice, type BillingPeriod } from "@/lib/billing-plan-rules";
import type { PlanState } from "@/lib/free-request-rules";
import styles from "./settings.module.css";
import plan from "./billing-plan-card.module.css";

/** Whether an Admin can pay now: yes, not while billing isn't enforced, or not while there is no payment provider. */
export type PlanCheckout = "available" | "not_charging" | "unavailable";
/** How the trip to the provider's checkout page ended (its return address says). */
export type CheckoutResult = "done" | "cancelled";

export type BillingPlanCardProps = {
  planState: PlanState;
  period: BillingPeriod | null;
  /** `offered`: the founding price applies. `endsOn`: this workspace's founding discount ends then. */
  founding: { offered: boolean; endsOn: string | null };
  checkout: PlanCheckout;
  result?: CheckoutResult;
  onCheckout: (period: BillingPeriod) => Promise<{ ok?: true; url?: string; error?: string }>;
};

const NAMES: Record<BillingPeriod, string> = { yearly: "Yearly", monthly: "Monthly" };
const BILLED: Record<BillingPeriod, string> = { yearly: "Billed yearly", monthly: "Billed monthly" };
const FAILED = "Couldn’t reach Lane. Try again.";
const ENTERPRISE = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Lane Enterprise")}`;

/** The price per seat per month, with the list price struck through beside a founding price. */
function Price({ period, founding }: { period: BillingPeriod; founding: boolean }) {
  const price = seatPrice(period, founding);
  return <p className={plan.price}>
    {price.discounted && <><span className="sr-only">List price </span><s>{price.list}</s>{" "}<span className="sr-only">, now </span></>}
    <strong>{price.price}</strong> per seat per month
  </p>;
}

/**
 * #214 Settings → Billing, for Admins: Lane's one plan with everything, yearly first and monthly beside it, and
 * Enterprise as "talk to us". Paying opens the payment provider's hosted checkout page (the Admin comes back here).
 * While the first 50 paying workspaces' founding discount is offered, prices show it against the list price.
 */
export function BillingPlanCard({ planState, period, founding, checkout, result, onCheckout }: BillingPlanCardProps) {
  const [busy, setBusy] = useState<BillingPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const paying = planState === "paying";
  const foundingPrice = founding.offered && (!paying || founding.endsOn !== null);

  async function pay(chosen: BillingPeriod) {
    setBusy(chosen);
    setError(null);
    setStatus("Opening the checkout page…");
    try {
      const answer = await callAction(() => onCheckout(chosen));
      if (answer.url) {
        window.location.assign(answer.url);
        return;
      }
      setError(answer.error || FAILED);
    } catch {
      setError(FAILED);
    }
    setStatus("");
    setBusy(null);
  }

  const description = paying
    ? `This workspace pays for Lane, billed ${period ?? "yearly"}.`
    : "One plan with all of Lane. You pay for each Admin and Member, with at least 3 seats. Guests and Viewers are free.";
  const back = result === "cancelled" ? "Checkout was cancelled. Nothing was charged."
    : result === "done" ? paying ? "Thanks. This workspace now pays for Lane." : "Thanks. Your payment is being confirmed; this page shows your plan once it is."
    : null;
  const footer = paying ? "Lane bills by card through its payment provider."
    : checkout === "available" ? "You pay by card on a secure checkout page, then come back here."
    : checkout === "not_charging" ? NOT_CHARGING : PAYING_UNAVAILABLE;

  return <section className={styles.card} aria-labelledby="billing-plan-title">
    <div className={styles.cardBody}>
      <h3 id="billing-plan-title">Lane plan</h3>
      <p>{description}</p>
      {planState === "lapsed" && <Alert role="status" tone="warning" title="This workspace’s plan has lapsed. Pay again to create new Requests; everything already filed keeps working." />}
      {back && <Alert role="status" tone={result === "cancelled" ? "warning" : "success"} title={back} />}
      {founding.endsOn
        ? founding.offered && <p className={styles.note}>Founding discount: {FOUNDING_DISCOUNT.percentOff}% off until {founding.endsOn}.</p>
        : !paying && founding.offered && <p className={styles.note}>The first {FOUNDING_DISCOUNT.workspaces} workspaces to pay get {FOUNDING_DISCOUNT.percentOff}% off for two years.</p>}
      {paying
        ? <div className={styles.rows}><div className={styles.row}><strong>Price</strong><div className={styles.value}><Price period={period ?? "yearly"} founding={foundingPrice} /></div></div></div>
        : <ul className={plan.periods} aria-label="Billing periods">
          {BILLING_PERIODS.map((each, index) => <li key={each} className={plan.period}>
            <h4 className={plan.name}>{NAMES[each]}</h4>
            <Price period={each} founding={foundingPrice} />
            <p className={plan.billed}>{BILLED[each]}</p>
            {checkout === "available" && <Button className={plan.pay} variant={index === 0 ? "primary" : "secondary"} loading={busy === each} disabled={busy !== null && busy !== each}
              onClick={() => { void pay(each); }}>Pay {each}</Button>}
          </li>)}
        </ul>}
      <div className={styles.rows}>
        <div className={styles.row}>
          <div><strong>Enterprise</strong><p>For larger companies that need more than one plan gives.</p></div>
          <a className={plan.link} href={ENTERPRISE}>Talk to us</a>
        </div>
      </div>
      {error && <Alert role="alert" tone="danger" title={error} />}
    </div>
    <div className={styles.cardFooter}>
      <div>
        <span>{footer}</span>
        <p role="status" className={styles.feedback}>{status}</p>
      </div>
    </div>
  </section>;
}
