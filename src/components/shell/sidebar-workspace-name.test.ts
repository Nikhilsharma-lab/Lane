import { createElement } from "react";
import { AppProviders } from "@/test/app-providers";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const place = vi.hoisted(() => ({ pathname: "/", status: "all" as string | null, project: null as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => place.pathname,
  useSearchParams: () => new URLSearchParams({ ...(place.status === null ? {} : { status: place.status }), ...(place.project ? { project: place.project } : {}) }),
  useRouter: () => ({ push: vi.fn() }),
}));
// The Inbox bell has its own database boundary and is unrelated to the label.
vi.mock("./inbox-bell", () => ({ InboxBell: () => null }));
// The palette is its own chunk with its own tests.
vi.mock("./command-palette-lazy", () => ({ CommandPaletteHost: () => null }));
vi.mock("./use-workspace-switcher", () => ({ useWorkspaceSwitcher: () => undefined }));

import { Sidebar } from "./sidebar";
import { SidebarView } from "./sidebar-view";

beforeEach(() => {
  place.pathname = "/";
  place.status = "all";
  place.project = null;
});

function renderSidebar(role: "admin" | "member" | "guest" = "member") {
  // The (app) layout always provides the workspace's Projects.
  return renderToStaticMarkup(createElement(AppProviders, { orgId: "org_active" }, createElement(Sidebar, {
    workspaceName: "Saved workspace name",
    fullName: "Test Member",
    email: "member@example.test",
    role,
    orgId: "org_active",
    userId: "user_1",
    workspaces: [{ id: "org_active", name: "Saved workspace name" }],
  })));
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

it("shows the server's workspace name", () => {
  expect(renderSidebar()).toContain("Saved workspace name");
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
    expect(renderedGroup(html, "Saved workspace name")).toBeDefined();
    expect(html).toContain('aria-label="Account menu, Test Member"');
    expect(html).not.toContain('href="/settings/members"');
    expect(html).not.toContain('href="/settings/profile"');
  });
  it("keeps the workspace Requests destination current inside a status-filtered detail", () => {
    place.pathname = "/requests/example"; place.status = "in_progress";
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
    place.status = status;
    const html = renderSidebar();
    expect(html).toMatch(/<a(?=[^>]*href="\/")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).not.toMatch(/<a(?=[^>]*href="\/\?status=[^"]+")(?=[^>]*aria-current="page")[^>]*>/);
  });

  it.each([
    ["guest", "My Requests", "All Requests"],
    ["member", "All Requests", "My Requests"],
    ["admin", "All Requests", "My Requests"],
  ] as const)("uses the correct Requests label for a workspace %s", (role, label, otherLabel) => {
    const html = renderSidebar(role);
    expect(html).toContain(label);
    expect(html).not.toContain(otherLabel);
  });
});

it("links accessible Projects and retains the Project selection within a Request detail", () => {
  place.status = "in_progress"; place.project = "11111111-1111-4111-8111-111111111111";
  const html = renderToStaticMarkup(createElement(AppProviders, null, createElement(SidebarView, {
    workspaceName: "Lane Studio", fullName: "Test Member", email: "member@example.test",
    role: "member", pathname: "/requests/example",
    projects: [{ id: "11111111-1111-4111-8111-111111111111", name: "Website", description: null }],
    notifications: null,
  })));
  expect(html).toContain('aria-label="Projects"');
  expect(html).toMatch(/<a(?=[^>]*href="\/\?status=in_progress&amp;project=11111111-1111-4111-8111-111111111111")(?=[^>]*aria-current="page")[^>]*>/);
  expect(html).toContain("Website");
  expect(html).toContain('href="/?status=in_progress&amp;project=none"');
});

// #159: the Impact Dashboard is one entry in the workspace navigation, for every role (a guest sees only their own work on it).
describe("Impact Dashboard navigation (#159)", () => {
  it.each(["admin", "member", "guest"] as const)("lists the Impact screen in the workspace navigation for a workspace %s", (role) => {
    const html = renderSidebar(role);
    expect(html).toMatch(/<a(?=[^>]*href="\/impact")[^>]*>/);
    expect(html).toContain("Impact");
  });
});
