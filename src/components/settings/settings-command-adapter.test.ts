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
    // #262: drawn as Arc's key cap, decorative beside the button's name.
    expect(button).toMatch(/<kbd aria-hidden="true"[^>]*>\/<\/kbd>/);
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

describe("Settings → Members loads with Members (#258)", () => {
  const members = createElement("p", null, "The member list");
  it("leaves the member list out while another section is open", () => {
    for (const initialSection of ["profile", "billing", "metrics"]) {
      const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "admin", workspaceName: "Lane Studio", initialSection, members }));
      expect(html).toMatch(/<section id="settings-members"/);
      expect(html).not.toContain("The member list");
    }
  });
  it("never mounts the member list for a Viewer or a Guest, even asked for Members", () => {
    for (const membership of ["viewer", "guest"]) {
      const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership, workspaceName: "Lane Studio", page: "members", initialSection: "members", members }));
      expect(html).not.toContain("The member list");
      expect(html).not.toContain('id="settings-members"');
    }
  });
  it("shows the member list when Members is open", () => {
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "member", workspaceName: "Lane Studio", page: "members", initialSection: "members", members }));
    expect(html).toMatch(/<section id="settings-members"(?![^>]*hidden)[^>]*>(?:(?!<\/section>)[\s\S])*The member list/);
  });
});

describe("Settings headings over row groups (#287)", () => {
  const visible = (html: string) => /<section id="settings-[\w-]+"(?![^>]*hidden)[^>]*>([\s\S]*?)<\/section>\s*(?=<section id="settings-|<\/div>)/.exec(html)?.[1] ?? "";
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  it("heads the open section with its name and one purpose line, above the groups", () => {
    const rows = { workspaceNameRow: createElement("p", null, "Workspace name Lane Studio"), leaveWorkspace: createElement("p", null, "Leave Lane Studio") };
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "member", workspaceName: "Lane Studio", initialSection: "workspace", ...rows }));
    const open = visible(html);
    expect(open).toMatch(/^<header[^>]*><h2[^>]*>Workspace details<\/h2><p>Your workspace and membership\.<\/p><\/header>/);
    // #395: the name row and the Leave row are the page's, each once.
    expect(text(open).match(/Workspace name/g)).toHaveLength(1);
    expect(text(open)).toContain("Workspace name Lane Studio Your access");
    expect(text(open)).toMatch(/Leave Lane Studio$/);
    expect(text(open)).toContain("Your access Workspace access is separate from your profile role. Member");
  });

  it("tells a Member that Members is the people and their roles; an Admin keeps the management wording", () => {
    const head = (membership: string) => text(/<section id="settings-members"[^>]*><header[^>]*>([\s\S]*?)<\/header>/.exec(renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership, workspaceName: "Lane Studio", initialSection: "members" })))?.[1] ?? "");
    expect(head("member")).toBe("Members People in this workspace and their roles.");
    expect(head("admin")).toBe("Members Manage workspace members and invitations.");
  });

  it("heads Billing with the pilot's purpose line, and names seats, the next bill and invoices once billing is enforced", () => {
    const head = (billingEnforced: boolean) => text(/<section id="settings-billing"[^>]*><header[^>]*>([\s\S]*?)<\/header>/.exec(renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "admin", billingEnforced, workspaceName: "Lane Studio", initialSection: "billing" })))?.[1] ?? "");
    expect(head(false)).toBe("Billing The Lane plan and the Free Requests left.");
    expect(head(true)).toBe("Billing The Lane plan, seats, next bill, invoices and the Free Requests left.");
  });

  it("marks each planned setting with a quiet Coming soon tag, not a disabled button (D24)", () => {
    const open = visible(renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "admin", workspaceName: "Lane Studio", initialSection: "coming-soon" })));
    expect(open).not.toMatch(/<button[^>]*disabled/);
    expect(open).toContain("Coming soon");
    expect(text(open)).not.toContain("Display names");
    expect(open).toMatch(/<h3[^>]*>Projects<\/h3>[\s\S]*Labels/);
    expect(open).not.toMatch(/<h3[^>]*>Requests<\/h3>(?:(?!<h3)[\s\S])*>Labels</);
  });
});

describe("A section this role can't open (#288, D30)", () => {
  const visibleSections = (html: string) => [...html.matchAll(/<section id="settings-([\w-]+)"([^>]*)>/g)].filter(match => !match[2].includes("hidden")).map(match => match[1]);
  it("shows a Member the default section with a quiet line saying who Billing is for", () => {
    const html = renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "member", workspaceName: "Lane Studio", initialSection: "billing" }));
    expect(html).toContain("Billing is for Admins of this workspace.");
    expect(visibleSections(html)).toEqual(["profile"]);
    expect(html.indexOf("Billing is for Admins")).toBeLessThan(html.indexOf('id="settings-profile"'));
  });
  it("tells a Viewer who Members is for", () => {
    expect(renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "viewer", workspaceName: "Lane Studio", initialSection: "members" })))
      .toContain("Members is for Admins and Members of this workspace.");
  });
  it("says nothing when the section opens, or was never asked for", () => {
    expect(renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "admin", workspaceName: "Lane Studio", initialSection: "billing" }))).not.toContain("is for Admins");
    expect(renderToStaticMarkup(createElement(SettingsCommandAdapter, { membership: "member", workspaceName: "Lane Studio" }))).not.toContain("of this workspace.");
  });
});
