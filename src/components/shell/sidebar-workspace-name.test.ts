import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  pathname: "/",
  status: "all",
  resource: {
    isLoaded: true,
    organization: { id: "org_active", name: "Renamed workspace" } as { id: string; name: string } | null | undefined,
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => clerk.resource,
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({ usePathname: () => clerk.pathname, useSearchParams: () => new URLSearchParams({ status: clerk.status }) }));
// Notifications have their own database boundary and are unrelated to the label.
vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));

import { Sidebar } from "./sidebar";

function renderSidebar(role = "member") {
  return renderToStaticMarkup(createElement(Sidebar, {
    workspaceName: "Saved workspace name",
    fullName: "Test Member",
    email: "member@example.test",
    role,
    orgId: "org_active",
  }));
}

describe("sidebar workspace display freshness", () => {
  beforeEach(() => {
    clerk.resource = { isLoaded: true, organization: { id: "org_active", name: "Renamed workspace" } };
  });

  it("renders the active Clerk organization's current name on desktop and mobile", () => {
    const html = renderSidebar();
    expect(html.match(/>Renamed workspace<\/span>/g)).toHaveLength(2);
    expect(html).not.toContain("Saved workspace name");
  });

  it("reflects a rename on the next render instead of retaining the earlier name", () => {
    expect(renderSidebar()).toContain("Renamed workspace");
    clerk.resource.organization = { id: "org_active", name: "Latest workspace name" };
    const html = renderSidebar();
    expect(html).toContain("Latest workspace name");
    expect(html).not.toContain("Renamed workspace");
  });

  it.each([
    { isLoaded: false, organization: undefined },
    { isLoaded: false, organization: { id: "org_active", name: "Not loaded yet" } },
    { isLoaded: true, organization: null },
    { isLoaded: true, organization: { id: "org_other", name: "Wrong workspace" } },
    { isLoaded: true, organization: { id: "org_active", name: "   " } },
  ])("retains the safe server fallback when the matching resource is unavailable: %j", (resource) => {
    clerk.resource = resource;
    const html = renderSidebar();
    expect(html.match(/>Saved workspace name<\/span>/g)).toHaveLength(2);
    expect(html).not.toContain("Wrong workspace");
    expect(html).not.toContain("Not loaded yet");
  });
});

// Keep the persistent navigation discoverable to assistive technology.
it("renders a labelled primary navigation with the current page", () => {
  const html = renderSidebar();
  expect(html).toContain('aria-label="Primary navigation"');
  expect(html).toContain('aria-current="page"');
});


describe("approved Requests navigation", () => {
  beforeEach(() => { clerk.pathname = "/"; clerk.status = "all"; });
  it("provides Intake and every approved status in the persistent panel", () => {
    const html = renderSidebar();
    for (const href of ["/intake", "/?status=open", "/?status=in_progress", "/?status=done"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('aria-label="Request status filters"');
  });
  it("keeps Settings in the footer with Members and Profile destinations", () => {
    const html = renderSidebar();
    const footer = html.slice(html.indexOf('data-slot="sidebar-footer"'));
    expect(footer).toContain('href="/settings/members"');
    expect(footer).toContain('href="/settings/profile"');
  });
  it("marks the URL status as current, including within a Request detail", () => {
    clerk.pathname = "/requests/example"; clerk.status = "in_progress";
    const html = renderSidebar();
    expect(html).toMatch(/<a(?=[^>]*href="\/\?status=in_progress")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).not.toMatch(/<a(?=[^>]*href="\/\?status=open")(?=[^>]*aria-current="page")[^>]*>/);
  });
  it("never exposes Members to guests or hypothetical applications", () => {
    const html = renderSidebar("guest");
    expect(html).not.toContain('href="/settings/members"');
    expect(html).toContain('href="/intake"');
    expect(html).not.toMatch(/>Ideas<|>Docs<|>Insights</);
  });
});
