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
