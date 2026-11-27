import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthShell } from "@/components/auth/auth-shell";
import { SUPPORT_EMAIL } from "@/app/support-contact";
import TermsPage, { metadata } from "./page";
import PrivacyPage from "../privacy/page";

const html = renderToStaticMarkup(createElement(TermsPage));
const text = html.replace(/<[^>]+>/g, " ");

describe("Plan item L1: the Terms of service page", () => {
  it("renders one h1 and an effective date", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("<h1>Terms of service</h1>");
    expect(text).toMatch(/Effective \d{1,2} [A-Z][a-z]+ \d{4}/);
    // #271: the root layout's template adds " · Lane".
    expect(metadata.title).toBe("Terms of service");
  });

  it("links to the Privacy policy, the support address and back to sign in", () => {
    expect(html).toContain('href="/privacy"');
    expect(html).toContain(`href="mailto:${SUPPORT_EMAIL}"`);
    expect(html).toContain('href="/login"');
  });

  // D17 (#290, after #311): payments are off, so the pilot line stays; the role list changes in #315, not here.
  it("keeps Lane free during the pilot", () => {
    expect(text).toContain("Lane is free during the pilot and does not accept payment.");
  });

  it("writes no em or en dashes", () => {
    const dashes = /[\u2014\u2013]/;
    expect(text).not.toMatch(dashes);
    expect(`${metadata.title} ${metadata.description}`).not.toMatch(dashes);
  });

  // #404: Better Auth runs inside Lane.
  it("says Lane handles accounts and workspaces itself, and never names Clerk", () => {
    expect(text).toContain("Lane handles sign-in, sessions, workspaces, memberships and invitations.");
    expect(html).not.toMatch(/clerk/i);
  });

  it("names the four roles as Lane does", () => {
    expect(text).toContain("Each workspace has at least one Admin, and may have Members, Guests and Viewers:");
    for (const role of ["Admins", "Members", "Guests", "Viewers"]) expect(html).toContain(`<strong>${role}</strong>`);
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

describe("Plan item L1: the Privacy policy page", () => {
  const privacy = renderToStaticMarkup(createElement(PrivacyPage));
  const privacyText = privacy.replace(/<[^>]+>/g, "");

  // D18 (#290): Privacy links to the Terms of service, as Terms links to Privacy.
  it("links to the Terms of service", () => {
    expect(privacy).toMatch(/<a[^>]*href="\/terms"[^>]*>Terms of service<\/a>/);
  });

  // D17 (#290): the check has the name Settings gives it.
  it("calls the AI check the Request AI check", () => {
    expect(privacyText).toContain("4. The Request AI check");
    expect(privacyText).toContain("When you run the Request AI check,");
    expect(privacyText).not.toContain("Intake AI check");
  });

  // #404 (spec #383, #345 Q7): Better Auth runs inside Lane, so the processors are the services around it.
  const listed = [...privacy.matchAll(/<li><strong>([^<]+?):<\/strong>/g)].map((match) => match[1]);

  it("lists the services that handle accounts now, and not Clerk", () => {
    expect(listed).toEqual(expect.arrayContaining(["Supabase", "Vercel", "Resend", "Cloudflare Turnstile", "Google sign-in", "Have I Been Pwned", "Upstash", "Anthropic"]));
    expect(privacy).not.toMatch(/clerk/i);
  });

  it("says Have I Been Pwned receives only a 5-character prefix of the password's hash", () => {
    expect(privacyText).toContain("It receives only a 5-character prefix of the password’s hash.");
  });

  it("says Lane stores the tokens Google returns, and that account deletion removes them", () => {
    expect(privacyText).toContain("Lane stores the sign-in tokens Google returns, which can contain basic profile details. Account deletion removes them.");
  });

  it("claims no picture of anyone", () => {
    expect(privacy).not.toMatch(/avatar|profile picture|photo/i);
  });

  it("keeps both deletion deadlines and says what account deletion removes", () => {
    expect(privacyText).toContain("We acknowledge privacy requests within 3 working days and aim to complete verified deletion requests within 30 days.");
    expect(privacyText).toContain("Account deletion removes your sign-in methods, sessions, workspace memberships and pending invitations, and removes your name and email address from Lane’s profile record.");
  });

  // Nikhil, 2026-11-18: Terms use the same name.
  it("Terms call it the Request AI check too", () => {
    const termsText = renderToStaticMarkup(createElement(TermsPage)).replace(/<[^>]+>/g, "");
    expect(termsText).toContain("5. The Request AI check");
    expect(termsText).not.toContain("Intake AI check");
  });
});
