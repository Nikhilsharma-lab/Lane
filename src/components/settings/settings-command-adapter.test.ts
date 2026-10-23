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
