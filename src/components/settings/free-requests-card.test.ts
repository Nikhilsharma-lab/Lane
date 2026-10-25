import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FreeRequestsCard, type FreeRequestsCardProps } from "./free-requests-card";

/** #213 Settings → Billing, for Admins: the Free Requests left, and why there are none. */
const render = (props: Partial<FreeRequestsCardProps> = {}) =>
  renderToStaticMarkup(createElement(FreeRequestsCard, {
    planState: "free",
    free: { total: 4, used: 1, left: 3, usedElsewhere: null },
    enforced: false,
    ...props,
  }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Free Requests card", () => {
  it("shows how many Free Requests are left, and what counts", () => {
    const html = text(render());
    expect(html).toContain("Free Requests left 3 of 4");
    expect(html).toContain("Every workspace gets 4 Free Requests with all of Lane, for any number of people and no time limit. Each Request created counts, including deleted ones. A Guest submission counts once it’s taken on.");
  });

  it("says nothing is blocked while Lane isn't charging", () => {
    expect(text(render({ free: { total: 4, used: 6, left: 0, usedElsewhere: null } }))).toContain("Free Requests left 0 of 4");
    expect(text(render())).toContain("Lane isn’t charging yet, so creating Requests stays open after these are used.");
  });

  it("says an Admin needs to pay once they're used and billing is on", () => {
    const html = render({ free: { total: 4, used: 4, left: 0, usedElsewhere: null }, enforced: true });
    expect(html).toContain('role="status"');
    expect(text(html)).toContain("This workspace has used its 4 Free Requests. An Admin needs to pay for Lane");
    expect(text(html)).not.toContain("isn’t charging yet");
    expect(text(render({ enforced: true }))).not.toContain("An Admin needs to pay");
  });

  it("tells a second workspace from the same company domain that the Free Requests were already used", () => {
    const html = text(render({ free: { total: 0, used: 0, left: 0, usedElsewhere: { kind: "company_domain", domain: "acme.com" } } }));
    expect(html).toContain("Free Requests left 0 of 4");
    expect(html).toContain("The Free Requests for acme.com were already used by another workspace.");
  });

  it("keeps a long company domain whole", () => {
    const domain = `${"design-systems-".repeat(12)}example.com`;
    expect(render({ free: { total: 0, used: 0, left: 0, usedElsewhere: { kind: "company_domain", domain } } })).toContain(domain);
  });

  it("shows no count for a paying workspace", () => {
    const html = text(render({ planState: "paying" }));
    expect(html).toContain("This workspace pays for Lane, so creating Requests has no limit.");
    expect(html).not.toContain("3 of 4");
  });
});
