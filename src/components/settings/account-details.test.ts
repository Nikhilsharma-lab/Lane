import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountDetails } from "./account-details";
import { settingsCatalog } from "./settings-catalog";

/** #287 (D32): Profile's account rows, with one Manage account row for connected sign-in accounts too. */
const render = () => renderToStaticMarkup(createElement(AccountDetails, { name: "Priya Raman", email: "priya@example.test", onManage: () => {} }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
/** The markup of the one element with this id, its children included. */
function elementWithId(html: string, id: string): string | null {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0 || html.indexOf(`id="${id}"`, start + 1) >= 0) return null;
  const open = html.lastIndexOf("<", start);
  const name = /^<([a-z]+)/.exec(html.slice(open))?.[1];
  let depth = 0;
  for (const tag of html.slice(open).matchAll(new RegExp(`<(/?)${name}\\b[^>]*>`, "g"))) {
    depth += tag[1] ? -1 : 1;
    if (depth === 0) return html.slice(open, open + tag.index + tag[0].length);
  }
  return null;
}

describe("Profile's account rows", () => {
  it("shows who is signed in, then one Manage account row naming connected accounts such as Google", () => {
    const html = render();
    expect(text(html)).toMatch(/Priya Raman priya@example\.test .*Manage account Name, photo, email and connected accounts such as Google\. Manage account/);
    // Searching "Google" lands on the whole Manage account row: its words and its button.
    const landing = elementWithId(html, settingsCatalog.find(entry => entry.id === "manage-account")?.target ?? "manage-account-missing");
    expect(text(landing ?? "")).toBe("Manage account Name, photo, email and connected accounts such as Google. Manage account");
    expect([...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(match => text(match[1]))).toEqual(["Manage account"]);
    expect(html).not.toContain("Connected accounts");
    expect(html).not.toContain("connected-accounts");
  });
});
