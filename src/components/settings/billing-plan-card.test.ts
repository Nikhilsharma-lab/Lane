import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingPlanCard, type BillingPlanCardProps } from "./billing-plan-card";

/** #214 Settings → Billing, for Admins: the one Lane plan, yearly first, the founding discount, and Enterprise. */
const render = (props: Partial<BillingPlanCardProps> = {}) =>
  renderToStaticMarkup(createElement(BillingPlanCard, {
    planState: "free",
    period: null,
    founding: { offered: false, endsOn: null },
    checkout: "available",
    onCheckout: async () => ({ ok: true as const, url: "https://pay.test" }),
    ...props,
  }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the Lane plan card", () => {
  it("shows yearly at $30 first and monthly at $36 beside it, each paid for by card", () => {
    const html = text(render());
    expect(html).toMatch(/Yearly .*\$30 per seat per month .*Billed yearly.*Monthly .*\$36 per seat per month .*Billed monthly/);
    expect(html).toContain("Pay yearly");
    expect(html).toContain("Pay monthly");
    expect(html).toContain("You pay by card on a secure checkout page, then come back here.");
  });

  it("shows the founding discount against the list price while it is offered", () => {
    const html = render({ founding: { offered: true, endsOn: null } });
    expect(html).toContain("<s>$30</s>");
    expect(html).toContain("<s>$36</s>");
    expect(text(html)).toMatch(/List price \$30 .*\$18 per seat per month/);
    expect(text(html)).toMatch(/List price \$36 .*\$21\.60 per seat per month/);
    expect(text(html)).toContain("The first 50 workspaces to pay get 40% off for two years.");
  });

  it("offers Enterprise as talk to us", () => {
    const html = render();
    expect(text(html)).toContain("Enterprise");
    expect(html).toMatch(/<a [^>]*href="mailto:uselaneapp@gmail.com\?subject=Lane%20Enterprise"[^>]*>Talk to us<\/a>/);
  });

  it("offers nothing to pay while Lane isn't charging, or paying isn't set up", () => {
    const off = text(render({ checkout: "not_charging" }));
    expect(off).toContain("Lane isn’t charging yet, so there’s nothing to pay.");
    expect(off).not.toContain("Pay yearly");
    const unavailable = text(render({ checkout: "unavailable" }));
    expect(unavailable).toContain("Paying by card isn’t available yet.");
    expect(unavailable).not.toContain("Pay monthly");
    // The prices still show.
    expect(unavailable).toContain("$30 per seat per month");
  });

  it("shows a paying workspace its plan, period and founding discount, with nothing to pay", () => {
    const html = text(render({ planState: "paying", period: "monthly", founding: { offered: true, endsOn: "25 Oct 2028" } }));
    expect(html).toContain("This workspace pays for Lane, billed monthly.");
    expect(html).toContain("Founding discount: 40% off until 25 Oct 2028.");
    expect(html).toMatch(/List price \$36 .*\$21\.60 per seat per month/);
    expect(html).not.toContain("Pay yearly");
    expect(html).not.toContain("Yearly");
  });

  it("says how checkout went when the Admin comes back", () => {
    expect(text(render({ result: "done" }))).toContain("Thanks. Your payment is being confirmed; this page shows your plan once it is.");
    expect(text(render({ result: "done", planState: "paying", period: "yearly" }))).toContain("Thanks. This workspace now pays for Lane.");
    const cancelled = render({ result: "cancelled" });
    expect(cancelled).toContain('role="status"');
    expect(text(cancelled)).toContain("Checkout was cancelled. Nothing was charged.");
  });

  it("asks a lapsed workspace to pay again", () => {
    const html = text(render({ planState: "lapsed", period: "yearly" }));
    expect(html).toContain("This workspace’s plan has lapsed. Pay again to create new Requests; everything already filed keeps working.");
    expect(html).toContain("Pay yearly");
  });
});

describe("changing the plan on the provider's pages (#216)", () => {
  const paying = { planState: "paying" as const, period: "yearly" as const, pages: { card: true, plan: true } };

  it("lets an Admin of a paying workspace change the billing period, update the card or cancel", () => {
    const html = render(paying);
    expect(text(html)).toMatch(/Change billing period .*Update card .*Cancel plan/);
    expect(text(html)).toContain("Changes and cancelling happen on the payment provider’s secure pages, then you come back here.");
    expect(text(html)).not.toContain("Keep the plan");
  });

  it("says when a cancelled plan ends, that nothing is deleted, and offers to keep it", () => {
    const html = text(render({ ...paying, endsOn: "25 Oct 2027" }));
    expect(html).toContain("This plan is cancelled and ends on 25 Oct 2027. After that, only creating new Requests waits for payment; nothing is deleted.");
    expect(html).toMatch(/Keep the plan .*Update card/);
    expect(html).not.toContain("Cancel plan");
    expect(html).not.toContain("Change billing period");
  });

  it("asks a lapsed workspace whose payment didn't go through to update the card, not to pay twice", () => {
    const html = text(render({ planState: "lapsed", period: "monthly", pages: { card: true, plan: true } }));
    expect(html).toContain("This workspace’s plan has lapsed because a payment didn’t go through. Update the card to pay what’s due and create new Requests again; everything already filed keeps working.");
    expect(html).toContain("Update card");
    expect(html).not.toContain("Pay monthly");
    expect(html).not.toContain("Cancel plan");
  });

  it("lets a workspace whose plan ended pay again, and still update its card", () => {
    const html = text(render({ planState: "lapsed", period: "yearly", pages: { card: true, plan: false } }));
    expect(html).toMatch(/Pay yearly.*Update card/);
    expect(html).not.toContain("Change billing period");
  });

  it("offers no billing pages before a workspace pays, or while the provider isn't set up", () => {
    expect(text(render())).not.toContain("Update card");
    const unavailable = text(render({ ...paying, pages: "unavailable" }));
    expect(unavailable).not.toContain("Update card");
    expect(unavailable).toContain("The payment provider’s billing pages aren’t available yet.");
  });
});
