import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountDetails } from "./account-details";

/** #287 (D32): Profile's account rows, with one Manage account row for connected sign-in accounts too. */
const render = () => renderToStaticMarkup(createElement(AccountDetails, { name: "Priya Raman", email: "priya@example.test", onManage: () => {} }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("Profile's account rows", () => {
  it("shows who is signed in, then one Manage account row naming connected accounts such as Google", () => {
    const html = render();
    expect(text(html)).toMatch(/Priya Raman priya@example\.test .*Manage account Name, photo, email and connected accounts such as Google\. Manage account/);
    expect(html).toMatch(/<div id="manage-account" tabindex="-1"[^>]*>/);
    expect([...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(match => text(match[1]))).toEqual(["Manage account"]);
    expect(html).not.toContain("Connected accounts");
    expect(html).not.toContain("connected-accounts");
  });
});
