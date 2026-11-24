import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BillingAccountCard, type BillingAccountCardProps } from "./billing-account-card";

/** #216 Settings → Billing, for Admins: the paid seats, the next bill and the invoices. */
const render = (props: Partial<BillingAccountCardProps> = {}) =>
  renderToStaticMarkup(createElement(BillingAccountCard, {
    planState: "paying",
    endsOn: null,
    seats: { adminsAndMembers: 5, paid: 5 },
    account: { nextBill: { amount: "$90.00", on: "25 Nov 2026" }, invoices: [] },
    ...props,
  }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const invoice = (n: number, fields: Partial<{ status: "paid" | "open" | "void" | "uncollectible"; number: string | null; url: string | null }> = {}) =>
  ({ id: `in_${n}`, number: `LANE-000${n}`, issuedOn: `${n} Oct 2026`, amount: "$90.00", status: "paid" as const, url: `https://invoice.test/${n}`, ...fields });

describe("the seats and invoices card", () => {
  it("shows the paid seats and the next bill of a paying workspace", () => {
    const html = text(render());
    expect(html).toMatch(/Paid seats .*Admins and Members, at least 3\. Guests and Viewers are free\. .*5/);
    expect(html).toMatch(/Next bill .*\$90\.00 on 25 Nov 2026/);
  });

  it("counts the 3-seat minimum when there are fewer Admins and Members", () => {
    expect(text(render({ seats: { adminsAndMembers: 2, paid: 3 } }))).toMatch(/2 Admins and Members, billed as the 3-seat minimum\. .*3/);
  });

  it("says there is no next bill once a cancelled plan ends, while lapsed, or before paying", () => {
    expect(text(render({ endsOn: "25 Oct 2027", account: { nextBill: null, invoices: [] } }))).toContain("None. The plan ends on 25 Oct 2027.");
    expect(text(render({ planState: "lapsed", account: { nextBill: null, invoices: [] } }))).toContain("None while the plan has lapsed.");
    expect(text(render({ planState: "free", account: { nextBill: null, invoices: [] } }))).toContain("None until this workspace pays.");
  });

  it("never shows a next bill for a plan that ends or has lapsed, whatever the provider previews", () => {
    expect(text(render({ endsOn: "25 Oct 2027" }))).toContain("None. The plan ends on 25 Oct 2027.");
    expect(text(render({ planState: "lapsed" }))).toContain("None while the plan has lapsed.");
    expect(text(render({ planState: "lapsed" }))).not.toContain("$90.00 on");
  });

  it("lists invoices with their date, number, amount and state, each opening on the provider's page", () => {
    const html = render({ account: { nextBill: null, invoices: [invoice(2, { status: "open" }), invoice(1)] } });
    expect(html).toContain('aria-label="Invoices"');
    expect(text(html)).toMatch(/2 Oct 2026 .*LANE-0002 .*\$90\.00 .*Due .*1 Oct 2026 .*LANE-0001 .*\$90\.00 .*Paid/);
    expect(html).toMatch(/<a [^>]*href="https:\/\/invoice.test\/2"[^>]*aria-label="View invoice LANE-0002 on the payment provider’s page"/);
  });

  it("shows an invoice without a number or page, and says when there are no invoices yet", () => {
    const html = text(render({ account: { nextBill: null, invoices: [invoice(3, { number: null, url: null, status: "void" })] } }));
    expect(html).toMatch(/3 Oct 2026 .*Invoice .*Void/);
    expect(html).not.toContain(" View ");
    expect(text(render({ account: { nextBill: null, invoices: [] } }))).toContain("No invoices yet.");
  });

  it("says when the provider can't be read, or isn't set up, and still shows the seats", () => {
    const failed = render({ account: "failed" });
    expect(failed).toContain('role="alert"');
    expect(text(failed)).toContain("Couldn’t load the next bill and invoices from the payment provider. Reload the page to try again.");
    expect(text(failed)).toMatch(/Paid seats .*5/);
    expect(text(render({ account: "unavailable" }))).toContain("The payment provider’s billing pages aren’t available yet.");
  });

  it("says when the seats can't be counted", () => {
    expect(text(render({ seats: null }))).toContain("Couldn’t count this workspace’s seats. Reload the page to try again.");
  });
});
