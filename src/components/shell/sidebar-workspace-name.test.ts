import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  pathname: "/",
  status: "all" as string | null,
  resource: {
    isLoaded: true,
    organization: { id: "org_active", name: "Renamed workspace" } as { id: string; name: string } | null | undefined,
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => clerk.resource,
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => clerk.pathname,
  useSearchParams: () => new URLSearchParams(clerk.status === null ? {} : { status: clerk.status }),
  useRouter: () => ({ push: vi.fn() }),
}));
// Notifications have their own database boundary and are unrelated to the label.
vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("./use-workspace-switcher", () => ({ useWorkspaceSwitcher: () => undefined }));

import { Sidebar } from "./sidebar";
import { SidebarView } from "./sidebar-view";

beforeEach(() => {
  clerk.pathname = "/";
  clerk.status = "all";
  clerk.resource = { isLoaded: true, organization: { id: "org_active", name: "Renamed workspace" } };
});

function renderSidebar(role = "member") {
  return renderToStaticMarkup(createElement(Sidebar, {
    workspaceName: "Saved workspace name",
    fullName: "Test Member",
    email: "member@example.test",
    role,
    orgId: "org_active",
  }));
}

// Locate the labelled group without depending on library classes or slots.
function renderedGroup(html: string, label: string): string | undefined {
  const opening = new RegExp(`<([a-z][a-z0-9]*)\\b(?=[^>]*\\brole="group")(?=[^>]*\\baria-label="${label}")[^>]*>`).exec(html);
  if (!opening || opening.index === undefined) return;
  const region = html.slice(opening.index);
  let depth = 0;
  for (const tag of region.matchAll(new RegExp(`</?${opening[1]}\\b[^>]*>`, "g"))) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return region.slice(0, tag.index + tag[0].length);
  }
}

describe("sidebar workspace display freshness", () => {
  it("renders the active Clerk organization's current name instead of the stale server name", () => {
    const html = renderSidebar();
    expect(html).toContain("Renamed workspace");
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
    expect(html).toContain("Saved workspace name");
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
  it("provides Intake and the workspace Requests destination", () => {
    const html = renderSidebar();
    for (const href of ["/intake", "/"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
  it("shows the real account actions in the identity menu rather than duplicate Settings rows", () => {
    const html = renderSidebar();
    expect(renderedGroup(html, "Settings")).toBeUndefined();
    expect(renderedGroup(html, "Renamed workspace")).toBeDefined();
    expect(html).toContain('aria-label="Account menu, Test Member"');
    expect(html).not.toContain('href="/settings/members"');
    expect(html).not.toContain('href="/settings/profile"');
  });
  it("keeps the workspace Requests destination current inside a status-filtered detail", () => {
    clerk.pathname = "/requests/example"; clerk.status = "in_progress";
    const html = renderSidebar();
    expect(html).toMatch(/<a(?=[^>]*href="\/")(?=[^>]*aria-current="page")[^>]*>/);
  });
  it("never exposes Members to guests or hypothetical applications", () => {
    const html = renderSidebar("guest");
    expect(html).not.toContain('href="/settings/members"');
    expect(html).toContain('href="/intake"');
    expect(html).not.toMatch(/>Ideas<|>Docs<|>Insights</);
  });

  it.each([null, "", "not-a-status"])("falls back to All Requests for missing or invalid status: %j", (status) => {
    clerk.status = status;
    const html = renderSidebar();
    expect(html).toMatch(/<a(?=[^>]*href="\/")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).not.toMatch(/<a(?=[^>]*href="\/\?status=[^"]+")(?=[^>]*aria-current="page")[^>]*>/);
  });

  it.each([
    ["guest", "My Requests", "All Requests"],
    ["member", "All Requests", "My Requests"],
    ["admin", "All Requests", "My Requests"],
  ])("uses the correct Requests label for Clerk %s", (role, label, otherLabel) => {
    const html = renderSidebar(role);
    expect(html).toContain(label);
    expect(html).not.toContain(otherLabel);
  });
});

it("links accessible Projects and retains the Project selection within a Request detail", () => {
  const html = renderToStaticMarkup(createElement(SidebarView, {
    workspaceName: "Lane Studio", fullName: "Test Member", email: "member@example.test",
    role: "member", pathname: "/requests/example", statusFilter: "in_progress",
    projectFilter: "11111111-1111-4111-8111-111111111111",
    projects: [{ id: "11111111-1111-4111-8111-111111111111", name: "Website", description: null }],
    notifications: null,
  }));
  expect(html).toContain('aria-label="Projects"');
  expect(html).toMatch(/<a(?=[^>]*href="\/\?status=in_progress&amp;project=11111111-1111-4111-8111-111111111111")(?=[^>]*aria-current="page")[^>]*>/);
  expect(html).toContain("Website");
  expect(html).toContain('href="/?status=in_progress&amp;project=none"');
});
