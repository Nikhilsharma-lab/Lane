"use client";

import { useState } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { SUPPORT_EMAIL } from "@/app/support-contact";
import { callAction } from "@/lib/action-call";
import { BILLING_PAGES_UNAVAILABLE, BILLING_PERIODS, FOUNDING_DISCOUNT, NOT_CHARGING, PAYING_UNAVAILABLE, seatPrice, type BillingPeriod, type PortalFlow } from "@/lib/billing-plan-rules";
import type { PlanState } from "@/lib/free-request-rules";
import styles from "./settings.module.css";
import plan from "./billing-plan-card.module.css";

/** Whether an Admin can pay now: yes, not while billing isn't enforced, or not while there is no payment provider. */
export type PlanCheckout = "available" | "not_charging" | "unavailable";
/** How the trip to the provider's checkout page ended (its return address says). */
export type CheckoutResult = "done" | "cancelled";
/**
 * #216: the payment provider's hosted billing pages this workspace can open: `card` once the provider knows it,
 * `plan` while it has a plan there. "unavailable" while there is no payment provider.
 */
export type PlanPages = { card: boolean; plan: boolean } | "unavailable";

type Answer = { ok?: true; url?: string; error?: string };

export type BillingPlanCardProps = {
  planState: PlanState;
  period: BillingPeriod | null;
  /** `offered`: the founding price applies. `endsOn`: this workspace's founding discount ends then. */
  founding: { offered: boolean; endsOn: string | null };
  checkout: PlanCheckout;
  result?: CheckoutResult;
  onCheckout: (period: BillingPeriod) => Promise<Answer>;
  /** #216: the day a cancelled plan ends. */
  endsOn?: string | null;
  pages?: PlanPages;
  onOpenPage?: (flow: PortalFlow) => Promise<Answer>;
};

const NAMES: Record<BillingPeriod, string> = { yearly: "Yearly", monthly: "Monthly" };
const BILLED: Record<BillingPeriod, string> = { yearly: "Billed yearly", monthly: "Billed monthly" };
const PAGE_NAMES: Record<PortalFlow, string> = { change_period: "Change billing period", update_card: "Update card", cancel: "Cancel plan", renew: "Keep the plan" };
const FAILED = "Couldn’t reach Lane. Try again.";
const ENTERPRISE = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Lane Enterprise")}`;

/** The price per seat per month, with the list price struck through beside a founding price. */
function Price({ period, founding }: { period: BillingPeriod; founding: boolean }) {
  const price = seatPrice(period, founding);
  return <p className={plan.price}>
    {price.discounted && <><span className="sr-only">List price </span><s>{price.list}</s><span className="sr-only">, now</span>{" "}</>}
    <strong>{price.price}</strong> per seat per month
  </p>;
}

/**
 * #214 Settings → Billing, for Admins: Lane's one plan with everything, yearly first and monthly beside it, and
 * Enterprise as "talk to us". Paying opens the payment provider's hosted checkout page (the Admin comes back here).
 * While the first 50 paying workspaces' founding discount is offered, prices show it against the list price.
 *
 * #216: a workspace the provider knows opens the provider's hosted pages from here: change the billing period,
 * update the card, cancel, or keep a cancelled plan. A cancelled plan says when it ends; a lapsed one says that only
 * new Requests wait, and is paid by updating the card while its plan hasn't ended.
 */
export function BillingPlanCard({ planState, period, founding, checkout, result, onCheckout, endsOn = null, pages, onOpenPage }: BillingPlanCardProps) {
  const [busy, setBusy] = useState<BillingPeriod | PortalFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const paying = planState === "paying";
  const foundingPrice = founding.offered && (!paying || founding.endsOn !== null);
  const open = typeof pages === "object" ? pages : null;
  // A lapsed plan that hasn't ended is paid by updating the card; a checkout would start a second plan.
  const waiting = planState === "lapsed" && open?.plan === true;
  const flows: PortalFlow[] = !open ? [] : [
    ...(paying && open.plan ? [endsOn ? "renew" as const : "change_period" as const] : []),
    ...(open.card ? ["update_card" as const] : []),
    ...(paying && open.plan && !endsOn ? ["cancel" as const] : []),
  ];

  async function go(chosen: BillingPeriod | PortalFlow, opening: string, call: () => Promise<Answer>) {
    setBusy(chosen);
    setError(null);
    setStatus(opening);
    try {
      const answer = await callAction(call);
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
  const pay = (chosen: BillingPeriod) => go(chosen, "Opening the checkout page…", () => onCheckout(chosen));
  const openPage = (flow: PortalFlow) => onOpenPage && go(flow, "Opening the billing page…", () => onOpenPage(flow));

  const description = paying
    ? `This workspace pays for Lane, billed ${period ?? "yearly"}.`
    : "One plan with all of Lane. You pay for each Admin and Member, with at least 3 seats. Guests and Viewers are free.";
  const back = result === "cancelled" ? "Checkout was cancelled. Nothing was charged."
    : result === "done" ? paying ? "Thanks. This workspace now pays for Lane." : "Thanks. Your payment is being confirmed; this page shows your plan once it is."
    : null;
  const footer = open && (paying || waiting) ? "Changes and cancelling happen on the payment provider’s secure pages, then you come back here."
    : pages === "unavailable" && paying ? BILLING_PAGES_UNAVAILABLE
    : paying ? "Lane bills by card through its payment provider."
    : checkout === "available" ? "You pay by card on a secure checkout page, then come back here."
    : checkout === "not_charging" ? NOT_CHARGING : PAYING_UNAVAILABLE;

  return <section className={styles.card} aria-labelledby="billing-plan-title">
    <div className={styles.cardBody}>
      <h3 id="billing-plan-title">Lane plan</h3>
      <p>{description}</p>
      {planState === "lapsed" && <Alert role="status" tone="warning" title={waiting
        ? "This workspace’s plan has lapsed because a payment didn’t go through. Update the card to pay what’s due and create new Requests again; everything already filed keeps working."
        : "This workspace’s plan has lapsed. Pay again to create new Requests; everything already filed keeps working."} />}
      {paying && endsOn && <Alert role="status" tone="info" title={`This plan is cancelled and ends on ${endsOn}. After that, only creating new Requests waits for payment; nothing is deleted.`} />}
      {back && <Alert role="status" tone={result === "cancelled" ? "warning" : "success"} title={back} />}
      {founding.endsOn
        ? founding.offered && <p className={styles.note}>Founding discount: {FOUNDING_DISCOUNT.percentOff}% off until {founding.endsOn}.</p>
        : !paying && founding.offered && <p className={styles.note}>The first {FOUNDING_DISCOUNT.workspaces} workspaces to pay get {FOUNDING_DISCOUNT.percentOff}% off for two years.</p>}
      {paying || waiting
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
      {flows.length > 0 && <div className={plan.actions}>
        {flows.map((flow) => <Button key={flow} variant={waiting ? "primary" : "secondary"} loading={busy === flow} disabled={busy !== null && busy !== flow}
          onClick={() => { void openPage(flow); }}>{PAGE_NAMES[flow]}</Button>)}
      </div>}
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
