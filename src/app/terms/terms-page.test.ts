import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthShell } from "@/components/auth/auth-shell";
import { SUPPORT_EMAIL } from "@/app/support-contact";
import TermsPage, { metadata } from "./page";

const html = renderToStaticMarkup(createElement(TermsPage));
const text = html.replace(/<[^>]+>/g, " ");

describe("Plan item L1: the Terms of service page", () => {
  it("renders one h1 and an effective date", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("<h1>Terms of service</h1>");
    expect(text).toMatch(/Effective \d{1,2} [A-Z][a-z]+ \d{4}/);
    expect(metadata.title).toBe("Terms of service | Lane");
  });

  it("links to the Privacy policy, the support address and back to sign in", () => {
    expect(html).toContain('href="/privacy"');
    expect(html).toContain(`href="mailto:${SUPPORT_EMAIL}"`);
    expect(html).toContain('href="/login"');
  });

  it("writes no em or en dashes", () => {
    const dashes = /[\u2014\u2013]/;
    expect(text).not.toMatch(dashes);
    expect(`${metadata.title} ${metadata.description}`).not.toMatch(dashes);
  });

  it("numbers its sections in order", () => {
    const numbers = [...html.matchAll(/<h2>(\d+)\. /g)].map((match) => Number(match[1]));
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    expect(numbers.length).toBeGreaterThan(10);
  });
});

describe("Plan item L1: the auth shell's legal links", () => {
  it("links to the Privacy policy and the Terms of service", () => {
    const shell = renderToStaticMarkup(createElement(AuthShell, null, "form"));
    const nav = shell.slice(shell.indexOf("<nav"), shell.indexOf("</nav>"));
    expect(nav).toContain('aria-label="Legal"');
    expect(nav.indexOf('href="/privacy"')).toBeGreaterThan(-1);
    expect(nav.indexOf('href="/terms"')).toBeGreaterThan(nav.indexOf('href="/privacy"'));
  });
});
