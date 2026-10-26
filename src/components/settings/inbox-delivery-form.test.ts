import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InboxDeliveryForm } from "./inbox-delivery-form";

/** #206: the Inbox delivery choice, Email (the default) or Off, saved as soon as it changes. */
const render = (initialChoice: "email" | "slack" | "off", email = "ravi@example.test", slack: { slackOffered?: boolean; choseSlack?: boolean } = {}) =>
  renderToStaticMarkup(createElement(InboxDeliveryForm, { initialChoice, email, ...slack, onSave: async () => ({ success: true }) }));
const radios = (html: string) => [...html.matchAll(/<input type="radio"[^>]*>/g)].map(match => match[0]);
const valueOf = (input: string) => /value="(\w+)"/.exec(input)?.[1];

describe("Inbox delivery choice", () => {
  it("offers Email and Off as one labelled radio group, Email chosen by default", () => {
    const html = render("email");
    expect(html).toContain("<legend>Deliver Needs-you items</legend>");
    expect(radios(html).map(valueOf)).toEqual(["email", "off"]);
    expect(radios(html).filter(input => input.includes("checked")).map(valueOf)).toEqual(["email"]);
    expect(html).toContain("ravi@example.test");
  });

  it("says Off still sends Result due, and that For-your-information items stay in Lane", () => {
    const html = render("off");
    expect(radios(html).filter(input => input.includes("checked")).map(valueOf)).toEqual(["off"]);
    expect(html).toContain("Result due");
    expect(html).toContain("For your information");
  });

  it("has a polite status region for the save result, empty until something is saved", () => {
    expect(render("email")).toMatch(/<p[^>]*role="status"[^>]*><\/p>/);
  });

  it("offers Slack DM only while Slack is connected (#207)", () => {
    expect(radios(render("email")).map(valueOf)).toEqual(["email", "off"]);
    const connected = render("slack", "ravi@example.test", { slackOffered: true, choseSlack: true });
    expect(radios(connected).map(valueOf)).toEqual(["email", "slack", "off"]);
    expect(radios(connected).filter(input => input.includes("checked")).map(valueOf)).toEqual(["slack"]);
    expect(connected).toContain("Slack DM");
  });

  it("says items go by email while a chosen Slack DM can't be used (#207)", () => {
    const html = render("email", "ravi@example.test", { slackOffered: false, choseSlack: true });
    expect(radios(html).map(valueOf)).toEqual(["email", "off"]);
    expect(html).toContain("You chose Slack DM, but Slack isn’t connected to this workspace now, so items reach you by email.");
    expect(render("email")).not.toContain("You chose Slack DM");
  });

  it("keeps a long address whole", () => {
    const long = `${"a".repeat(80)}@example.test`;
    expect(render("email", long)).toContain(long);
  });
});
