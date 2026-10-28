import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsCommandAdapter, opensSettingsSearch } from "./settings-command-adapter";

// Issue #101: ⌘K belongs to the app's command palette; Settings search keeps /.
const key = (key: string, mods: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, ...mods });

describe("Settings search shortcut", () => {
  it("opens on / outside a text field", () => {
    expect(opensSettingsSearch(key("/"), false)).toBe(true);
  });
  it("leaves / to a text field and to modified chords", () => {
    expect(opensSettingsSearch(key("/"), true)).toBe(false);
    expect(opensSettingsSearch(key("/", { metaKey: true }), false)).toBe(false);
    expect(opensSettingsSearch(key("/", { altKey: true }), false)).toBe(false);
  });
  it("leaves ⌘K and Ctrl K to the command palette", () => {
    expect(opensSettingsSearch(key("k", { metaKey: true }), false)).toBe(false);
    expect(opensSettingsSearch(key("K", { ctrlKey: true }), false)).toBe(false);
  });
  it("hints / on the Search settings button", () => {
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "member", workspaceName: "Lane Studio" }));
    const button = /<button[^>]*aria-haspopup="dialog"[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";
    expect(button).toContain("Search settings");
    expect(button).toContain('aria-keyshortcuts="/"');
    expect(button).toContain("<kbd>/</kbd>");
  });
});

describe("Settings → Metrics (#196)", () => {
  const sections = (html: string) => [...html.matchAll(/<section id="settings-([\w-]+)"([^>]*)>/g)].map(match => ({ id: match[1], hidden: match[2].includes("hidden") }));
  it("links the Metrics section to its own page", () => {
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "member", workspaceName: "Lane Studio" }));
    expect(html).toMatch(/<a[^>]*href="\/settings\/metrics"[^>]*>(?:(?!<\/a>)[\s\S])*<span>Metrics<\/span><\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/settings\/profile\?section=members"/);
  });
  it("shows the Metrics panel on the Metrics page", () => {
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "member", workspaceName: "Lane Studio", page: "metrics", initialSection: "metrics", metrics: createElement("p", null, "The library") }));
    expect(sections(html).filter(section => !section.hidden).map(section => section.id)).toEqual(["metrics"]);
    expect(html).toMatch(/<section id="settings-metrics"[^>]*>(?:(?!<\/section>)[\s\S])*The library/);
  });
  it("leaves Metrics out for a guest", () => {
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "guest", workspaceName: "Lane Studio" }));
    expect(html).not.toContain("/settings/metrics");
  });
});

describe("Settings → Inbox delivery (#206)", () => {
  const sections = (html: string) => [...html.matchAll(/<section id="settings-([\w-]+)"([^>]*)>/g)].map(match => ({ id: match[1], hidden: match[2].includes("hidden") }));
  it("is a Personal section for Members and Admins, showing the page's delivery panel", () => {
    for (const membership of ["member", "admin"]) {
      const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership, workspaceName: "Lane Studio", initialSection: "inbox-delivery", delivery: createElement("p", null, "Delivery choice") }));
      expect(html).toMatch(/<a[^>]*href="\/settings\/profile\?section=inbox-delivery"[^>]*>(?:(?!<\/a>)[\s\S])*<span>Inbox delivery<\/span><\/a>/);
      expect(sections(html).filter(section => !section.hidden).map(section => section.id)).toEqual(["inbox-delivery"]);
      expect(html).toMatch(/<section id="settings-inbox-delivery"[^>]*>(?:(?!<\/section>)[\s\S])*Delivery choice/);
    }
  });
  it("is not offered to a Guest, and is no longer listed as coming soon", () => {
    const guest = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "guest", workspaceName: "Lane Studio" }));
    expect(guest).not.toContain("section=inbox-delivery");
    const member = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "member", workspaceName: "Lane Studio", initialSection: "coming-soon" }));
    expect(member).not.toContain("Choosing how Inbox items reach you is not available yet");
  });
});

describe("Settings → Slack (#207)", () => {
  const sections = (html: string) => [...html.matchAll(/<section id="settings-([\w-]+)"([^>]*)>/g)].map(match => ({ id: match[1], hidden: match[2].includes("hidden") }));
  it("is a Workspace section for Admins, showing the page's Slack panel", () => {
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "admin", workspaceName: "Lane Studio", initialSection: "slack", slack: createElement("p", null, "Slack connection") }));
    expect(html).toMatch(/<a[^>]*href="\/settings\/profile\?section=slack"[^>]*>(?:(?!<\/a>)[\s\S])*<span>Slack<\/span><\/a>/);
    expect(sections(html).filter(section => !section.hidden).map(section => section.id)).toEqual(["slack"]);
    expect(html).toMatch(/<section id="settings-slack"[^>]*>(?:(?!<\/section>)[\s\S])*Slack connection/);
  });
  it("is not offered to a Member or a Guest", () => {
    for (const membership of ["member", "guest"]) {
      const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership, workspaceName: "Lane Studio", initialSection: "slack" }));
      expect(html).not.toContain("section=slack");
      expect(sections(html).map(section => section.id)).not.toContain("slack");
    }
  });
});

describe("Settings → Billing (#213)", () => {
  const sections = (html: string) => [...html.matchAll(/<section id="settings-([\w-]+)"([^>]*)>/g)].map(match => ({ id: match[1], hidden: match[2].includes("hidden") }));
  it("is a Workspace section for Admins, showing the page's Billing panel", () => {
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "admin", workspaceName: "Lane Studio", initialSection: "billing", billing: createElement("p", null, "Free Requests left") }));
    expect(html).toMatch(/<a[^>]*href="\/settings\/profile\?section=billing"[^>]*>(?:(?!<\/a>)[\s\S])*<span>Billing<\/span><\/a>/);
    expect(sections(html).filter(section => !section.hidden).map(section => section.id)).toEqual(["billing"]);
    expect(html).toMatch(/<section id="settings-billing"[^>]*>(?:(?!<\/section>)[\s\S])*Free Requests left/);
  });
  it("is not offered to a Member, a Guest or a Viewer", () => {
    for (const membership of ["member", "guest", "viewer"]) {
      const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership, workspaceName: "Lane Studio", initialSection: "billing" }));
      expect(html).not.toContain("section=billing");
      expect(sections(html).map(section => section.id)).not.toContain("billing");
    }
  });
});
