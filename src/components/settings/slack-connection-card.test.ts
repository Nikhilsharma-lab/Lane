import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SlackConnectionCard, type SlackConnectionCardProps } from "./slack-connection-card";

/** #207 Settings → Slack, for Admins: what the connection card shows in each state. */
const render = (props: Partial<SlackConnectionCardProps> = {}) =>
  renderToStaticMarkup(createElement(SlackConnectionCard, {
    connection: { kind: "disconnected" },
    onConnect: async () => ({ error: "unused" }),
    onDisconnect: async () => ({ success: true }),
    ...props,
  }));
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(match => match[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);

describe("Slack connection card", () => {
  it("offers to connect when Slack isn't connected, saying what Lane will do in Slack", () => {
    const html = render();
    expect(buttons(html)).toEqual(["Connect Slack"]);
    expect(html).toContain("Slack DM");
    expect(html).toContain("finds people by their email address");
  });

  it("offers no button while Slack isn't available in Lane", () => {
    const html = render({ connection: { kind: "unavailable" } });
    expect(buttons(html)).toEqual([]);
    expect(html).toContain("Slack isn’t available in Lane yet.");
  });

  it("names the connected Slack workspace, who connected it and when, and offers to disconnect", () => {
    const html = render({ connection: { kind: "connected", teamName: "Acme Slack", connectedByName: "Ada Admin", connectedOn: "25 Oct 2026", available: true } });
    expect(html).toContain("Acme Slack");
    expect(html).toContain("Ada Admin");
    expect(html).toContain("25 Oct 2026");
    expect(buttons(html)).toEqual(["Disconnect Slack"]);
  });

  it("keeps a long Slack workspace name whole, and copes without a name for who connected it", () => {
    const long = "A".repeat(150);
    const html = render({ connection: { kind: "connected", teamName: long, connectedByName: null, connectedOn: "25 Oct 2026", available: true } });
    expect(html).toContain(long);
    expect(html).toContain("25 Oct 2026");
  });

  it("says DMs go by email while Slack is switched off, but still lets an Admin disconnect", () => {
    const html = render({ connection: { kind: "connected", teamName: "Acme Slack", connectedByName: "Ada Admin", connectedOn: "25 Oct 2026", available: false } });
    expect(html).toContain("Slack DMs are switched off in Lane right now, so items go by email.");
    expect(buttons(html)).toEqual(["Disconnect Slack"]);
  });

  it("reports how the return from Slack went: success politely, problems as an alert", () => {
    expect(render({ connection: { kind: "connected", teamName: "Acme", connectedByName: null, connectedOn: "25 Oct 2026", available: true }, result: "connected" }))
      .toMatch(/role="status"[^>]*>Slack is connected\. People here can now choose Slack DM under Inbox delivery\.</);
    for (const [result, copy] of [
      ["cancelled", "Slack wasn’t connected: the install was cancelled in Slack."],
      ["expired", "That Slack link expired. Connect Slack again."],
      ["refused", "Only the Admin who started connecting Slack can finish it."],
      ["failed", "Slack didn’t finish connecting. Try again."],
    ] as const) expect(render({ result })).toMatch(new RegExp(`role="alert"[\\s\\S]*${copy.replace(/[.?]/g, "\\$&")}`));
  });

  it("has a polite status region, empty until something happens", () => {
    expect(render()).toMatch(/<p[^>]*role="status"[^>]*><\/p>/);
  });
});
